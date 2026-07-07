/**
 * Résout une action au format natif (ex. `google_drive.read_file`) vers le vrai
 * slug d'outil Composio (ex. `GOOGLEDRIVE_DOWNLOAD_FILE`) pour un connecteur
 * Composio-only. Évite la classe de bug où le plan IA invente une action native
 * qui n'existe dans aucun registre → exécution impossible.
 *
 * La sélection est :
 *  - tolérante (synonymes de verbes : read≈download≈get, list≈search…),
 *  - SÛRE (ne choisit jamais une action mutante/destructive pour un verbe en
 *    lecture seule — on préfère échouer franchement que supprimer un fichier).
 */

import { listComposioTools, type ComposioToolEntry } from "./catalog";
import { toComposioToolkitSlug } from "@/lib/connectors/resolve-id";

/** Minuscule + suppression des accents (« créer » → « creer », sinon la
 *  tokenisation a-z fragmentait les verbes français en « cr », « er »). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function norm(s: string): string {
  return fold(s).replace(/[^a-z0-9]/g, "");
}

function tokens(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Partie « verbe » d'une action native : `connector.verb` → `verb`. */
export function actionVerb(actionId: string): string {
  const dot = actionId.indexOf(".");
  return dot >= 0 ? actionId.slice(dot + 1) : actionId;
}

/** Retire le préfixe toolkit d'un slug Composio : `GOOGLEDRIVE_LIST_FILES` → `list files`. */
function toolTail(slug: string, toolkit: string): string {
  const prefix = toolkit.toLowerCase() + "_";
  const low = slug.toLowerCase();
  const stripped = low.startsWith(prefix) ? low.slice(prefix.length) : low;
  return stripped.replace(/_/g, " ");
}

// Familles de verbes : un verbe demandé matche n'importe quel synonyme.
// Inclut les « tics de langage » FRANÇAIS que le builder/copilote génère
// (créer, envoyer, rédiger… — accents déjà retirés par fold()).
const VERB_SYNONYMS: Record<string, string[]> = {
  read: ["read", "get", "download", "export", "fetch", "parse", "retrieve", "view", "show", "find"],
  get: ["get", "read", "download", "export", "fetch", "retrieve", "find"],
  download: ["download", "export", "get", "read", "fetch"],
  list: ["list", "search", "find", "getall", "query", "fetch", "all", "get"],
  search: ["search", "find", "list", "query", "lookup"],
  find: ["find", "search", "get", "list", "lookup"],
  create: ["create", "add", "insert", "upload", "new", "make", "post"],
  write: ["write", "create", "save", "redact", "rediger", "upload", "add", "insert", "append"],
  save: ["save", "write", "create", "upload", "store"],
  add: ["add", "create", "insert", "append", "upload"],
  upload: ["upload", "create", "add", "insert", "import"],
  send: ["send", "post", "share", "create", "deliver"],
  update: ["update", "edit", "modify", "patch", "change", "rename", "move", "set"],
  delete: ["delete", "remove", "trash", "destroy", "drop"],
  // ── Verbes français → mêmes familles ──
  creer: ["create", "add", "insert", "new", "make", "post"],
  generer: ["create", "make", "generate", "new"],
  ecrire: ["write", "create", "save", "append", "add", "insert"],
  rediger: ["write", "create", "save", "compose"],
  ajouter: ["add", "create", "insert", "append", "upload"],
  envoyer: ["send", "post", "share", "deliver"],
  publier: ["post", "publish", "send", "share", "create"],
  lire: ["read", "get", "fetch", "retrieve", "view"],
  recuperer: ["get", "read", "fetch", "retrieve", "download"],
  extraire: ["get", "read", "export", "extract", "parse"],
  chercher: ["search", "find", "list", "query", "lookup"],
  rechercher: ["search", "find", "list", "query", "lookup"],
  lister: ["list", "search", "getall", "fetch", "all"],
  telecharger: ["download", "export", "get", "upload"],
  modifier: ["update", "edit", "modify", "patch", "change"],
  supprimer: ["delete", "remove", "trash"],
  planifier: ["create", "schedule", "add", "insert"],
  partager: ["share", "send", "post"],
  // Formes nominales fréquentes (« nouvelle_feuille », « nouveau_doc »)
  nouvelle: ["create", "new", "add", "make"],
  nouveau: ["create", "new", "add", "make"],
  faire: ["create", "make", "add"],
};

const MUTATING = new Set([
  "create", "add", "insert", "upload", "import", "new", "make",
  "write", "save", "redact", "rediger", "append",
  "update", "edit", "modify", "patch", "change", "rename", "move", "set",
  "delete", "remove", "trash", "destroy", "drop",
  "send", "post", "share", "deliver",
  // français (accents retirés par fold)
  "creer", "generer", "ecrire", "ajouter", "envoyer", "publier",
  "modifier", "supprimer", "planifier", "partager", "nouvelle", "nouveau", "faire",
]);

// Verbes d'écriture de DOCUMENT : on doit produire un fichier AVEC du contenu,
// jamais une métadonnée vide.
const WRITE_DOC_VERBS = new Set([
  "write", "create", "save", "redact", "rediger", "upload", "add",
  "creer", "ecrire", "generer",
]);

const READ_ONLY_VERBS = new Set([
  "read", "get", "download", "export", "fetch", "parse", "retrieve",
  "list", "search", "find", "view", "show", "lookup", "query",
  // français
  "lire", "recuperer", "extraire", "chercher", "rechercher", "lister", "telecharger",
]);

function verbMatchers(primary: string): Set<string> {
  return new Set(VERB_SYNONYMS[primary] ?? [primary]);
}

/** Tokens qui changent l'OBJET de l'action (sous-ressources) : fortement
 *  pénalisés quand ils ne figurent pas dans la demande. */
const TRAP_TOKENS = new Set([
  "comment", "comments", "reply", "replies", "note", "notes",
  "sticker", "stickers", "label", "labels", "reaction", "reactions",
  "webhook", "webhooks", "watch", "acl", "permission", "permissions",
  "revision", "revisions", "metadata", "attachment", "attachments",
  "star", "stars", "member", "members", "membership", "memberships",
]);

/**
 * Choisit le meilleur slug d'outil pour `actionId` parmi `tools`.
 * Fonction PURE (testable sans réseau).
 */
export interface PickToolOptions {
  /** Vrai si l'étape transporte un contenu texte (favorise l'écriture de doc). */
  hasTextContent?: boolean;
}

export function pickToolSlug(
  tools: ComposioToolEntry[],
  toolkit: string,
  actionId: string,
  opts: PickToolOptions = {},
): string | null {
  const verb = actionVerb(actionId);
  const verbNorm = norm(verb);
  const verbToks = tokens(verb);
  const primary = verbToks[0] ?? verbNorm;
  const objectToks = verbToks.slice(1); // ex. ["file"] pour read_file
  const synonyms = verbMatchers(primary);
  const requestedReadOnly = READ_ONLY_VERBS.has(primary);

  // P0-1 : écriture d'un document/fichier (verbe d'écriture + objet doc/fichier
  // OU présence d'un contenu texte). On préfère alors une action qui écrit du
  // contenu (…_FROM_TEXT, create_document, append_text) et on pénalise la
  // création de métadonnée vide (…_CREATE_FILE seul).
  const objectIsDoc = objectToks.some((t) =>
    ["file", "document", "doc", "text", "article", "note", "page"].includes(t),
  );
  const wantsTextWrite =
    WRITE_DOC_VERBS.has(primary) && (objectIsDoc || opts.hasTextContent === true);

  let best: { slug: string; score: number; rank: number; len: number } | null = null;

  for (const tool of tools) {
    // Outils DÉPRÉCIÉS : jamais choisis (Composio fournit toujours le
    // remplaçant — ex. TRELLO_ADD_BOARDS_LISTS… « (Deprecated) »).
    if (/deprecated/i.test(tool.name) || /^\s*deprecated/i.test(tool.description ?? "")) continue;

    const tail = toolTail(tool.slug, toolkit);
    const tailNorm = norm(tail);
    const slugToks = tokens(tail);
    const tailToks = new Set([...slugToks, ...tokens(tool.name)]);

    const hasVerb = Array.from(synonyms).some((s) => tailToks.has(s));
    const hasMutating = Array.from(tailToks).some((t) => MUTATING.has(t));
    const hasReadToken = Array.from(tailToks).some((t) => READ_ONLY_VERBS.has(t));

    // Garde-fou : verbe demandé en lecture seule mais outil mutant/destructif → on écarte.
    if (requestedReadOnly && hasMutating && !hasReadToken) continue;
    // Ancrage sur le PREMIER token du slug (= le verbe de l'API REST) : un nom
    // marketing contenant « list » ne blanchit pas un ADD_/CREATE_/DELETE_
    // (« Add new list to board » piégeait list_boards).
    if (requestedReadOnly && slugToks.length > 0 && MUTATING.has(slugToks[0])) continue;
    // Symétrique : verbe d'ÉCRITURE demandé mais outil purement lecture → on
    // écarte (sinon « create_spreadsheet » choisissait VALUES_GET parce que
    // son nom contenait « spreadsheet » — le score objet dominait le verbe).
    const requestedMutating = MUTATING.has(primary);
    if (requestedMutating && hasReadToken && !hasMutating) continue;

    // files ≈ file : l'objet matche au singulier comme au pluriel.
    const hasTokenOrPlural = (t: string) =>
      tailToks.has(t) ||
      tailToks.has(t.endsWith("s") ? t.slice(0, -1) : t + "s");
    const objectMatch =
      objectToks.length === 0 || objectToks.every(hasTokenOrPlural);

    let score = 0;
    if (tailNorm === verbNorm) score = 1000;
    else if (hasVerb && objectMatch) score = 800;
    else if (objectMatch && objectToks.length > 0) score = 400;
    else if (hasVerb) score = 250;
    else {
      let overlap = 0;
      for (const t of verbToks) if (tailToks.has(t)) overlap += 1;
      if (overlap > 0) score = overlap * 120;
    }

    if (score <= 0) continue;

    // Le verbe EXACT demandé prime sur un synonyme ET sur un simple match
    // d'objet — mais seulement s'il est en TÊTE du slug (position du verbe
    // dans les APIs REST) : « list » dans GET_LISTS_BOARD_BY_ID_LIST est un
    // OBJET (une liste Trello), pas le verbe.
    if (slugToks[0] === primary || tokens(tool.name)[0] === primary) score += 200;


    if (wantsTextWrite) {
      const writesText =
        /from[_ ]?text|create[_ ]?document|append[_ ]?text|write[_ ]?file|create[_ ]?doc/.test(tail);
      const metadataOnly = /\bcreate[_ ]?file\b/.test(tail) && !writesText;
      if (writesText) score += 500;
      // Création de fichier « métadonnée seule » → fortement dépriorisée.
      if (metadataOnly) score -= 600;
    }

    if (score <= 0) continue;

    // Tokens « en trop » (hors verbe/objet demandés, nom du toolkit et
    // mots-outils) : pour « create_design », COMMENT_REPLY_IN_DESIGN
    // (extras: comment, reply) doit perdre face à
    // CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET (extra: asset). La pénalité ne
    // sert qu'au CLASSEMENT (rankScore, calculé APRÈS tous les ajustements) —
    // pas à l'admissibilité, sinon les variantes légitimes
    // (rediger_brouillon → CREATE_EMAIL_DRAFT) passeraient sous le plancher.
    const requested = new Set([...verbToks, ...synonyms, ...tokens(toolkit)]);
    const STOPWORDS = new Set(["with", "optional", "in", "a", "an", "the", "new", "or", "and", "by", "for", "to", "of", "from", "text"]);
    // Un token « piège » est ANNULÉ si le schéma porte un paramètre
    // correspondant optionnel ou avec défaut : idMember (défaut « me ») sur
    // GET_MEMBERS_BOARDS ne change pas l'objet de l'action.
    const defaultedTokens = new Set<string>();
    for (const input of tool.inputs ?? []) {
      // Uniquement les params avec un VRAI défaut (idMember = « me ») : un
      // simple optionnel ne blanchit pas un piège (LIST_PERMISSIONS restait
      // choisi pour list_files via ses params optionnels).
      if (input.defaultValue !== undefined) {
        // Découpe camelCase (idMember → id, member) avant tokenisation.
        const snake = input.key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
        for (const t of tokens(snake)) defaultedTokens.add(t);
      }
    }
    let extras = 0;
    let traps = 0;
    for (const t of tailToks) {
      if (requested.has(t) || STOPWORDS.has(t)) continue;
      // Tokens à CHANGEMENT D'OBJET : « create_task » ne doit jamais tomber sur
      // CREATE_TASK_COMMENT, « create_issue » sur CREATE_ISSUE_NOTE, ni
      // « create_card » sur CREATE_CARD_STICKER — l'outil fait AUTRE CHOSE.
      if (TRAP_TOKENS.has(t)) {
        const singular = t.endsWith("s") ? t.slice(0, -1) : t;
        // Annulé ET gratuit : le sous-objet est auto-remplissable (défaut/optionnel),
        // il ne doit ni disqualifier ni pénaliser (idMember défaut « me »).
        if (!(defaultedTokens.has(t) || defaultedTokens.has(singular) || defaultedTokens.has(t + "s"))) {
          traps += 1;
        }
      } else {
        extras += 1;
      }
    }
    // Intention de LECTURE globale (list/get…) : un outil exigeant un ID
    // précis sans défaut est à la mauvaise granularité (GET_…_BY_ID_LIST
    // pour « lister mes boards ») — pénalisé au classement.
    let requiredNoDefault = 0;
    if (requestedReadOnly) {
      for (const input of tool.inputs ?? []) {
        if (input.required && input.defaultValue === undefined) requiredNoDefault += 1;
      }
    }
    const rankScore = score - extras * 80 - traps * 400 - requiredNoDefault * 100;

    const len = tail.length;
    if (
      !best ||
      rankScore > best.rank ||
      (rankScore === best.rank && len < best.len)
    ) {
      best = { slug: tool.slug, score, rank: rankScore, len };
    }
  }

  return best && best.score >= 200 ? best.slug : null;
}

const resolveCache = new Map<string, { at: number; slug: string | null }>();
const RESOLVE_CACHE_MS = 15 * 60 * 1000; // aligné sur le cache catalogue

/**
 * Trouve le slug Composio le mieux assorti à `actionId` pour le toolkit du
 * connecteur. Retourne `null` si aucun outil pertinent (et SÛR).
 */
export async function resolveComposioToolSlug(
  connectorId: string,
  actionId: string,
  opts: PickToolOptions = {},
): Promise<string | null> {
  const toolkit = toComposioToolkitSlug(connectorId);
  // La préférence d'écriture texte influe sur le choix → clé de cache distincte.
  const cacheKey = `${toolkit}::${actionId}::${opts.hasTextContent ? "txt" : "any"}`;
  const cached = resolveCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESOLVE_CACHE_MS) return cached.slug;

  let tools: ComposioToolEntry[];
  try {
    tools = await listComposioTools(toolkit);
  } catch (err) {
    // Échec TRANSITOIRE du catalogue (réseau, rate-limit) : surtout ne pas le
    // mettre en cache comme « action introuvable » (avant : un seul hoquet
    // réseau rendait l'action indisponible jusqu'au redémarrage du serveur).
    // Le [503] rend l'erreur retryable par withRetry côté exécution.
    throw new Error(
      `[503] Catalogue Composio momentanément indisponible (${err instanceof Error ? err.message : "erreur réseau"}) — réessayez.`,
    );
  }

  const result = tools.length > 0 ? pickToolSlug(tools, toolkit, actionId, opts) : null;
  resolveCache.set(cacheKey, { at: Date.now(), slug: result });
  return result;
}

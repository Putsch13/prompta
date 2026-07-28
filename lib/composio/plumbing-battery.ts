/**
 * Cœur de la BATTERIE DE PLOMBERIE Composio — voir scripts/plumbing-battery.ts
 * pour la doctrine. Vit dans lib/ pour être exécutable côté SERVEUR (sonde
 * /api/cron/composio-audit?plumbing=…), là où la clé Composio existe.
 * Aucune action n'est exécutée : catalogue (schémas) + fonctions pures.
 */

import { listComposioTools, type ComposioToolEntry } from "@/lib/composio/catalog";
import { resolveComposioToolSlug } from "@/lib/composio/resolve-native-action";
import { guardComposioParams } from "@/lib/composio/param-guard";
import { isSensitiveWriteStep, isWriteActionStep } from "@/lib/agent/approval-guards";
import { mapAgentError } from "@/lib/agent/error-map";


// ── Génération d'intentions « utilisateur » par toolkit ─────────────────────

const READ_TOKENS = new Set(["get", "list", "search", "fetch", "find", "query", "read", "retrieve", "lookup", "view", "show", "count", "describe", "export"]);
const WRITE_TOKENS = new Set(["send", "create", "add", "insert", "update", "delete", "remove", "post", "publish", "write", "append", "move", "archive", "upload", "import", "set", "replace", "cancel", "invite", "assign", "merge", "charge", "pay", "refund", "submit", "trigger"]);

function slugTokens(slug: string): string[] {
  return slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function toolFamily(slug: string, toolkitSlug?: string): "read" | "write" | "other" {
  // Le préfixe d'app peut contenir un verbe (« REMOVE_BG_GET_ACCOUNT » est
  // une lecture) : la famille se juge sur la queue, pas sur le nom d'app.
  let tail = slug;
  if (toolkitSlug) {
    const prefix = `${toolkitSlug.toUpperCase()}_`;
    if (slug.toUpperCase().startsWith(prefix)) tail = slug.slice(prefix.length);
  }
  const toks = slugTokens(tail);
  if (toks.some((t) => WRITE_TOKENS.has(t))) return "write";
  if (toks.some((t) => READ_TOKENS.has(t))) return "read";
  return "other";
}

/** Nom d'action « style planificateur » dérivé d'un slug réel du toolkit. */
function nativeActionFor(toolkitSlug: string, toolSlug: string): string {
  const prefix = `${toolkitSlug.toUpperCase()}_`;
  const tail = toolSlug.startsWith(prefix) ? toolSlug.slice(prefix.length) : toolSlug;
  return `${toolkitSlug}.${tail.toLowerCase()}`;
}

/** Variantes négligées qu'un LLM produit réellement. */
const SLOPPY_SYNONYM: Record<string, string> = {
  create: "add", fetch: "get", list: "get", retrieve: "get", search: "find",
  send: "send", update: "edit", delete: "remove", insert: "add",
};
function sloppyVariant(native: string): string | null {
  const [app, tail] = native.split(".");
  if (!tail) return null;
  const toks = tail.split("_");
  const syn = SLOPPY_SYNONYM[toks[0]];
  if (!syn || syn === toks[0]) return null;
  return `${app}.${[syn, ...toks.slice(1)].join("_")}`;
}

/** Échantillon représentatif : 1 lecture, 1 création/écriture, 1 autre. */
function sampleTools(tools: ComposioToolEntry[], toolkitSlug: string): ComposioToolEntry[] {
  const read = tools.find((t) => toolFamily(t.slug, toolkitSlug) === "read");
  const write = tools.find((t) => toolFamily(t.slug, toolkitSlug) === "write");
  const other = tools.find((t) => t !== read && t !== write);
  return [read, write, other].filter(Boolean) as ComposioToolEntry[];
}

/** Valeur plausible pour un input (comme un plan LLM la produirait). */
function plausibleValue(key: string): string {
  if (/id$/i.test(key)) return "{{id_decouvert}}";
  if (/email/i.test(key)) return "test@exemple.fr";
  if (/url|link/i.test(key)) return "https://exemple.fr/page";
  if (/date|time/i.test(key)) return "2026-07-28";
  if (/count|limit|num|max/i.test(key)) return "10";
  return "valeur de test";
}

/** camelCase ↔ snake_case (le LLM mélange les deux). */
function camelVariant(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ── Vérifications ───────────────────────────────────────────────────────────

export interface Failure {
  toolkit: string;
  check: string;
  action: string;
  detail: string;
}

export async function checkToolkit(toolkitSlug: string, failures: Failure[], counters: Record<string, number>): Promise<void> {
  let tools: ComposioToolEntry[];
  try {
    tools = await listComposioTools(toolkitSlug);
  } catch (e) {
    counters.catalog_unavailable++;
    failures.push({ toolkit: toolkitSlug, check: "catalogue", action: "-", detail: (e as Error).message.slice(0, 120) });
    return;
  }
  if (tools.length === 0) {
    counters.empty_toolkit++;
    return;
  }

  for (const tool of sampleTools(tools, toolkitSlug)) {
    const family = toolFamily(tool.slug, toolkitSlug);
    const native = nativeActionFor(toolkitSlug, tool.slug);
    const candidates = [native, sloppyVariant(native)].filter(Boolean) as string[];

    // 1. RÉSOLUTION — chaque forme que le planificateur peut écrire.
    for (const action of candidates) {
      counters.resolution_cases++;
      let slug: string | null = null;
      try {
        slug = await resolveComposioToolSlug(toolkitSlug, action);
      } catch (e) {
        counters.resolution_crash++;
        failures.push({ toolkit: toolkitSlug, check: "resolution_crash", action, detail: (e as Error).message.slice(0, 150) });
        continue;
      }
      if (!slug) {
        counters.resolution_none++;
        failures.push({ toolkit: toolkitSlug, check: "resolution_none", action, detail: `attendu ≈ ${tool.slug}` });
        continue;
      }
      // Une LECTURE demandée ne doit JAMAIS résoudre vers une mutation.
      const resolvedFamily = toolFamily(slug, toolkitSlug);
      if (family === "read" && resolvedFamily === "write") {
        counters.resolution_read_to_write++;
        failures.push({ toolkit: toolkitSlug, check: "resolution_read_to_write", action, detail: `→ ${slug}` });
      }
    }

    // 2. PARAM-GUARD — args réalistes : requis fournis en casse VARIANTE
    //    + une clé inventée. Attendu : alignement, élagage, zéro crash.
    counters.guard_cases++;
    const required = tool.inputs.filter((i) => i.required);
    const args: Record<string, string> = { target: "invention du LLM" };
    for (const inp of required) args[camelVariant(inp.key)] = plausibleValue(inp.key);
    try {
      const r = await guardComposioParams(toolkitSlug, tool.slug, args);
      if ("target" in r.args && !tool.inputs.some((i) => i.key === "target")) {
        counters.guard_prune_fail++;
        failures.push({ toolkit: toolkitSlug, check: "guard_prune_fail", action: tool.slug, detail: "clé inventée non élaguée" });
      }
      const stillMissing = required.filter((i) => !(i.key in r.args));
      if (stillMissing.length > 0) {
        counters.guard_align_fail++;
        failures.push({
          toolkit: toolkitSlug, check: "guard_align_fail", action: tool.slug,
          detail: `variantes camelCase non alignées : ${stillMissing.map((i) => i.key).join(", ")}`,
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("missing_required_params")) {
        // Acceptable UNIQUEMENT si le requis est un objet/array que notre
        // valeur string ne peut pas satisfaire — sinon échec d'alignement.
        counters.guard_missing_despite_provided++;
        failures.push({ toolkit: toolkitSlug, check: "guard_missing_despite_provided", action: tool.slug, detail: msg.slice(0, 150) });
      } else {
        counters.guard_crash++;
        failures.push({ toolkit: toolkitSlug, check: "guard_crash", action: tool.slug, detail: msg.slice(0, 150) });
      }
    }

    // 2bis. Requis OMIS volontairement → l'erreur doit être le message
    //       actionnable missing_required_params, jamais un crash brut.
    if (required.length > 0) {
      counters.guard_missing_cases++;
      try {
        await guardComposioParams(toolkitSlug, tool.slug, {});
        // Pas d'erreur = tous les requis ont des défauts de schéma : ok.
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("missing_required_params")) {
          counters.guard_missing_bad_error++;
          failures.push({ toolkit: toolkitSlug, check: "guard_missing_bad_error", action: tool.slug, detail: msg.slice(0, 150) });
        }
      }
    }

    // 3. APPROBATION — les deux formes d'action (native et slug brut).
    for (const form of [native, tool.slug]) {
      const step = { type: "action", connector: toolkitSlug, action: form, params: {} } as never;
      const sensitive = isSensitiveWriteStep(step);
      if (family === "read" && sensitive) {
        counters.approval_on_read++;
        failures.push({ toolkit: toolkitSlug, check: "approval_on_read", action: form, detail: "validation humaine exigée pour une lecture" });
      }
      if (family === "write" && !sensitive && !["googlesheets", "googledocs", "googledrive"].includes(toolkitSlug.replace(/[^a-z0-9]/g, ""))) {
        counters.no_approval_on_write++;
        failures.push({ toolkit: toolkitSlug, check: "no_approval_on_write", action: form, detail: "écriture sans validation humaine" });
      }
      // 4. RETRY — une écriture n'est jamais rejouable à l'aveugle.
      if (family === "write" && !isWriteActionStep(step)) {
        counters.retryable_write++;
        failures.push({ toolkit: toolkitSlug, check: "retryable_write", action: form, detail: "écriture considérée rejouable" });
      }
    }
  }
}

// ── Erreurs déterministes : classification et messages (une fois) ───────────

export function checkErrorMapping(failures: Failure[]): void {
  const cases: [string, (hint: string, msg: string) => boolean, string][] = [
    ["missing_required_params: L'action X requiert des champs non renseignés : « Y » (y).",
      (h) => !/builder/i.test(h) && h.length > 10, "hint builder-speak ou vide"],
    ["notion → x : [composio_error] Invalid request data provided - Extra inputs are not permitted",
      (_h, m) => m.length > 10, "message vide"],
  ];
  for (const [raw, ok, why] of cases) {
    const mapped = mapAgentError(new Error(raw), { connector: "notion", action: "notion.x" });
    if (!ok(mapped.hint ?? "", mapped.message)) {
      failures.push({ toolkit: "-", check: "error_map", action: raw.slice(0, 40), detail: why });
    }
  }
}


/**
 * QA MÉGA — campagne ~100 agents ultra-complexes sur l'infra déployée.
 *
 * Deux volets :
 *  A. ~24 missions PROFONDES sur les apps réellement connectées (gmail, sheets,
 *     docs, calendar, drive, youtube, trello, notion, canva) : parallèles,
 *     conditions, validations humaines, retrieve, multi-apps. Attendu : completed.
 *  B. ~76 agents CATALOGUE sur des toolkits non connectés (premiers slugs du
 *     catalogue Composio, popularité décroissante) : l'action est l'étape 1,
 *     le run doit échouer PROPREMENT (« X n'est pas connecté … Connexions »).
 *     Vérifie gate connecteur + message actionnable pour chaque app.
 *
 * GARDE-FOUS (ne pas retirer) :
 *  - budget dur : QA_BUDGET_CENTS (défaut 1000 = 10 $), arrêt des soumissions au-delà ;
 *  - AUCUN envoi vers des tiers : seul destinataire autorisé puccini.f13@gmail.com ;
 *  - Calendar sans invités ; AUCUNE action LinkedIn d'écriture ;
 *  - n'auto-approuve JAMAIS les runs d'autres utilisateurs ;
 *  - runs CONSERVÉS par défaut (inspection) — QA_MEGA_CLEAN=1 pour nettoyer.
 *
 * Usage : npx tsx scripts/qa-mega.ts
 *         QA_BUDGET_CENTS=1000 QA_MEGA_CONCURRENCY=6 npx tsx scripts/qa-mega.ts
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { loadEnvFiles } from "./load-env";
import { AgentManifestSchema, type AgentManifest } from "../lib/agent/schema";
import { estimateMaxCostForManifest } from "../lib/billing/estimate-manifest-cost";

loadEnvFiles();

const SELF_EMAIL = "puccini.f13@gmail.com";
const BASE_URL = process.env.QA_BASE_URL ?? "https://prompta-sjtf.onrender.com";
const BUDGET_CENTS = Number(process.env.QA_BUDGET_CENTS ?? 1000);
const MODEL = "gpt-5.4-mini";
const RUN_TIMEOUT_MS = Number(process.env.QA_RUN_TIMEOUT_MS ?? 240_000);
const CONCURRENCY = Number(process.env.QA_MEGA_CONCURRENCY ?? 6);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface MegaTest {
  name: string;
  goal: string;
  category: "profond" | "catalogue";
  manifest: Record<string, unknown>;
  inputs?: Record<string, string>;
  expect: string[];
  errorPattern?: RegExp;
  expectDeliverable?: boolean;
}

interface MegaResult {
  name: string;
  category: string;
  goal: string;
  runId: string | null;
  status: string;
  durationMs: number;
  stepsCompleted: number;
  error: string | null;
  verdict: "OK" | "ERREUR" | "MESSAGE_FLOU" | "SKIP";
  note?: string;
}

function llm(prompt: string, outputKey?: string) {
  return { type: "llm", model: MODEL, prompt, ...(outputKey ? { outputKey } : {}) };
}

function mailSelf(subject: string, bodyTemplate: string) {
  return {
    type: "action",
    connector: "gmail",
    action: "gmail.send",
    params: { from: SELF_EMAIL, to: SELF_EMAIL, subject, body: bodyTemplate },
  };
}

/** Pipeline Sheets exploitable : création, extraction d'id, écriture. */
function sheetsWrite(title: string, header: string, rowsTemplate: string, keyPrefix: string) {
  return [
    {
      type: "action",
      connector: "google_sheets",
      action: "google_sheets.create_spreadsheet",
      params: { title },
      outputKey: `${keyPrefix}_creation`,
    },
    llm(`Réponds UNIQUEMENT le spreadsheetId de : {{${keyPrefix}_creation}}`, `${keyPrefix}_id`),
    {
      type: "action",
      connector: "google_sheets",
      action: "google_sheets.append_row",
      params: { spreadsheet_id: `{{${keyPrefix}_id}}`, values: `${header}\n${rowsTemplate}` },
      outputKey: `${keyPrefix}_ecriture`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLET A — missions profondes (apps connectées, attendu completed)
// ─────────────────────────────────────────────────────────────────────────────

const DEEP_TESTS: MegaTest[] = [
  {
    name: "mega_gmail_triage_conditionnel",
    goal: "Gmail : lecture boîte → triage LLM → condition → rapport à soi-même",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "gmail", action: "gmail.read", params: { query: "in:inbox" }, outputKey: "boite" },
        llm("Trie ces emails en URGENT/NORMAL/IGNORER (une ligne par email, max 8) : {{boite}}. Termine par VERDICT: OK si au moins un email est listé, sinon VERDICT: VIDE.", "triage"),
        { type: "condition", expression: "{{triage}} contains VERDICT" },
        mailSelf("QA Méga — triage boîte", "{{triage}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_sheets_usine_verifiee",
    goal: "Sheets : création → écriture 6 lignes → relecture → contrôle LLM → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        ...sheetsWrite(
          "QA Méga — usine vérifiée",
          "PRODUIT;STOCK;PRIX",
          "Clavier;12;49\nSouris;30;19\nÉcran;7;179\nCasque;15;89\nWebcam;9;59\nHub USB;22;29",
          "usine",
        ),
        { type: "action", connector: "google_sheets", action: "sheets.read", params: { spreadsheetId: "{{usine_id}}", range: "A1:C7" }, outputKey: "relecture" },
        llm("Vérifie que {{relecture}} contient bien 6 produits. Réponds CONFORME ou ANOMALIE + détail.", "controle"),
        mailSelf("QA Méga — usine Sheets vérifiée", "Contrôle : {{controle}}\n\nFeuille : {{usine_creation}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_docs_rapport_veille",
    goal: "Docs : recherche web → rapport structuré → création Google Doc → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "agents IA autonomes entreprises 2026", num: "10" } },
        llm("Rédige un rapport de veille structuré (titre, 3 sections, conclusion) à partir de : {{step_0_output}}", "rapport"),
        { type: "action", connector: "google_docs", action: "google_docs.create_document", params: { title: "QA Méga — veille agents IA", text: "{{rapport}}" }, outputKey: "doc" },
        mailSelf("QA Méga — rapport de veille créé", "Doc créé : {{doc}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_calendar_analyse_semaine",
    goal: "Calendar : lecture agenda → analyse → créneau de travail créé (sans invités) → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "google_calendar", action: "google_calendar.list_events", params: {}, outputKey: "agenda" },
        llm("Analyse cet agenda et propose le meilleur créneau de travail profond demain : {{agenda}}. 2 lignes.", "analyse"),
        {
          type: "action", connector: "google_calendar", action: "google_calendar.create_event",
          params: { summary: "QA Méga — travail profond", description: "{{analyse}}", start_datetime: "2026-07-11T09:00:00", event_duration_hour: "2" },
        },
        mailSelf("QA Méga — créneau planifié", "{{analyse}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_drive_inventaire_classe",
    goal: "Drive : retrieve fichiers → classification LLM → écriture Sheets → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "documents récents", maxResults: 8, outputKey: "fichiers" },
        llm("Classe ces fichiers par type (tableur/doc/autre), format `NOM;TYPE` une ligne par fichier, max 8 lignes, rien d'autre : {{fichiers}}", "classement"),
        ...sheetsWrite("QA Méga — inventaire Drive", "NOM;TYPE", "{{classement}}", "inv"),
        mailSelf("QA Méga — inventaire Drive", "Classement :\n{{classement}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_youtube_veille_notion",
    goal: "YouTube : recherche vidéos → top 3 LLM → page Notion → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "youtube", action: "youtube.search_videos", params: { query: "prospection commerciale IA" }, outputKey: "videos" },
        llm("Sélectionne les 3 vidéos les plus pertinentes avec justification (markdown) : {{videos}}", "top3"),
        { type: "action", connector: "notion", action: "notion.search", params: { query: "QA" }, outputKey: "pages" },
        llm("Réponds UNIQUEMENT l'id (uuid) de la première page dans : {{pages}}", "parent"),
        { type: "action", connector: "notion", action: "notion.create_page", params: { parent_id: "{{parent}}", title: "QA Méga — veille YouTube", content: "{{top3}}" }, outputKey: "page" },
        mailSelf("QA Méga — veille YouTube dans Notion", "{{top3}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_trello_sprint_complet",
    goal: "Trello : board → liste → carte → email récap (chaîne d'ids extraits)",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        // Réutilise un board existant : l'espace Trello gratuit est à sa limite
        // de tableaux (les créations échoueraient en provider_quota).
        { type: "action", connector: "trello", action: "trello.list_boards", params: {}, outputKey: "boards" },
        llm("Réponds UNIQUEMENT l'id du premier board dont le nom commence par « QA » dans : {{boards}} (sinon l'id du premier board).", "board_id"),
        { type: "action", connector: "trello", action: "trello.create_list", params: { board_id: "{{board_id}}", name: "QA Méga — À faire" }, outputKey: "liste" },
        llm("Réponds UNIQUEMENT l'id de la liste dans : {{liste}}", "liste_id"),
        { type: "action", connector: "trello", action: "trello.create_card", params: { list_id: "{{liste_id}}", name: "Vérifier la chaîne QA Méga", description: "Carte créée par la campagne QA Méga." }, outputKey: "carte" },
        mailSelf("QA Méga — sprint Trello monté", "Board, liste et carte créés. Carte : {{carte}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_notion_base_connaissance",
    goal: "Notion : recherche pages → synthèse → nouvelle page structurée → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "notion", action: "notion.search", params: { query: "QA" }, outputKey: "existant" },
        llm("Réponds UNIQUEMENT l'id (uuid) de la première page dans : {{existant}}", "parent"),
        llm("Synthétise ce qui existe déjà ({{existant}}) puis rédige une page « État de la base QA » en markdown (titre + 3 sections).", "synthese"),
        { type: "action", connector: "notion", action: "notion.create_page", params: { parent_id: "{{parent}}", title: "QA Méga — état de la base", content: "{{synthese}}" } },
        mailSelf("QA Méga — base de connaissance Notion", "{{synthese}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_canva_studio_inventaire",
    goal: "Canva : création design → inventaire designs → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "canva", action: "canva.create_design", params: { title: "QA Méga — visuel test" }, outputKey: "design" },
        { type: "action", connector: "canva", action: "canva.list_designs", params: {}, outputKey: "designs" },
        llm("Compte les designs et liste les 5 plus récents : {{designs}}. Markdown court.", "inventaire"),
        mailSelf("QA Méga — studio Canva", "{{inventaire}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_multi_veille_totale",
    goal: "3 sources en parallèle (web + YouTube + Drive) → fusion → validation → Doc → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "automatisation agents IA PME France", num: "10" } }, llm("Résume en 5 puces : {{step_1_output}}", "web")], outputKey: "b_web" },
            { steps: [{ type: "action", connector: "youtube", action: "youtube.search_videos", params: { query: "automatisation PME IA" }, outputKey: "yt" }, llm("Top 3 vidéos en 3 puces : {{yt}}", "video")], outputKey: "b_video" },
            { steps: [{ type: "retrieve", source: "google_drive", query: "notes projets", maxResults: 5, outputKey: "docs" }, llm("Résume les documents internes en 3 puces : {{docs}}", "interne")], outputKey: "b_interne" },
          ],
          outputKey: "collecte",
        },
        llm("Fusionne en une note de veille cohérente (markdown, 3 sections) : WEB={{web}} VIDEO={{video}} INTERNE={{interne}}", "note"),
        { type: "approval", label: "QA Méga — valider la note de veille totale", payloadTemplate: "{{note}}", outputKey: "note_ok" },
        { type: "action", connector: "google_docs", action: "google_docs.create_document", params: { title: "QA Méga — veille totale", text: "{{note_ok}}" } },
        mailSelf("QA Méga — veille totale validée", "{{note_ok}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_crm_pipeline_complet",
    goal: "CRM : génération leads → Sheets → priorisation → RDV Calendar → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        llm("Génère 5 leads B2B fictifs (entreprises inventées) au format `ENTREPRISE;SECTEUR;SCORE` (score 1-10), rien d'autre.", "leads"),
        ...sheetsWrite("QA Méga — pipeline CRM", "ENTREPRISE;SECTEUR;SCORE", "{{leads}}", "crm"),
        llm("Quel lead prioriser dans {{leads}} ? Une ligne de justification.", "priorite"),
        {
          type: "action", connector: "google_calendar", action: "google_calendar.create_event",
          params: { summary: "QA Méga — RDV lead prioritaire", description: "{{priorite}}", start_datetime: "2026-07-11T15:00:00", event_duration_hour: "1" },
        },
        mailSelf("QA Méga — pipeline CRM prêt", "Priorité : {{priorite}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_double_condition_routage",
    goal: "Routage : verdict LLM → condition 1 → plan → condition 2 → email",
    category: "profond",
    manifest: {
      kind: "agent",
      inputs: [{ key: "projet", label: "Projet", required: true, type: "text" }],
      steps: [
        llm("Évalue la faisabilité de « {{projet}} ». Termine impérativement par VERDICT: GO.", "verdict"),
        { type: "condition", expression: "{{verdict}} contains GO" },
        llm("Rédige un plan en 3 étapes pour {{projet}}. Termine par PLAN: PRET.", "plan"),
        { type: "condition", expression: "{{plan}} contains PRET" },
        mailSelf("QA Méga — routage double condition", "{{plan}}"),
      ],
    },
    inputs: { projet: "automatiser le suivi client d'une agence" },
    expect: ["completed"],
  },
  {
    name: "mega_agenda_vers_docs",
    goal: "Calendar → ordre du jour LLM → Google Doc → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "google_calendar", action: "google_calendar.list_events", params: {}, outputKey: "agenda" },
        llm("Transforme cet agenda en ordre du jour de revue hebdo (markdown, 4 points) : {{agenda}}", "odj"),
        { type: "action", connector: "google_docs", action: "google_docs.create_document", params: { title: "QA Méga — ordre du jour hebdo", text: "{{odj}}" } },
        mailSelf("QA Méga — ordre du jour prêt", "{{odj}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_contenu_multicanal",
    goal: "3 contenus en parallèle → validation → Notion + email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [llm("Article de blog 150 mots sur les agents IA pour PME.", "article")], outputKey: "b1" },
            { steps: [llm("Post réseau social 50 mots sur le même thème (SANS le publier).", "post")], outputKey: "b2" },
            { steps: [llm("Objet + 3 lignes de newsletter sur le même thème.", "newsletter")], outputKey: "b3" },
          ],
          outputKey: "contenus",
        },
        llm("Assemble en un kit éditorial markdown : ARTICLE={{article}} POST={{post}} NEWSLETTER={{newsletter}}", "kit"),
        { type: "approval", label: "QA Méga — valider le kit éditorial", payloadTemplate: "{{kit}}", outputKey: "kit_ok" },
        { type: "action", connector: "notion", action: "notion.search", params: { query: "QA" }, outputKey: "pages" },
        llm("Réponds UNIQUEMENT l'id (uuid) de la première page dans : {{pages}}", "parent"),
        { type: "action", connector: "notion", action: "notion.create_page", params: { parent_id: "{{parent}}", title: "QA Méga — kit éditorial", content: "{{kit_ok}}" } },
        mailSelf("QA Méga — kit éditorial validé", "{{kit_ok}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_gmail_croise_drive",
    goal: "Boîte mail + Drive croisés → analyse LLM → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "gmail", action: "gmail.read", params: { query: "in:inbox" }, outputKey: "mails" },
        { type: "retrieve", source: "google_drive", query: "rapports", maxResults: 5, outputKey: "docs" },
        llm("Croise ces emails ({{mails}}) et ces documents ({{docs}}) : y a-t-il des sujets communs ? 4 puces max.", "croisement"),
        mailSelf("QA Méga — croisement mail/Drive", "{{croisement}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_youtube_playlist_thematique",
    goal: "YouTube : playlists existantes → nouvelle playlist thématique → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "youtube", action: "youtube.list_playlists", params: {}, outputKey: "playlists" },
        llm("Résume les playlists existantes en 3 puces : {{playlists}}", "etat"),
        { type: "action", connector: "youtube", action: "youtube.create_playlist", params: { title: "QA Méga — veille IA", description: "Playlist créée par la campagne QA Méga." }, outputKey: "nouvelle" },
        mailSelf("QA Méga — playlist créée", "État : {{etat}}\n\nNouvelle : {{nouvelle}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_sheets_double_ecriture",
    goal: "Sheets : création → 2 écritures successives → relecture → contrôle",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        ...sheetsWrite("QA Méga — double écriture", "LOT;VALEUR", "A;1\nB;2\nC;3", "d1"),
        { type: "action", connector: "google_sheets", action: "google_sheets.append_row", params: { spreadsheet_id: "{{d1_id}}", values: "D;4\nE;5\nF;6" }, outputKey: "ecriture2" },
        { type: "action", connector: "google_sheets", action: "sheets.read", params: { spreadsheetId: "{{d1_id}}", range: "A1:B7" }, outputKey: "relecture" },
        llm("Vérifie que {{relecture}} contient 6 lots (A à F). Réponds CONFORME ou ANOMALIE + détail.", "controle"),
        mailSelf("QA Méga — double écriture contrôlée", "{{controle}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_trello_etat_des_lieux",
    goal: "Trello : inventaire boards → analyse → board d'archivage → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "trello", action: "trello.list_boards", params: {}, outputKey: "boards" },
        // Pas de create_board : l'espace gratuit est à sa limite de tableaux.
        llm("Fais l'état des lieux de ces boards (nombre, noms, lesquels semblent être des tests à archiver) : {{boards}}. 4 puces.", "etat"),
        mailSelf("QA Méga — état des lieux Trello", "{{etat}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_docs_bilingue",
    goal: "Docs : texte FR → traduction EN → document bilingue → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        llm("Rédige un paragraphe (80 mots) présentant un service d'agents IA.", "fr"),
        llm("Traduis en anglais professionnel : {{fr}}", "en"),
        { type: "action", connector: "google_docs", action: "google_docs.create_document", params: { title: "QA Méga — présentation bilingue", text: "FRANÇAIS\n\n{{fr}}\n\nENGLISH\n\n{{en}}" } },
        mailSelf("QA Méga — document bilingue créé", "FR : {{fr}}\n\nEN : {{en}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_calendar_conflits_sheets",
    goal: "Calendar : détection de conflits → rapport Sheets → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: "google_calendar", action: "google_calendar.list_events", params: {}, outputKey: "agenda" },
        llm("Détecte les chevauchements/conflits dans {{agenda}}. Format `CRENEAU;PROBLEME` une ligne par constat (ou `aucun;RAS`), max 5 lignes, rien d'autre.", "conflits"),
        ...sheetsWrite("QA Méga — conflits agenda", "CRENEAU;PROBLEME", "{{conflits}}", "cf"),
        mailSelf("QA Méga — audit agenda", "Constats :\n{{conflits}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "mega_notion_trello_pont",
    goal: "Pont Notion→Trello : tâches depuis une synthèse → board + page → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        llm("Génère 4 tâches de préparation d'un lancement produit, format markdown liste.", "taches"),
        { type: "action", connector: "notion", action: "notion.search", params: { query: "QA" }, outputKey: "pages" },
        llm("Réponds UNIQUEMENT l'id (uuid) de la première page dans : {{pages}}", "parent"),
        { type: "action", connector: "notion", action: "notion.create_page", params: { parent_id: "{{parent}}", title: "QA Méga — plan de lancement", content: "{{taches}}" } },
        { type: "action", connector: "trello", action: "trello.list_boards", params: {}, outputKey: "boards" },
        mailSelf("QA Méga — pont Notion/Trello", "{{taches}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_canva_brief_tendances",
    goal: "Canva : recherche tendances → brief créa → design → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "tendances design graphique 2026", num: "8" } },
        llm("Rédige un brief créa (5 puces) à partir de : {{step_0_output}}", "brief"),
        { type: "action", connector: "canva", action: "canva.create_design", params: { title: "QA Méga — brief tendances" } },
        mailSelf("QA Méga — brief créa", "{{brief}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_double_validation_chaine",
    goal: "Chaîne à DOUBLE validation humaine : proposition → OK → raffinement → OK → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        llm("Propose une offre commerciale simple pour un service d'agents IA (5 lignes).", "offre"),
        { type: "approval", label: "QA Méga — valider l'offre brute", payloadTemplate: "{{offre}}", outputKey: "offre_ok" },
        llm("Raffine cette offre validée en version premium (5 lignes) : {{offre_ok}}", "premium"),
        { type: "approval", label: "QA Méga — valider la version premium", payloadTemplate: "{{premium}}", outputKey: "premium_ok" },
        mailSelf("QA Méga — offre doublement validée", "{{premium_ok}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "mega_stress_parallele_fusion",
    goal: "Stress : 4 branches parallèles → fusion → condition → Sheets → email",
    category: "profond",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [llm("Un risque marché d'un SaaS d'agents IA, 1 ligne.", "r1")], outputKey: "b1" },
            { steps: [llm("Un risque technique d'un SaaS d'agents IA, 1 ligne.", "r2")], outputKey: "b2" },
            { steps: [llm("Un risque juridique d'un SaaS d'agents IA, 1 ligne.", "r3")], outputKey: "b3" },
            { steps: [llm("Un risque financier d'un SaaS d'agents IA, 1 ligne.", "r4")], outputKey: "b4" },
          ],
          outputKey: "risques",
        },
        llm("Fusionne au format `RISQUE;GRAVITE` (gravité 1-5), 4 lignes, rien d'autre : {{r1}} | {{r2}} | {{r3}} | {{r4}}. ", "matrice"),
        { type: "condition", expression: "{{matrice}} contains ;" },
        ...sheetsWrite("QA Méga — matrice de risques", "RISQUE;GRAVITE", "{{matrice}}", "mx"),
        mailSelf("QA Méga — matrice de risques", "{{matrice}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// VOLET B — couverture catalogue (toolkits non connectés, échec propre attendu)
// ─────────────────────────────────────────────────────────────────────────────

/** Alias de TOUTES les apps connectées du compte (les deux formes). */
const CONNECTED = new Set([
  "gmail", "google_sheets", "googlesheets", "google_docs", "googledocs",
  "google_calendar", "googlecalendar", "google_drive", "googledrive",
  "youtube", "trello", "notion", "linkedin", "canva",
]);

/** Verbe de lecture plausible par famille — juste pour un id d'action réaliste. */
function coverageAction(slug: string): string {
  if (/mail|smtp|send/.test(slug)) return `${slug}.list_messages`;
  if (/cal|schedul/.test(slug)) return `${slug}.list_events`;
  if (/crm|sales|pipe|hub/.test(slug)) return `${slug}.list_contacts`;
  if (/git|jira|linear|asana|clickup|monday|todo/.test(slug)) return `${slug}.list_issues`;
  if (/search|tavily|serp|exa|perplexity|firecrawl/.test(slug)) return `${slug}.search`;
  return `${slug}.list_items`;
}

function buildCatalogueTests(count: number): MegaTest[] {
  const slugs = (JSON.parse(readFileSync("scripts/tmp/toolkits.json", "utf-8")) as { slugs: string[] }).slugs;
  const picked = slugs.filter((s) => !CONNECTED.has(s)).slice(0, count);
  return picked.map((slug) => ({
    name: `mega_cat_${slug}`,
    goal: `Catalogue : ${slug} — l'agent tente une lecture, le message d'échec doit être actionnable`,
    category: "catalogue" as const,
    manifest: {
      kind: "agent",
      steps: [
        { type: "action", connector: slug, action: coverageAction(slug), params: {}, outputKey: "donnees" },
        llm(`Résume en 3 puces : {{donnees}}`, "resume"),
        { type: "condition", expression: "{{resume}} contains •" },
        mailSelf(`QA Méga — ${slug}`, "{{resume}}"),
      ],
    },
    // Non connecté → failed avec message actionnable. Certains toolkits sans
    // auth (recherche, sandbox) peuvent aller au bout → completed toléré.
    expect: ["failed", "completed"],
    errorPattern: /connecté|Connexions|connexion|non supporté|introuvable|clé API/i,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Harnais parallèle
// ─────────────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/cron/tick`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  } catch { /* best-effort */ }
}

async function autoApproveOwn(runIds: Set<string>, userId: string): Promise<boolean> {
  const { data: pending } = await sb.from("agent_approvals").select("id, run_id").eq("status", "pending");
  let approved = false;
  for (const a of pending ?? []) {
    if (!runIds.has(a.run_id)) continue; // JAMAIS les runs d'autrui
    const { decideApproval } = await import("../lib/agent/approvals");
    await decideApproval(a.id, userId, "approved").catch(() => undefined);
    approved = true;
  }
  return approved;
}

async function runOne(test: MegaTest, userId: string, ownRunIds: Set<string>): Promise<MegaResult> {
  const base: Omit<MegaResult, "status" | "verdict"> = {
    name: test.name, category: test.category, goal: test.goal,
    runId: null, durationMs: 0, stepsCompleted: 0, error: null,
  };
  const parsed = AgentManifestSchema.safeParse(test.manifest);
  if (!parsed.success) {
    return { ...base, status: "invalid_manifest", verdict: "ERREUR", error: JSON.stringify(parsed.error.issues.slice(0, 2)) };
  }
  const manifest: AgentManifest = parsed.data;

  const { data: run, error: insertErr } = await sb
    .from("listing_agent_runs")
    .insert({
      user_id: userId, listing_id: null, status: "pending", dry_run: false,
      inputs: { ...(test.inputs ?? {}), __manifest: JSON.stringify(manifest), __qa: "1", __qa_mega: "1" },
    })
    .select("id").single();
  if (insertErr || !run?.id) {
    return { ...base, status: "insert_failed", verdict: "ERREUR", error: insertErr?.message ?? "?" };
  }
  ownRunIds.add(run.id);
  const started = Date.now();
  void tick();

  let final = { status: "pending", error_message: null as string | null, steps_completed: 0 as number | null };
  while (Date.now() - started < RUN_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data: row } = await sb
      .from("listing_agent_runs")
      .select("status, error_message, steps_completed")
      .eq("id", run.id).single();
    if (row) final = row;
    if (["completed", "failed", "suspended", "cancelled"].includes(final.status)) break;
    if (["awaiting_approval", "running", "pending"].includes(final.status)) {
      const did = await autoApproveOwn(ownRunIds, userId);
      if (did) await tick();
    }
    if (final.status === "pending") void tick();
  }

  const durationMs = Date.now() - started;
  let verdict: MegaResult["verdict"] = "OK";
  let note: string | undefined;
  if (!test.expect.includes(final.status)) {
    verdict = "ERREUR";
    if (final.status === "pending") note = "Jamais traité — worker saturé ?";
  } else if (final.status === "failed" && test.errorPattern && !test.errorPattern.test(final.error_message ?? "")) {
    verdict = "MESSAGE_FLOU";
    note = "Échec attendu mais message non actionnable";
  } else if (test.expectDeliverable && final.status === "completed") {
    const { count } = await sb.from("agent_deliverables").select("*", { count: "exact", head: true }).eq("run_id", run.id);
    if (!count) { verdict = "ERREUR"; note = "Aucun livrable persisté"; }
  }
  return {
    ...base, runId: run.id, status: final.status, durationMs,
    stepsCompleted: final.steps_completed ?? 0, error: final.error_message, verdict, note,
  };
}

async function main() {
  console.log(`QA MÉGA — cible ${BASE_URL}, budget ${BUDGET_CENTS}¢, concurrence ${CONCURRENCY}\n`);
  if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET requis (.env.local)");

  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = users.users.find((u) => u.email?.toLowerCase() === SELF_EMAIL);
  if (!user) throw new Error(`Compte ${SELF_EMAIL} introuvable`);

  const only = process.env.QA_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const catalogueCount = Number(process.env.QA_MEGA_CATALOGUE ?? 76);
  let pool: MegaTest[] = [...DEEP_TESTS, ...buildCatalogueTests(catalogueCount)];
  if (only?.length) pool = pool.filter((t) => only.includes(t.name));
  console.log(`${pool.length} agents (${pool.filter((t) => t.category === "profond").length} profonds, ${pool.filter((t) => t.category === "catalogue").length} catalogue)\n`);

  // Budget dur : on écarte AVANT lancement tout ce qui dépasserait le plafond.
  let spentEstimate = 0;
  const results: MegaResult[] = [];
  const queue: MegaTest[] = [];
  for (const test of pool) {
    const parsed = AgentManifestSchema.safeParse(test.manifest);
    const estimate = parsed.success ? estimateMaxCostForManifest(parsed.data) : 0;
    if (spentEstimate + estimate > BUDGET_CENTS) {
      results.push({
        name: test.name, category: test.category, goal: test.goal, runId: null,
        status: "skipped", durationMs: 0, stepsCompleted: 0, error: null,
        verdict: "SKIP", note: `Budget atteint (${spentEstimate.toFixed(0)}¢)`,
      });
      continue;
    }
    spentEstimate += estimate;
    queue.push(test);
  }
  console.log(`Estimation max engagée : ~${spentEstimate.toFixed(0)}¢ / ${BUDGET_CENTS}¢ — ${queue.length} lancés, ${results.length} écartés\n`);

  const ownRunIds = new Set<string>();
  let idx = 0;
  let done = 0;
  async function workerLoop(): Promise<void> {
    while (idx < queue.length) {
      const test = queue[idx++];
      const r = await runOne(test, user!.id, ownRunIds);
      results.push(r);
      done++;
      console.log(`[${done}/${queue.length}] ${r.name} → ${r.status} ${r.verdict !== "OK" ? `[${r.verdict}]` : ""} (${(r.durationMs / 1000).toFixed(0)}s)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => workerLoop()));

  // ── Rapport ──
  const lines: string[] = [
    `# Rapport QA MÉGA — ${new Date().toISOString()}`,
    `Cible : ${BASE_URL} · Budget max engagé : ~${spentEstimate.toFixed(0)}¢ / ${BUDGET_CENTS}¢ · ${results.length} agents`,
    "",
    "| Agent | Cat. | Statut | Verdict | Durée | Erreur/Note |",
    "|---|---|---|---|---|---|",
  ];
  const order = { ERREUR: 0, MESSAGE_FLOU: 1, OK: 2, SKIP: 3 } as const;
  for (const r of [...results].sort((a, b) => order[a.verdict] - order[b.verdict])) {
    lines.push(
      `| ${r.name} | ${r.category} | ${r.status} | **${r.verdict}**${r.note ? ` — ${r.note}` : ""} | ${(r.durationMs / 1000).toFixed(0)}s | ${(r.error ?? "").replace(/\n/g, " ").replace(/\|/g, "\\|").slice(0, 160)} |`,
    );
  }
  mkdirSync("scripts/tmp", { recursive: true });
  writeFileSync("scripts/tmp/qa-mega-report.md", lines.join("\n") + "\n");

  const bad = results.filter((r) => r.verdict === "ERREUR" || r.verdict === "MESSAGE_FLOU");
  console.log(`\n═══ ${results.length} agents · ${bad.length} problème(s) ═══`);
  for (const r of bad) console.log(`✗ ${r.name} [${r.status}] ${(r.error ?? r.note ?? "").slice(0, 140)}`);
  console.log(`\nRapport : scripts/tmp/qa-mega-report.md`);

  // Conservation par défaut (inspection) — QA_MEGA_CLEAN=1 pour nettoyer.
  if (process.env.QA_MEGA_CLEAN === "1") {
    const ids = Array.from(ownRunIds);
    if (ids.length > 0) {
      await sb.from("listing_agent_run_steps").delete().in("run_id", ids);
      await sb.from("agent_approvals").delete().in("run_id", ids);
      await sb.from("agent_deliverables").delete().in("run_id", ids).then(() => undefined, () => undefined);
      await sb.from("listing_agent_runs").delete().in("id", ids);
      console.log(`Nettoyage : ${ids.length} runs supprimés.`);
    }
  }
  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA MÉGA — erreur fatale :", err);
  process.exit(2);
});

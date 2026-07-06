/**
 * QA AUTOPILOT — teste la chaîne agent de bout en bout SUR L'INFRA DÉPLOYÉE
 * (vrais Composio/LLM/worker) et produit un rapport d'erreurs.
 *
 * Ce que fait le script :
 *  1. construit une matrice de manifestes couvrant les types d'étapes
 *     (LLM, variables, chaînage, condition, parallèle, validation humaine,
 *     actions Composio, retrieve, limites…) ;
 *  2. insère chaque run en base (manifeste embarqué, comme un test builder) ;
 *  3. déclenche le traitement via /api/cron/tick de la prod (CRON_SECRET) ;
 *  4. auto-approuve les validations humaines DE SES PROPRES runs uniquement ;
 *  5. écrit un rapport (scripts/tmp/qa-report.md) + résumé console ;
 *  6. nettoie ses runs (sauf KEEP_QA_RUNS=1).
 *
 * GARDE-FOUS (ne pas retirer) :
 *  - budget dur : arrêt des soumissions au-delà de QA_BUDGET_CENTS (défaut 400) ;
 *  - AUCUN envoi vers des tiers : le seul destinataire autorisé est
 *    puccini.f13@gmail.com (email du propriétaire) ; pas de Slack/Telegram ;
 *  - n'auto-approuve JAMAIS les runs d'autres utilisateurs.
 *
 * Usage : npx tsx scripts/qa-autopilot.ts
 *         QA_BASE_URL=https://… KEEP_QA_RUNS=1 npx tsx scripts/qa-autopilot.ts
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { loadEnvFiles } from "./load-env";
import { AgentManifestSchema, type AgentManifest } from "../lib/agent/schema";
import { estimateMaxCostForManifest } from "../lib/billing/estimate-manifest-cost";

loadEnvFiles();

const SELF_EMAIL = "puccini.f13@gmail.com";
const BASE_URL = process.env.QA_BASE_URL ?? "https://prompta-sjtf.onrender.com";
const BUDGET_CENTS = Number(process.env.QA_BUDGET_CENTS ?? 400);
const MODEL = "gpt-5.4-mini";
const RUN_TIMEOUT_MS = 150_000;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface QaTest {
  name: string;
  goal: string;
  manifest: Record<string, unknown>;
  inputs?: Record<string, string>;
  /** Statuts finaux acceptables. */
  expect: string[];
  /** Si failed : le message doit matcher (sinon on signale un message flou). */
  errorPattern?: RegExp;
  /** Vérifie qu'au moins un livrable a été persisté (dossier de mission). */
  expectDeliverable?: boolean;
}

function llm(prompt: string, outputKey?: string) {
  return { type: "llm", model: MODEL, prompt, ...(outputKey ? { outputKey } : {}) };
}

// Scénarios ULTRA-COMPLEXES conservés pour inspection manuelle
// (KEEP_QA_RUNS=1 les garde en base ; QA_ONLY="ultra_*" pour ne lancer qu'eux).
const ULTRA_TESTS: QaTest[] = [
  {
    name: "ultra_veille_multi_sources",
    goal: "Veille : Drive + web → synthèse structurée → Sheets → validation → email récap",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "mes documents récents", maxResults: 5, outputKey: "docs" },
        { type: "tool", tool: "web_search", params: { query: "tendances IA agents 2026" } },
        llm(
          "À partir des documents {{docs}} et de la recherche web {{step_1_output}}, rédige une note de veille structurée en 5 points avec titres.",
          "note",
        ),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "QA Ultra — note de veille" },
        },
        { type: "approval", label: "QA Ultra — valider la note avant diffusion", payloadTemplate: "{{note}}", outputKey: "note_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "QA Ultra — note de veille", body: "{{note_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "ultra_branches_paralleles_conditionnelles",
    goal: "Parallèle (3 analyses) → fusion → condition → LLM final",
    manifest: {
      kind: "agent",
      inputs: [{ key: "sujet", label: "Sujet", required: true, type: "text" }],
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [llm("Angle commercial de : {{sujet}}, 2 lignes.")], outputKey: "commercial" },
            { steps: [llm("Angle technique de : {{sujet}}, 2 lignes.")], outputKey: "technique" },
            { steps: [llm("Angle risques de : {{sujet}}, 2 lignes.")], outputKey: "risques" },
          ],
          outputKey: "analyses",
        },
        llm("Synthétise commercial={{commercial}} technique={{technique}} risques={{risques}}. Termine par: VERDICT: GO ou VERDICT: NOGO.", "verdict"),
        { type: "condition", expression: "{{verdict}} contains GO" },
        llm("Rédige une recommandation finale d'une ligne basée sur : {{verdict}}"),
      ],
    },
    inputs: { sujet: "lancer un agent IA de support client" },
    expect: ["completed"],
  },
  {
    name: "ultra_calendar_drive_notion_chain",
    goal: "Multi-apps : événement Calendar + lecture Drive + note structurée (4 apps, 6 étapes)",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "mes fichiers récents", maxResults: 3, outputKey: "src" },
        llm("Résume ces éléments en un ordre du jour de réunion (3 points) : {{src}}", "odj"),
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: {
            summary: "QA Ultra — revue",
            description: "{{odj}}",
            start_datetime: "2026-07-10T14:00:00",
            event_duration_hour: "1",
          },
        },
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "QA Ultra — ordre du jour" },
        },
        { type: "approval", label: "QA Ultra — valider l'ordre du jour", payloadTemplate: "{{odj}}", outputKey: "odj_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "QA Ultra — ordre du jour validé", body: "{{odj_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
];

const TESTS: QaTest[] = [
  {
    name: "llm_simple",
    goal: "Un agent 1 étape LLM répond",
    manifest: { kind: "agent", steps: [llm("Réponds exactement : ok")] },
    expect: ["completed"],
  },
  {
    name: "llm_variables",
    goal: "Interpolation d'un input {{name}}",
    manifest: {
      kind: "agent",
      inputs: [{ key: "name", label: "Nom", required: true, type: "text" }],
      steps: [llm("Dis bonjour à {{name}} en 3 mots max.")],
    },
    inputs: { name: "Florent" },
    expect: ["completed"],
  },
  {
    name: "llm_chainage_outputkey",
    goal: "Chaînage sortie → prompt suivant",
    manifest: {
      kind: "agent",
      steps: [
        llm("Donne un mot au hasard, un seul.", "mot"),
        llm("Épelle « {{mot}} » en majuscules, réponse courte."),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "condition",
    goal: "Étape condition (== sur littéral)",
    manifest: {
      kind: "agent",
      steps: [llm("Réponds exactement : oui", "verdict"), { type: "condition", expression: '{{verdict}} contains oui' }],
    },
    expect: ["completed"],
  },
  {
    name: "parallele",
    goal: "2 branches LLM en parallèle",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [llm("Réponds : A")], outputKey: "a" },
            { steps: [llm("Réponds : B")], outputKey: "b" },
          ],
          outputKey: "fusion",
        },
        llm("Concatène {{a}} et {{b}}, réponse courte."),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "validation_humaine",
    goal: "Pause approbation → auto-approve → reprise → fin",
    manifest: {
      kind: "agent",
      steps: [
        llm("Écris une phrase de test.", "contenu"),
        { type: "approval", label: "QA — valider le contenu", payloadTemplate: "{{contenu}}", outputKey: "valide" },
        llm("Répète ceci sans rien changer : {{valide}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "limites_12_etapes",
    goal: "12 étapes LLM (anciennes limites : mort à la 6e)",
    manifest: {
      kind: "agent",
      steps: Array.from({ length: 12 }, (_, i) => llm(`Réponds : ${i + 1}`)),
    },
    expect: ["completed"],
  },
  {
    name: "gmail_envoi_a_soi",
    goal: "Action Gmail réelle — destinataire = soi-même UNIQUEMENT",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: {
            from: SELF_EMAIL,
            to: SELF_EMAIL,
            subject: "QA Prompta — test automatique",
            body: "Email envoyé par le QA autopilot Prompta. Aucun destinataire tiers.",
          },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "canva_param_requis_manquant",
    goal: "Garde générique : champ requis absent → erreur claire AVANT l'appel (ou default auto)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { title: "QA Prompta — garde params" },
        },
      ],
    },
    expect: ["completed", "failed"],
    errorPattern: /requiert des champs non renseignés|missing_required_params/i,
  },
  {
    name: "canva_creation_complete",
    goal: "Création Canva réelle avec design_type fourni",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "QA Prompta — création test" },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "drive_retrieve",
    goal: "Lecture Google Drive (retrieve)",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "liste mes 3 fichiers les plus récents", maxResults: 3 },
        llm("Résume en une ligne : {{step_0_output}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "action_inexistante",
    goal: "Action inventée sur toolkit Composio → message actionnable",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.faire_le_cafe",
          params: {},
        },
      ],
    },
    expect: ["failed"],
    errorPattern: /introuvable|choisissez une action existante|requiert des champs/i,
  },
  // ─────────────────────── Scénarios MULTI-COUCHES (v3) ──────────────────
  {
    name: "pipeline_sheets_bout_en_bout",
    goal: "Créer une feuille → extraire son id → y écrire des valeurs (3 couches)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "QA Prompta — pipeline bout en bout" },
          outputKey: "creation",
        },
        llm(
          "Voici la réponse d'une API de création de spreadsheet : {{creation}}\nRéponds UNIQUEMENT l'identifiant (spreadsheetId) sans rien d'autre.",
          "sheet_id",
        ),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.append_row",
          params: {
            spreadsheet_id: "{{sheet_id}}",
            values: "QA;Prompta;ok",
          },
        },
      ],
    },
    expect: ["completed", "failed"],
    errorPattern: /requiert des champs|introuvable|choisissez|invalid/i,
  },
  {
    name: "mission_multi_apps",
    goal: "Drive → analyse → Sheets → Calendar → validation → Gmail récap (5 apps)",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "mes 3 fichiers les plus récents", maxResults: 3 },
        llm("Analyse ces fichiers et fais un plan d'action en 3 points : {{step_0_output}}", "plan"),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "QA Prompta — plan d'action" },
        },
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: {
            summary: "QA Prompta — revue du plan",
            description: "{{plan}}",
            start_datetime: "2026-07-04T10:00:00",
            event_duration_hour: "1",
          },
        },
        { type: "approval", label: "QA — valider le récap avant email", payloadTemplate: "{{plan}}", outputKey: "plan_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: {
            from: SELF_EMAIL,
            to: SELF_EMAIL,
            subject: "QA Prompta — mission multi-apps",
            body: "Plan validé :\n\n{{plan_ok}}",
          },
        },
      ],
    },
    // gmail peut échouer en 403 tant que la connexion n'a pas le scope d'envoi.
    expect: ["completed", "failed"],
    errorPattern: /autorisation manquante|reconnectez gmail/i,
    expectDeliverable: true,
  },
  {
    name: "json_extraction_profonde",
    goal: "Chemin JSON à 2 niveaux {{data.client.ville}}",
    manifest: {
      kind: "agent",
      steps: [
        llm('Réponds UNIQUEMENT ce JSON : {"client":{"nom":"Dupont","ville":"Lyon"},"score":42}', "data"),
        llm("Ville du client (un mot) : {{data.client.ville}} — score : {{data.score}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "code_sandbox",
    goal: "Étape code Python (sandbox E2B)",
    manifest: {
      kind: "agent",
      steps: [{ type: "code", source: "print('qa-sandbox-ok')" }],
    },
    expect: ["completed", "failed"],
    errorPattern: /E2B|sandbox|clé/i,
  },
  {
    name: "stress_25_etapes",
    goal: "25 étapes LLM (plafonds redimensionnés + timeout 5 min)",
    manifest: {
      kind: "agent",
      steps: Array.from({ length: 25 }, (_, i) => llm(`Réponds uniquement : ${i + 1}`)),
    },
    expect: ["completed"],
  },
  // ───────────────────────────── Scénarios COMPLEXES ─────────────────────
  {
    name: "mission_complete_drive_llm_validation_gmail",
    goal: "Mission réelle : Drive → synthèse LLM → validation humaine → email à soi-même",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "google_drive", query: "mes 3 fichiers les plus récents", maxResults: 3 },
        llm("Fais une synthèse en 3 lignes de : {{step_0_output}}", "synthese"),
        { type: "approval", label: "QA — valider la synthèse avant envoi", payloadTemplate: "{{synthese}}", outputKey: "synthese_validee" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: {
            from: SELF_EMAIL,
            to: SELF_EMAIL,
            subject: "QA Prompta — mission complète",
            body: "Synthèse validée par validation humaine :\n\n{{synthese_validee}}",
          },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "json_path_chaining",
    goal: "Sortie JSON d'une étape lue via {{data.champ}}",
    manifest: {
      kind: "agent",
      steps: [
        llm('Réponds UNIQUEMENT ce JSON sans autre texte : {"ville":"Paris","pays":"France"}', "data"),
        llm("Réponds uniquement le nom de la ville : {{data.ville}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "double_validation",
    goal: "Deux validations humaines dans le même run",
    manifest: {
      kind: "agent",
      steps: [
        llm("Écris le brouillon A (une phrase).", "brouillon_a"),
        { type: "approval", label: "QA — valider A", payloadTemplate: "{{brouillon_a}}", outputKey: "a_ok" },
        llm("Écris le brouillon B basé sur : {{a_ok}}", "brouillon_b"),
        { type: "approval", label: "QA — valider B", payloadTemplate: "{{brouillon_b}}", outputKey: "b_ok" },
        llm("Fusionne : {{a_ok}} + {{b_ok}} en une phrase."),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "ai_fill_parametre",
    goal: "Paramètre d'action rempli par IA (aiFills)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: {
            title: { model: MODEL, prompt: "Invente un titre court (4 mots max) pour une présentation QA." },
          },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "sheets_creation",
    goal: "Création d'une feuille Google Sheets (résolution dynamique)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "QA Prompta — feuille de test" },
        },
      ],
    },
    expect: ["completed", "failed"],
    errorPattern: /requiert des champs|introuvable|choisissez/i,
  },
  {
    name: "calendar_evenement_sans_invites",
    goal: "Événement Google Calendar sur MON calendrier (aucun invité)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: {
            summary: "QA Prompta — événement de test",
            description: "Créé par le QA autopilot. Aucun invité.",
            start_datetime: "2026-07-03T09:00:00",
            event_duration_hour: "1",
          },
        },
      ],
    },
    expect: ["completed", "failed"],
    errorPattern: /requiert des champs|introuvable|choisissez|invalid/i,
  },
  {
    name: "retrieve_url",
    goal: "Lecture d'une page web (retrieve url)",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "url", query: "https://example.com" },
        llm("Titre de cette page, une ligne : {{step_0_output}}"),
      ],
    },
    expect: ["completed"],
  },
  {
    name: "memoire_agent",
    goal: "Agent avec mémoire activée (sauvegarde du résultat)",
    manifest: {
      kind: "agent",
      memory: { enabled: true },
      steps: [llm("Réponds : mémoire ok")],
    },
    expect: ["completed"],
  },
  {
    name: "mega_mix",
    goal: "Parallèle (retrieve url + LLM) → fusion → validation → LLM final",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "retrieve", source: "url", query: "https://example.com" }], outputKey: "page" },
            { steps: [llm("Donne 2 critères de qualité d'une page web, bref.")], outputKey: "criteres" },
          ],
          outputKey: "matiere",
        },
        llm("Évalue la page {{page}} selon {{criteres}} en 2 lignes.", "evaluation"),
        { type: "approval", label: "QA — valider l'évaluation", payloadTemplate: "{{evaluation}}", outputKey: "eval_ok" },
        llm("Conclusion en une ligne : {{eval_ok}}"),
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "recherche_web",
    goal: "Outil web_search (clé Serper plateforme)",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "météo Paris aujourd'hui" } },
        llm("Une ligne : {{step_0_output}}"),
      ],
    },
    // PLATFORM_SERPER_KEY optionnelle : un échec est acceptable si le message
    // dit clairement le problème de clé (absente/invalide/quota).
    expect: ["completed", "failed"],
    errorPattern: /Clé Serper|Recherche web refusée/i,
  },
];

interface QaResult {
  name: string;
  goal: string;
  runId: string | null;
  status: string;
  durationMs: number;
  stepsCompleted: number;
  error: string | null;
  verdict: "OK" | "ERREUR" | "MESSAGE_FLOU" | "SKIP";
  note?: string;
}

async function tick(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/cron/tick`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  } catch {
    /* réseau best-effort */
  }
}

async function autoApproveOwn(runIds: Set<string>, userId: string): Promise<boolean> {
  const { data: pending } = await sb
    .from("agent_approvals")
    .select("id, run_id")
    .eq("status", "pending");
  let approved = false;
  for (const a of pending ?? []) {
    if (!runIds.has(a.run_id)) continue; // JAMAIS les runs d'autrui
    const { decideApproval } = await import("../lib/agent/approvals");
    await decideApproval(a.id, userId, "approved");
    approved = true;
    console.log(`  ↳ approbation auto (${a.id.slice(0, 8)})`);
  }
  return approved;
}

async function main() {
  console.log(`QA autopilot — cible ${BASE_URL}, budget ${BUDGET_CENTS}¢\n`);
  if (!process.env.CRON_SECRET) throw new Error("CRON_SECRET requis (.env.local)");

  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = users.users.find((u) => u.email?.toLowerCase() === SELF_EMAIL);
  if (!user) throw new Error(`Compte ${SELF_EMAIL} introuvable`);

  // Nettoyage des runs QA orphelins d'une exécution précédente interrompue —
  // sauf en mode conservation (KEEP_QA_RUNS=1 garde TOUT pour inspection).
  const { data: orphans } = process.env.KEEP_QA_RUNS === "1" ? { data: [] } : await sb
    .from("listing_agent_runs")
    .select("id")
    .eq("user_id", user.id)
    .filter("inputs->>__qa", "eq", "1");
  if (orphans && orphans.length > 0) {
    const ids = orphans.map((o) => o.id);
    await sb.from("listing_agent_run_steps").delete().in("run_id", ids);
    await sb.from("agent_approvals").delete().in("run_id", ids);
    await sb.from("listing_agent_runs").delete().in("id", ids);
    console.log(`Nettoyage préalable : ${ids.length} runs QA orphelins supprimés.\n`);
  }

  const results: QaResult[] = [];
  const ownRunIds = new Set<string>();
  let spentEstimate = 0;

  // QA_ONLY="nom1,nom2" : rejoue uniquement ces scénarios (économise le budget).
  const only = process.env.QA_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  // QA_ULTRA=1 : inclut les scénarios ultra-complexes (conservés en base).
  const pool = process.env.QA_ULTRA === "1" ? [...TESTS, ...ULTRA_TESTS] : TESTS;
  const selected = only?.length ? pool.filter((t) => only.includes(t.name)) : pool;
  if (only?.length) console.log(`Sélection : ${selected.map((t) => t.name).join(", ")}\n`);

  for (const test of selected) {
    const parsed = AgentManifestSchema.safeParse(test.manifest);
    if (!parsed.success) {
      results.push({
        name: test.name, goal: test.goal, runId: null, status: "invalid_manifest",
        durationMs: 0, stepsCompleted: 0,
        error: JSON.stringify(parsed.error.issues.slice(0, 2)),
        verdict: "ERREUR", note: "Le manifeste QA lui-même est refusé par le schéma",
      });
      continue;
    }
    const manifest: AgentManifest = parsed.data;

    const estimate = estimateMaxCostForManifest(manifest);
    if (spentEstimate + estimate > BUDGET_CENTS) {
      results.push({
        name: test.name, goal: test.goal, runId: null, status: "skipped",
        durationMs: 0, stepsCompleted: 0, error: null, verdict: "SKIP",
        note: `Budget atteint (${spentEstimate.toFixed(0)}¢ estimés)`,
      });
      continue;
    }
    spentEstimate += estimate;

    const { data: run, error: insertErr } = await sb
      .from("listing_agent_runs")
      .insert({
        user_id: user.id,
        listing_id: null,
        status: "pending",
        dry_run: false,
        inputs: { ...(test.inputs ?? {}), __manifest: JSON.stringify(manifest), __qa: "1" },
      })
      .select("id")
      .single();

    if (insertErr || !run?.id) {
      results.push({
        name: test.name, goal: test.goal, runId: null, status: "insert_failed",
        durationMs: 0, stepsCompleted: 0, error: insertErr?.message ?? "?", verdict: "ERREUR",
      });
      continue;
    }
    ownRunIds.add(run.id);
    console.log(`▶ ${test.name} (${run.id.slice(0, 8)}) — ~${estimate.toFixed(1)}¢`);

    const started = Date.now();
    void tick();
    let final: { status: string; error_message: string | null; steps_completed: number | null } = {
      status: "pending", error_message: null, steps_completed: 0,
    };

    while (Date.now() - started < RUN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 4000));
      const { data: row } = await sb
        .from("listing_agent_runs")
        .select("status, error_message, steps_completed")
        .eq("id", run.id)
        .single();
      if (row) final = row;
      if (["completed", "failed", "suspended", "cancelled"].includes(final.status)) break;
      // La pause de validation peut rester « running » en base (drift 0045) :
      // on vérifie les approbations pendantes à CHAQUE itération.
      if (["awaiting_approval", "running", "pending"].includes(final.status)) {
        const did = await autoApproveOwn(ownRunIds, user.id);
        if (did) await tick();
      }
      if (final.status === "pending") void tick(); // relance si la file traînait
    }

    const durationMs = Date.now() - started;
    let verdict: QaResult["verdict"] = "OK";
    let note: string | undefined;
    if (!test.expect.includes(final.status)) {
      verdict = "ERREUR";
      if (final.status === "pending") note = "Jamais traité — worker/tick injoignable ?";
    } else if (final.status === "failed" && test.errorPattern && !test.errorPattern.test(final.error_message ?? "")) {
      verdict = "MESSAGE_FLOU";
      note = "Échec attendu mais message non actionnable";
    } else if (test.expectDeliverable && final.status === "completed") {
      const { count } = await sb
        .from("agent_deliverables")
        .select("*", { count: "exact", head: true })
        .eq("run_id", run.id);
      if (!count) {
        verdict = "ERREUR";
        note = "Aucun livrable persisté (dossier de mission vide)";
      }
    }

    results.push({
      name: test.name, goal: test.goal, runId: run.id, status: final.status,
      durationMs, stepsCompleted: final.steps_completed ?? 0,
      error: final.error_message, verdict, note,
    });
    console.log(`  → ${final.status} en ${(durationMs / 1000).toFixed(0)}s ${verdict !== "OK" ? `[${verdict}]` : ""}`);
  }

  // ── Rapport ──
  const lines: string[] = [
    `# Rapport QA autopilot — ${new Date().toISOString()}`,
    `Cible : ${BASE_URL} · Budget estimé consommé : ~${spentEstimate.toFixed(1)}¢ / ${BUDGET_CENTS}¢`,
    "",
    "| Test | Objectif | Statut | Verdict | Durée | Erreur |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.goal} | ${r.status} | **${r.verdict}**${r.note ? ` — ${r.note}` : ""} | ${(r.durationMs / 1000).toFixed(0)}s | ${(r.error ?? "").replace(/\n/g, " ").slice(0, 180)} |`,
    );
  }
  mkdirSync("scripts/tmp", { recursive: true });
  writeFileSync("scripts/tmp/qa-report.md", lines.join("\n") + "\n");

  const bad = results.filter((r) => r.verdict !== "OK" && r.verdict !== "SKIP");
  console.log(`\n═══ ${results.length} tests · ${bad.length} problème(s) ═══`);
  for (const r of bad) console.log(`✗ ${r.name}: [${r.status}] ${r.error?.slice(0, 160) ?? r.note}`);
  console.log(`\nRapport : scripts/tmp/qa-report.md`);

  // ── Nettoyage (best-effort) ──
  if (process.env.KEEP_QA_RUNS !== "1") {
    const ids = Array.from(ownRunIds);
    if (ids.length > 0) {
      await sb.from("listing_agent_run_steps").delete().in("run_id", ids);
      await sb.from("agent_approvals").delete().in("run_id", ids);
      await sb.from("agent_deliverables").delete().in("run_id", ids).then(() => undefined, () => undefined);
      await sb.from("user_run_activity").delete().in("run_id", ids).then(() => undefined, () => undefined);
      await sb.from("listing_agent_runs").delete().in("id", ids);
      console.log(`Nettoyage : ${ids.length} runs QA supprimés.`);
    }
  }

  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA autopilot — erreur fatale :", err);
  process.exit(2);
});

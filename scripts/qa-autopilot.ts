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
const RUN_TIMEOUT_MS = Number(process.env.QA_RUN_TIMEOUT_MS ?? 150_000);

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

/**
 * Pipeline Sheets EXPLOITABLE : crée la feuille, extrait son id, y écrit
 * en-tête + lignes. Une feuille créée vide n'est pas un livrable.
 * `rowsTemplate` : lignes `col1;col2;…` (peut référencer {{variables}}).
 */
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

// ═══════════════ Scénarios DREAM — missions « vitrines » ultra-complexes ═══════════════
// QA_DREAM=1 les lance (exclusivement). Toujours KEEP_QA_RUNS=1 avec eux : ce sont
// des dossiers de mission à inspecter. Emails UNIQUEMENT vers SELF_EMAIL,
// événements Calendar sans invité, designs Canva sur le compte propriétaire.
const DREAM_TESTS: QaTest[] = [
  {
    name: "dream_recherche_bien_immobilier",
    goal: "Recherche de bien : 3 recherches parallèles → comparatif → validation → dossier par email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "appartement T3 à vendre Marseille 8e prix 2026" } }], outputKey: "annonces" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "prix m2 immobilier Marseille 8e arrondissement 2026" } }], outputKey: "marche" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "quartiers Marseille 8e avis habitants transports" } }], outputKey: "quartier" },
          ],
          outputKey: "veille_immo",
        },
        llm(
          "Tu es chasseur immobilier. À partir des annonces {{annonces}}, des prix du marché {{marche}} et des infos quartier {{quartier}}, rédige un DOSSIER DE RECHERCHE structuré : 1) Synthèse du marché (prix m², tendance) 2) Top 3 des opportunités repérées avec fourchette de prix 3) Points de vigilance 4) Recommandation de négociation. Format markdown avec titres.",
          "dossier",
        ),
        { type: "approval", label: "Dream — valider le dossier immobilier", payloadTemplate: "{{dossier}}", outputKey: "dossier_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🏠 Dossier recherche T3 Marseille 8e", body: "{{dossier_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_restitution_canva_design",
    goal: "Recherche → brief créa → design Canva créé selon le brief → restitution par email",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "tendances design présentation startup 2026 minimalisme" } },
        llm(
          "Tu es directeur artistique. À partir de ces tendances : {{step_0_output}}, rédige un BRIEF CRÉA en 5 points (palette, typo, ton, structure des slides, do/don't) pour une présentation de startup IA.",
          "brief",
        ),
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: {
            title: { model: MODEL, prompt: "Titre court et percutant (5 mots max) pour une présentation startup IA, déduit de ce brief : {{brief}}" },
          },
          outputKey: "design",
        },
        llm(
          "Rédige la restitution client : le brief créa était {{brief}} et le design Canva créé est {{design}}. Explique en 4 lignes ce qui a été livré et le lien design s'il figure dans la réponse.",
          "restitution",
        ),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🎨 Livrable : design Canva selon brief", body: "{{restitution}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_audit_seo_complet",
    goal: "Audit SEO : page + bonnes pratiques en parallèle → audit noté → Sheets → validation → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "retrieve", source: "url", query: "https://example.com" }], outputKey: "page" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "checklist audit SEO on-page 2026" } }], outputKey: "checklist" },
          ],
          outputKey: "matiere_seo",
        },
        llm(
          "Tu es consultant SEO senior. Audite la page {{page}} selon la checklist {{checklist}}. Produis : 1) Note globale /100 2) Tableau des 6 critères clés (titre, meta, structure Hn, contenu, maillage, performance) avec note /10 et constat 3) Top 3 des actions prioritaires. Markdown.",
          "audit",
        ),
        llm("Convertis cet audit en lignes CSV exactes au format Critère;Note;Constat (6 lignes, AUCUN autre texte) : {{audit}}", "audit_csv"),
        ...sheetsWrite("Dream — Audit SEO example.com", "Critère;Note;Constat", "{{audit_csv}}", "seo"),
        { type: "approval", label: "Dream — valider l'audit SEO", payloadTemplate: "{{audit}}", outputKey: "audit_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🔍 Audit SEO complet — example.com", body: "{{audit_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_bdd_prospects_sheets",
    goal: "Création de BDD : générer 10 prospects fictifs → Sheets créée → lignes insérées → contrôle qualité",
    manifest: {
      kind: "agent",
      steps: [
        llm(
          "Génère 10 lignes de prospects FICTIFS (données inventées, aucune vraie personne) au format exact : Nom;Société;Secteur;Ville;Score. Une ligne par prospect, AUCUN autre texte, pas d'en-tête.",
          "prospects",
        ),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "Dream — BDD Prospects (fictifs)" },
          outputKey: "creation",
        },
        llm("Voici la réponse d'une API de création de spreadsheet : {{creation}}\nRéponds UNIQUEMENT l'identifiant (spreadsheetId), rien d'autre.", "sheet_id"),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.append_row",
          params: { spreadsheet_id: "{{sheet_id}}", values: "Nom;Société;Secteur;Ville;Score\n{{prospects}}" },
        },
        llm("Contrôle qualité : la BDD contient ces lignes : {{prospects}}. Vérifie qu'il y a bien 10 prospects, 5 colonnes, et résume la répartition par secteur en 3 lignes.", "controle"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🗄️ BDD prospects créée — contrôle qualité", body: "{{controle}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_dashboard_kpi_alerte",
    goal: "Dashboard KPI : données → Sheets → analyse seuils → condition → alerte email",
    manifest: {
      kind: "agent",
      steps: [
        llm(
          "Génère 12 lignes de KPI mensuels FICTIFS format exact : Mois;CA;Churn%;NPS (ex: 2026-01;42000;3.1;54). Fais varier le churn entre 2 et 9. AUCUN autre texte.",
          "kpis",
        ),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "Dream — Dashboard KPI" },
          outputKey: "creation",
        },
        llm("Réponds UNIQUEMENT le spreadsheetId de : {{creation}}", "sheet_id"),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.append_row",
          params: { spreadsheet_id: "{{sheet_id}}", values: "Mois;CA;Churn%;NPS\n{{kpis}}" },
        },
        llm("Analyse ces KPI : {{kpis}}. Si un churn dépasse 5%, réponds 'ALERTE: ' suivi des mois concernés. Sinon réponds 'RAS'.", "verdict"),
        { type: "condition", expression: "{{verdict}} contains ALERTE" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🚨 Dashboard KPI — alerte churn", body: "{{verdict}}\n\nDonnées complètes :\n{{kpis}}" },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "dream_memo_investissement",
    goal: "Due diligence : 3 recherches parallèles → mémo d'investissement → validation → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "Anthropic produits Claude entreprise 2026" } }], outputKey: "produit" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "marché agents IA entreprise taille croissance 2026" } }], outputKey: "marche" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "risques réglementation IA Europe AI Act 2026" } }], outputKey: "risques" },
          ],
          outputKey: "dd",
        },
        llm(
          "Tu es analyste VC. Rédige un MÉMO D'INVESTISSEMENT sur le secteur des agents IA : 1) Thèse (produit : {{produit}}) 2) Marché ({{marche}}) 3) Risques ({{risques}}) 4) Verdict GO/NOGO argumenté. Markdown, ton professionnel.",
          "memo",
        ),
        { type: "approval", label: "Dream — valider le mémo d'investissement", payloadTemplate: "{{memo}}", outputKey: "memo_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "💼 Mémo d'investissement — agents IA", body: "{{memo_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_etude_marche_complete",
    goal: "Étude de marché 10 étapes : recherches → analyses → GO/NOGO → plan → Sheets → Calendar → email",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "marché coaching en ligne France taille 2026" } },
        llm("Synthèse marché en 4 lignes (taille, croissance, acteurs) : {{step_0_output}}", "marche"),
        { type: "tool", tool: "web_search", params: { query: "concurrents plateformes coaching en ligne France" } },
        llm("Cartographie concurrentielle en 5 lignes : {{step_2_output}}", "concurrence"),
        llm("À partir du marché {{marche}} et de la concurrence {{concurrence}}, verdict : réponds 'GO: ' ou 'NOGO: ' suivi de 2 lignes de justification.", "verdict"),
        { type: "condition", expression: "{{verdict}} contains GO" },
        llm("Rédige un plan de lancement en 5 jalons datés (S1 à S12) pour une plateforme de coaching : positionnement déduit de {{marche}} et {{concurrence}}.", "plan"),
        llm("Convertis ce plan en lignes CSV exactes Jalon;Semaine;Description (5 lignes, AUCUN autre texte) : {{plan}}", "plan_csv"),
        ...sheetsWrite("Dream — Étude de marché coaching", "Jalon;Semaine;Description", "{{plan_csv}}", "etude"),
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: { title: { model: MODEL, prompt: "Titre de présentation (5 mots max) pour cette étude de marché : {{marche}}" } },
          outputKey: "support_etude",
        },
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: { summary: "Dream — kick-off étude coaching", description: "{{plan}}", start_datetime: "2026-07-15T09:30:00", event_duration_hour: "1" },
        },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "📊 Étude de marché complète — coaching en ligne", body: "Verdict : {{verdict}}\n\nPlan :\n{{plan}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_veille_concurrentielle_swot",
    goal: "Veille concurrentielle : 3 axes parallèles → SWOT → validation → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "Zapier nouveautés fonctionnalités 2026" } }], outputKey: "zapier" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "Make.com automation plateforme avis 2026" } }], outputKey: "make" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "n8n open source automation adoption 2026" } }], outputKey: "n8n" },
          ],
          outputKey: "veille",
        },
        llm(
          "Tu es stratège produit d'une plateforme d'agents IA. SWOT complet face à Zapier ({{zapier}}), Make ({{make}}) et n8n ({{n8n}}) : Forces, Faiblesses, Opportunités, Menaces — 3 puces chacun + 1 recommandation stratégique. Markdown.",
          "swot",
        ),
        { type: "approval", label: "Dream — valider le SWOT concurrentiel", payloadTemplate: "{{swot}}", outputKey: "swot_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "⚔️ Veille concurrentielle — SWOT automation", body: "{{swot_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_newsletter_hebdo",
    goal: "Newsletter : 2 recherches → rédaction éditorialisée → validation → envoi à soi-même",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "actualités intelligence artificielle semaine juillet 2026" } }], outputKey: "actus_ia" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "levées de fonds startups françaises juillet 2026" } }], outputKey: "actus_funding" },
          ],
          outputKey: "matiere_news",
        },
        llm(
          "Rédige la newsletter hebdo « Le Récap IA » : édito 3 lignes, puis 3 actus IA ({{actus_ia}}) et 2 actus funding ({{actus_funding}}) — chaque actu : titre accrocheur + 2 lignes + pourquoi c'est important. Ton complice, emojis sobres.",
          "newsletter",
        ),
        { type: "approval", label: "Dream — valider la newsletter avant envoi", payloadTemplate: "{{newsletter}}", outputKey: "news_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "📰 Le Récap IA — édition test", body: "{{news_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_pipeline_recrutement",
    goal: "Recrutement : fiche de poste → grille + questions en parallèle → kit complet → Sheets → email",
    manifest: {
      kind: "agent",
      steps: [
        llm("Rédige une fiche de poste concise (6 lignes) : Growth Marketer senior pour une plateforme SaaS d'agents IA.", "fiche"),
        {
          type: "parallel",
          branches: [
            { steps: [llm("Grille d'évaluation candidat (5 critères notés /5 avec descripteurs) pour : {{fiche}}")], outputKey: "grille" },
            { steps: [llm("8 questions d'entretien structuré (3 techniques, 3 situationnelles, 2 culture) pour : {{fiche}}")], outputKey: "questions" },
          ],
          outputKey: "kit",
        },
        llm("Assemble le KIT DE RECRUTEMENT complet : fiche {{fiche}}, grille {{grille}}, questions {{questions}}. Markdown structuré.", "kit_final"),
        llm("Convertis cette grille en lignes CSV exactes Critère;Description;Note max (5 lignes, AUCUN autre texte) : {{grille}}", "grille_csv"),
        ...sheetsWrite("Dream — Suivi candidats Growth Marketer", "Critère;Description;Note max", "{{grille_csv}}", "recrut"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🎯 Kit de recrutement Growth Marketer", body: "{{kit_final}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_analyse_avis_clients",
    goal: "Analyse d'avis : corpus fictif → 3 analyses parallèles → plan d'action → Sheets → email",
    manifest: {
      kind: "agent",
      steps: [
        llm("Génère 10 avis clients FICTIFS variés (positifs, négatifs, neutres) sur une app de livraison de repas. Format : une ligne par avis, note /5 au début.", "avis"),
        {
          type: "parallel",
          branches: [
            { steps: [llm("Analyse de sentiment des avis {{avis}} : répartition %, ton dominant, 2 verbatims marquants.")], outputKey: "sentiment" },
            { steps: [llm("Thèmes récurrents dans {{avis}} : top 4 avec fréquence.")], outputKey: "themes" },
            { steps: [llm("Irritants critiques dans {{avis}} : top 3 classés par gravité.")], outputKey: "irritants" },
          ],
          outputKey: "analyses_avis",
        },
        llm("Plan d'action CX en 5 mesures priorisées à partir de : sentiment {{sentiment}}, thèmes {{themes}}, irritants {{irritants}}. Chaque mesure : action + impact attendu + délai.", "plan_cx"),
        llm("Convertis ces avis en lignes CSV exactes Note;Avis (10 lignes, AUCUN autre texte) : {{avis}}", "avis_csv"),
        ...sheetsWrite("Dream — Analyse avis clients", "Note;Avis", "{{avis_csv}}", "avis"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "💬 Analyse avis clients + plan d'action CX", body: "{{plan_cx}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_plan_editorial_45j",
    goal: "Calendrier éditorial : stratégie → 15 contenus datés → BDD Sheets → kick-off Calendar → email",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "formats contenu LinkedIn qui performent B2B 2026" } },
        llm("Stratégie éditoriale LinkedIn B2B en 4 lignes à partir de : {{step_0_output}}", "strategie"),
        llm(
          "Génère 15 contenus datés sur 45 jours format exact : Date;Format;Titre;Angle (ex: 2026-07-10;Carrousel;5 erreurs des agents IA;pédagogique). Stratégie : {{strategie}}. AUCUN autre texte.",
          "calendrier",
        ),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.create_spreadsheet",
          params: { title: "Dream — Calendrier éditorial 45j" },
          outputKey: "creation",
        },
        llm("Réponds UNIQUEMENT le spreadsheetId de : {{creation}}", "sheet_id"),
        {
          type: "action",
          connector: "google_sheets",
          action: "google_sheets.append_row",
          params: { spreadsheet_id: "{{sheet_id}}", values: "Date;Format;Titre;Angle\n{{calendrier}}" },
        },
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: { summary: "Dream — kick-off calendrier éditorial", description: "{{strategie}}", start_datetime: "2026-07-12T10:00:00", event_duration_hour: "1" },
        },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "📅 Calendrier éditorial 45 jours livré", body: "Stratégie : {{strategie}}\n\nCalendrier :\n{{calendrier}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_revue_presse",
    goal: "Revue de presse : 3 rubriques parallèles → édition du matin → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "actualité tech France aujourd'hui" } }], outputKey: "tech" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "actualité économie France aujourd'hui" } }], outputKey: "eco" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "actualité intelligence artificielle aujourd'hui" } }], outputKey: "ia" },
          ],
          outputKey: "presse",
        },
        llm(
          "Rédige « La Revue de Presse du matin » : 3 rubriques (Tech : {{tech}}, Éco : {{eco}}, IA : {{ia}}), 2 brèves par rubrique (titre + 2 lignes + source si visible). En ouverture, « l'info à retenir » du jour.",
          "revue",
        ),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "☕ Revue de presse du matin", body: "{{revue}}" },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "dream_audit_contenu_url",
    goal: "Audit de contenu : lecture page → grille d'analyse → verdict conditionnel → recommandations",
    manifest: {
      kind: "agent",
      steps: [
        { type: "retrieve", source: "url", query: "https://www.anthropic.com" },
        llm(
          "Audite le contenu de cette page {{step_0_output}} : clarté du message (note /10), proposition de valeur (note /10), appels à l'action (note /10). Termine par 'REFONTE' si la moyenne < 7, sinon 'CONFORME'.",
          "audit_contenu",
        ),
        { type: "condition", expression: "{{audit_contenu}} contains CONFORME" },
        llm("Rédige 3 recommandations d'optimisation malgré la conformité, à partir de : {{audit_contenu}}", "recos"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "📝 Audit de contenu — anthropic.com", body: "{{audit_contenu}}\n\nRecommandations :\n{{recos}}" },
        },
      ],
    },
    expect: ["completed"],
  },
  {
    name: "dream_brief_puis_deux_designs_canva",
    goal: "Canva ×2 : un brief → deux designs cohérents (présentation + doc) créés à la suite",
    manifest: {
      kind: "agent",
      steps: [
        llm("Brief de marque en 4 lignes pour « Prompta » : promesse, ton, univers visuel, tagline.", "brief_marque"),
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: { title: { model: MODEL, prompt: "Titre de présentation (4 mots max) fidèle au brief : {{brief_marque}}" } },
          outputKey: "design_presentation",
        },
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: { title: { model: MODEL, prompt: "Titre de one-pager commercial (4 mots max) fidèle au brief : {{brief_marque}}" } },
          outputKey: "design_doc",
        },
        llm("Restitution : brief {{brief_marque}}, design 1 : {{design_presentation}}, design 2 : {{design_doc}}. Résume les 2 livrables en 4 lignes.", "restit"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🎨 Deux designs Canva livrés", body: "{{restit}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_veille_drive_synthese",
    goal: "Drive + web croisés : docs récents + actualité → note d'analyse croisée → validation → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "retrieve", source: "google_drive", query: "mes documents récents", maxResults: 4 }], outputKey: "docs" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "meilleures pratiques gestion de projet IA 2026" } }], outputKey: "web" },
          ],
          outputKey: "sources",
        },
        llm(
          "Note d'analyse croisée : ce que contiennent mes documents ({{docs}}) vs les meilleures pratiques du marché ({{web}}). 1) Ce qui est aligné 2) Les écarts 3) 3 actions concrètes. Markdown.",
          "note_croisee",
        ),
        { type: "approval", label: "Dream — valider la note croisée", payloadTemplate: "{{note_croisee}}", outputKey: "note_ok" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🔀 Note d'analyse croisée Drive × marché", body: "{{note_ok}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_stress_35_etapes",
    goal: "Stress : 35 étapes LLM chaînées (« pleins de lignes »)",
    manifest: {
      kind: "agent",
      steps: Array.from({ length: 35 }, (_, i) => llm(`Réponds uniquement : ${i + 1}`)),
    },
    expect: ["completed"],
  },
  {
    name: "dream_double_validation_scenario",
    goal: "Workflow gouverné : brouillon → validation 1 → enrichissement → validation 2 → publication email",
    manifest: {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "chiffres adoption IA générative entreprises 2026" } },
        llm("Brouillon d'article LinkedIn (10 lignes) sur l'adoption de l'IA en entreprise, appuyé sur : {{step_0_output}}", "brouillon"),
        { type: "approval", label: "Dream — valider le brouillon", payloadTemplate: "{{brouillon}}", outputKey: "v1" },
        llm("Enrichis ce brouillon validé avec un hook percutant en ouverture et un CTA final : {{v1}}", "version_finale"),
        { type: "approval", label: "Dream — bon à publier ?", payloadTemplate: "{{version_finale}}", outputKey: "v2" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "✅ Article validé 2 fois — prêt à publier", body: "{{v2}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_comparatif_fournisseurs",
    goal: "Comparatif d'achat : 3 recherches → matrice de décision → BDD Sheets → email",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "tool", tool: "web_search", params: { query: "OpenAI API tarifs GPT 2026" } }], outputKey: "openai" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "Anthropic Claude API tarifs 2026" } }], outputKey: "anthropic" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "Google Gemini API tarifs 2026" } }], outputKey: "google" },
          ],
          outputKey: "fournisseurs",
        },
        llm(
          "Matrice de décision fournisseur LLM : compare OpenAI ({{openai}}), Anthropic ({{anthropic}}), Google ({{google}}) sur prix, qualité, écosystème (notes /5). Format : Fournisseur;Prix;Qualité;Écosystème;Verdict — une ligne chacun + recommandation finale 2 lignes.",
          "matrice",
        ),
        llm("Extrais de cette matrice UNIQUEMENT les 3 lignes CSV Fournisseur;Prix;Qualité;Écosystème;Verdict (aucun autre texte) : {{matrice}}", "matrice_csv"),
        ...sheetsWrite("Dream — Comparatif fournisseurs LLM", "Fournisseur;Prix;Qualité;Écosystème;Verdict", "{{matrice_csv}}", "compa"),
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "⚖️ Comparatif fournisseurs LLM", body: "{{matrice}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
  },
  {
    name: "dream_mission_finale_6_apps",
    goal: "BOSS FINAL : Drive + 2 recherches parallèles → analyse → Sheets → Calendar → Canva → validation → récap email (6 apps)",
    manifest: {
      kind: "agent",
      steps: [
        {
          type: "parallel",
          branches: [
            { steps: [{ type: "retrieve", source: "google_drive", query: "mes documents récents", maxResults: 3 }], outputKey: "contexte_docs" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "lancement produit SaaS checklist go-to-market 2026" } }], outputKey: "gtm" },
            { steps: [{ type: "tool", tool: "web_search", params: { query: "erreurs classiques lancement startup à éviter" } }], outputKey: "erreurs" },
          ],
          outputKey: "matiere_mission",
        },
        llm(
          "Tu es chef de mission. Synthèse GO-TO-MARKET : contexte interne ({{contexte_docs}}), checklist marché ({{gtm}}), pièges ({{erreurs}}). Produis : 1) Plan GTM en 6 jalons 2) 3 risques majeurs + parades 3) KPI de pilotage. Markdown.",
          "mission",
        ),
        llm("Extrais de cette mission les KPI de pilotage en lignes CSV exactes KPI;Cible;Fréquence (4 lignes, AUCUN autre texte) : {{mission}}", "kpi_csv"),
        ...sheetsWrite("Dream — Mission GTM (suivi)", "KPI;Cible;Fréquence", "{{kpi_csv}}", "gtm"),
        {
          type: "action",
          connector: "google_calendar",
          action: "google_calendar.create_event",
          params: { summary: "Dream — comité GTM", description: "{{mission}}", start_datetime: "2026-07-16T15:00:00", event_duration_hour: "1" },
        },
        {
          type: "action",
          connector: "canva",
          action: "canva.create_design",
          params: { design_type: "presentation", title: "" },
          aiFills: { title: { model: MODEL, prompt: "Titre de présentation comité (4 mots max) pour cette mission : {{mission}}" } },
          outputKey: "support",
        },
        { type: "approval", label: "Dream — GO final du chef de mission", payloadTemplate: "{{mission}}", outputKey: "go_final" },
        {
          type: "action",
          connector: "gmail",
          action: "gmail.send",
          params: { from: SELF_EMAIL, to: SELF_EMAIL, subject: "🚀 Mission GTM complète — 6 apps mobilisées", body: "{{go_final}}\n\nSupport de présentation : {{support}}" },
        },
      ],
    },
    expect: ["completed"],
    expectDeliverable: true,
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
  // QA_DREAM=1 : lance UNIQUEMENT les missions vitrines (20 scénarios).
  const pool =
    process.env.QA_DREAM === "1"
      ? DREAM_TESTS
      : process.env.QA_ULTRA === "1"
        ? [...TESTS, ...ULTRA_TESTS]
        : TESTS;
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

    // QA_LEAVE_APPROVALS=1 : les validations humaines restent EN ATTENTE pour
    // que le propriétaire les vive dans l'espace validation (pas d'auto-approve).
    const leaveApprovals = process.env.QA_LEAVE_APPROVALS === "1";

    while (Date.now() - started < RUN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 4000));
      const { data: row } = await sb
        .from("listing_agent_runs")
        .select("status, error_message, steps_completed")
        .eq("id", run.id)
        .single();
      if (row) final = row;
      if (["completed", "failed", "suspended", "cancelled"].includes(final.status)) break;
      if (leaveApprovals && final.status === "awaiting_approval") break;
      // La pause de validation peut rester « running » en base (drift 0045) :
      // on vérifie les approbations pendantes à CHAQUE itération.
      if (!leaveApprovals && ["awaiting_approval", "running", "pending"].includes(final.status)) {
        const did = await autoApproveOwn(ownRunIds, user.id);
        if (did) await tick();
      }
      if (final.status === "pending") void tick(); // relance si la file traînait
    }

    const durationMs = Date.now() - started;
    let verdict: QaResult["verdict"] = "OK";
    let note: string | undefined;
    if (leaveApprovals && final.status === "awaiting_approval") {
      results.push({
        name: test.name, goal: test.goal, runId: run.id, status: final.status,
        durationMs, stepsCompleted: final.steps_completed ?? 0, error: null,
        verdict: "OK", note: "En attente de TA validation (espace Validations)",
      });
      console.log(`  → awaiting_approval en ${(durationMs / 1000).toFixed(0)}s [à valider manuellement]`);
      continue;
    }
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

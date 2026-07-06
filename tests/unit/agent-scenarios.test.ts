/**
 * Suite de scénarios agents — couverture large « ~100 cas ».
 *
 * Objectif : verrouiller le comportement de bout en bout du pipeline agent
 * (contrat → résolveur → exécution) sur des agents simples ET complexes
 * (parallèle, approbations, multi-connecteur), plus le mapping d'erreurs et la
 * traduction natif→Composio. Tout est pur (pas d'I/O), donc rapide et fiable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContract,
  deriveInterface,
  askedInputs,
  resourceInputs,
} from "../../lib/agent/contract";
import {
  resolveAgentInterface,
  resolvedValueForStepParam,
  preflightMissing,
  runtimeFieldsToShow,
} from "../../lib/agent/resolve-interface";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";
import { mapAgentError } from "../../lib/agent/error-map";
import { composioMappingFor } from "../../lib/connectors/native-to-composio";
import {
  stepKey,
  parseStepKey,
  isStepKey,
  parallelSubIndex,
  walkWithIndex,
} from "../../lib/agent/step-key";
import type { AgentStep } from "../../lib/agent/schema";

// ─── Builders d'étapes ────────────────────────────────────────────────────────

function llm(prompt: string, outputKey?: string): AgentStep {
  return { type: "llm", model: "gpt-5.4", prompt, ...(outputKey ? { outputKey } : {}) } as AgentStep;
}

function sheetsRead(opts?: { pinnedRange?: boolean; outputKey?: string }): AgentStep {
  return {
    type: "action",
    connector: "google_sheets",
    action: "sheets.read",
    params: {
      spreadsheetId: resourcePlaceholder("google_sheets.spreadsheet"),
      range: "Sheet1!A1:B10",
    },
    ...(opts?.pinnedRange ? { paramMeta: { range: { scope: "builder_test" } } } : {}),
    outputKey: opts?.outputKey ?? "rows",
  } as AgentStep;
}

function gmailSend(opts?: { to?: string; shared?: boolean }): AgentStep {
  return {
    type: "action",
    connector: "gmail",
    action: "gmail.send",
    params: {
      from: resourcePlaceholder("gmail.send_as"),
      to: opts?.to ?? "{{destinataire_email}}",
      subject: "Synthèse",
      body: "{{resume}}",
    },
    paramMeta: { subject: { scope: "builder_test" } },
    ...(opts?.shared ? { sharedEnv: true } : {}),
  } as AgentStep;
}

function slackSend(text = "{{msg}}"): AgentStep {
  return {
    type: "action",
    connector: "slack",
    action: "slack.send",
    params: { channel: resourcePlaceholder("slack.channel"), text },
  } as AgentStep;
}

// ════════════════════════════════════════════════════════════════════════════
// A. CONTRAT — agents simples
// ════════════════════════════════════════════════════════════════════════════

test("contrat: LLM avec 1 variable → 1 entrée abonné", () => {
  const c = buildContract([llm("Bonjour {{prenom}}")]);
  const keys = c.interface.map((i) => i.key);
  assert.ok(keys.includes("prenom"));
});

test("contrat: variable = sortie d'étape amont → exclue de l'interface", () => {
  const c = buildContract([llm("Genère un texte", "draft"), llm("Relis {{draft}}")]);
  assert.ok(!c.interface.some((i) => i.key === "draft"));
});

test("contrat: variable imbriquée {{report.section}} dont report est outputKey → exclue", () => {
  const c = buildContract([llm("x", "report"), llm("Voir {{report.section}}")]);
  assert.ok(!c.interface.some((i) => i.key.startsWith("report")));
});

test("contrat: variables dupliquées → dédoublonnées", () => {
  const c = buildContract([llm("{{ton}} et encore {{ton}}")]);
  assert.equal(c.interface.filter((i) => i.key === "ton").length, 1);
});

test("contrat: deux variables distinctes → deux entrées", () => {
  const c = buildContract([llm("{{a}} {{b}}")]);
  assert.ok(c.interface.some((i) => i.key === "a"));
  assert.ok(c.interface.some((i) => i.key === "b"));
});

test("contrat: placeholder ressource → kind resource + clé stepKey", () => {
  const c = buildContract([sheetsRead()]);
  const r = c.interface.find((i) => i.key === stepKey(0, "spreadsheetId"));
  assert.ok(r);
  assert.equal(r?.kind, "resource");
  assert.equal(r?.connectorParam?.connector, "google_sheets");
});

test("contrat: identité gmail.send_as → kind identity", () => {
  const c = buildContract([gmailSend()]);
  const from = c.interface.find((i) => i.connectorParam?.key === "from");
  assert.ok(from);
  assert.equal(from?.kind, "identity");
});

test("contrat: littéral épinglé (builder_test) → source pinned + value", () => {
  const c = buildContract([sheetsRead({ pinnedRange: true })]);
  const range = c.interface.find((i) => i.connectorParam?.key === "range");
  assert.ok(range);
  assert.equal(range?.source, "pinned");
  assert.equal(range?.value, "Sheet1!A1:B10");
});

test("contrat: binding {{destinataire_email}} dans gmail.to → source subscriber", () => {
  const c = buildContract([gmailSend()]);
  const to = c.interface.find((i) => i.key === "destinataire_email");
  assert.ok(to);
  assert.equal(to?.source, "subscriber");
});

test("contrat: body={{resume}} (sortie d'étape) → non demandé", () => {
  const c = buildContract([llm("x", "resume"), gmailSend()]);
  assert.ok(!c.interface.some((i) => i.key === "resume"));
});

test("contrat: askedInputs ne renvoie que les champs texte/email abonné", () => {
  const c = buildContract([llm("{{prenom}}"), sheetsRead()]);
  const asked = askedInputs(c);
  assert.ok(asked.every((i) => i.source === "subscriber"));
  assert.ok(asked.some((i) => i.key === "prenom"));
  assert.ok(!asked.some((i) => i.kind === "resource"));
});

test("contrat: resourceInputs ne renvoie que ressources/identités abonné", () => {
  const c = buildContract([sheetsRead(), gmailSend()]);
  const res = resourceInputs(c);
  assert.ok(res.every((i) => i.kind === "resource" || i.kind === "identity"));
});

test("contrat: agent vide → interface vide", () => {
  assert.equal(deriveInterface([]).length, 0);
});

test("contrat: LLM sans variable → interface vide", () => {
  assert.equal(deriveInterface([llm("Texte fixe sans variable")]).length, 0);
});

test("contrat: condition avec variable → entrée abonné", () => {
  const c = buildContract([
    { type: "condition", expression: "{{score}} > 5", outputKey: "ok" } as AgentStep,
  ]);
  assert.ok(c.interface.some((i) => i.key === "score"));
});

test("contrat: retrieve avec variable → entrée abonné", () => {
  const c = buildContract([
    { type: "retrieve", query: "docs sur {{sujet}}", outputKey: "docs" } as AgentStep,
  ]);
  assert.ok(c.interface.some((i) => i.key === "sujet"));
});

// ════════════════════════════════════════════════════════════════════════════
// B. CONTRAT — agents complexes (parallèle, multi-connecteur, shared)
// ════════════════════════════════════════════════════════════════════════════

test("contrat: agent 3 étapes sheets→llm→gmail → ressources des 2 connecteurs", () => {
  const c = buildContract([sheetsRead(), llm("Résume {{rows}}", "resume"), gmailSend()]);
  assert.ok(c.interface.some((i) => i.connectorParam?.connector === "google_sheets"));
  assert.ok(c.interface.some((i) => i.connectorParam?.connector === "gmail"));
});

test("contrat: étape shared → source shared", () => {
  const c = buildContract([gmailSend({ shared: true })]);
  const from = c.interface.find((i) => i.connectorParam?.key === "from");
  assert.ok(from);
  assert.equal(from?.source, "shared");
});

test("contrat parallèle: indices globaux via parallelSubIndex", () => {
  const parallel: AgentStep = {
    type: "parallel",
    branches: [
      { steps: [sheetsRead()], outputKey: "b0" },
      { steps: [slackSend()], outputKey: "b1" },
    ],
  } as AgentStep;
  const c = buildContract([parallel]);
  const sheetKey = c.interface.find((i) => i.connectorParam?.connector === "google_sheets");
  const slackKey = c.interface.find((i) => i.connectorParam?.connector === "slack");
  assert.equal(sheetKey?.connectorParam?.stepIndex, parallelSubIndex(0, 0, 0));
  assert.equal(slackKey?.connectorParam?.stepIndex, parallelSubIndex(0, 1, 0));
});

test("contrat parallèle: sorties de branche exclues de l'interface", () => {
  const parallel: AgentStep = {
    type: "parallel",
    branches: [{ steps: [llm("x", "out0")], outputKey: "out0" }],
  } as AgentStep;
  const after = llm("Utilise {{out0}}");
  const c = buildContract([parallel, after]);
  assert.ok(!c.interface.some((i) => i.key === "out0"));
});

test("contrat: multi-connecteur sheets+gmail+slack → 3 connecteurs présents", () => {
  const c = buildContract([sheetsRead(), gmailSend(), slackSend()]);
  const connectors = new Set(
    c.interface.map((i) => i.connectorParam?.connector).filter(Boolean),
  );
  assert.ok(connectors.has("google_sheets"));
  assert.ok(connectors.has("gmail"));
  assert.ok(connectors.has("slack"));
});

test("contrat: chaque ressource a une clé unique stepIndex:param", () => {
  const c = buildContract([sheetsRead(), slackSend()]);
  const keys = c.interface
    .filter((i) => i.kind === "resource")
    .map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

// ════════════════════════════════════════════════════════════════════════════
// C. RÉSOLVEUR — phases run / sell / preflight / build
// ════════════════════════════════════════════════════════════════════════════

function pipeline(): AgentStep[] {
  return [sheetsRead(), llm("Résume {{rows}} pour {{destinataire}}", "resume"), gmailSend()];
}

test("résolveur run: tout fourni → aucune valeur en {{…}}", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: { destinataire: "Alice", destinataire_email: "a@x.com" },
    resources: { "0:spreadsheetId": "SHEET123", "2:from": "moi@x.com" },
  });
  for (const r of resolved) {
    if (r.status === "resolved" && r.resolvedValue) {
      assert.ok(!r.resolvedValue.includes("{{"), `${r.key} contient {{`);
    }
  }
});

test("résolveur run: spreadsheetId résolu depuis resources", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: { destinataire: "A", destinataire_email: "a@x.com" },
    resources: { "0:spreadsheetId": "SHEET123", "2:from": "m@x.com" },
  });
  const v = resolvedValueForStepParam(resolved, 0, "spreadsheetId");
  assert.equal(v?.status, "resolved");
  assert.equal(v?.resolvedValue, "SHEET123");
});

test("résolveur run: identité from résolue depuis resources", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: { destinataire: "A", destinataire_email: "a@x.com" },
    resources: { "0:spreadsheetId": "S", "2:from": "moi@x.com" },
  });
  const v = resolvedValueForStepParam(resolved, 2, "from");
  assert.equal(v?.resolvedValue, "moi@x.com");
});

test("résolveur run: to résolu depuis provided[destinataire_email]", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: { destinataire: "A", destinataire_email: "alice@x.com" },
    resources: { "0:spreadsheetId": "S", "2:from": "m@x.com" },
  });
  const v = resolvedValueForStepParam(resolved, 2, "to");
  assert.equal(v?.resolvedValue, "alice@x.com");
});

test("résolveur run: pinned (subject builder_test) → resolved littéral", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: {},
    resources: {},
  });
  const v = resolvedValueForStepParam(resolved, 2, "subject");
  assert.equal(v?.status, "resolved");
  assert.equal(v?.resolvedValue, "Synthèse");
});

test("résolveur run: rien fourni → champs texte en ask avec message", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    runnerId: "u1",
    provided: {},
    resources: {},
  });
  const asks = resolved.filter((r) => r.status === "ask");
  assert.ok(asks.some((a) => a.key === "destinataire"));
  for (const a of asks) assert.ok(a.message && a.message.length > 0);
});

test("résolveur run: ressource non fournie → ask widget resource_picker", () => {
  const resolved = resolveAgentInterface(buildContract([sheetsRead()]), {
    phase: "run",
    runnerId: "u1",
    provided: {},
    resources: {},
  });
  const r = resolved.find((x) => x.connectorParam?.key === "spreadsheetId");
  assert.equal(r?.status, "ask");
  assert.equal(r?.widget, "resource_picker");
});

test("résolveur run: champ optionnel non requis → resolved vide non bloquant", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "{{optionnel}}" } as AgentStep,
  ];
  const c = buildContract(steps);
  // force non-required
  c.interface.forEach((i) => (i.required = false));
  const resolved = resolveAgentInterface(c, { phase: "run", provided: {} });
  const o = resolved.find((r) => r.key === "optionnel");
  assert.equal(o?.status, "resolved");
});

test("résolveur sell: pinned non-shared → repassé en ask (placeholder abonné)", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), { phase: "sell" });
  const subject = resolved.find((r) => r.connectorParam?.key === "subject");
  assert.equal(subject?.status, "ask");
});

test("résolveur sell: ressource pinned → placeholder ressource régénéré", () => {
  const steps = [sheetsRead({ pinnedRange: true })];
  const resolved = resolveAgentInterface(buildContract(steps), { phase: "sell" });
  const range = resolved.find((r) => r.connectorParam?.key === "range");
  assert.equal(range?.status, "ask");
});

test("résolveur sell: shared conservé → resolved (env créateur)", () => {
  const resolved = resolveAgentInterface(buildContract([gmailSend({ shared: true })]), {
    phase: "sell",
  });
  const from = resolved.find((r) => r.connectorParam?.key === "from");
  assert.equal(from?.status, "resolved");
});

test("résolveur preflight: ressource manquante → bloquant", () => {
  const missing = preflightMissing(buildContract([sheetsRead()]), {
    phase: "preflight",
    runnerId: "u1",
    resources: {},
  });
  assert.ok(missing.some((m) => m.connectorParam?.key === "spreadsheetId"));
});

test("résolveur preflight: ressource fournie → non bloquante", () => {
  const missing = preflightMissing(buildContract([sheetsRead()]), {
    phase: "preflight",
    runnerId: "u1",
    resources: { "0:spreadsheetId": "S" },
  });
  assert.ok(!missing.some((m) => m.connectorParam?.key === "spreadsheetId"));
});

test("résolveur preflight: champ texte fourni → non bloquant", () => {
  const missing = preflightMissing(buildContract([llm("{{prenom}}")]), {
    phase: "preflight",
    provided: { prenom: "Bob" },
  });
  assert.ok(!missing.some((m) => m.key === "prenom"));
});

test("résolveur preflight: champ texte manquant → bloquant", () => {
  const missing = preflightMissing(buildContract([llm("{{prenom}}")]), {
    phase: "preflight",
    provided: {},
  });
  assert.ok(missing.some((m) => m.key === "prenom"));
});

test("résolveur run: runtimeFieldsToShow ne renvoie que ask/missing", () => {
  const show = runtimeFieldsToShow(buildContract(pipeline()), {
    phase: "run",
    provided: {},
    resources: {},
  });
  assert.ok(show.every((s) => s.status === "ask" || s.status === "missing"));
});

test("résolveur: provided avec placeholder {{x}} ignoré (non significatif)", () => {
  const resolved = resolveAgentInterface(buildContract([llm("{{prenom}}")]), {
    phase: "run",
    provided: { prenom: "{{prenom}}" },
  });
  const p = resolved.find((r) => r.key === "prenom");
  assert.equal(p?.status, "ask");
});

test("résolveur: valeur vide → ask", () => {
  const resolved = resolveAgentInterface(buildContract([llm("{{prenom}}")]), {
    phase: "run",
    provided: { prenom: "   " },
  });
  assert.equal(resolved.find((r) => r.key === "prenom")?.status, "ask");
});

test("résolveur run: resources prime sur provided pour une ressource", () => {
  const resolved = resolveAgentInterface(buildContract([sheetsRead()]), {
    phase: "run",
    resources: { "0:spreadsheetId": "FROM_RES" },
    provided: { [stepKey(0, "spreadsheetId")]: "FROM_PROV" },
  });
  const v = resolvedValueForStepParam(resolved, 0, "spreadsheetId");
  assert.equal(v?.resolvedValue, "FROM_RES");
});

test("résolveur run parallèle: ressource résolue avec clé parallelSubIndex", () => {
  const parallel: AgentStep = {
    type: "parallel",
    branches: [{ steps: [sheetsRead()], outputKey: "b0" }],
  } as AgentStep;
  const idx = parallelSubIndex(0, 0, 0);
  const resolved = resolveAgentInterface(buildContract([parallel]), {
    phase: "run",
    resources: { [`${idx}:spreadsheetId`]: "S" },
  });
  const v = resolvedValueForStepParam(resolved, idx, "spreadsheetId");
  assert.equal(v?.resolvedValue, "S");
});

test("résolveur build: pinned → resolved (valeur utilisée telle quelle)", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "build",
    runnerId: "creator",
  });
  const subject = resolved.find((r) => r.connectorParam?.key === "subject");
  assert.equal(subject?.status, "resolved");
});

test("résolveur: chaque ResolvedInput a un widget", () => {
  const resolved = resolveAgentInterface(buildContract(pipeline()), {
    phase: "run",
    provided: {},
    resources: {},
  });
  for (const r of resolved) assert.ok(r.widget, `widget manquant pour ${r.key}`);
});

// ════════════════════════════════════════════════════════════════════════════
// D. MAPPING D'ERREURS
// ════════════════════════════════════════════════════════════════════════════

const errorCases: [string, string][] = [
  ["Plafond max_steps atteint", "max_steps"],
  ["max_tokens dépassé", "max_tokens"],
  ["max_output_bytes trop grand", "max_output_bytes"],
  ["max_tool_calls atteint", "max_tool_calls"],
  ["Request timeout", "timeout"],
  ["operation timed out", "timeout"],
  ["approval rejected by user", "approval_rejected"],
  ["Action rejetée par l'humain", "approval_rejected"],
  ["approbation rejetée", "approval_rejected"],
  ["Validation humaine expirée", "approval_expired"],
  ["approval expired", "approval_expired"],
  ["Paramètre « Plage » non renseigné", "unresolved_placeholder"],
  ["valeur {{spreadsheetId}} non résolue", "unresolved_placeholder"],
  ["Connexion google_sheets requise", "missing_connection"],
  ["service not connected", "missing_connection"],
  ["401 invalid authentication credentials", "invalid_credentials"],
  ["Invalid Credentials", "invalid_credentials"],
  ["Token has been expired or revoked", "invalid_credentials"],
  ["unauthorized request", "invalid_credentials"],
  ["Google Sheets : 404 — not found", "sheets_not_found"],
  ["spreadsheet 404", "sheets_not_found"],
  ["Google Sheets : 403 — forbidden", "sheets_forbidden"],
  ["429 rate limit exceeded", "rate_limit"],
  ["idempotency conflict", "idempotency_conflict"],
  ["action déjà en cours", "idempotency_conflict"],
  ["python sandbox error", "code_runtime"],
];

for (const [raw, code] of errorCases) {
  test(`error-map: "${raw.slice(0, 32)}" → ${code}`, () => {
    assert.equal(mapAgentError(new Error(raw)).code, code);
  });
}

test("error-map: Gmail 400 from invalide → gmail_invalid_header", () => {
  assert.equal(
    mapAgentError(new Error("Gmail : 400 — Invalid from header")).code,
    "gmail_invalid_header",
  );
});

test("error-map: Gmail 403 → gmail_forbidden", () => {
  assert.equal(mapAgentError(new Error("Gmail : 403 forbidden")).code, "gmail_forbidden");
});

test("error-map: erreur inconnue → unknown", () => {
  assert.equal(mapAgentError(new Error("boom inattendu xyz")).code, "unknown");
});

test("error-map: token expiré n'est PAS approval_expired (non-régression)", () => {
  assert.notEqual(
    mapAgentError(new Error("Token has been expired or revoked")).code,
    "approval_expired",
  );
});

test("error-map: invalid_credentials inclut un hint reconnexion", () => {
  const m = mapAgentError(new Error("401 Invalid Credentials"), { connector: "google_sheets" });
  assert.ok(m.hint && /reconnect/i.test(m.hint));
});

test("error-map: message string brut accepté (pas seulement Error)", () => {
  assert.equal(mapAgentError("429 rate limit").code, "rate_limit");
});

// ════════════════════════════════════════════════════════════════════════════
// E. NATIF → COMPOSIO
// ════════════════════════════════════════════════════════════════════════════

test("native→composio: sheets.read → GOOGLESHEETS_VALUES_GET", () => {
  const m = composioMappingFor("sheets.read");
  assert.equal(m?.toolSlug, "GOOGLESHEETS_VALUES_GET");
  assert.equal(m?.toolkitSlug, "googlesheets");
});

test("native→composio: sheets.read mappe spreadsheetId → spreadsheet_id", () => {
  const m = composioMappingFor("sheets.read")!;
  const args = m.mapParams({ spreadsheetId: "SHEET1", range: "A1:B2" });
  assert.equal(args.spreadsheet_id, "SHEET1");
  assert.equal(args.range, "A1:B2");
});

test("native→composio: sheets.read range vide → défaut A:Z", () => {
  const m = composioMappingFor("sheets.read")!;
  const args = m.mapParams({ spreadsheetId: "S" });
  assert.equal(args.range, "A:Z");
});

test("native→composio: sheets.read combine onglet + plage", () => {
  const m = composioMappingFor("sheets.read")!;
  const args = m.mapParams({ spreadsheetId: "S", tab: "Feuille2", range: "A1:C9" });
  assert.equal(args.range, "Feuille2!A1:C9");
});

test("native→composio: placeholder {{x}} filtré des arguments", () => {
  const m = composioMappingFor("sheets.read")!;
  const args = m.mapParams({ spreadsheetId: "{{spreadsheetId}}", range: "A1:B2" });
  assert.ok(!("spreadsheet_id" in args));
});

test("native→composio: gmail.send → GMAIL_SEND_EMAIL + recipient_email", () => {
  const m = composioMappingFor("gmail.send")!;
  const args = m.mapParams({ to: "a@x.com", subject: "Hi", body: "Yo" });
  assert.equal(m.toolSlug, "GMAIL_SEND_EMAIL");
  assert.equal(args.recipient_email, "a@x.com");
  assert.equal(args.subject, "Hi");
  // Le corps markdown est converti en HTML email (is_html).
  assert.ok(args.body.includes(">Yo</p>"));
  assert.equal(args.is_html, "true");
});

test("native→composio: gmail.read → GMAIL_FETCH_EMAILS avec max_results", () => {
  const m = composioMappingFor("gmail.read")!;
  const args = m.mapParams({ query: "from:boss" });
  assert.equal(m.toolSlug, "GMAIL_FETCH_EMAILS");
  assert.equal(args.query, "from:boss");
  assert.equal(args.max_results, "5");
});

test("native→composio: sheets.append → APPEND avec values", () => {
  const m = composioMappingFor("sheets.append")!;
  const args = m.mapParams({ spreadsheetId: "S", values: "[[1,2]]" });
  assert.ok(m.toolSlug.includes("APPEND"));
  assert.equal(args.spreadsheet_id, "S");
  assert.equal(args.values, "[[1,2]]");
});

test("native→composio: slack.send → SLACK_SEND_MESSAGE", () => {
  const m = composioMappingFor("slack.send")!;
  const args = m.mapParams({ channel: "C123", text: "salut" });
  assert.equal(m.toolSlug, "SLACK_SEND_MESSAGE");
  assert.equal(args.channel, "C123");
  assert.equal(args.text, "salut");
});

test("native→composio: action inconnue → undefined", () => {
  assert.equal(composioMappingFor("inconnu.action"), undefined);
});

test("native→composio: gmail.send sans destinataire → recipient_email absent", () => {
  const m = composioMappingFor("gmail.send")!;
  const args = m.mapParams({ subject: "Hi", body: "Yo" });
  assert.ok(!("recipient_email" in args));
});

test("native→composio: valeurs vides filtrées", () => {
  const m = composioMappingFor("slack.send")!;
  const args = m.mapParams({ channel: "C1", text: "" });
  assert.ok(!("text" in args));
});

// ════════════════════════════════════════════════════════════════════════════
// F. INDEXATION D'ÉTAPES (step-key)
// ════════════════════════════════════════════════════════════════════════════

test("step-key: stepKey/parseStepKey aller-retour", () => {
  const k = stepKey(3, "spreadsheetId");
  assert.equal(k, "3:spreadsheetId");
  assert.deepEqual(parseStepKey(k), { stepIndex: 3, paramKey: "spreadsheetId" });
});

test("step-key: isStepKey reconnaît / rejette", () => {
  assert.ok(isStepKey("0:range"));
  assert.ok(!isStepKey("destinataire"));
  assert.ok(!isStepKey("{{x}}"));
});

test("step-key: parseStepKey invalide → null", () => {
  assert.equal(parseStepKey("pas une clé"), null);
});

test("step-key: parallelSubIndex distinct par branche/position", () => {
  const a = parallelSubIndex(0, 0, 0);
  const b = parallelSubIndex(0, 1, 0);
  const c = parallelSubIndex(0, 0, 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});

test("step-key: walkWithIndex top-level → index séquentiel", () => {
  const walked = walkWithIndex([llm("a"), llm("b"), llm("c")]);
  assert.deepEqual(walked.map((w) => w.stepIndex), [0, 1, 2]);
});

test("step-key: walkWithIndex aplatit les branches parallèles", () => {
  const parallel: AgentStep = {
    type: "parallel",
    branches: [
      { steps: [llm("a"), llm("b")], outputKey: "x" },
      { steps: [llm("c")], outputKey: "y" },
    ],
  } as AgentStep;
  const walked = walkWithIndex([parallel]);
  assert.equal(walked.length, 3);
  assert.equal(walked[0].stepIndex, parallelSubIndex(0, 0, 0));
  assert.equal(walked[1].stepIndex, parallelSubIndex(0, 0, 1));
  assert.equal(walked[2].stepIndex, parallelSubIndex(0, 1, 0));
});

test("step-key: walkWithIndex mixe top-level et parallèle", () => {
  const parallel: AgentStep = {
    type: "parallel",
    branches: [{ steps: [llm("a")], outputKey: "x" }],
  } as AgentStep;
  const walked = walkWithIndex([llm("start"), parallel, llm("end")]);
  // 1 top-level + 1 sub + 1 top-level = 3 étapes exécutables
  assert.equal(walked.length, 3);
  assert.equal(walked[0].stepIndex, 0);
  assert.equal(walked[2].stepIndex, 2);
});

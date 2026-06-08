import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContract,
  deriveInterface,
  askedInputs,
  resourceInputs,
} from "../../lib/agent/contract";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";
import { CONNECTORS, getConnectorAction } from "../../lib/connectors/registry";
import type { AgentStep } from "../../lib/agent/schema";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function sheetsAnalyseGmailAgent(): AgentStep[] {
  return [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: resourcePlaceholder("google_sheets.spreadsheet"),
        range: "A:Z",
      },
      paramMeta: {
        // range est un littéral épinglé (builder_test) → ne doit pas être demandé
        range: { scope: "builder_test" },
      },
      outputKey: "sheet_rows",
    },
    {
      type: "llm",
      model: "gpt-5.4",
      prompt:
        "Résume les lignes pour {{destinataire}} : {{sheet_rows}}.\nTon : {{ton}}.",
      outputKey: "resume",
    },
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: {
        from: resourcePlaceholder("gmail.send_as"),
        to: "{{destinataire_email}}",
        subject: "{{sujet}}",
        body: "{{resume}}",
      },
    },
  ];
}

function canvaAgent(): AgentStep[] {
  return [
    {
      type: "action",
      connector: "canva",
      action: "canva.create",
      params: {
        template_id: "{{canva_template_id}}",
        title: "{{titre}}",
      },
      outputKey: "design",
    },
  ];
}

function slackAgent(): AgentStep[] {
  return [
    {
      type: "llm",
      model: "gpt-5.4",
      prompt: "Résume {{contexte}}",
      outputKey: "msg",
    },
    {
      type: "action",
      connector: "slack",
      action: "slack.send",
      params: {
        channel: resourcePlaceholder("slack.channel"),
        text: "{{msg}}",
      },
    },
  ];
}

// ─── Tests « le bug ne revient pas » ─────────────────────────────────────────

test("Sheets→IA→Gmail : aucun champ épinglé ne réapparaît dans askedInputs", () => {
  const contract = buildContract(sheetsAnalyseGmailAgent());
  const asked = askedInputs(contract);
  const keys = asked.map((i) => i.key);

  // range était épinglé (A:Z) → absent
  assert.ok(!keys.includes("google_sheets_range"));
  assert.ok(!keys.some((k) => k.endsWith(":range")));

  // sheet_rows / resume sont des sorties d'étape → absents
  assert.ok(!keys.includes("sheet_rows"));
  assert.ok(!keys.includes("resume"));

  // ce qui doit être demandé : destinataire, destinataire_email, sujet, ton
  for (const k of ["destinataire", "destinataire_email", "sujet", "ton"]) {
    assert.ok(keys.includes(k), `clé attendue manquante: ${k}`);
  }
});

test("Sheets→IA→Gmail : ressources résolvables au run", () => {
  const contract = buildContract(sheetsAnalyseGmailAgent());
  const resources = resourceInputs(contract);
  const types = resources.map((r) => r.resourceType);
  // spreadsheetId (sheets) + from (gmail identity)
  assert.ok(types.includes("google_sheets.spreadsheet"));
  assert.ok(types.includes("gmail.send_as"));
  // chaque ressource a une clé `stepIndex:paramKey` (alignée avec extract-run-resources)
  for (const r of resources) {
    assert.match(r.key, /^\d+:\w+$/);
    assert.ok(r.connectorParam, "connectorParam manquant");
  }
});

test("Canva : template_id et titre demandés (aucun « non renseigné » silencieux)", () => {
  const contract = buildContract(canvaAgent());
  const asked = askedInputs(contract);
  const keys = asked.map((i) => i.key);
  assert.ok(keys.includes("canva_template_id"));
  assert.ok(keys.includes("titre"));
});

test("Slack : channel = ressource, text = sortie d'étape donc pas demandé", () => {
  const contract = buildContract(slackAgent());
  const asked = askedInputs(contract);
  const askedKeys = asked.map((i) => i.key);
  assert.ok(askedKeys.includes("contexte"));
  assert.ok(!askedKeys.includes("msg"));
  assert.ok(!askedKeys.some((k) => k.endsWith(":text")));

  const resources = resourceInputs(contract);
  assert.ok(resources.some((r) => r.resourceType === "slack.channel"));
});

test("Dédoublonnage : un même {{destinataire}} réutilisé = un seul champ demandé", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "Bonjour {{destinataire}}", outputKey: "msg1" },
    { type: "llm", model: "gpt-5.4", prompt: "Salut {{destinataire}}", outputKey: "msg2" },
  ];
  const asked = askedInputs(buildContract(steps));
  const occurrences = asked.filter((i) => i.key === "destinataire").length;
  assert.equal(occurrences, 1);
});

test("Sortie d'étape imbriquée ({{report.section}}) jamais demandée", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-5.4", prompt: "Génère un rapport", outputKey: "report" },
    {
      type: "llm",
      model: "gpt-5.4",
      prompt: "Reformule {{report.section}} pour {{audience}}",
    },
  ];
  const asked = askedInputs(buildContract(steps));
  const keys = asked.map((i) => i.key);
  assert.ok(keys.includes("audience"));
  assert.ok(!keys.includes("report"));
  assert.ok(!keys.includes("report.section"));
});

test("Chaque champ demandé a une clé = clé de binding résolvable au run", () => {
  for (const stepsFactory of [sheetsAnalyseGmailAgent, canvaAgent, slackAgent]) {
    const asked = askedInputs(buildContract(stepsFactory()));
    for (const input of asked) {
      assert.ok(input.key.length > 0, "clé vide interdite");
      // Pas de placeholder bizarre ni de {{}} qui traîne
      assert.ok(!input.key.includes("{{"));
      assert.ok(!input.key.includes("}}"));
    }
  }
});

// ─── Conformité du registre (le bug ne peut pas revenir au niveau données) ───

test("Conformité registre : tout input requis possède un kind", () => {
  const offenders: string[] = [];
  for (const connector of CONNECTORS) {
    for (const action of connector.actions) {
      for (const input of action.inputs) {
        if (input.required && !input.kind) {
          offenders.push(`${action.id}.${input.key}`);
        }
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Inputs requis sans kind : ${offenders.join(", ")}`,
  );
});

test("Conformité registre : sheets.read n'utilise plus « * » comme défaut", () => {
  const action = getConnectorAction("google_sheets", "sheets.read")!;
  const range = action.inputs.find((i) => i.key === "range")!;
  assert.notEqual(range.defaultValue, "*", "Le défaut * (joker) est interdit");
});

test("deriveInterface est stable (idempotent)", () => {
  const steps = sheetsAnalyseGmailAgent();
  const a = deriveInterface(steps);
  const b = deriveInterface(steps);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

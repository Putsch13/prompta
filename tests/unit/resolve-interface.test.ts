/**
 * Test du Résolveur (Pilier B) — P2.6.
 *
 * Pour Sheets / Gmail / Canva / Slack, vérifie les 4 phases :
 *  - build : pinned = resolved (la valeur builder)
 *  - run : pinned = resolved, subscriber resource manquant = ask (picker),
 *    connexion absente = missing (connect)
 *  - sell : pinned non-shared repassé en placeholder demandé (ask)
 *  - preflight : ne renvoie que les missing/ask requis avec un message
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildContract } from "../../lib/agent/contract";
import {
  resolveAgentInterface,
  preflightMissing,
  resolvedValueForStepParam,
} from "../../lib/agent/resolve-interface";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";
import type { AgentStep } from "../../lib/agent/schema";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function sheetsAgent(): AgentStep[] {
  return [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: resourcePlaceholder("google_sheets.spreadsheet"),
        range: "Sheet1!A:Z",
      },
      paramMeta: { range: { scope: "builder_test" } },
      outputKey: "rows",
    },
  ];
}

function gmailAgent(): AgentStep[] {
  return [
    {
      type: "llm",
      model: "gpt-5.4",
      prompt: "Génère un email pour {{contexte}}",
      outputKey: "body",
    },
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: {
        from: resourcePlaceholder("gmail.send_as"),
        to: "{{destinataire}}",
        subject: "{{sujet}}",
        body: "{{body}}",
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
        template_id: "DAFxxxxxxxx",
        title: "{{titre}}",
      },
      paramMeta: { template_id: { scope: "builder_test" } },
    },
  ];
}

// ─── Phase BUILD ─────────────────────────────────────────────────────────────

test("build : pinned = resolved avec sa valeur", () => {
  const resolved = resolveAgentInterface(buildContract(sheetsAgent()), { phase: "build" });
  const range = resolvedValueForStepParam(resolved, 0, "range");
  assert.equal(range?.source, "pinned");
  assert.equal(range?.status, "resolved");
  assert.equal(range?.resolvedValue, "Sheet1!A:Z");
});

test("build : Canva template épinglé = resolved", () => {
  const resolved = resolveAgentInterface(buildContract(canvaAgent()), { phase: "build" });
  const tpl = resolvedValueForStepParam(resolved, 0, "template_id");
  assert.equal(tpl?.source, "pinned");
  assert.equal(tpl?.status, "resolved");
});

// ─── Phase RUN ───────────────────────────────────────────────────────────────

test("run : subscriber resource sans valeur = ask (resource_picker)", () => {
  const resolved = resolveAgentInterface(buildContract(sheetsAgent()), {
    phase: "run",
    runnerId: "u1",
    provided: {},
    resources: {},
  });
  const sheet = resolvedValueForStepParam(resolved, 0, "spreadsheetId");
  assert.equal(sheet?.status, "ask");
  assert.equal(sheet?.widget, "resource_picker");
  assert.ok(sheet?.message && sheet.message.length > 0);
});

test("run : subscriber resource avec valeur = resolved", () => {
  const resolved = resolveAgentInterface(buildContract(sheetsAgent()), {
    phase: "run",
    runnerId: "u1",
    resources: { "0:spreadsheetId": "1xyz" },
  });
  const sheet = resolvedValueForStepParam(resolved, 0, "spreadsheetId");
  assert.equal(sheet?.status, "resolved");
  assert.equal(sheet?.resolvedValue, "1xyz");
});

test("run : Gmail to/subject manquants = ask, body est sortie d'étape (pas dans contrat)", () => {
  const resolved = resolveAgentInterface(buildContract(gmailAgent()), {
    phase: "run",
    runnerId: "u1",
    provided: {},
    resources: {},
  });
  const asks = resolved.filter((r) => r.status === "ask").map((r) => r.key);
  assert.ok(asks.includes("destinataire"));
  assert.ok(asks.includes("sujet"));
  // contexte (variable du prompt LLM) aussi demandé
  assert.ok(asks.includes("contexte"));
  // body est une sortie d'étape (LLM) → pas demandé
  assert.ok(!asks.includes("body"));
});

// ─── Phase SELL ──────────────────────────────────────────────────────────────

test("sell : pinned non-shared repassé en ask (placeholder demandé)", () => {
  const resolved = resolveAgentInterface(buildContract(sheetsAgent()), { phase: "sell" });
  // range était pinned → maintenant ask
  const range = resolved.find(
    (r) => r.connectorParam?.stepIndex === 0 && r.connectorParam?.key === "range",
  );
  assert.equal(range?.status, "ask");
  assert.equal(range?.source, "subscriber");
  // valeur résolue = placeholder (texte ou {{resource:type}})
  assert.ok(range?.resolvedValue?.startsWith("{{"));
});

test("sell : Canva template_id pinned → ask en sell", () => {
  const resolved = resolveAgentInterface(buildContract(canvaAgent()), { phase: "sell" });
  const tpl = resolved.find(
    (r) => r.connectorParam?.stepIndex === 0 && r.connectorParam?.key === "template_id",
  );
  assert.equal(tpl?.status, "ask");
  assert.equal(tpl?.source, "subscriber");
});

// ─── Phase PREFLIGHT ─────────────────────────────────────────────────────────

test("preflight : ne renvoie que ask/missing requis", () => {
  const missing = preflightMissing(buildContract(gmailAgent()), {
    phase: "preflight",
    runnerId: "u1",
    provided: { contexte: "RDV demain" },
    resources: {}, // from manquant
  });
  for (const m of missing) {
    assert.ok(m.status === "ask" || m.status === "missing");
    assert.ok(m.required);
    assert.ok(m.message && m.message.length > 0);
  }
  // contexte est fourni → absent ; destinataire/sujet/from présents
  const keys = missing.map((m) => m.key);
  assert.ok(!keys.includes("contexte"));
  assert.ok(keys.includes("destinataire"));
  assert.ok(keys.includes("sujet"));
});

test("preflight : tout fourni → missing vide", () => {
  const missing = preflightMissing(buildContract(gmailAgent()), {
    phase: "preflight",
    runnerId: "u1",
    provided: {
      contexte: "x",
      destinataire: "alice@x.com",
      sujet: "Salut",
    },
    resources: { "1:from": "moi@x.com" },
  });
  assert.equal(missing.length, 0);
});

// ─── Sanity « widget ↔ kind » ────────────────────────────────────────────────

test("widget cohérent avec le kind du registre", () => {
  const resolved = resolveAgentInterface(buildContract(gmailAgent()), {
    phase: "run",
    provided: {},
    resources: {},
  });
  for (const r of resolved) {
    if (r.kind === "resource" || r.kind === "identity") {
      assert.equal(r.widget, "resource_picker", `kind=${r.kind} doit avoir widget=resource_picker`);
    }
    if (r.kind === "email") {
      assert.equal(r.widget, "email");
    }
    if (r.kind === "textarea") {
      assert.equal(r.widget, "textarea");
    }
  }
});

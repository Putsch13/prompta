import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseFailedSteps,
  connectorFromStep,
} from "../../lib/agent/diagnose-run";

test("connectorFromStep déduit le connecteur depuis le slug", () => {
  assert.equal(
    connectorFromStep({ stepIndex: 0, actionSlug: "GOOGLEDRIVE_LIST_FILES" }),
    "googledrive",
  );
  assert.equal(
    connectorFromStep({ stepIndex: 0, actionSlug: "google_drive.read_file" }),
    "google_drive",
  );
  assert.equal(
    connectorFromStep({ stepIndex: 0, connector: "gmail", actionSlug: "X" }),
    "gmail",
  );
});

test("missing_connection → fix connect (bloquant, non retryable)", () => {
  const { fixes } = diagnoseFailedSteps([
    { stepIndex: 1, errorCode: "missing_connection", actionSlug: "GMAIL_SEND_EMAIL" },
  ]);
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].kind, "connect");
  assert.equal(fixes[0].connector, "gmail");
  assert.equal(fixes[0].severity, "blocker");
  assert.equal(fixes[0].retryable, false);
});

test("invalid_credentials → reconnect", () => {
  const { fixes } = diagnoseFailedSteps([
    { stepIndex: 0, errorCode: "invalid_credentials", connector: "googlesheets" },
  ]);
  assert.equal(fixes[0].kind, "reconnect");
  assert.equal(fixes[0].connector, "googlesheets");
});

test("permission_denied (403) → reconnect bloquant, PAS un retry temporaire", () => {
  const { fixes, summary } = diagnoseFailedSteps([
    { stepIndex: 2, errorCode: "permission_denied", connector: "google_sheets" },
  ]);
  assert.equal(fixes[0].kind, "reconnect");
  assert.equal(fixes[0].severity, "blocker");
  assert.equal(fixes[0].retryable, false);
  assert.match(summary, /bloquant/);
});

test("rate_limit/timeout → retry (warning, retryable)", () => {
  const { fixes, summary } = diagnoseFailedSteps([
    { stepIndex: 0, errorCode: "timeout" },
  ]);
  assert.equal(fixes[0].kind, "retry");
  assert.equal(fixes[0].retryable, true);
  assert.match(summary, /relancement/i);
});

test("déduplique les correctifs identiques (même reconnexion)", () => {
  const { fixes } = diagnoseFailedSteps([
    { stepIndex: 0, errorCode: "invalid_credentials", connector: "googledrive" },
    { stepIndex: 1, errorCode: "invalid_credentials", connector: "googledrive" },
  ]);
  assert.equal(fixes.length, 1);
});

test("résumé indique le nombre de bloquants", () => {
  const { summary } = diagnoseFailedSteps([
    { stepIndex: 0, errorCode: "missing_connection", connector: "gmail" },
  ]);
  assert.match(summary, /bloquant/i);
});

test("aucune étape exploitable → résumé neutre", () => {
  const { fixes, summary } = diagnoseFailedSteps([{ stepIndex: 0 }]);
  assert.equal(fixes.length, 0);
  assert.match(summary, /aucune/i);
});

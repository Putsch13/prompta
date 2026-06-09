import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../../lib/agent/step-logger";

test("redactSecrets — masque les clés sensibles", () => {
  const out = redactSecrets({ api_key: "sk-123", name: "Bob", access_token: "x" }) as Record<string, unknown>;
  assert.equal(out.api_key, "[redacted]");
  assert.equal(out.access_token, "[redacted]");
  assert.equal(out.name, "Bob");
});

test("redactSecrets — masque les motifs Bearer / sk- dans les chaînes", () => {
  const out = redactSecrets("Authorization: Bearer abc.def.ghi token sk-ABCDEFGH12345678") as string;
  assert.ok(!out.includes("abc.def.ghi"));
  assert.ok(out.includes("[redacted]"));
});

test("redactSecrets — récursif sur objets imbriqués", () => {
  const out = redactSecrets({ a: { b: { password: "p", ok: 1 } } }) as { a: { b: { password: string; ok: number } } };
  assert.equal(out.a.b.password, "[redacted]");
  assert.equal(out.a.b.ok, 1);
});

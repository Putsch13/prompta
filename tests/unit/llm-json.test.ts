import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject, repairJsonString, parseLlmJson } from "../../lib/llm/json";

describe("llm/json", () => {
  it("parse un JSON propre", () => {
    assert.deepEqual(parseLlmJson('{"a":1,"b":"x"}'), { a: 1, b: "x" });
  });

  it("ignore le texte autour et les fences markdown", () => {
    const text = 'Voici le plan :\n```json\n{"ok":true}\n```\nMerci.';
    assert.deepEqual(parseLlmJson(text), { ok: true });
  });

  it("extrait l'objet équilibré sans sur-capturer", () => {
    const block = extractJsonObject('{"a":{"b":1}} suivi de } parasite');
    assert.equal(block, '{"a":{"b":1}}');
  });

  it("répare les sauts de ligne bruts dans une chaîne", () => {
    const broken = '{"msg":"ligne1\nligne2"}';
    assert.throws(() => JSON.parse(broken));
    assert.deepEqual(parseLlmJson(broken), { msg: "ligne1\nligne2" });
  });

  it("répare les virgules traînantes", () => {
    assert.deepEqual(parseLlmJson('{"a":1,"b":2,}'), { a: 1, b: 2 });
  });

  it("n'altère pas les échappements déjà valides", () => {
    const ok = '{"path":"a\\\\b","q":"\\"x\\""}';
    assert.equal(repairJsonString(ok), ok);
    assert.deepEqual(parseLlmJson(ok), { path: "a\\b", q: '"x"' });
  });

  it("retourne null si irrécupérable", () => {
    assert.equal(parseLlmJson("pas de json du tout"), null);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceArg } from "../../lib/composio/execute";

test("coerceArg — sans schéma : garde les scalaires en string (P3-2)", () => {
  // Un titre « 123 » ne doit PAS devenir un nombre.
  assert.equal(coerceArg("123"), "123");
  // « true » reste une string sans schéma.
  assert.equal(coerceArg("true"), "true");
  // Texte commençant par un chiffre.
  assert.equal(coerceArg("2024 Rapport annuel"), "2024 Rapport annuel");
});

test("coerceArg — sans schéma : parse uniquement les structures JSON", () => {
  assert.deepEqual(coerceArg('{"a":1}'), { a: 1 });
  assert.deepEqual(coerceArg("[1,2,3]"), [1, 2, 3]);
});

test("coerceArg — JSON invalide reste une string", () => {
  assert.equal(coerceArg("[pas du json"), "[pas du json");
});

test("coerceArg — avec schéma number", () => {
  assert.equal(coerceArg("42", "number"), 42);
  assert.equal(coerceArg("abc", "number"), "abc");
});

test("coerceArg — avec schéma boolean", () => {
  assert.equal(coerceArg("true", "boolean"), true);
  assert.equal(coerceArg("false", "boolean"), false);
});

test("coerceArg — schéma string force la string même pour un nombre", () => {
  assert.equal(coerceArg("123", "string"), "123");
});

test("coerceArg — schéma object", () => {
  assert.deepEqual(coerceArg('{"x":true}', "object"), { x: true });
});

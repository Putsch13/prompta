import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyRetrieval } from "../../lib/data-sources/retrieve";

test("isEmptyRetrieval — structures vides détectées", () => {
  assert.equal(isEmptyRetrieval(""), true);
  assert.equal(isEmptyRetrieval("[]"), true);
  assert.equal(isEmptyRetrieval("{}"), true);
  assert.equal(isEmptyRetrieval('{"files":[]}'), true);
  assert.equal(isEmptyRetrieval('{"results":[]}'), true);
  assert.equal(isEmptyRetrieval("No files found"), true);
  assert.equal(isEmptyRetrieval("Aucun résultat"), true);
});

test("isEmptyRetrieval — contenu réel non détecté comme vide", () => {
  assert.equal(isEmptyRetrieval('{"files":[{"id":"abc","name":"Rapport"}]}'), false);
  assert.equal(isEmptyRetrieval("Voici le contenu du fichier..."), false);
  assert.equal(isEmptyRetrieval('[["a","b"],["c","d"]]'), false);
});

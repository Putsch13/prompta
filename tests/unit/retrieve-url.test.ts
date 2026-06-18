/**
 * Extraction d'URL pour l'étape retrieve « url » : la query peut être une
 * phrase (« Extraire … depuis https://… pour … ») → on doit en sortir l'URL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractFirstUrl } from "../../lib/data-sources/retrieve";

test("URL nue conservée", () => {
  assert.equal(extractFirstUrl("https://example.com/page"), "https://example.com/page");
});

test("URL extraite d'une phrase", () => {
  assert.equal(
    extractFirstUrl("Extraire les photos depuis https://www.instagram.com/poa_event/ pour un book."),
    "https://www.instagram.com/poa_event/",
  );
});

test("ponctuation finale retirée", () => {
  assert.equal(extractFirstUrl("Va sur https://exemple.fr/a,b)."), "https://exemple.fr/a,b");
});

test("pas d'URL → null", () => {
  assert.equal(extractFirstUrl("analyse le dossier marketing"), null);
  assert.equal(extractFirstUrl(""), null);
});

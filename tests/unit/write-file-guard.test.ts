import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWriteFileParams, isTextDocumentWrite } from "../../lib/connectors/write-file-guard";

test("isTextDocumentWrite — détecte les écritures de document", () => {
  assert.equal(isTextDocumentWrite("GOOGLEDRIVE_CREATE_FILE_FROM_TEXT"), true);
  assert.equal(isTextDocumentWrite("GOOGLEDOCS_CREATE_DOCUMENT"), true);
  assert.equal(isTextDocumentWrite("GOOGLEDRIVE_CREATE_FILE"), true);
  assert.equal(isTextDocumentWrite("google_drive.write_file"), true);
});

test("isTextDocumentWrite — ignore lecture/liste", () => {
  assert.equal(isTextDocumentWrite("GOOGLEDRIVE_LIST_FILES"), false);
  assert.equal(isTextDocumentWrite("GMAIL_SEND_EMAIL"), false);
});

test("checkWriteFileParams — nom + contenu présents → ok", () => {
  const r = checkWriteFileParams("GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", {
    file_name: "Article.md",
    text_content: "Bonjour le monde",
  });
  assert.equal(r.ok, true);
});

test("checkWriteFileParams — contenu vide → échec explicite", () => {
  const r = checkWriteFileParams("GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", {
    file_name: "Article.md",
    text_content: "   ",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /contenu/i);
});

test("checkWriteFileParams — nom vide → échec explicite", () => {
  const r = checkWriteFileParams("GOOGLEDOCS_CREATE_DOCUMENT", {
    title: "",
    content: "du texte",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /nom/i);
});

test("checkWriteFileParams — action non-écriture → toujours ok", () => {
  const r = checkWriteFileParams("GOOGLEDRIVE_LIST_FILES", {});
  assert.equal(r.ok, true);
});

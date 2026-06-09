import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractResourceId,
  looksLikeResourceUrl,
} from "../../lib/connectors/extract-resource-id";

test("extrait l'ID d'une URL Google Docs", () => {
  assert.equal(
    extractResourceId("https://docs.google.com/document/d/1AbC_def-123/edit#heading=h.x"),
    "1AbC_def-123",
  );
});

test("extrait l'ID d'une URL Google Sheets", () => {
  assert.equal(
    extractResourceId("https://docs.google.com/spreadsheets/d/1SHEET99/edit#gid=0"),
    "1SHEET99",
  );
});

test("extrait l'ID d'une URL Google Slides", () => {
  assert.equal(
    extractResourceId("https://docs.google.com/presentation/d/1PRES77/edit"),
    "1PRES77",
  );
});

test("extrait l'ID d'un fichier Drive", () => {
  assert.equal(
    extractResourceId("https://drive.google.com/file/d/1FILE55/view?usp=sharing"),
    "1FILE55",
  );
});

test("extrait l'ID d'un dossier Drive (avec /u/0/)", () => {
  assert.equal(
    extractResourceId("https://drive.google.com/drive/u/0/folders/1FOLDER33"),
    "1FOLDER33",
  );
  assert.equal(
    extractResourceId("https://drive.google.com/drive/folders/1FOLDER44"),
    "1FOLDER44",
  );
});

test("extrait l'ID via ?id= (drive open)", () => {
  assert.equal(
    extractResourceId("https://drive.google.com/open?id=1OPEN22"),
    "1OPEN22",
  );
});

test("extrait et normalise un ID Notion (tirets retirés)", () => {
  assert.equal(
    extractResourceId("https://www.notion.so/Mon-Doc-0123456789abcdef0123456789abcdef"),
    "0123456789abcdef0123456789abcdef",
  );
});

test("renvoie la valeur inchangée si ce n'est pas une URL connue", () => {
  assert.equal(extractResourceId("1AlreadyAnId123"), "1AlreadyAnId123");
  assert.equal(extractResourceId("Sheet1!A1:D10"), "Sheet1!A1:D10");
  assert.equal(extractResourceId(""), "");
  assert.equal(extractResourceId("https://example.com/page"), "https://example.com/page");
});

test("looksLikeResourceUrl détecte les URLs exploitables", () => {
  assert.equal(
    looksLikeResourceUrl("https://docs.google.com/document/d/1X/edit"),
    true,
  );
  assert.equal(looksLikeResourceUrl("1PlainId"), false);
});

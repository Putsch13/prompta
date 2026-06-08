import { test } from "node:test";
import assert from "node:assert/strict";
import { pickToolSlug, actionVerb } from "../../lib/composio/resolve-native-action";
import type { ComposioToolEntry } from "../../lib/composio/catalog";

function tool(slug: string, name = slug): ComposioToolEntry {
  return { slug, name, toolkit: "googledrive", inputs: [] };
}

const DRIVE_TOOLS: ComposioToolEntry[] = [
  tool("GOOGLEDRIVE_DOWNLOAD_FILE", "Download file"),
  tool("GOOGLEDRIVE_DELETE_FILE", "Delete file"),
  tool("GOOGLEDRIVE_LIST_FILES", "List files"),
  tool("GOOGLEDRIVE_CREATE_FOLDER", "Create folder"),
  tool("GOOGLEDRIVE_FIND_FILE", "Find file"),
  tool("GOOGLEDRIVE_UPLOAD_FILE", "Upload file"),
];

test("actionVerb — extrait le verbe", () => {
  assert.equal(actionVerb("google_drive.read_file"), "read_file");
  assert.equal(actionVerb("list_files"), "list_files");
});

test("pickToolSlug — read_file → outil de lecture, jamais destructif", () => {
  const slug = pickToolSlug(DRIVE_TOOLS, "googledrive", "google_drive.read_file");
  assert.ok(slug);
  assert.notEqual(slug, "GOOGLEDRIVE_DELETE_FILE");
  assert.ok(["GOOGLEDRIVE_DOWNLOAD_FILE", "GOOGLEDRIVE_FIND_FILE"].includes(slug!));
});

test("pickToolSlug — list_files → LIST_FILES", () => {
  const slug = pickToolSlug(DRIVE_TOOLS, "googledrive", "google_drive.list_files");
  assert.equal(slug, "GOOGLEDRIVE_LIST_FILES");
});

test("pickToolSlug — delete_file → DELETE_FILE (verbe mutant explicite)", () => {
  const slug = pickToolSlug(DRIVE_TOOLS, "googledrive", "google_drive.delete_file");
  assert.equal(slug, "GOOGLEDRIVE_DELETE_FILE");
});

test("pickToolSlug — upload_file → UPLOAD_FILE", () => {
  const slug = pickToolSlug(DRIVE_TOOLS, "googledrive", "google_drive.upload_file");
  assert.equal(slug, "GOOGLEDRIVE_UPLOAD_FILE");
});

test("pickToolSlug — verbe sans correspondance → null", () => {
  const slug = pickToolSlug(
    [tool("GOOGLEDRIVE_CREATE_FOLDER", "Create folder")],
    "googledrive",
    "google_drive.read_file",
  );
  assert.equal(slug, null);
});

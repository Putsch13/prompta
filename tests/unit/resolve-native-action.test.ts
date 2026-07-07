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

// P0-1 : écriture de document → préférer FROM_TEXT, jamais CREATE_FILE (métadonnée vide)
const DRIVE_WRITE_TOOLS: ComposioToolEntry[] = [
  tool("GOOGLEDRIVE_CREATE_FILE", "Create file"),
  tool("GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", "Create file from text"),
  tool("GOOGLEDRIVE_UPLOAD_FILE", "Upload file"),
];

test("pickToolSlug — write_file avec contenu → FROM_TEXT (pas CREATE_FILE vide)", () => {
  const slug = pickToolSlug(DRIVE_WRITE_TOOLS, "googledrive", "google_drive.write_file", {
    hasTextContent: true,
  });
  assert.equal(slug, "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT");
});

test("pickToolSlug — create_file objet 'document' → FROM_TEXT", () => {
  const slug = pickToolSlug(DRIVE_WRITE_TOOLS, "googledrive", "google_drive.create_document");
  assert.equal(slug, "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT");
});

test("pickToolSlug — create_file sans indice texte ne choisit pas la métadonnée vide quand FROM_TEXT dispo", () => {
  const slug = pickToolSlug(DRIVE_WRITE_TOOLS, "googledrive", "google_drive.create_file", {
    hasTextContent: true,
  });
  assert.notEqual(slug, "GOOGLEDRIVE_CREATE_FILE");
});

// Verbe nu sans connecteur (ex. canva create_design) — cas du bug en prod.
function canvaTool(slug: string): ComposioToolEntry {
  return { slug, name: slug, toolkit: "canva", inputs: [] };
}

test("pickToolSlug — create_design (verbe nu) → CANVA_CREATE_DESIGN", () => {
  const tools = [
    canvaTool("CANVA_CREATE_DESIGN"),
    canvaTool("CANVA_LIST_DESIGNS"),
    canvaTool("CANVA_GET_DESIGN"),
  ];
  assert.equal(pickToolSlug(tools, "canva", "create_design"), "CANVA_CREATE_DESIGN");
});

test("pickToolSlug — read_design ne choisit jamais DELETE_DESIGN", () => {
  const tools = [canvaTool("CANVA_DELETE_DESIGN"), canvaTool("CANVA_GET_DESIGN")];
  assert.equal(pickToolSlug(tools, "canva", "read_design"), "CANVA_GET_DESIGN");
});

test("pickToolSlug — create_design évite COMMENT_REPLY quand seule la variante WITH_OPTIONAL_ASSET existe", () => {
  const tools = [
    { slug: "CANVA_CREATE_COMMENT_REPLY_IN_DESIGN", name: "Create comment reply in design", toolkit: "canva", inputs: [] },
    { slug: "CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET", name: "Create Canva design with optional asset", toolkit: "canva", inputs: [] },
    { slug: "CANVA_CREATE_DESIGN_COMMENT_IN_PREVIEW_API", name: "Create design comment", toolkit: "canva", inputs: [] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(
    pickToolSlug(tools, "canva", "canva.create_design"),
    "CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET",
  );
});

test("pickToolSlug — create_design préfère toujours l'exact CANVA_CREATE_DESIGN quand présent", () => {
  const tools = [
    { slug: "CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET", name: "Create Canva design with optional asset", toolkit: "canva", inputs: [] },
    { slug: "CANVA_CREATE_DESIGN", name: "Create design", toolkit: "canva", inputs: [] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(pickToolSlug(tools, "canva", "canva.create_design"), "CANVA_CREATE_DESIGN");
});

test("pickToolSlug — tokens pièges : create_task évite CREATE_TASK_COMMENT quand une vraie création existe", () => {
  const tools = [
    { slug: "ASANA_CREATE_TASK_COMMENT", name: "Create task comment", toolkit: "asana", inputs: [] },
    { slug: "ASANA_CREATE_SUBTASK_FOR_TASK", name: "Create subtask for task", toolkit: "asana", inputs: [] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(pickToolSlug(tools, "asana", "asana.create_task"), "ASANA_CREATE_SUBTASK_FOR_TASK");
});

test("pickToolSlug — create_issue préfère CREATE_NEW_ISSUE à CREATE_ISSUE_NOTE", () => {
  const tools = [
    { slug: "GITLAB_CREATE_ISSUE_NOTE", name: "Create issue note", toolkit: "gitlab", inputs: [] },
    { slug: "GITLAB_CREATE_NEW_ISSUE", name: "Create new issue", toolkit: "gitlab", inputs: [] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(pickToolSlug(tools, "gitlab", "gitlab.create_issue"), "GITLAB_CREATE_NEW_ISSUE");
});

test("pickToolSlug — un piège explicitement demandé reste résolvable", () => {
  const tools = [
    { slug: "ASANA_CREATE_TASK_COMMENT", name: "Create task comment", toolkit: "asana", inputs: [] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(pickToolSlug(tools, "asana", "asana.create_task_comment"), "ASANA_CREATE_TASK_COMMENT");
});

test("pickToolSlug — deprecated exclu + premier token mutant écarté en lecture + piège annulé si défaut", () => {
  const tools = [
    { slug: "TRELLO_ADD_BOARDS_LISTS_BY_ID_BOARD", name: "Add new list to board (Deprecated)", description: "DEPRECATED: use...", toolkit: "trello", inputs: [] },
    { slug: "TRELLO_GET_BOARDS_BY_ID_BOARD", name: "Get boards by id board", toolkit: "trello", inputs: [{ key: "idBoard", label: "Id Board", required: true, type: "text", kind: "input", defaultScope: "dynamic" }] },
    { slug: "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER", name: "Get member boards by id", toolkit: "trello", inputs: [{ key: "idMember", label: "Id Member", required: false, type: "text", kind: "input", defaultScope: "dynamic", defaultValue: "me" }] },
  ] as Parameters<typeof pickToolSlug>[0];
  assert.equal(pickToolSlug(tools, "trello", "trello.list_boards"), "TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER");
});

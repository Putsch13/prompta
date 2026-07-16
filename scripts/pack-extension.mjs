/**
 * Empaquette extension/ → public/downloads/prompta-everywhere.zip
 * Appelé en prebuild pour que le bouton « Télécharger » serve toujours
 * la version courante (sans passer par GitHub).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "extension");
const outDir = join(root, "public", "downloads");
const out = join(outDir, "prompta-everywhere.zip");

if (!existsSync(src)) {
  console.error("[pack-extension] dossier extension/ introuvable");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
if (existsSync(out)) rmSync(out);

execFileSync(
  "zip",
  [
    "-r",
    out,
    ".",
    "-x",
    "*.DS_Store",
    "-x",
    "README.md",
    "-x",
    "popup.html",
    "-x",
    "popup.js",
  ],
  { cwd: src, stdio: "inherit" },
);
console.log(`[pack-extension] → ${out}`);

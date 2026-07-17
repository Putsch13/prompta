/**
 * Empaquette extension/ → deux zips dans public/downloads/ :
 *  - prompta-everywhere.zip : Chrome & Chromium (manifest.json, service worker) ;
 *  - prompta-firefox.zip    : Firefox MV3 (manifest.firefox.json renommé
 *    manifest.json dans le zip — background.scripts + gecko id).
 *
 * Appelé en prebuild pour que les boutons « Télécharger » servent toujours
 * la version courante (sans passer par GitHub).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, cpSync, renameSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "extension");
const outDir = join(root, "public", "downloads");

// Fichiers hors distribution (le popup n'est pas référencé par les manifests).
const OMIT = /(^|\/)(README\.md|popup\.html|popup\.js|\.DS_Store)$/;

if (!existsSync(src)) {
  console.error("[pack-extension] dossier extension/ introuvable");
  process.exit(1);
}
if (!existsSync(join(src, "manifest.firefox.json"))) {
  console.error("[pack-extension] extension/manifest.firefox.json introuvable");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

/** Zippe le contenu de dir (déjà filtré) vers outFile. */
function zipDir(dir, outFile) {
  if (existsSync(outFile)) rmSync(outFile);
  execFileSync("zip", ["-rq", outFile, ".", "-x", "*.DS_Store"], { cwd: dir, stdio: "inherit" });
  console.log(`[pack-extension] → ${outFile}`);
}

/** Copie extension/ vers un dossier de staging en écartant les fichiers OMIT. */
function stage(name) {
  const dir = mkdtempSync(join(tmpdir(), `prompta-pack-${name}-`));
  cpSync(src, dir, { recursive: true, filter: (from) => !OMIT.test(from) });
  return dir;
}

// ── Chrome / Chromium ─────────────────────────────────────────────────────────
const chromeDir = stage("chrome");
try {
  rmSync(join(chromeDir, "manifest.firefox.json"));
  zipDir(chromeDir, join(outDir, "prompta-everywhere.zip"));
} finally {
  rmSync(chromeDir, { recursive: true, force: true });
}

// ── Firefox (manifest.firefox.json devient LE manifest du zip) ───────────────
const firefoxDir = stage("firefox");
try {
  rmSync(join(firefoxDir, "manifest.json"));
  renameSync(join(firefoxDir, "manifest.firefox.json"), join(firefoxDir, "manifest.json"));
  zipDir(firefoxDir, join(outDir, "prompta-firefox.zip"));
} finally {
  rmSync(firefoxDir, { recursive: true, force: true });
}

#!/usr/bin/env bash
#
# Convertit extension/ en projet Xcode « Safari Web Extension ».
#
# Prérequis : macOS + Xcode complet (pas seulement les Command Line Tools).
# Sortie    : safari-build/Prompta partout/ (projet Xcode, app macOS + extension).
#
# Ensuite (à la main) :
#   1. open "safari-build/Prompta partout/Prompta partout.xcodeproj"
#   2. Build & Run (⌘R) — l'app conteneur installe l'extension ;
#   3. Safari → Réglages → Avancé → « Afficher le menu Développement »,
#      puis Développement → « Autoriser les extensions non signées » ;
#   4. Safari → Réglages → Extensions → activer Prompta partout.
#
# Distribution réelle : compte Apple Developer (99 $/an) + App Store.
# Voir docs/BROWSER-PORTS.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/extension"
OUT="$ROOT/safari-build"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "✗ Ce script ne tourne que sur macOS (conversion Safari = outil Xcode)." >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "✗ xcrun introuvable. Installe Xcode depuis l'App Store, ouvre-le une fois," >&2
  echo "  puis relance ce script." >&2
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "✗ safari-web-extension-converter introuvable." >&2
  echo "  Il faut Xcode COMPLET (App Store), pas seulement les Command Line Tools." >&2
  echo "  Après installation : sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

if [[ ! -f "$SRC/manifest.json" ]]; then
  echo "✗ $SRC/manifest.json introuvable — lance le script depuis le repo prompta." >&2
  exit 1
fi

echo "→ Conversion de extension/ en projet Safari (sortie : $OUT)…"
xcrun safari-web-extension-converter "$SRC" \
  --project-location "$OUT" \
  --app-name "Prompta partout" \
  --bundle-identifier fr.prompta.partout \
  --swift \
  --no-open \
  --force

echo
echo "✓ Projet généré dans $OUT"
echo "  Prochaines étapes : ouvrir le .xcodeproj, ⌘R, puis autoriser les"
echo "  extensions non signées dans Safari (menu Développement)."
echo "  Détails : docs/BROWSER-PORTS.md"

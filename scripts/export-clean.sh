#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-prompta-clean.zip}"

cd "$ROOT"

zip -r "$OUT" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x ".git/*" \
  -x ".env" \
  -x ".env.*" \
  -x "__MACOSX/*" \
  -x "*.DS_Store" \
  -x "test-results/*" \
  -x "*.tsbuildinfo" \
  -x "prompta-clean.zip" \
  -x "prompta*.zip"

echo "Archive propre créée : $OUT"

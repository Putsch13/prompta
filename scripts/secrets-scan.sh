#!/usr/bin/env bash
# secrets-scan.sh — Scan for leaked secrets in tracked files.
# Usage: npm run secrets:scan  (or bash scripts/secrets-scan.sh)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'
  'sk-ant-[a-zA-Z0-9]+'
  'sk-proj-[a-zA-Z0-9]+'
  'e2b_[a-zA-Z0-9]{20,}'
  'eyJhbGciOi[a-zA-Z0-9_-]+'
  'whsec_[a-zA-Z0-9]+'
  're_[a-zA-Z0-9]{20,}'
  'pk_test_[a-zA-Z0-9]+'
  'sk_test_[a-zA-Z0-9]+'
  'phc_[a-zA-Z0-9]+'
  'ak_[a-zA-Z0-9]{20,}'
  'sbp_[a-zA-Z0-9]+'
)

FOUND=0

# Lines carrying "pragma: allowlist secret" are known fakes (CI placeholders, test fixtures).
for pattern in "${PATTERNS[@]}"; do
  matches=$(git grep -n -E "$pattern" -- ':!.env*' ':!node_modules' ':!.next' ':!scripts/secrets-scan.sh' 2>/dev/null | grep -v 'pragma: allowlist secret' || true)
  if [ -n "$matches" ]; then
    echo -e "${RED}LEAKED:${NC} Pattern '$pattern' found:"
    echo "$matches" | head -20
    echo ""
    FOUND=1
  fi
done

if [ "$FOUND" -eq 0 ]; then
  echo -e "${GREEN}OK${NC} — No secrets found in tracked files."
  exit 0
else
  echo -e "${RED}FAIL${NC} — Secrets detected! Remove them before pushing."
  exit 1
fi

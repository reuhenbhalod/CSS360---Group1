#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Encrypt backend/.env  →  backend/.env.enc
#
# Run this once after you set up your API keys, and again any time
# you rotate them. Commit the resulting backend/.env.enc; share the
# passphrase with teammates out-of-band (1Password / Slack DM / etc).
#
# Teammates decrypt with:  ./scripts/cicd.sh --decrypt-keys
#
# Usage:
#   ./scripts/encrypt-env.sh
#   GOODEATS_ENV_PASSPHRASE=hunter2 ./scripts/encrypt-env.sh   # non-interactive
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v openssl >/dev/null; then
  echo "✗ openssl not found — install it and re-run"
  exit 1
fi

if [[ ! -f backend/.env ]]; then
  echo "✗ backend/.env not found — create it first (cp backend/.env.example backend/.env, then fill in keys)"
  exit 1
fi

# AES-256-CBC + PBKDF2 with OWASP-recommended iteration count.
# -a writes base64 so the file is text-diffable in git.
COMMON_ARGS=(enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -a
             -in backend/.env -out backend/.env.enc)

if [[ -n "${GOODEATS_ENV_PASSPHRASE:-}" ]]; then
  openssl "${COMMON_ARGS[@]}" -pass env:GOODEATS_ENV_PASSPHRASE
else
  openssl "${COMMON_ARGS[@]}"   # interactive prompt (asks twice for verification)
fi

echo
echo "✓ wrote backend/.env.enc"
echo
echo "Next steps:"
echo "  1. git add backend/.env.enc && git commit -m 'Update encrypted env'"
echo "  2. Share the passphrase with teammates via password manager / DM"
echo "  3. Teammates run: ./scripts/cicd.sh --decrypt-keys"

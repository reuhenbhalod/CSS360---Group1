#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# GoodEats hand-built CI/CD pipeline
#
# Maps to the rubric (one stage per line item):
#   1. Pull           — git fetch + checkout main
#   2. Static analysis — eslint (frontend) + ruff (backend)
#   3. Tests          — pytest (unit+integration) + vitest (unit) + smoke
#   4. Package        — docker compose build
#   5. Deploy         — docker compose up -d
#   6. Verify         — curl /api/health, /api/all, and the frontend
#
# Usage:
#   ./scripts/cicd.sh                  # run the whole pipeline
#   ./scripts/cicd.sh --skip-pull      # use the current working tree (good for local dev)
#   ./scripts/cicd.sh --no-deploy      # CI-only (lint + tests + build), don't start prod
#   ./scripts/cicd.sh --teardown       # stop the running stack
#   ./scripts/cicd.sh --decrypt-keys   # decrypt backend/.env.enc → backend/.env (teammate onboarding)
#
# Exits non-zero on any failure so a wrapping CI system can detect it.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── colors / logging ────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'

stage()   { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }
ok()      { echo -e "${GREEN}✓${NC} $*"; }
fail()    { echo -e "${RED}✗${NC} $*"; exit 1; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }

# ─── flags ───────────────────────────────────────────────────────
SKIP_PULL=0
NO_DEPLOY=0
TEARDOWN=0
DECRYPT_KEYS=0
for arg in "$@"; do
  case "$arg" in
    --skip-pull)    SKIP_PULL=1 ;;
    --no-deploy)    NO_DEPLOY=1 ;;
    --teardown)     TEARDOWN=1 ;;
    --decrypt-keys) DECRYPT_KEYS=1 ;;
    -h|--help)      sed -n '2,19p' "$0"; exit 0 ;;
    *)              fail "unknown flag: $arg (try --help)" ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── 0. Teardown shortcut ────────────────────────────────────────
if [[ "$TEARDOWN" == 1 ]]; then
  stage "TEARDOWN"
  docker compose down -v
  ok "stack stopped, volumes removed"
  exit 0
fi

# ─── 0. Decrypt-keys shortcut (teammate onboarding) ──────────────
# Decrypts backend/.env.enc → backend/.env so a teammate who just
# cloned the repo can run the dashboard with real API keys. The
# passphrase is shared out-of-band (Slack DM, 1Password, etc).
if [[ "$DECRYPT_KEYS" == 1 ]]; then
  stage "DECRYPT backend/.env"
  command -v openssl >/dev/null || fail "openssl not installed"
  [[ -f backend/.env.enc ]] || fail "backend/.env.enc not found — ask the project owner to commit one"
  if [[ -f backend/.env ]]; then
    warn "backend/.env already exists — press Enter to overwrite, Ctrl-C to abort"
    read -r
  fi
  COMMON_ARGS=(enc -d -aes-256-cbc -pbkdf2 -iter 600000 -a
               -in backend/.env.enc -out backend/.env)
  if [[ -n "${GOODEATS_ENV_PASSPHRASE:-}" ]]; then
    openssl "${COMMON_ARGS[@]}" -pass env:GOODEATS_ENV_PASSPHRASE \
      || fail "decrypt failed — wrong passphrase?"
  else
    openssl "${COMMON_ARGS[@]}" \
      || fail "decrypt failed — wrong passphrase?"
  fi
  ok "wrote backend/.env"
  echo "  Now run: ./scripts/cicd.sh (or python main.py inside backend/)"
  exit 0
fi

# ─── 0. Prerequisites ────────────────────────────────────────────
stage "0 / 6  PREREQUISITE CHECK"
command -v git    >/dev/null || fail "git not installed"
command -v node   >/dev/null || fail "node not installed"
command -v npm    >/dev/null || fail "npm not installed"
command -v python3 >/dev/null || fail "python3 not installed"
if [[ "$NO_DEPLOY" == 0 ]]; then
  command -v docker >/dev/null || fail "docker not installed — install Docker Desktop (or rerun with --no-deploy to skip package/deploy/verify)"
  docker compose version >/dev/null 2>&1 || fail "'docker compose' not available (need Docker v20.10+)"
  ok "git, node, npm, python3, docker compose all present"
else
  ok "git, node, npm, python3 present (docker skipped: --no-deploy)"
fi

if [[ ! -f backend/.env ]]; then
  warn "backend/.env is missing — three sources (Foursquare, GNews, Guardian)"
  warn "will return ok:false until you create it from backend/.env.example"
fi

# ─── 1. Pull latest code (2 pts) ─────────────────────────────────
stage "1 / 6  PULL latest code from main"
if [[ "$SKIP_PULL" == 1 ]]; then
  warn "--skip-pull: using current working tree at $(git rev-parse --short HEAD)"
else
  git fetch origin --prune
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$CURRENT_BRANCH" != "main" ]]; then
    warn "currently on '$CURRENT_BRANCH', not main — checking out main"
    git checkout main
  fi
  git pull --ff-only origin main
fi
ok "code at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

# ─── Install dev dependencies (idempotent) ───────────────────────
stage "INSTALL dev dependencies"

# Backend venv
if [[ ! -d backend/.venv ]]; then
  python3 -m venv backend/.venv
fi
# shellcheck disable=SC1091
source backend/.venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r backend/requirements.txt
ok "backend deps installed in backend/.venv"

# Frontend node_modules
if [[ ! -d node_modules ]]; then
  npm install --legacy-peer-deps --silent
fi
ok "frontend deps installed in node_modules/"

# ─── 2. Static analysis (4 pts) ──────────────────────────────────
stage "2 / 6  STATIC ANALYSIS"

echo "→ ruff (backend Python)"
(cd backend && ruff check . --exclude .venv --exclude __pycache__ --output-format=concise) \
  && ok "ruff clean" || fail "ruff found issues"

echo "→ eslint (frontend JS/JSX)"
npm run --silent lint && ok "eslint clean" || fail "eslint found issues"

# ─── 3. Tests (4 pts) ────────────────────────────────────────────
stage "3 / 6  TESTS"

echo "→ unit + integration: backend pytest"
(cd backend && python -m pytest test_ingestion.py -q) \
  && ok "pytest passed" || fail "pytest failed"

echo "→ unit: frontend vitest"
npm test -- --run \
  && ok "vitest passed" || fail "vitest failed"

# Smoke test (pre-deploy): start a temporary backend, hit endpoints, kill it.
# The post-deploy smoke test in stage 6 hits the *production* stack.
echo "→ smoke (pre-deploy): boot backend + curl /api/health"
(cd backend && python main.py >/tmp/goodeats-smoke.log 2>&1) &
SMOKE_PID=$!
trap 'kill $SMOKE_PID 2>/dev/null || true' EXIT
for i in {1..15}; do
  if curl -fs http://localhost:8000/api/health >/dev/null; then break; fi
  sleep 1
done
if curl -fs http://localhost:8000/api/health >/dev/null; then
  ok "pre-deploy smoke: /api/health returned 200"
else
  cat /tmp/goodeats-smoke.log | tail -20
  fail "pre-deploy smoke failed — backend didn't come up"
fi
kill $SMOKE_PID 2>/dev/null || true
wait $SMOKE_PID 2>/dev/null || true   # absorb the SIGTERM exit message
trap - EXIT
sleep 1  # let port 8000 release

if [[ "$NO_DEPLOY" == 1 ]]; then
  ok "CI stages complete; --no-deploy set, skipping package/deploy"
  exit 0
fi

# ─── 4. Package (2 pts) ──────────────────────────────────────────
stage "4 / 6  PACKAGE Docker images"
docker compose build --pull
ok "images built: goodeats-backend, goodeats-frontend"

# ─── 5. Deploy (4 pts) ───────────────────────────────────────────
stage "5 / 6  DEPLOY (docker compose up)"
# Stop any previous stack first so we get clean ports.
docker compose down 2>/dev/null || true
docker compose up -d
ok "stack started (backend :8000, frontend :8080)"

# ─── 6. Verify (2 pts) ───────────────────────────────────────────
stage "6 / 6  VERIFY deployment"

echo "→ waiting for backend healthcheck to go green"
for i in {1..30}; do
  HEALTH="$(docker inspect --format='{{.State.Health.Status}}' goodeats-backend 2>/dev/null || echo unknown)"
  if [[ "$HEALTH" == "healthy" ]]; then ok "backend healthy"; break; fi
  if [[ "$i" == "30" ]]; then
    docker compose logs --tail=40 backend
    fail "backend never went healthy"
  fi
  sleep 2
done

echo "→ /api/health (deployed)"
curl -fs http://localhost:8000/api/health | grep -q '"ok":true' \
  && ok "/api/health → ok:true" || fail "/api/health did not return ok:true"

echo "→ /api/all (deployed; expect 5 source envelopes)"
BODY="$(curl -fs http://localhost:8000/api/all)"
for source in restaurants places reddit news articles; do
  echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
env = d.get('$source')
if not env or 'ok' not in env:
    sys.exit('missing $source envelope')
print(f'  · $source: ok={env[\"ok\"]} count={env[\"count\"]} error={env[\"error\"]}')"
done
ok "/api/all returned all 5 source envelopes"

echo "→ frontend (deployed)"
curl -fs -o /dev/null -w "  · http://localhost:8080 → %{http_code}\n" http://localhost:8080
curl -fs http://localhost:8080 | grep -q '<div id="root"' \
  && ok "frontend served the React shell" || fail "frontend did not serve index.html"

# ─── Summary ─────────────────────────────────────────────────────
echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ CI/CD PIPELINE PASSED${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo "  Deployed stack:"
echo "    backend  → http://localhost:8000  (health: /api/health, data: /api/all)"
echo "    frontend → http://localhost:8080"
echo
echo "  Stop the stack:  ./scripts/cicd.sh --teardown"
echo "  Tail logs:       docker compose logs -f"

# GoodEats

A multi-source dining dashboard for Bothell, WA. React + Vite frontend, FastAPI + SQLite backend, five upstream APIs (Foursquare, OpenStreetMap, Reddit, GNews, The Guardian), and a hand-built CI/CD pipeline that takes the repo from a git pull to a verified Docker deployment.

- Repository: https://github.com/reuhenbhalod/CSS360---Group1
- Production build: `docker compose up` — exposes frontend on **:8080**, backend on **:8000**
- One-command pipeline: `./scripts/cicd.sh`

---

## Quick start (manual)

```bash
git clone https://github.com/reuhenbhalod/CSS360---Group1.git
cd CSS360---Group1

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then paste in Foursquare / GNews / Guardian keys
                            # (or, if you're a teammate: see "Onboarding" below)
python main.py              # http://localhost:8000

# Frontend (new terminal, from repo root)
npm install --legacy-peer-deps
npm run dev                 # http://localhost:5173
```

If a key is missing in `.env`, that source returns `ok:false` with a clear error message and the rest of the dashboard still works.

API key signups (all free, instant):
- Foursquare: <https://foursquare.com/developers/>
- GNews: <https://gnews.io/>
- The Guardian: <https://open-platform.theguardian.com/access/>

---

## Teammate onboarding (shared API keys)

`backend/.env` is gitignored. To avoid every teammate signing up for their own
keys, the repo ships an **encrypted** copy at `backend/.env.enc` (AES-256-CBC +
PBKDF2). The passphrase is shared out-of-band (Slack DM / password manager).

```bash
./scripts/cicd.sh --decrypt-keys       # prompts for passphrase, writes backend/.env
```

Then run the app normally (`python main.py`, `npm run dev`, or `./scripts/cicd.sh`).

### When you rotate keys (project owner)

1. Update `backend/.env` with the new key values.
2. Re-encrypt and commit:
   ```bash
   ./scripts/encrypt-env.sh              # writes backend/.env.enc
   git add backend/.env.enc && git commit -m "Rotate API keys"
   ```
3. Tell teammates to re-run `./scripts/cicd.sh --decrypt-keys` (use the same
   passphrase unless you also rotated that).

**Why this works:** the encrypted blob is safe to commit (decryption requires
the passphrase). Only one secret — the passphrase — needs to be shared out-of-band,
instead of three API keys that change whenever you rotate.

---

## CI/CD pipeline (grader guide)

The hand-built pipeline at [`scripts/cicd.sh`](scripts/cicd.sh) implements all six required stages and prints a colored status line for each one. It exits non-zero on any failure.

### One-command end-to-end run

```bash
./scripts/cicd.sh
```

This will:

| # | Stage | Rubric points | What runs |
|---|---|---|---|
| 1 | **Pull** | 2 | `git fetch && git checkout main && git pull --ff-only` |
| 2 | **Static analysis** | 4 | `ruff check backend/` + `npm run lint` (eslint) |
| 3 | **Tests** | 4 | `pytest test_ingestion.py` (19 unit + integration) **and** `npm test` (vitest unit) **and** a pre-deploy smoke test (boots backend, hits `/api/health`) |
| 4 | **Package** | 2 | `docker compose build` produces `goodeats-backend` and `goodeats-frontend` images |
| 5 | **Deploy** | 4 | `docker compose up -d` starts the stack with a healthcheck-gated startup |
| 6 | **Verify** | 2 | Waits for the backend healthcheck to go green, then `curl`s `/api/health`, `/api/all` (all 5 source envelopes), and the frontend at `:8080` |

A successful run ends with a green banner and the live URLs to hit. A failure stops immediately and prints the failing stage's logs.

### Prerequisites on the grader's machine

```bash
# All required:
git, node (≥20), npm, python3 (≥3.9), docker (≥20.10 with `docker compose` subcommand)
```

That's it. The script installs every language-level dependency itself:
- creates `backend/.venv/` and runs `pip install -r backend/requirements.txt`
- runs `npm install --legacy-peer-deps` if `node_modules/` is missing
- pulls/builds Docker images on demand

The system-level `curl` binary is also required and is present on every supported OS.

### Useful flags

```bash
./scripts/cicd.sh --skip-pull       # use the current working tree (good for local dev iteration)
./scripts/cicd.sh --no-deploy       # CI-only: lint + tests + build, no docker run
./scripts/cicd.sh --teardown        # docker compose down -v (stop the deployed stack)
./scripts/cicd.sh --decrypt-keys    # decrypt backend/.env.enc → backend/.env (teammate onboarding)
./scripts/cicd.sh --help            # print the inline header comment
```

### After a successful deploy

```bash
# Backend
curl http://localhost:8000/api/health           # → {"ok":true}
curl http://localhost:8000/api/all              # → 5 source envelopes

# Frontend (open in browser)
open http://localhost:8080
```

### GitHub Actions equivalent

The same six stages run automatically on every push and PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml). The Actions tab on GitHub shows the latest run.

**CI secrets:** the workflow writes `FOURSQUARE_API_KEY`, `GNEWS_API_KEY`, and `GUARDIAN_API_KEY` from repo Actions Secrets into `backend/.env` before building. Set these under **Settings → Secrets and variables → Actions**. Unset secrets are blank and that source degrades gracefully (`ok:false`).

---

## Project layout

```
.
├── scripts/cicd.sh           ← hand-built CI/CD pipeline
├── .github/workflows/ci.yml  ← automated GitHub Actions equivalent
├── docker-compose.yml        ← prod stack: backend + frontend
├── Dockerfile.frontend       ← multi-stage Node build → nginx serve
├── nginx.conf                ← SPA-fallback config for the frontend container
│
├── backend/
│   ├── Dockerfile            ← Python + curl + uvicorn
│   ├── main.py               ← FastAPI app, cache-first /api/all
│   ├── database.py           ← SQLite schema + migration
│   ├── ingestion.py          ← validators, dedup inserters, 1h TTL cache
│   ├── parsers.py            ← Python port of src/parsers.js
│   ├── sources/              ← one fetcher per upstream API
│   │   ├── foursquare.py     ← new Foursquare Service API (Bearer auth)
│   │   ├── overpass.py       ← OpenStreetMap Overpass (no key)
│   │   ├── reddit.py         ← curl subprocess; r/SeattleFood/hot.json
│   │   ├── gnews.py          ← GNews v4
│   │   └── guardian.py       ← Guardian Content API
│   ├── test_ingestion.py     ← 19 pytest cases (schema, ingestion, cache)
│   ├── requirements.txt
│   └── .env.example
│
└── src/                      ← React frontend
    ├── App.jsx               ← dashboard, map view, feed
    ├── parsers.js            ← defensive normalization (mirrors backend/parsers.py)
    └── test/                 ← vitest unit suites (components, parsers, utils)
```

---

## Architecture notes

- **Per-source error isolation.** A 4xx/5xx or missing key in one source returns `ok:false` on that envelope only; the other four sources are unaffected. Cached envelopes are only those with `ok:true`, so a transient failure can't poison the cache for an hour.
- **1-hour TTL cache.** First `/api/all` call is ~9 s (live fan-out to 5 upstreams). Subsequent calls within an hour are ~30 ms (served from SQLite). `?fresh=1` bypasses the cache.
- **Reddit special-case.** Reddit's bot filter blocks every Python HTTP client we tried (httpx, curl_cffi). The Reddit fetcher shells out to the system `curl` binary via `asyncio.create_subprocess_exec`. The Docker image installs `curl` to maintain parity.
- **Foursquare migration.** The legacy `api.foursquare.com/v3` endpoint returns 401 for new keys; the fetcher uses `places-api.foursquare.com` with `Bearer` auth + `X-Places-Api-Version` header.

---

## Running the tests directly (outside the pipeline)

```bash
# Backend unit + integration
cd backend
source .venv/bin/activate
python -m pytest test_ingestion.py -v   # 19 tests

# Frontend unit
cd ..
npm test                                # vitest in watch mode
npm test -- --run                       # vitest single run
```

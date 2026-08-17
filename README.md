# homepage

"Morning paper" homepage: 90s-styled weather dashboard for the configured home
location (ZIP 11201 as coordinates — weather.gov has no ZIP geocoding), backed
by [api.weather.gov](https://www.weather.gov/documentation/services-web-api).
If the configured home is outside NYC, the page also shows New York City
(dormant while home = 11201; covered by tests). Doubles as a reference
implementation of a corporate-like container pipeline:
GitHub Actions → image artifact → self-hosted runner → rootless Podman on
Rocky/RHEL 8 or 9 behind host NGINX (registry-less by design — see Pipeline).

## Architecture

- `frontend/` — Vite + React + React Router + Tailwind v4, structured per
  [Bulletproof React](https://github.com/alan2207/bulletproof-react): `app/`,
  `components/`, `features/weather/`, `lib/`, `testing/`; kebab-case files, no
  barrel files, unidirectional imports enforced by ESLint zones. Server state
  lives in TanStack Query only.
- `backend/` — Express 5 + TypeScript. `GET /api/weather` composes
  weather.gov `points → hourly + daily` per location with a Redis cache-aside
  layer (fixed TTLs: points 24 h, forecasts 10 min) that falls through when
  Redis is down. `GET /healthz` for probes. In production the same container
  serves the built frontend as static assets (SPA fallback included).
- DTO types are intentionally duplicated between backend and frontend
  (`features/weather/types.ts` ↔ `features/weather/api/get-weather.ts`) — one
  endpoint doesn't justify a shared package.
- `deploy/` — idempotent `bootstrap.sh` (EL8 + EL9), per-OS unit files, NGINX
  vhost, and the [server runbook](deploy/server-bootstrap.md).

## Development

Requires Node ≥ 22 and (optionally) Podman for a local Redis. The app runs
fine without Redis — the cache just disables itself.

```bash
npm ci
npm run redis          # optional: local Redis via podman
npm run dev:backend    # Express on :3000 (terminal 1)
npm run dev:frontend   # Vite on :5173, proxies /api → :3000 (terminal 2)

npm run lint / typecheck / test / build / format
```

## Container

```bash
podman build -t homepage -f Containerfile .
podman network create t && podman run -d --network t --name redis docker.io/library/redis:7-alpine
podman run -d --network t -p 3000:3000 -e REDIS_URL=redis://redis:6379 homepage
curl localhost:3000/healthz && open http://localhost:3000/
```

## Pipeline

- **CI** (`ci.yml`): PRs run lint, typecheck, tests, and builds.
- **Release** (`release.yml`), on merge to `main` — **registry-less** (no
  container registry available yet; procurement pending):
  1. `build` — native arm64 image build on `ubuntu-24.04-arm`, exported as an
     OCI archive and uploaded as a pipeline artifact (2-day retention).
  2. `deploy` — runs on the self-hosted runner on the server: downloads the
     artifact, `podman load`, tags `localhost/homepage:latest` +
     `:sha-<commit>`, `systemctl --user restart homepage.service`, curl
     `/healthz` loop, prunes to the 5 newest sha images.
- Deploys track `:latest`; the local `sha-*` images are the rollback store
  (artifacts expire — see runbook). The server needs zero registry access.
- When a registry is procured: restore the GHCR login/metadata/push flow (in
  git history through commit `ccfccda`) and point the unit files' `Image=`
  back at the registry ref — nothing else changes.
- Keep the repo **private** — self-hosted runners on public repos are a
  security risk.
- Branch protection requiring the `verify` check needs GitHub Pro on private
  repos; until then the PR-before-merge flow is a team convention.

## Server setup

See [deploy/server-bootstrap.md](deploy/server-bootstrap.md). Short version:
clone, edit `OWNER` in the unit file, `sudo ./deploy/bootstrap.sh`, register
the runner, merge to main.

# Configuration & secrets: who owns what

How this boilerplate handles environment-specific configuration and
CyberArk-managed secrets, and why each piece lives where it does. The pattern
is wired (dormant) into this repo — every snippet below mirrors a real file.

## The problem

An application sees one flat interface — environment variables — but three
different kinds of thing flow through it:

| Kind | Example | Changes when | Owned by |
|---|---|---|---|
| **Existence** — which vars the app needs | `INFOSEC_API_URL`, `INFOSEC_API_SECRET` are required | code changes | the application |
| **Per-environment values** (non-sensitive) | dev URL vs prod URL | an environment changes | the team, via review |
| **Secret values** | the M2M token behind `INFOSEC_API_SECRET` | CyberArk's CPM rotates it, on *its* schedule | CyberArk |

Treating these as one thing produces the classic failure modes:

- **CI-variable sprawl** — per-env values typed into pipeline variable
  screens: invisible to review, unversioned, drifting between tools.
- **Rotation coupling** — secrets fetched by the pipeline and injected at
  deploy time go stale the moment CPM rotates them; production then breaks
  until someone redeploys. Rotation cadence and deploy cadence are unrelated;
  coupling them is the bug.
- **Secret sprawl** — every system that touches a secret (CI logs, job
  artifacts, images, checked-in env files) is another copy to leak and
  another place rotation misses.

## The pattern: each concern lives in the domain that owns its lifecycle

| Concern | Domain | Mechanism in this repo |
|---|---|---|
| Existence + validation | **Application** | `backend/src/config/env.ts` — fail-fast at startup; the app is environment-blind |
| Non-sensitive per-env values | **Repo, per environment** | `deploy/env/dev.env`, `deploy/env/prod.env` — reviewed via PR, installed to the server, never baked into the image (preserves build-once-promote) |
| "Which environment am I" | **Server** | chosen once at install: `sudo ./deploy/install-app.sh prod` copies `prod.env` → `~deploy/.config/homepage/app.env` |
| Secret values | **CyberArk, fetched by the server** | `ExecStartPre` runs `fetch-secrets.sh` at every service start: CCP REST call → env file in `$XDG_RUNTIME_DIR` (tmpfs — RAM-backed, wiped on stop/reboot) |
| Orchestration | **Pipeline** | builds, promotes the artifact, restarts services, gates dev→prod. Never sees application secret values |

## Worked example: `INFOSEC_API_URL` + `INFOSEC_API_SECRET`

**Non-sensitive, per environment** — `deploy/env/dev.env` vs `prod.env`:

```bash
# deploy/env/dev.env
INFOSEC_API_URL=https://infosec-api.dev.corp.example.com

# deploy/env/prod.env
INFOSEC_API_URL=https://infosec-api.corp.example.com
```

**Secret** — never in git. The server is registered in CyberArk PAM as an
**Application ID** (authenticated by *Allowed Machines* + a client
certificate — "machine identity": the host proves who it is instead of
holding a password). At every service start, `ExecStartPre` calls the
**Central Credential Provider** (CCP, the agentless REST interface):

```bash
curl -fsS --cert client.pem --key client.key --get \
  "https://ccp.corp.example.com/AIMWebService/api/Accounts" \
  --data-urlencode "AppID=homepage-prod" \
  --data-urlencode "Safe=APP-HOMEPAGE" \
  --data-urlencode "Object=infosec-m2m-token" \
  --data-urlencode "Reason=service start"
# → JSON; .Content is the secret
```

and writes `INFOSEC_API_SECRET=<value>` to `$XDG_RUNTIME_DIR/homepage/
secrets.env` (mode 0600, tmpfs). The unit loads both files:

```ini
# EL9 quadlet (deploy/el9/quadlets/homepage.container)
[Container]
EnvironmentFile=%h/.config/homepage/app.env      # non-sensitive, per-env
EnvironmentFile=%t/homepage/secrets.env          # fetched each start

[Service]
RuntimeDirectory=homepage                        # systemd-managed %t/homepage
ExecStartPre=%h/.local/bin/homepage-fetch-secrets %t/homepage/secrets.env
```

```ini
# EL8 static unit (deploy/el8/systemd-user/homepage.service) — same idea:
RuntimeDirectory=homepage
ExecStartPre=%h/.local/bin/homepage-fetch-secrets %t/homepage/secrets.env
ExecStart=/usr/bin/podman run ... \
  --env-file %h/.config/homepage/app.env \
  --env-file %t/homepage/secrets.env \
  ...
```

The app just reads `process.env.INFOSEC_API_URL` / `INFOSEC_API_SECRET` and
fail-fast validates. It cannot tell dev from prod, and it has no idea CyberArk
exists — that's the point.

Config activation on a server is one file: create
`~deploy/.config/homepage/ccp.conf` (CCP URL, AppID, cert paths, the
VAR|Safe|Object list — see the template header in `deploy/fetch-secrets.sh`).
Without it the fetch step writes an empty file and exits 0, so the pattern
ships dormant and harmless.

## Why the *server* fetches secrets (and not the pipeline)

This is the deliberate design decision, aligned with the
[OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
(§3.2.3 ranks "the consumer of the secret retrieves the secret" as best
practice) and with how CyberArk's CP/CCP/Conjur are designed to be used:

1. **Blast radius.** CI systems are prime attack targets and multiply copies
   (runner memory, logs, artifacts). If the pipeline never holds production
   credentials, a compromised runner or leaked job log cannot expose them.
2. **Rotation decoupling.** CPM rotates on policy; a fetch-at-start consumer
   picks up the new value on the next restart with **no redeploy**. CCP even
   exposes `FailRequestOnPasswordChange=true` to avoid racing an in-flight
   rotation, and CyberArk's *dual accounts* pattern covers zero-downtime
   rotation for always-on apps.
3. **Audit + least privilege.** The CyberArk audit trail names the actual
   consuming server's AppID (with per-request `Reason`), and the Safe ACL
   grants the prod secret to the prod server — not to a CI identity that can
   deploy anything anywhere.

**What the pipeline *should* fetch:** its own operational secrets — deploy
keys, registry credentials — ideally via the OIDC/JWT-based official
integrations (`cyberark/conjur-action` for GitHub, the CyberArk Conjur
service connector for Azure DevOps) so CI holds no long-lived bootstrap
secret ("secret zero"). Promotion gating (deploy to dev on merge, approve
into prod) is also the pipeline's job: Azure DevOps environment approvals
are available on every tier; note GitHub's equivalent (environment protection
rules) requires Enterprise on private repos.

## Named fallback: pipeline injection ("trusted orchestrator")

If a server segment cannot reach CyberArk, the fallback is the pipeline
fetching at deploy time and writing the server's env file over the deploy
job. Do it least-badly: fetch via OIDC-authenticated integration (no stored
CyberArk password in CI), write straight to the server file with `0600`,
never into pipeline variables/logs, and accept the cost you're buying:
rotation now requires a redeploy, and CI becomes part of your secret
perimeter (harden and audit it as production). Name it in the runbook so
nobody mistakes the fallback for the pattern.

Same pattern, other interfaces: with **Conjur**, `ExecStartPre` authenticates
via an authenticator (JWT/API key) and `conjur retrieve`; with **CP** (local
agent), it calls `clipasswordsdk GetPassword` — the domain split is
identical, only the fetch command changes. The end-state beyond this pattern
is *Secretless* (a broker connects on the app's behalf and the app never
sees the credential at all).

## Onboarding checklist — new app or new environment

1. **CyberArk**: register the AppID (`<app>-<env>`) with Allowed Machines +
   client certificate; add it to the Safe with retrieve permission.
2. **Repo**: add the var to both `deploy/env/*.env` (non-sensitive) or to the
   `CCP_SECRETS` list in the server's `ccp.conf` (secret); add it to the
   app's fail-fast env module so a missing value stops startup loudly.
3. **Server**: `sudo ./deploy/install-app.sh <env>`; create/extend
   `~deploy/.config/<app>/ccp.conf`; restart the service.
4. **Pipeline**: nothing — that's the proof the pattern is working.

## Vocabulary

- **Machine identity** — the workload authenticates as itself (IP + cert +
  OS user / OIDC claim) instead of holding a password.
- **Secret zero** — the bootstrap credential that protects the others; solved
  by platform-derived identity, not by another password.
- **JIT retrieval vs secret sprawl** — fetch at use vs copies everywhere.
- **Trusted orchestrator** — the CI-injects-secrets compromise pattern (our
  named fallback, not our default).
- **Dual accounts** — CyberArk's zero-downtime rotation scheme (active/
  inactive account pair swapped by CPM).

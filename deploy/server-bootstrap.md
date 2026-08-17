# Server bootstrap runbook

Takes a greenfield Rocky/RHEL 8 or 9 ARM64 server to "serving the app via the
release pipeline". Everything scriptable lives in [`bootstrap.sh`](bootstrap.sh);
this runbook is the ordered checklist around it.

## 1. Clone and bootstrap

```bash
sudo dnf install -y git
git clone https://github.com/OWNER/homepage.git   # private repo: use a PAT or deploy key
cd homepage
# Edit OWNER in deploy/el9/quadlets/homepage.container (EL9)
# or deploy/el8/systemd-user/homepage.service (EL8) first.
sudo ./deploy/bootstrap.sh
```

The script is idempotent — re-run it any time (e.g. after unit-file changes in
the repo; it converges the installed units on the repo's versions).

What it does: installs podman + nginx, creates the `deploy` user with linger,
sets the `httpd_can_network_connect` SELinux boolean (NGINX → 127.0.0.1:3000 is
a silent 502 without it), opens http/https in firewalld, installs the per-OS
unit files (EL9: quadlets in `~deploy/.config/containers/systemd/`; EL8: static
podman-run units in `~deploy/.config/systemd/user/` + the `homepage` network),
and installs/reloads the NGINX vhost.

## 2. Register the self-hosted runner

As printed by the script: repo **Settings → Actions → Runners → New
self-hosted runner** (Linux ARM64), install under `/home/deploy/actions-runner`,
then `sudo ./svc.sh install deploy && sudo ./svc.sh start`. The service runs
jobs as `deploy`; the release workflow exports `XDG_RUNTIME_DIR` itself before
calling `systemctl --user`.

## 3. First deploy

Merge to `main` (or re-run the Release workflow). The `deploy` job logs in to
GHCR with its job-scoped `GITHUB_TOKEN`, pulls `:latest`, restarts
`homepage.service`, and curls `/healthz` until healthy.

Manual alternative (before the runner exists): see step 2 of the script's
"next steps" output — `podman login` with a `read:packages` PAT persisted to
`~/.config/containers/auth.json` (the default login path is under `/run` and
does not survive reboot).

## 4. Smoke checks

```bash
sudo -iu deploy
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user status redis.service homepage.service
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/weather | head -c 300
```

From your Mac: `curl http://<server-ip>/` and open it in a browser.

Reboot test: `sudo reboot`, wait, confirm the stack came back without a login
(linger + `WantedBy=default.target`).

## EL8 vs EL9 differences (why two unit trees)

| | EL9 (primary) | EL8 |
|---|---|---|
| Units | Quadlets (`.container`/`.network`) | Static `podman generate systemd --new`-style units |
| Why | Podman 5.x, cgroups v2 | Rootless Quadlet broken on stock EL8 (`--cgroups=split` needs cgroups v2; EL8 defaults to v1). Podman frozen at 4.9. |
| Health gate | `Notify=healthy`: restart blocks until healthy, fails the deploy job on a bad image | `--sdnotify=conmon` only (`--sdnotify=healthy` panics rootless on podman < 5.2). Pipeline curl loop is the gate. |
| Network | `homepage.network` quadlet (netavark/aardvark DNS) | `podman network create homepage` in bootstrap (CNI + dnsname DNS) |
| Limits | Available (unused) | Not available rootless on cgroups v1. Escape hatch (not recommended): switch to cgroups v2 via `grubby --update-kernel=ALL --args=systemd.unified_cgroup_hierarchy=1` + reboot. |

Container names, ports, env, and the deploy job are identical on both.
EL8/Rocky 8 maintenance ends **May 2029** — plan EL9 migrations accordingly.

## Rollback

Every release also pushes a `sha-<commit>` tag:

```bash
sudo -iu deploy
export XDG_RUNTIME_DIR=/run/user/$(id -u)
podman pull ghcr.io/OWNER/homepage:sha-<good-commit>
podman tag ghcr.io/OWNER/homepage:sha-<good-commit> ghcr.io/OWNER/homepage:latest
systemctl --user restart homepage.service
```

(Deploy-by-sha with unit templating is the stricter pattern; `:latest` +
sha tags for traceability is the deliberate POC trade-off.)

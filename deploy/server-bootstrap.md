# Server bootstrap runbook

Takes a greenfield Rocky/RHEL 8 or 9 ARM64 server to "serving the app via the
release pipeline" in three commands. A server wipe is the same three commands.
After that, **every deploy re-runs `bootstrap.sh` from the pipeline**, so
server config (packages, SELinux, firewall, unit files, nginx vhost) converges
on the repo's versions with no SSH involved.

## New server (or after a wipe)

```bash
# 1. Get the repo (private: use a fine-grained PAT with Contents: Read)
sudo dnf install -y git
git clone https://github.com/AdamNgu/homepage.git && cd homepage

# 2. Bootstrap the OS (idempotent: packages, deploy user + linger, SELinux
#    boolean, firewalld, unit files, nginx vhost, pipeline sudoers grant)
sudo ./deploy/bootstrap.sh

# 3. Install + register the Actions runner (token from repo Settings >
#    Actions > Runners > New self-hosted runner; expires ~1h)
sudo ./deploy/install-runner.sh <REGISTRATION_TOKEN>
```

Then trigger a deploy: merge to `main`, or re-run the latest Release workflow
from the Actions tab. If a `deploy` job is already sitting in "queued", it
picks up the new runner automatically. The initial clone is only needed for
these two scripts — afterwards the runner's checkout supplies everything.

## What a deploy does

The `build` job produces the image as an OCI-archive pipeline artifact (no
registry involved). The `deploy` job, on this server: checks out the repo →
`sudo deploy/bootstrap.sh` (config convergence; permitted by a sudoers
drop-in pinned to that path) → downloads the artifact → `podman load` → tags
`localhost/homepage:latest` + `:sha-<commit>` → `systemctl --user restart
homepage.service` → curls `/healthz` until healthy → prunes to the 5 newest
sha images.

The app image needs no registry access — base layers ride inside the
artifact. (Redis is the one remaining public pull: starting `redis.service`
fetches `docker.io/library/redis:7-alpine` once. On a network where that's
blocked, `podman save/load` it from any machine that can pull.)

**Security trade-off, stated plainly:** the sudoers grant pins the script
*path*, but the script *content* comes from `main` — merge access to main
implies root on this server. Acceptable for a LAN reference box; in a corporate
setup, gate it with branch protection and environment approval rules.

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

Every deploy tags the loaded image `sha-<commit>` and the deploy job keeps the
5 newest in local podman storage (pipeline artifacts expire after 2 days and
are NOT the rollback store):

```bash
sudo -iu deploy
export XDG_RUNTIME_DIR=/run/user/$(id -u)
podman images localhost/homepage        # see what's on hand
podman tag localhost/homepage:sha-<good-commit> localhost/homepage:latest
systemctl --user restart homepage.service
```

(Deploy-by-sha with unit templating is the stricter pattern; `:latest` +
sha tags for traceability is the deliberate POC trade-off.)

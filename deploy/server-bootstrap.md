# Server bootstrap runbook

Takes a greenfield Rocky/RHEL 8 or 9 ARM64 server to "serving the app via the
release pipeline". Everything scriptable lives in two idempotent scripts —
[`server-bootstrap.sh`](server-bootstrap.sh) (server-wide, once per host) and
[`install-app.sh`](install-app.sh) (per application) — and this runbook is the
ordered checklist around them.

## 1. Clone and bootstrap

```bash
sudo dnf install -y git
git clone https://github.com/OWNER/homepage.git   # private repo: use a PAT or deploy key
cd homepage
sudo ./deploy/server-bootstrap.sh   # once per server, ever
sudo ./deploy/install-app.sh        # once per app; re-run to push unit/vhost changes
```

(The unit files reference `localhost/homepage:latest`, which the deploy job
loads into local podman storage — no registry edits needed.)

Both scripts are idempotent — re-run either at any time. `install-app.sh`
re-copies this repo's unit files and vhost, so it doubles as the "push updated
units" tool after config changes merge.

**server-bootstrap.sh** (server-wide): installs podman + nginx, creates the
`deploy` user with linger, sets the `httpd_can_network_connect` SELinux boolean
(NGINX → any 127.0.0.1 backend is a silent 502 without it), opens http/https in
firewalld, enables nginx. Nothing app-specific.

**install-app.sh** (this app): installs the per-OS unit files (EL9: quadlets in
`~deploy/.config/containers/systemd/`; EL8: static podman-run units in
`~deploy/.config/systemd/user/` + the `homepage` network) and the app's
name-based NGINX vhost, then reloads nginx.

### Multi-app conventions (this repo is the boilerplate)

Each additional app copies `deploy/` into its own repo and changes only its
payload: unique container/network names, a **unique loopback port** (homepage
uses 3000), and a **unique `server_name`** in its vhost. There is deliberately
no catch-all (`default_server`) vhost — apps answer only to their own
hostname, so they never fight over unmatched requests (those hit the distro's
stock test page: a useful "server up, wrong hostname" signal). Server-wide
steps never repeat; a per-repo runner registration does.

### Client name resolution (required — no catch-all)

On each client (e.g. your Mac), point the app's hostname at the server:

```
# /etc/hosts
<server-ip>  homepage.lan
```

or add the record to LAN DNS. Browsing the bare IP shows the nginx test page
by design. (Avoid `.local` names — they collide with mDNS.)

## 2. Register the self-hosted runner

As printed by `install-app.sh`: repo **Settings → Actions → Runners → New
self-hosted runner** (Linux ARM64), download/extract/`./config.sh` as the
`deploy` user under **`/opt/actions-runner`** — not a home directory. SELinux
labels `/home` content `user_home_t`, which systemd services are not allowed
to execute; a runner installed there fails with `203/EXEC` on `svc.sh start`.
`/opt` (label `usr_t`) is the conventional place for third-party services.

```bash
sudo install -d -o deploy -g deploy /opt/actions-runner
sudo -iu deploy
cd /opt/actions-runner
# download + extract + ./config.sh per the GitHub UI, then:
exit
```

Skip GitHub's final `./run.sh` step — that's foreground/demo mode and dies on
logout. Install it as a boot-persistent service instead (`svc.sh` must run
from inside the runner directory, as root):

```bash
sudo -i
cd /opt/actions-runner
./svc.sh install deploy && ./svc.sh start && ./svc.sh status
exit
```

(If you already installed under `/home/deploy/actions-runner` and hit
`203/EXEC`: `./svc.sh uninstall`, `mv` the directory to `/opt/actions-runner`,
`chown -R deploy:deploy` it, `restorecon -R` it, then reinstall the service —
no re-registration needed.)

The service runs jobs as `deploy`; the release workflow exports
`XDG_RUNTIME_DIR` itself before calling `systemctl --user`. Runners are
per-repo on a personal account — each additional app registers its own.

## 3. First deploy

Merge to `main`, or use **Actions → Release → Run workflow** (manual
dispatch — always runs current main). **Do not re-run old runs to deploy**:
a run executes the workflow file as of its own commit, not today's main, so
re-running a stale run replays history. The `build` job produces the
image as an OCI-archive pipeline artifact (no registry involved); the `deploy`
job downloads it, `podman load`s it, tags `localhost/homepage:latest` +
`:sha-<commit>`, restarts `homepage.service`, and curls `/healthz` until
healthy. The app image needs no registry access — base layers ride inside the
artifact. (Redis is the one remaining public pull: starting `redis.service`
fetches `docker.io/library/redis:7-alpine` once. On a network where that's
blocked, `podman save/load` it from any machine that can pull.)

Manual alternative (before the runner exists): build once from the checkout as
`deploy` — `podman build -t localhost/homepage:latest -f Containerfile .` —
then `systemctl --user start redis.service homepage.service`.

## 4. Smoke checks

```bash
sudo -iu deploy
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user status redis.service homepage.service
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/weather | head -c 300
```

Through the vhost (Host header matters — there is no catch-all):

```bash
curl -fsS -H "Host: homepage.lan" http://127.0.0.1/      # on the server
```

From your Mac (after the `/etc/hosts` entry): `curl http://homepage.lan/` and
open **`http://homepage.lan/`** in a browser — type the `http://` scheme
explicitly. Browsers treat bare `.lan` names as search queries and/or
auto-upgrade to HTTPS (443 is closed by design → "can't be reached"). If
Chrome still fails: disable Settings → Security → "Always use secure
connections"; note "Use secure DNS" (DoH) can bypass `/etc/hosts`.

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

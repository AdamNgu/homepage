# Deployment walkthrough (Rocky 9 + VMware Fusion, from zero)

The descriptive companion to [server-bootstrap.md](server-bootstrap.md):
assumes no prior server-admin knowledge, explains *why* alongside *what*, and
records the real failures hit during the first deployment and their fixes.
Every step below was validated on a live deploy (Aug 2026).

## Step 0 — VM networking mode (decides everything else)

VMware Fusion attaches a VM to the network in one of two modes:

- **Share with my Mac (NAT)** — default. The VM hides behind the Mac: it can
  reach out, the Mac can reach it, but nothing else on the LAN can. The
  "router" handing it an IP is Fusion itself.
- **Bridged (Autodetect)** — the VM joins your real network as its own
  machine and gets an IP from your actual router, like a laptop would.

Use **Bridged**: Virtual Machine menu → Network Adapter → Bridged
(Autodetect). That's what makes this behave like a real server and enables the
DHCP reservation in step 2.

## Step 1 — Get a shell

A *shell* is the command line — the program (bash) that reads what you type.
Two ways to one on the VM:

1. **Fusion console window** — click in, log in. Always works, awkward
   copy/paste. Use when networking is broken.
2. **SSH from the Mac's Terminal (day-to-day)** — a shell on the VM,
   delivered over the network. Find the VM's IP once (in the console):

   ```bash
   ip -4 addr show     # look under ens160 for e.g. "inet 192.168.0.121/24"
   ```

   Then from the Mac: `ssh youruser@192.168.0.121`. Answer `yes` to the
   first-time fingerprint prompt. Confirm sudo works: `sudo -v` (if "not in
   the sudoers file": from the console, `su -`, `usermod -aG wheel youruser`,
   re-login).

## Step 2 — Connectivity + pin the IP

**Connectivity** here means three *outbound* HTTPS destinations — nothing ever
connects inward (the runner polls GitHub outbound; that's why a LAN-only
server with zero open ports works):

```bash
curl -sI https://github.com | head -1              # expect HTTP/2 200   (clone, runner, artifacts)
curl -sI https://registry-1.docker.io | head -1    # expect 401 — answering is what matters (redis pull)
curl -sI https://api.weather.gov | head -1         # expect 200/301      (runtime forecasts)
```

Any HTTP status = DNS + routing + TLS all work. Only timeouts or "could not
resolve host" are failures. (`ping` is weaker — some networks block it while
HTTPS works.)

**Pin the IP.** Routers hand out temporary DHCP leases; after a reboot the VM
could come back at a different address and silently break clients' hosts
entries. Preferred fix — **DHCP reservation** at the router:

1. VM's MAC address: `ip link show` → the `link/ether` line under `ens160`.
2. Router admin page: Mac → System Settings → Wi-Fi → Details → the
   **Router** field (e.g. `192.168.0.1`) → open in a browser, log in.
3. Find "DHCP/Address Reservation" (name varies by vendor), pick the VM,
   assign its current IP, save. Nothing changes on the VM.

Alternative (static IP on the VM): `sudo nmtui` → Edit connection → IPv4
`Manual` → address/gateway/DNS. Caveat: pick an address *outside* the
router's DHCP pool or it may hand "your" IP to another device someday — the
reservation avoids that footgun.

## Step 3 — Token + clone

The repo is private; a fine-grained Personal Access Token is a scoped,
revocable password for cloning:

1. github.com → avatar → Settings → Developer settings → Personal access
   tokens → **Fine-grained tokens** → Generate: Only select repositories →
   this repo; Repository permissions → **Contents: Read-only**; 90-day
   expiration. Copy it (shown once).
2. On the VM:

   ```bash
   sudo dnf install -y git
   git clone https://<TOKEN>@github.com/OWNER/homepage.git
   cd homepage
   ```

   The token is saved in the clone's `.git/config`; fine for read-only on
   your own server, revocable from the same GitHub page.

## Step 4 — Run the two bootstrap scripts

```bash
sudo ./deploy/server-bootstrap.sh   # once per server, ever
sudo ./deploy/install-app.sh        # once per app; re-run to push unit/vhost changes
```

**server-bootstrap.sh** (server-wide, idempotent): podman + nginx, `deploy`
user with linger (services survive logout/boot without a login), the
`httpd_can_network_connect` SELinux boolean (without it every proxied request
is a silent 502), firewall 80/443, nginx enabled. First SELinux flip takes
~10s (policy rebuild); reruns print "Nothing to do".

**install-app.sh** (per-app, idempotent): this app's unit files into the
deploy user's systemd folder (quadlets on EL9; static units + `podman network
create` on EL8), ownership fix for `~deploy/.config`, the `homepage.lan`
vhost, `nginx -t`, reload. Ends with a NEXT STEPS block ≈ steps 5–7 here.
Nothing runs yet — there's no image until the first deploy.

## Step 5 — Install and register the runner

The runner is an agent that polls GitHub *outbound* ("any jobs for me?") and
executes the release workflow's `deploy` job on this machine.

**Location matters — use `/opt/actions-runner`, never a home directory.**
SELinux labels `/home` content `user_home_t`, which systemd services may not
execute: a runner under `/home/deploy` fails at `svc.sh start` with
`203/EXEC` / "Permission denied" (confirm with `ausearch -m avc`). `/opt`
(label `usr_t`) is where third-party services conventionally live.

1. Repo → Settings → Actions → Runners → **New self-hosted runner** → Linux,
   ARM64. GitHub shows download/extract/config commands with a token that
   expires in ~1 hour.
2. Run them in the right place:

   ```bash
   sudo install -d -o deploy -g deploy /opt/actions-runner
   sudo -iu deploy
   cd /opt/actions-runner
   # paste GitHub's curl + tar lines, then:
   ./config.sh --url https://github.com/OWNER/homepage --token <TOKEN>   # accept defaults
   exit
   ```

3. **Skip GitHub's `./run.sh` line** — that's foreground demo mode and dies on
   logout. Install the boot-persistent service instead (root shell, because
   `svc.sh` needs the runner dir as cwd):

   ```bash
   sudo -i
   cd /opt/actions-runner
   ./svc.sh install deploy && ./svc.sh start && ./svc.sh status   # expect active (running)
   exit
   ```

4. Verify: the Runners page shows **Idle** within seconds.

Already installed under `/home` and hit `203/EXEC`? `./svc.sh uninstall`,
`mv` to `/opt/actions-runner`, `chown -R deploy:deploy`, `restorecon -R`,
reinstall the service. No re-registration needed.

## Step 6 — Tell clients where the app lives

There is deliberately no catch-all vhost — the site answers only to its
hostname. On each client (the Mac):

```bash
sudo sh -c 'echo "<server-ip>  homepage.lan" >> /etc/hosts'
```

`/etc/hosts` is the machine's local phone book, consulted before DNS. Devices
you can't edit (phones) need the record in the router's DNS instead. Browsing
the bare IP shows the nginx test page *by design* — "server up, wrong
hostname."

## Step 7 — Trigger the first deploy

Merge to `main`, or Actions → Release → **Run workflow** (always runs current
main). **Never re-run an old run to deploy** — a run executes the workflow
file *as of its own commit*, not today's main; re-running a stale run replays
history.

What happens: `build` on GitHub's ARM runner (~2 min) uploads the image as an
OCI-archive artifact; then `deploy` flips your runner Idle→Active and — on
the VM — downloads, `podman load`s, tags `localhost/homepage:{latest,sha-*}`,
restarts the service (first start also pulls Redis from docker.io once,
~30s), and must pass the health gate to go green. **A green deploy job is the
proof of deployment.**

## Step 8 — Smoke checks + triage

On the VM:

```bash
sudo -iu deploy
export XDG_RUNTIME_DIR=/run/user/$(id -u)    # user-level systemctl needs this over SSH
systemctl --user status redis.service homepage.service   # expect: active (running)
curl -fsS http://127.0.0.1:3000/healthz                  # expect: {"status":"ok"}
curl -fsS -H "Host: homepage.lan" http://127.0.0.1/ | head -c 200   # HTML via nginx
```

From the Mac: open **`http://homepage.lan/`** — and type the `http://`
scheme explicitly. Browsers treat bare `.lan` names as search queries, and
auto-upgrade to HTTPS (nothing listens on 443 → "can't be reached") even when
plain HTTP works. If Chrome still fails: Settings → Security → disable
"Always use secure connections"; its "Use secure DNS" (DoH) can also bypass
`/etc/hosts`.

Triage: `healthz` fails → app down, read `journalctl --user -u
homepage.service`. `healthz` OK but nginx curl 502 → proxy blocked (SELinux
boolean). VM curls OK but Mac fails → network: hosts entry, IP, or
NAT-instead-of-Bridged.

## Step 9 — Prove durability and repeatability

- **Reboot test:** `sudo reboot`, wait a minute, reload — proves linger +
  `WantedBy=default.target` bring the stack up with nobody logged in.
- **Repeat-deploy test:** merge a visible one-liner (marquee text), watch
  Actions, reload. That's the loop: merge → build → artifact → load →
  restart → healthy — no hands on the server.

## Failures we actually hit (kept as teaching material)

| Symptom | Cause | Fix |
|---|---|---|
| Old deploy step ran `sudo`, failed "terminal required" | Re-ran a stale run — runs execute their own commit's workflow | Use Run workflow / merge; never re-run stale runs |
| `svc.sh start` → `203/EXEC` | SELinux: services may not exec `user_home_t` (runner in `/home`) | Runner lives in `/opt/actions-runner` |
| Deploy job: "`/home/deploy/.config` … not owned by current user" | `install -d -o` owns only the final dir; root-owned intermediates | install-app.sh now `chown -R`s the tree |
| Browser "can't reach" homepage.lan while curl works | Address-bar search on bare `.lan` / auto-HTTPS upgrade (443 closed) | Type `http://homepage.lan/` explicitly |
| `cd /home/deploy/...` permission denied as admin user | Home dirs are 0700 on RHEL — correct hardening | Use a root shell for cross-user paths |

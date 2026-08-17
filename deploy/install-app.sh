#!/usr/bin/env bash
# deploy/install-app.sh — PER-APP install/update for THIS application on a
# host already prepared by server-bootstrap.sh. Run as root from a checkout
# of this repo. Idempotent — re-run any time to converge the installed unit
# files and NGINX vhost on the repo's current versions (this doubles as the
# "push updated units" tool).
#
# Boilerplate note for new apps: copy deploy/ into the new repo, then change
# the constants below, the unit files (container/network names, a UNIQUE
# loopback port), and the vhost (unique server_name). Server-wide steps
# (packages, deploy user, SELinux, firewall) never repeat — they live in
# server-bootstrap.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME=homepage
APP_PORT=3000               # loopback-only; must be unique per app on the host
DEPLOY_USER=deploy
DEPLOY_HOME="/home/$DEPLOY_USER"
EL_MAJOR=""

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# Helpers are duplicated from server-bootstrap.sh so each script stays
# standalone and copy-able into other repos.
require_root() {
  [[ $EUID -eq 0 ]] || die "run as root (sudo $0)"
}

check_os() {
  # shellcheck source=/dev/null
  source /etc/os-release
  case "$ID" in
    rocky | rhel | almalinux) ;;
    *) die "unsupported OS: $ID (expected rocky/rhel/almalinux)" ;;
  esac
  EL_MAJOR="${VERSION_ID%%.*}"
  case "$EL_MAJOR" in
    8 | 9) ;;
    *) die "unsupported version: $VERSION_ID (expected 8.x or 9.x)" ;;
  esac
  log "detected $ID $VERSION_ID (EL$EL_MAJOR)"
}

require_server_bootstrap() {
  command -v podman >/dev/null || die "podman missing — run server-bootstrap.sh first"
  command -v nginx >/dev/null || die "nginx missing — run server-bootstrap.sh first"
  id -u "$DEPLOY_USER" &>/dev/null || die "user $DEPLOY_USER missing — run server-bootstrap.sh first"
}

as_deploy() {
  runuser -u "$DEPLOY_USER" -- env \
    XDG_RUNTIME_DIR="/run/user/$(id -u "$DEPLOY_USER")" "$@"
}

install_units_el9() {
  local dest="$DEPLOY_HOME/.config/containers/systemd"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dest"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0644 \
    "$SCRIPT_DIR"/el9/quadlets/* "$dest/"
  as_deploy systemctl --user daemon-reload
}

install_units_el8() {
  # Rootless Quadlet needs cgroups v2; stock EL8 is v1 — static units instead.
  local dest="$DEPLOY_HOME/.config/systemd/user"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dest"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0644 \
    "$SCRIPT_DIR"/el8/systemd-user/* "$dest/"
  # The quadlet .network equivalent, done imperatively on EL8.
  as_deploy podman network exists "$APP_NAME" ||
    as_deploy podman network create "$APP_NAME"
  as_deploy systemctl --user daemon-reload
  as_deploy systemctl --user enable "redis.service" "$APP_NAME.service"
}

install_nginx_vhost() {
  install -m 0644 "$SCRIPT_DIR/nginx/$APP_NAME.conf" "/etc/nginx/conf.d/$APP_NAME.conf"
  restorecon -R /etc/nginx/conf.d "$DEPLOY_HOME/.config" || true
  nginx -t
  systemctl reload nginx
}

print_next_steps() {
  cat <<EOF
============================================================
$APP_NAME installed (EL$EL_MAJOR). Manual next steps:

1. Client name resolution: this vhost answers to "$APP_NAME.lan"
   only (no catch-all). On each client machine, add to /etc/hosts:
     <this-server-ip>  $APP_NAME.lan
   (or add the record to your LAN DNS).

2. Register this repo's GitHub Actions runner (needs a short-lived
   token from repo Settings > Actions > Runners > New self-hosted
   runner, Linux ARM64):
     sudo -iu $DEPLOY_USER
     mkdir -p ~/actions-runner && cd ~/actions-runner
     # download + extract the runner per the GitHub UI, then:
     ./config.sh --url https://github.com/OWNER/$APP_NAME --token <TOKEN>
     exit
   Skip GitHub's './run.sh' step — that runs the runner in the
   foreground and dies on logout. Install it as a service instead
   (root shell: svc.sh needs the runner dir as cwd, and the deploy
   home is 0700 so only root can enter it):
     sudo -i
     cd $DEPLOY_HOME/actions-runner
     ./svc.sh install $DEPLOY_USER
     ./svc.sh start
     exit

3. First image (no registry in this setup): merge to main and let
   the pipeline build + deploy it, or build once from this checkout
   as $DEPLOY_USER:
     podman build -t localhost/$APP_NAME:latest -f Containerfile .
     systemctl --user start redis.service $APP_NAME.service

4. Smoke check:
     curl -fsS http://127.0.0.1:$APP_PORT/healthz
     curl -fsS -H "Host: $APP_NAME.lan" http://127.0.0.1/

Tip: any SSH session doing 'systemctl --user' as $DEPLOY_USER needs:
     export XDG_RUNTIME_DIR=/run/user/\$(id -u)
============================================================
EOF
}

main() {
  require_root
  check_os
  require_server_bootstrap
  if [[ "$EL_MAJOR" == "9" ]]; then
    log "units (el9 quadlets)"; install_units_el9
  else
    log "units (el8 systemd-user)"; install_units_el8
  fi
  log "nginx vhost"; install_nginx_vhost
  print_next_steps
}

main "$@"

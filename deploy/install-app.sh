#!/usr/bin/env bash
# deploy/install-app.sh — PER-APP install/update for THIS application on a
# host already prepared by server-bootstrap.sh. Run as root from a checkout
# of this repo:
#   sudo ./deploy/install-app.sh [dev|prod]     (default: prod)
# Idempotent — re-run any time to converge the installed unit files, env
# config, and NGINX vhost on the repo's current versions (this doubles as the
# "push updated units" tool).
#
# Boilerplate note for new apps: copy deploy/ into the new repo, then change
# the constants below, the unit files (container/network names, a UNIQUE
# loopback port), the env/*.env values, and the vhost (unique server_name).
# Server-wide steps (packages, deploy user, SELinux, firewall) never repeat —
# they live in server-bootstrap.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME=homepage
APP_PORT=3000               # loopback-only; must be unique per app on the host
APP_ENV="${1:-prod}"        # which deploy/env/<env>.env this server gets
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

check_app_env() {
  [[ -f "$SCRIPT_DIR/env/$APP_ENV.env" ]] ||
    die "unknown environment '$APP_ENV' — expected one of: $(cd "$SCRIPT_DIR/env" && ls -- *.env | sed 's/\.env$//' | paste -sd' ' -)"
  log "environment: $APP_ENV"
}

# Per-env config + the CyberArk secret fetcher (see CONFIG-AND-SECRETS.md).
install_app_config() {
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.config/$APP_NAME"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0644 \
    "$SCRIPT_DIR/env/$APP_ENV.env" "$DEPLOY_HOME/.config/$APP_NAME/app.env"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.local/bin"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0755 \
    "$SCRIPT_DIR/fetch-secrets.sh" "$DEPLOY_HOME/.local/bin/$APP_NAME-fetch-secrets"
  # install -d owns only the FINAL directory; fix root-owned intermediates.
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.config" "$DEPLOY_HOME/.local"
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
  # install -d owns only the FINAL directory; intermediates (~/.config
  # itself) are created root-owned, which podman-as-deploy refuses to use.
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.config"
  as_deploy systemctl --user daemon-reload
}

install_units_el8() {
  # Rootless Quadlet needs cgroups v2; stock EL8 is v1 — static units instead.
  local dest="$DEPLOY_HOME/.config/systemd/user"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dest"
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0644 \
    "$SCRIPT_DIR"/el8/systemd-user/* "$dest/"
  # See install_units_el9: fix root-owned intermediate dirs BEFORE any
  # podman-as-deploy call below.
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.config"
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
$APP_NAME installed (EL$EL_MAJOR, environment: $APP_ENV). Manual next steps:

0. Secrets are DORMANT until you create
   $DEPLOY_HOME/.config/$APP_NAME/ccp.conf (CyberArk CCP endpoint,
   AppID, client cert, secret list — template in the header of
   deploy/fetch-secrets.sh). Without it the service runs with the
   non-sensitive env only. See deploy/CONFIG-AND-SECRETS.md.

1. Client name resolution: this vhost answers to "$APP_NAME.lan"
   only (no catch-all). On each client machine, add to /etc/hosts:
     <this-server-ip>  $APP_NAME.lan
   (or add the record to your LAN DNS).

2. Register this repo's GitHub Actions runner (needs a short-lived
   token from repo Settings > Actions > Runners > New self-hosted
   runner, Linux ARM64). Install under /opt, NOT a home directory:
   SELinux labels /home as user_home_t, which systemd services may
   not execute (203/EXEC) — /opt is the conventional service home.
     sudo install -d -o $DEPLOY_USER -g $DEPLOY_USER /opt/actions-runner
     sudo -iu $DEPLOY_USER
     cd /opt/actions-runner
     # download + extract the runner per the GitHub UI, then:
     ./config.sh --url https://github.com/OWNER/$APP_NAME --token <TOKEN>
     exit
   Skip GitHub's './run.sh' step — that runs the runner in the
   foreground and dies on logout. Install it as a service instead:
     sudo -i
     cd /opt/actions-runner
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
  check_app_env
  log "app config ($APP_ENV)"; install_app_config
  if [[ "$EL_MAJOR" == "9" ]]; then
    log "units (el9 quadlets)"; install_units_el9
  else
    log "units (el8 systemd-user)"; install_units_el8
  fi
  log "nginx vhost"; install_nginx_vhost
  print_next_steps
}

main "$@"

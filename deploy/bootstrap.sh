#!/usr/bin/env bash
# deploy/bootstrap.sh — idempotent bootstrap for a greenfield Rocky/RHEL 8|9
# ARM64 server. Run as root from a checkout of this repo. Safe to re-run at
# any time: reruns converge units/config on the repo's current versions, so
# this script doubles as the "push updated unit files" tool.
#
# Bash (not Ansible) on purpose: one server, zero control-machine deps,
# readable top-to-bottom as executable documentation. Each function maps 1:1
# to an Ansible module (user/dnf/seboolean/firewalld/systemd) if a fleet ever
# makes the port worthwhile.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER=deploy
DEPLOY_HOME="/home/$DEPLOY_USER"
EL_MAJOR=""

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

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

install_packages() {
  # Idempotent as-is: dnf exits 0 with "Nothing to do" when already installed.
  # On EL8 the default container-tools:rhel8 module supplies podman 4.9 plus
  # its CNI/dnsname/dnsmasq rootless-networking dependencies automatically.
  dnf install -y podman nginx
}

create_deploy_user() {
  id -u "$DEPLOY_USER" &>/dev/null || useradd --create-home "$DEPLOY_USER"
  # Without linger the user's systemd manager (and every container in it)
  # only exists while a session is open.
  loginctl enable-linger "$DEPLOY_USER"
}

as_deploy() {
  runuser -u "$DEPLOY_USER" -- env \
    XDG_RUNTIME_DIR="/run/user/$(id -u "$DEPLOY_USER")" "$@"
}

configure_selinux() {
  # NGINX (httpd_t) may not open outbound TCP by default: proxying to
  # 127.0.0.1:3000 is a silent 502 without this boolean. Guarded because
  # setsebool -P rebuilds the policy store even when it's already on.
  if [[ "$(getsebool httpd_can_network_connect)" != *" --> on" ]]; then
    setsebool -P httpd_can_network_connect on
  fi
}

configure_firewall() {
  systemctl enable --now firewalld
  # ALREADY_ENABLED warnings on rerun are fine.
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
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
  as_deploy podman network exists homepage ||
    as_deploy podman network create homepage
  as_deploy systemctl --user daemon-reload
  as_deploy systemctl --user enable redis.service homepage.service
}

install_nginx_conf() {
  install -m 0644 "$SCRIPT_DIR/nginx/homepage.conf" /etc/nginx/conf.d/homepage.conf
  # The distro nginx.conf ships its own `listen ... default_server` block,
  # which would collide with ours (nginx -t: duplicate default server).
  # Stripping the flag demotes that block to a never-matched fallback;
  # idempotent on rerun.
  sed -i 's/ default_server//g' /etc/nginx/nginx.conf
  restorecon -R /etc/nginx/conf.d "$DEPLOY_HOME/.config" || true
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

print_next_steps() {
  cat <<EOF
============================================================
Bootstrap complete (EL$EL_MAJOR). Manual next steps:

1. Register the GitHub Actions runner (needs a short-lived token
   from repo Settings > Actions > Runners > New self-hosted runner):
     sudo -iu $DEPLOY_USER
     mkdir -p ~/actions-runner && cd ~/actions-runner
     # download + extract the Linux ARM64 runner per the GitHub UI, then:
     ./config.sh --url https://github.com/OWNER/homepage --token <TOKEN>
     exit
     # svc.sh must run from inside the runner directory:
     cd $DEPLOY_HOME/actions-runner
     sudo ./svc.sh install $DEPLOY_USER
     sudo ./svc.sh start

2. First image: either merge to main and let the pipeline deploy, or
   pull manually as $DEPLOY_USER with a read:packages PAT:
     podman login ghcr.io --authfile ~/.config/containers/auth.json
     podman pull ghcr.io/OWNER/homepage:latest
     systemctl --user start redis.service homepage.service

3. Smoke check:
     curl -fsS http://127.0.0.1:3000/healthz
     curl -fsS http://<server-ip>/   # from another machine

Tip: any SSH session doing 'systemctl --user' as $DEPLOY_USER needs:
     export XDG_RUNTIME_DIR=/run/user/\$(id -u)
============================================================
EOF
}

main() {
  require_root
  check_os
  log "packages"; install_packages
  log "deploy user"; create_deploy_user
  log "selinux"; configure_selinux
  log "firewall"; configure_firewall
  if [[ "$EL_MAJOR" == "9" ]]; then
    log "units (el9 quadlets)"; install_units_el9
  else
    log "units (el8 systemd-user)"; install_units_el8
  fi
  log "nginx"; install_nginx_conf
  print_next_steps
}

main "$@"

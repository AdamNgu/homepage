#!/usr/bin/env bash
# deploy/server-bootstrap.sh — ONE-TIME, server-wide setup for a greenfield
# Rocky/RHEL 8|9 host that will run one or more rootless-podman applications
# behind host NGINX. Run as root. Idempotent — safe to re-run any time.
#
# Nothing in here is application-specific. Per-app setup (unit files, NGINX
# vhost, runner registration) lives in each app repo's deploy/install-app.sh;
# run that once per application AFTER this script.
#
# Bash (not Ansible) on purpose: one server, zero control-machine deps,
# readable top-to-bottom as executable documentation. Each function maps 1:1
# to an Ansible module (user/dnf/seboolean/firewalld/systemd) if a fleet ever
# makes the port worthwhile.
set -euo pipefail

DEPLOY_USER=deploy

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
  case "${VERSION_ID%%.*}" in
    8 | 9) ;;
    *) die "unsupported version: $VERSION_ID (expected 8.x or 9.x)" ;;
  esac
  log "detected $ID $VERSION_ID"
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

configure_selinux() {
  # NGINX (httpd_t) may not open outbound TCP by default: proxying to any
  # 127.0.0.1:<port> backend is a silent 502 without this boolean. One switch
  # covers every app on the host. Guarded because setsebool -P rebuilds the
  # policy store even when it's already on.
  if [[ "$(getsebool httpd_can_network_connect)" != *" --> on" ]]; then
    setsebool -P httpd_can_network_connect on
  fi
}

configure_firewall() {
  systemctl enable --now firewalld
  # All apps share 80/443 through NGINX vhosts; per-app loopback ports stay
  # closed to the network. ALREADY_ENABLED warnings on rerun are fine.
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
}

enable_nginx() {
  nginx -t
  systemctl enable --now nginx
}

print_next_steps() {
  cat <<EOF
============================================================
Server bootstrap complete. This host is ready for apps.

For EACH application, from a checkout of that app's repo:
  sudo ./deploy/install-app.sh
(it installs the app's unit files + NGINX vhost and prints the
app's runner-registration and first-image steps)
============================================================
EOF
}

main() {
  require_root
  check_os
  log "packages";    install_packages
  log "deploy user"; create_deploy_user
  log "selinux";     configure_selinux
  log "firewall";    configure_firewall
  log "nginx";       enable_nginx
  print_next_steps
}

main "$@"

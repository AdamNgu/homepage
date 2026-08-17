#!/usr/bin/env bash
# deploy/install-runner.sh — install + register the GitHub Actions runner as
# the deploy user and start it as a service. Run as root AFTER bootstrap.sh.
# Idempotent: re-runs skip whatever already exists.
#
# Usage: sudo ./install-runner.sh <REGISTRATION_TOKEN> [REPO_URL]
# (Token: repo Settings > Actions > Runners > New self-hosted runner.
#  Tokens expire after ~1h — grab a fresh one per install.)
set -euo pipefail

TOKEN="${1:?usage: install-runner.sh <registration-token> [repo-url]}"
REPO_URL="${2:-https://github.com/AdamNgu/homepage}"
DEPLOY_USER=deploy
RUNNER_DIR="/home/$DEPLOY_USER/actions-runner"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root (sudo $0 ...)"
id -u "$DEPLOY_USER" &>/dev/null || die "no '$DEPLOY_USER' user — run bootstrap.sh first"

if [[ ! -x "$RUNNER_DIR/config.sh" ]]; then
  log "downloading runner"
  # Resolve the latest version from the release redirect (no API/JSON needed).
  VERSION="$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
    https://github.com/actions/runner/releases/latest)"
  VERSION="${VERSION##*/v}"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$RUNNER_DIR"
  curl -fsSL -o /tmp/actions-runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-linux-arm64-${VERSION}.tar.gz"
  runuser -u "$DEPLOY_USER" -- tar -xzf /tmp/actions-runner.tar.gz -C "$RUNNER_DIR"
  rm -f /tmp/actions-runner.tar.gz
fi

log "runner OS dependencies"
"$RUNNER_DIR/bin/installdependencies.sh" >/dev/null

if [[ ! -f "$RUNNER_DIR/.runner" ]]; then
  log "registering with $REPO_URL"
  runuser -u "$DEPLOY_USER" -- bash -c \
    "cd '$RUNNER_DIR' && ./config.sh --url '$REPO_URL' --token '$TOKEN' --unattended --replace"
fi

# svc.sh must run from inside the runner directory.
cd "$RUNNER_DIR"
[[ -f .service ]] || ./svc.sh install "$DEPLOY_USER"
./svc.sh start
./svc.sh status | head -5

log "done — a queued deploy job will pick this runner up automatically"

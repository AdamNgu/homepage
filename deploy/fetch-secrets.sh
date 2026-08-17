#!/usr/bin/env bash
# deploy/fetch-secrets.sh — fetch application secrets from CyberArk CCP into a
# tmpfs env file at service start. Installed by install-app.sh as
# ~/.local/bin/homepage-fetch-secrets; run by the unit's ExecStartPre with the
# target path as its argument (e.g. %t/homepage/secrets.env).
#
# DORMANT BY DEFAULT: with no ~/.config/homepage/ccp.conf this writes an empty
# file and exits 0. The unit's EnvironmentFile= must always exist (quadlet has
# no optional-file prefix), so the empty file is load-bearing, not cosmetic.
#
# ~/.config/homepage/ccp.conf (bash syntax, sourced; chmod 0600):
#   CCP_URL=https://ccp.corp.example.com
#   CCP_APP_ID=homepage-prod
#   CCP_CERT=/home/deploy/.config/homepage/client.pem
#   CCP_KEY=/home/deploy/.config/homepage/client.key
#   CCP_SECRETS=(
#     "INFOSEC_API_SECRET|APP-HOMEPAGE|infosec-m2m-token"   # VAR|Safe|Object
#   )
set -euo pipefail

OUT="${1:?usage: homepage-fetch-secrets <output-env-file>}"
CONF="$HOME/.config/homepage/ccp.conf"

# Fresh 0600 file every run: never leaks, never half-populated, always exists.
install -m 0600 /dev/null "$OUT"

if [[ ! -f "$CONF" ]]; then
  exit 0 # dormant: no CyberArk configured on this host
fi

# shellcheck source=/dev/null
source "$CONF"

# CCP agentless REST. This host authenticates by client certificate plus
# membership in the AppID's Allowed Machines list; the secret is .Content in
# the response JSON. Values are never echoed or logged.
fetch_one() {
  local var="$1" safe="$2" object="$3" value
  value=$(curl -fsS --cert "$CCP_CERT" --key "$CCP_KEY" \
    --get "$CCP_URL/AIMWebService/api/Accounts" \
    --data-urlencode "AppID=$CCP_APP_ID" \
    --data-urlencode "Safe=$safe" \
    --data-urlencode "Object=$object" \
    --data-urlencode "Reason=service start" \
    | jq -er '.Content')
  printf '%s=%s\n' "$var" "$value" >>"$OUT"
}

for entry in "${CCP_SECRETS[@]}"; do
  IFS='|' read -r var safe object <<<"$entry"
  fetch_one "$var" "$safe" "$object"
done
echo "fetched ${#CCP_SECRETS[@]} secret(s) from CCP" >&2

#!/usr/bin/env bash
# Apply Google OAuth client ID on EC2 and redeploy Lambda.
# Usage (from repo root, with EC2 SSH key):
#   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com bash scripts/apply-google-oauth.sh
# Or pass as first argument:
#   bash scripts/apply-google-oauth.sh xxxx.apps.googleusercontent.com

set -euo pipefail

CLIENT_ID="${1:-${GOOGLE_CLIENT_ID:-}}"
EC2_HOST="${EC2_HOST:-ubuntu@54.213.212.184}"
SSH_KEY="${SSH_KEY:-D:/Code/PEM/PDC.pem}"

if [[ -z "$CLIENT_ID" ]]; then
  echo "Usage: GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com bash scripts/apply-google-oauth.sh" >&2
  echo "Create a Web OAuth client at https://console.cloud.google.com/apis/credentials" >&2
  exit 1
fi

if [[ ! "$CLIENT_ID" == *".apps.googleusercontent.com" ]]; then
  echo "Expected a Web client ID ending in .apps.googleusercontent.com" >&2
  exit 1
fi

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

ssh "${SSH_OPTS[@]}" "$EC2_HOST" bash -s -- "$CLIENT_ID" <<'REMOTE'
set -euo pipefail
CLIENT_ID="$1"
ENV="$HOME/Shadowing/.env"

upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV"
  fi
}

upsert_env GOOGLE_CLIENT_ID "$CLIENT_ID"
upsert_env VITE_GOOGLE_CLIENT_ID "$CLIENT_ID"

cd "$HOME/Shadowing"
git pull --ff-only origin main
node infra/sam/deploy-with-env.mjs

echo "--- auth config ---"
curl -sS "https://9fe40kut09.execute-api.us-west-2.amazonaws.com/dev/api/auth/config"
echo
REMOTE

echo "Done. Open https://shadowingnetwork.com/#login and confirm the Google button appears."

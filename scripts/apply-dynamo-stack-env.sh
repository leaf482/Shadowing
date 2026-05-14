#!/usr/bin/env bash
# Merge DynamoDB table env from CloudFormation into repo .env (for EC2 systemd EnvironmentFile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
STACK="${STACK:-shadowing-api-dev}"
REGION="${REGION:-${AWS_REGION:-us-west-2}}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

"$ROOT/scripts/dynamo-stack-env.sh" "$STACK" "$REGION" >"$TMP"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating $ENV_FILE from .env.example"
  cp "$ROOT/.env.example" "$ENV_FILE"
fi

cp "$ENV_FILE" "${ENV_FILE}.bak.$$"
sed -i '/^# BEGIN DYNAMO STACK ENV$/,/^# END DYNAMO STACK ENV$/d' "$ENV_FILE"
{
  echo ""
  cat "$TMP"
} >>"$ENV_FILE"

echo "Updated $ENV_FILE (backup: ${ENV_FILE}.bak.$$)"

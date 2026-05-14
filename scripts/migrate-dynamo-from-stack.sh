#!/usr/bin/env bash
# Run npm run migrate:dynamo using TABLE_* names from CloudFormation stack outputs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK="${1:-shadowing-api-dev}"
REGION="${2:-${AWS_REGION:-us-west-2}}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
"$ROOT/scripts/dynamo-stack-env.sh" "$STACK" "$REGION" >"$TMP"
set -a
# shellcheck disable=SC1090
source "$TMP"
set +a
export SQLITE_PATH="${SQLITE_PATH:-$ROOT/server/shadowing.db}"
cd "$ROOT"
exec npm run migrate:dynamo

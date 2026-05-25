#!/usr/bin/env bash
set -euo pipefail
BASE="${SMOKE_BASE_URL:-https://9fe40kut09.execute-api.us-west-2.amazonaws.com/dev}"
EMAIL="deploy-smoke-$(date +%s)@uw.edu"
echo "register $EMAIL"
curl -sS -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest1\"}"
echo
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest1\"}"

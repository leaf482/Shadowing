#!/usr/bin/env bash
set -euo pipefail
CF="${1:-d2z5wraie5zbrx.cloudfront.net}"
ts=$(date +%s)
email="smoke${ts}@uw.edu"
echo "email=$email"
reg=$(curl -sk -X POST "https://${CF}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${email}\",\"password\":\"TestPass123!\"}")
echo "register: $reg"
login_code=$(curl -sk -w "%{http_code}" -o /tmp/login-body.json -X POST "https://${CF}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${email}\",\"password\":\"TestPass123!\"}")
echo "login: $login_code $(cat /tmp/login-body.json)"

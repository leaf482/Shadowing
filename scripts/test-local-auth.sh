#!/bin/bash
set -euo pipefail
ts=$(date +%s)
email="localtest${ts}@uw.edu"
echo "email=$email"
reg=$(curl -s -w "\nHTTP:%{http_code}" -X POST http://127.0.0.1:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${email}\",\"password\":\"TestPass123!\"}")
echo "register: $reg"
send=$(curl -s -w "\nHTTP:%{http_code}" -X POST http://127.0.0.1:3000/api/auth/send-verification \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${email}\"}")
echo "send: $send"
sudo journalctl -u shadowing-api -n 8 --no-pager | grep '\[auth\]' || true

#!/usr/bin/env bash
# Remove local/VM build caches and transient env backups under the repo (safe to re-run).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
rm -rf infra/sam/.aws-sam .aws-sam
rm -f .env.bak.*
echo "Cleaned .aws-sam build dirs and .env.bak.* under $ROOT"

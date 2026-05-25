#!/usr/bin/env bash
set -euo pipefail
FN="shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq"
REGION="us-west-2"
REPO_ENV="${REPO_ENV:-$HOME/Shadowing/.env}"

aws lambda get-function-configuration --region "$REGION" --function-name "$FN" --query Environment.Variables --output json > /tmp/lambda-env.json

python3 <<PY
import json
import os
import re

with open("/tmp/lambda-env.json") as f:
    v = json.load(f)

v["STATIC_BUCKET"] = "shadowing-static-dev-sitebucket-xnygmxwbe67z"
v["CLOUDFRONT_DISTRIBUTION_ID"] = "E2XKSS6CLI091Q"

repo_env = os.environ.get("REPO_ENV", "")
if repo_env and os.path.isfile(repo_env):
    with open(repo_env) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            if key in ("GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID") and val.strip():
                v["GOOGLE_CLIENT_ID"] = val.strip()

with open("/tmp/lambda-env-out.json", "w") as f:
    json.dump({"Variables": v}, f)
PY

aws lambda update-function-configuration --region "$REGION" --function-name "$FN" --environment file:///tmp/lambda-env-out.json --query 'Environment.Variables.{STATIC:STATIC_BUCKET,CF:CLOUDFRONT_DISTRIBUTION_ID,GOOGLE:GOOGLE_CLIENT_ID}' --output json

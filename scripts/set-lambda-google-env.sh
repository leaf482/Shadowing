#!/usr/bin/env bash
set -euo pipefail
REGION=us-west-2
FN=shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq

aws lambda get-function-configuration \
  --region "$REGION" \
  --function-name "$FN" \
  --query Environment.Variables \
  --output json > /tmp/lambda-env-base.json

python3 <<'PY'
import json

with open("/tmp/lambda-env-base.json") as f:
    v = json.load(f)

v["COGNITO_OAUTH_DOMAIN"] = "shadowing-network"
v["COGNITO_GOOGLE_ENABLED"] = "true"
v["COGNITO_USER_POOL_ID"] = "us-west-2_5GBVjb1NA"
v["COGNITO_CLIENT_ID"] = "2d9538pjg5i5246gbqgobqanus"

with open("/tmp/lambda-env-out.json", "w") as f:
    json.dump({"Variables": v}, f)
PY

aws lambda update-function-configuration \
  --region "$REGION" \
  --function-name "$FN" \
  --environment file:///tmp/lambda-env-out.json \
  --query 'Environment.Variables.{GOOGLE:COGNITO_GOOGLE_ENABLED,DOMAIN:COGNITO_OAUTH_DOMAIN}' \
  --output json

#!/usr/bin/env bash
set -euo pipefail
FN="shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq"
REGION="us-west-2"
aws lambda get-function-configuration --region "$REGION" --function-name "$FN" --query Environment.Variables --output json > /tmp/lambda-env.json
python3 <<'PY'
import json
with open("/tmp/lambda-env.json") as f:
    v = json.load(f)
v["STATIC_BUCKET"] = "shadowing-static-dev-sitebucket-xnygmxwbe67z"
v["CLOUDFRONT_DISTRIBUTION_ID"] = "E2XKSS6CLI091Q"
with open("/tmp/lambda-env-out.json", "w") as f:
    json.dump({"Variables": v}, f)
PY
aws lambda update-function-configuration --region "$REGION" --function-name "$FN" --environment file:///tmp/lambda-env-out.json --query 'Environment.Variables.{STATIC:STATIC_BUCKET,CF:CLOUDFRONT_DISTRIBUTION_ID}' --output json

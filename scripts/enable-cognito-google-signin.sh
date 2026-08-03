#!/usr/bin/env bash
# Enable Google federated sign-in on the existing Cognito user pool (no full SAM redeploy required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

REGION="${AWS_REGION:-us-west-2}"
USER_POOL_ID="${COGNITO_USER_POOL_ID:-us-west-2_5GBVjb1NA}"
CLIENT_ID="${COGNITO_CLIENT_ID:-2d9538pjg5i5246gbqgobqanus}"
DOMAIN_PREFIX="${COGNITO_DOMAIN_PREFIX:-shadowing-network}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:?Set GOOGLE_CLIENT_SECRET}"
API_FUNCTION="${API_FUNCTION:-shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq}"
PRESIGNUP_FUNCTION="${PRESIGNUP_FUNCTION:-}"

if [[ -z "$PRESIGNUP_FUNCTION" ]]; then
  PRESIGNUP_FUNCTION="$(aws cloudformation describe-stack-resource \
    --region "$REGION" \
    --stack-name shadowing-api-dev \
    --logical-resource-id CognitoPreSignUpFunction \
    --query StackResourceDetail.PhysicalResourceId \
    --output text 2>/dev/null || true)"
fi

echo "==> User pool: $USER_POOL_ID"
echo "==> OAuth domain prefix: $DOMAIN_PREFIX"

echo "==> Ensure custom:domain attribute exists"
if ! aws cognito-idp describe-user-pool \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --query "UserPool.SchemaAttributes[?Name=='custom:domain'].Name" \
  --output text | grep -q custom:domain; then
  aws cognito-idp add-custom-attributes \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --custom-attributes "Name=domain,AttributeDataType=String,Mutable=true,Required=false"
  echo "    added custom:domain"
else
  echo "    custom:domain already present"
fi

echo "==> Ensure Cognito hosted domain"
DOMAIN_DESC="$(aws cognito-idp describe-user-pool-domain \
  --region "$REGION" \
  --domain "$DOMAIN_PREFIX" \
  --query "DomainDescription.UserPoolId" \
  --output text 2>/dev/null || true)"
if [[ -n "$DOMAIN_DESC" && "$DOMAIN_DESC" != "None" ]]; then
  echo "    domain $DOMAIN_PREFIX already exists on pool $DOMAIN_DESC"
else
  aws cognito-idp create-user-pool-domain \
    --region "$REGION" \
    --domain "$DOMAIN_PREFIX" \
    --user-pool-id "$USER_POOL_ID"
  echo "    created domain $DOMAIN_PREFIX"
fi

echo "==> Configure Google identity provider"
PROVIDER_JSON="$(aws cognito-idp list-identity-providers \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --query "Providers[?ProviderName=='Google'].ProviderName" \
  --output text 2>/dev/null || true)"

if [[ "$PROVIDER_JSON" == "Google" ]]; then
  aws cognito-idp update-identity-provider \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --provider-name Google \
    --provider-details "client_id=$GOOGLE_CLIENT_ID,client_secret=$GOOGLE_CLIENT_SECRET,authorize_scopes=profile email openid" \
    --attribute-mapping "email=email,name=name,username=sub,custom:domain=hd"
  echo "    updated Google provider"
else
  aws cognito-idp create-identity-provider \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --provider-name Google \
    --provider-type Google \
    --provider-details "client_id=$GOOGLE_CLIENT_ID,client_secret=$GOOGLE_CLIENT_SECRET,authorize_scopes=profile email openid" \
    --attribute-mapping "email=email,name=name,username=sub,custom:domain=hd"
  echo "    created Google provider"
fi

echo "==> Update app client OAuth settings"
CLIENT_JSON="$(aws cognito-idp describe-user-pool-client \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --output json)"

aws cognito-idp update-user-pool-client \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_PASSWORD_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls "https://shadowingnetwork.com/" "https://www.shadowingnetwork.com/" "http://localhost:5173/" \
  --logout-urls "https://shadowingnetwork.com/" "https://www.shadowingnetwork.com/" "http://localhost:5173/" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --prevent-user-existence-errors ENABLED

echo "==> Deploy Pre Sign-up Lambda"
PRESIGNUP_ZIP="/tmp/shadowing-presignup.zip"
(
  cd "$ROOT/infra/sam/cognito-triggers"
  zip -qr "$PRESIGNUP_ZIP" preSignUp.mjs
)
aws lambda update-function-code \
  --region "$REGION" \
  --function-name "$PRESIGNUP_FUNCTION" \
  --zip-file "fileb://$PRESIGNUP_ZIP" \
  --output text --query FunctionName

echo "==> Set API Lambda Cognito OAuth env"
aws lambda get-function-configuration \
  --region "$REGION" \
  --function-name "$API_FUNCTION" \
  --query Environment.Variables \
  --output json > /tmp/lambda-env-google-base.json

python3 <<PY
import json
import os

with open("/tmp/lambda-env-google-base.json") as f:
    vars = json.load(f)

domain_prefix = "${DOMAIN_PREFIX}"
user_pool_id = "${USER_POOL_ID}"
client_id = "${CLIENT_ID}"

vars["COGNITO_OAUTH_DOMAIN"] = domain_prefix
vars["COGNITO_GOOGLE_ENABLED"] = "true"
vars["COGNITO_USER_POOL_ID"] = user_pool_id
vars["COGNITO_CLIENT_ID"] = client_id

with open("/tmp/lambda-env-google.json", "w") as f:
    json.dump({"Variables": vars}, f)
PY

aws lambda update-function-configuration \
  --region "$REGION" \
  --function-name "$API_FUNCTION" \
  --environment file:///tmp/lambda-env-google.json \
  --query 'Environment.Variables.{GOOGLE:COGNITO_GOOGLE_ENABLED,DOMAIN:COGNITO_OAUTH_DOMAIN}' \
  --output json

echo ""
echo "Done. Add this redirect URI in Google Cloud Console if not already present:"
echo "  https://${DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com/oauth2/idpresponse"

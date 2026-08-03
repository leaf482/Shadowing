#!/usr/bin/env bash
set -euo pipefail
REGION=us-west-2
BUCKET=shadowing-static-dev-sitebucket-xnygmxwbe67z
CF_ID=E2XKSS6CLI091Q

rm -rf /tmp/shadowing-repo
mkdir -p /tmp/shadowing-repo/dist /tmp/shadowing-repo/scripts /tmp/shadowing-repo/server/generated

cp -a /tmp/shadowing-repo-dist/. /tmp/shadowing-repo/dist/
cp /tmp/sync-static-cdn.mjs /tmp/shadowing-repo/scripts/
cp /tmp/cdn-deploy-package.stub.json /tmp/shadowing-repo/package.json
cp /tmp/clinics.json /tmp/shadowing-repo/server/generated/clinics.json

cd /tmp/shadowing-repo
npm install --omit=dev
STATIC_BUCKET="$BUCKET" AWS_REGION="$REGION" node scripts/sync-static-cdn.mjs

INVALIDATION=$(aws cloudfront create-invalidation \
  --region "$REGION" \
  --distribution-id "$CF_ID" \
  --paths '/*' \
  --query 'Invalidation.Id' \
  --output text)

echo "Bucket: $BUCKET"
echo "Invalidation: $INVALIDATION"

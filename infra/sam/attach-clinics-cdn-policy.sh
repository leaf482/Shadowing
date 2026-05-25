#!/usr/bin/env bash
set -euo pipefail
ROLE_NAME=$(aws lambda get-function-configuration --region us-west-2 --function-name shadowing-api-dev-ApiFunction-GgjeZ3BMqcfq --query Role --output text | awk -F/ '{print $NF}')
cat > /tmp/clinics-cdn-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shadowing-static-dev-sitebucket-xnygmxwbe67z/clinics.json"
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::769297868450:distribution/E2XKSS6CLI091Q"
    }
  ]
}
EOF
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name ClinicsSnapshotCdnPublish --policy-document file:///tmp/clinics-cdn-policy.json
echo "attached ClinicsSnapshotCdnPublish to $ROLE_NAME"

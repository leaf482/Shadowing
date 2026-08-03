#!/usr/bin/env bash
# Allow Cognito User Pool to send email via verified SES domain identity.
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
DOMAIN="${SES_DOMAIN:-shadowingnetwork.com}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

POLICY="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCognitoIdpSend",
      "Effect": "Allow",
      "Principal": {
        "Service": "cognito-idp.amazonaws.com"
      },
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/${DOMAIN}",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "${ACCOUNT_ID}"
        },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/*"
        }
      }
    }
  ]
}
EOF
)"

aws sesv2 create-email-identity-policy \
  --region "$REGION" \
  --email-identity "$DOMAIN" \
  --policy-name AllowCognitoUserPoolSend \
  --policy "$POLICY" 2>/dev/null \
|| aws sesv2 update-email-identity-policy \
  --region "$REGION" \
  --email-identity "$DOMAIN" \
  --policy-name AllowCognitoUserPoolSend \
  --policy "$POLICY"

echo "Applied SES identity policy for Cognito on ${DOMAIN}"

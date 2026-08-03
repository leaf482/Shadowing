#!/usr/bin/env bash
# Print SES sandbox vs production status (us-west-2).
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"

echo "SES account ($REGION):"
aws sesv2 get-account --region "$REGION" --output json \
  --query '{
    ProductionAccessEnabled: ProductionAccessEnabled,
    ReviewStatus: Details.ReviewDetails.Status,
    CaseId: Details.ReviewDetails.CaseId,
    EnforcementStatus: EnforcementStatus,
    Max24HourSend: SendQuota.Max24HourSend,
    MaxSendRate: SendQuota.MaxSendRate,
    SentLast24Hours: SendQuota.SentLast24Hours
  }'

echo ""
echo "Domain identity:"
aws sesv2 get-email-identity --email-identity shadowingnetwork.com --region "$REGION" --output json \
  --query '{VerifiedForSending:VerifiedForSendingStatus,Dkim:DkimAttributes.Status,CognitoPolicy:Policies.AllowCognitoUserPoolSend != `null`}'

if aws sesv2 get-account --region "$REGION" --query 'ProductionAccessEnabled' --output text | grep -q false; then
  echo ""
  echo "NOTE: ProductionAccessEnabled=false means sandbox — Cognito can only deliver to SES-verified recipient addresses."
  echo "Request production: bash scripts/request-ses-production-access.sh"
fi

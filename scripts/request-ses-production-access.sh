#!/usr/bin/env bash
# Request Amazon SES production access (exit sandbox) for transactional Cognito email.
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
CONTACT_EMAIL="${SES_CONTACT_EMAIL:-panda483@uw.edu}"

aws sesv2 put-account-details \
  --region "$REGION" \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://shadowingnetwork.com" \
  --contact-language EN \
  --use-case-description "Shadow Network (shadowingnetwork.com) sends transactional email only via Amazon Cognito: sign-up verification codes and password reset codes to university .edu addresses. No marketing email. Expected volume under 500 messages per day at launch." \
  --additional-contact-email-addresses "$CONTACT_EMAIL"

echo "Production access request submitted. Check status:"
aws sesv2 get-account --region "$REGION" --output json \
  --query '{ProductionAccessEnabled:ProductionAccessEnabled,ReviewStatus:Details.ReviewDetails.Status,EnforcementStatus:EnforcementStatus,Max24HourSend:SendQuota.Max24HourSend}'

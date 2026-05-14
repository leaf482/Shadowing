#!/usr/bin/env bash
# Route 53 hosted zone + apex/www ALIAS CloudFront + mail DNS (SES MX/SPF + Resend DKIM).
# Prerequisites: AWS CLI v2, IAM permission route53:* on this zone (or equivalent).
# Edit infra/route53/change-batch.json if domain or CloudFront target changes.

set -euo pipefail

DOMAIN="${DOMAIN:-shadowingnetwork.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANGE_BATCH="${SCRIPT_DIR}/change-batch.json"

echo "== IAM identity"
aws sts get-caller-identity

echo "== Resolve hosted zone for ${DOMAIN}"
HZ_ID="$(aws route53 list-hosted-zones-by-name \
  --dns-name "${DOMAIN}." \
  --query "HostedZones[?Name=='${DOMAIN}.']|[0].Id" \
  --output text 2>/dev/null | sed 's|/hostedzone/||' || true)"

if [[ -z "$HZ_ID" || "$HZ_ID" == "None" ]]; then
  echo "Creating hosted zone ${DOMAIN} ..."
  aws route53 create-hosted-zone --name "${DOMAIN}." --caller-reference "$(date +%s)"
  sleep 3
  HZ_ID="$(aws route53 list-hosted-zones-by-name \
    --dns-name "${DOMAIN}." \
    --query "HostedZones[?Name=='${DOMAIN}.']|[0].Id" \
    --output text | sed 's|/hostedzone/||')"
fi

if [[ -z "$HZ_ID" || "$HZ_ID" == "None" ]]; then
  echo "Could not resolve hosted zone ID for ${DOMAIN}." >&2
  exit 1
fi

echo "HostedZoneId: ${HZ_ID}"

echo "== Apply DNS records from ${CHANGE_BATCH}"
aws route53 change-resource-record-sets \
  --hosted-zone-id "${HZ_ID}" \
  --change-batch "file://${CHANGE_BATCH}"

echo "== Nameservers (set these at your registrar for ${DOMAIN})"
aws route53 get-hosted-zone --id "${HZ_ID}" \
  --query 'DelegationSet.NameServers' --output text | tr '\t' '\n'

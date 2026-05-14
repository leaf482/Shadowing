#!/usr/bin/env bash
set -euo pipefail
DIST_ID="${DIST_ID:-E2XKSS6CLI091Q}"
CERT_ARN="${CERT_ARN:-arn:aws:acm:us-east-1:769297868450:certificate/de65edc7-3585-41d7-8653-fa37cf7e6549}"

aws cloudfront get-distribution-config --id "$DIST_ID" --output json > /tmp/cf-full.json
ETAG="$(jq -r '.ETag' /tmp/cf-full.json)"

jq --arg cert "$CERT_ARN" \
  '.DistributionConfig
    | .Aliases = {"Quantity": 2, "Items": ["shadowingnetwork.com", "www.shadowingnetwork.com"]}
    | .ViewerCertificate = {
        CloudFrontDefaultCertificate: false,
        ACMCertificateArn: $cert,
        SSLSupportMethod: "sni-only",
        MinimumProtocolVersion: "TLSv1.2_2021",
        CertificateSource: "acm"
      }' \
  /tmp/cf-full.json > /tmp/cf-new.json

aws cloudfront update-distribution \
  --id "$DIST_ID" \
  --distribution-config "file:///tmp/cf-new.json" \
  --if-match "$ETAG" \
  --output json

echo "CloudFront update submitted. Deployment typically finishes in 5–15 minutes."

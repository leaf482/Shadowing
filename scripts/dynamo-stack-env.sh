#!/usr/bin/env bash
# Print DATA_BACKEND + TABLE_* lines from a SAM/CloudFormation stack (for .env or migrate).
set -euo pipefail
STACK="${1:-shadowing-api-dev}"
REGION="${2:-${AWS_REGION:-us-west-2}}"
out_val() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
echo "# BEGIN DYNAMO STACK ENV"
echo "DATA_BACKEND=dynamo"
echo "AWS_REGION=$REGION"
echo "TABLE_CLINICS=$(out_val TableClinics)"
echo "TABLE_USERS=$(out_val TableUsers)"
echo "TABLE_AUTH_SESSIONS=$(out_val TableAuthSessions)"
echo "TABLE_SHADOWING_REQUESTS=$(out_val TableShadowingRequests)"
echo "TABLE_EXPERIENCES=$(out_val TableExperiences)"
echo "TABLE_PROJECTS=$(out_val TableProjects)"
echo "TABLE_PLACEMENT_SESSIONS=$(out_val TablePlacementSessions)"
echo "TABLE_AUDIT_LOGS=$(out_val TableAuditLogs)"
echo "TABLE_QUALITY_FLAGS=$(out_val TableQualityFlags)"
echo "TABLE_RATE_LIMITS=$(out_val TableRateLimits)"
echo "# END DYNAMO STACK ENV"

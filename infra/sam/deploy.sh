#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"
export AWS_REGION="$REGION"
sam build --template-file template.yaml
sam deploy --template-file template.yaml --region "$REGION" "$@"

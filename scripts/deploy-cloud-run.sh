#!/bin/sh
set -eu

if [ "${CARDOCS_ALLOW_DEPLOY:-}" != "1" ]; then
  echo "CARDOCS_ALLOW_DEPLOY=missing"
  echo "Set CARDOCS_ALLOW_DEPLOY=1 only after the Git Flow approval gate for the target environment."
  exit 1
fi

PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "FIREBASE_PROJECT_ID=missing"
  exit 1
fi

REGION="${CARDOCS_CLOUD_RUN_REGION:-southamerica-east1}"

gcloud run deploy cardocs-backend \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --project "$PROJECT_ID"

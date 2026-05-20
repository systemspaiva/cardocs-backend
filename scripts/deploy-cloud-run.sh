#!/bin/sh
set -eu

if [ "${CARDOCS_ALLOW_DEPLOY:-}" != "1" ]; then
  echo "CARDOCS_ALLOW_DEPLOY=missing"
  echo "Set CARDOCS_ALLOW_DEPLOY=1 only after the Git Flow approval gate for the target environment."
  exit 1
fi

if [ "${CARDOCS_DEPLOY_TARGET:-}" != "develop" ]; then
  echo "CARDOCS_DEPLOY_TARGET=missing_or_not_develop"
  echo "Only develop deploys are allowed from this script."
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ "$CURRENT_BRANCH" != "develop" ]; then
  echo "GIT_BRANCH=$CURRENT_BRANCH"
  echo "Deploy is blocked unless the current branch is develop."
  exit 1
fi

PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
if [ -z "$PROJECT_ID" ]; then
  echo "FIREBASE_PROJECT_ID=missing"
  exit 1
fi

REGION="${CARDOCS_CLOUD_RUN_REGION:-southamerica-east1}"
CARDOCS_IA_BASE_URL_VALUE="${CARDOCS_IA_BASE_URL:-}"
if [ -z "$CARDOCS_IA_BASE_URL_VALUE" ]; then
  echo "CARDOCS_IA_BASE_URL=missing"
  echo "Configure the private cardocs-ia Cloud Run URL before deploying cardocs-backend."
  exit 1
fi

gcloud run deploy cardocs-backend \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --update-env-vars "CARDOCS_IA_BASE_URL=${CARDOCS_IA_BASE_URL_VALUE},CARDOCS_IA_TIMEOUT_MS=${CARDOCS_IA_TIMEOUT_MS:-120000},CARDOCS_APP_STORE_ENVIRONMENT=${CARDOCS_APP_STORE_ENVIRONMENT:-Sandbox},CARDOCS_IOS_BUNDLE_ID=${CARDOCS_IOS_BUNDLE_ID:-com.paivaapps.tarevisado},CARDOCS_APP_APPLE_ID=${CARDOCS_APP_APPLE_ID:-6771093806}" \
  --remove-env-vars "GENKIT_INVOICE_EXTRACTION_ENABLED,GENKIT_INVOICE_MODEL,GENKIT_INVOICE_TIMEOUT_MS,GEMINI_INVOICE_EXTRACTION_ENABLED,GEMINI_INVOICE_MODEL,GEMINI_INVOICE_TIMEOUT_MS,GEMINI_PART_RECOMMENDATION_ENABLED,GEMINI_PART_RECOMMENDATION_MODEL,GEMINI_PART_RECOMMENDATION_TIMEOUT_MS,GOOGLE_AI_API_KEY,GEMINI_API_KEY,DOCUMENT_AI_OCR_ENABLED,DOCUMENT_AI_PROJECT_ID,DOCUMENT_AI_LOCATION,DOCUMENT_AI_OCR_PROCESSOR_ID,DOCUMENT_AI_OCR_TIMEOUT_MS" \
  --remove-secrets "GOOGLE_AI_API_KEY,GEMINI_API_KEY" \
  --project "$PROJECT_ID"

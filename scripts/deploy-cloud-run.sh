#!/bin/sh
set -eu

if [ "${CARDOCS_ALLOW_DEPLOY:-}" != "1" ]; then
  echo "CARDOCS_ALLOW_DEPLOY=missing"
  echo "Set CARDOCS_ALLOW_DEPLOY=1 only after the Git Flow approval gate for the target environment."
  exit 1
fi

if [ "${CARDOCS_ALLOW_TRAFFIC_PROMOTION:-}" != "1" ]; then
  echo "CARDOCS_ALLOW_TRAFFIC_PROMOTION=missing"
  echo "Set CARDOCS_ALLOW_TRAFFIC_PROMOTION=1 only for an explicitly approved production rollout."
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

if [ -n "$(git status --porcelain)" ]; then
  echo "GIT_WORKTREE=dirty"
  echo "Deploy is blocked unless develop contains only committed changes."
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

ANDROID_PACKAGE_NAME_VALUE="${CARDOCS_ANDROID_PACKAGE_NAME:-com.luhenpa.cardocs}"
GOOGLE_PLAY_MONTHLY_PRODUCT_ID_VALUE="${CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID:-tarevisado_premium}"
GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID_VALUE="${CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID:-monthly}"
GOOGLE_PLAY_ANNUAL_PRODUCT_ID_VALUE="${CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID:-tarevisado_premium}"
GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID_VALUE="${CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID:-annual}"

SERVICE_ID="${CARDOCS_CLOUD_RUN_SERVICE:-cardocs-backend}"
CARDOCS_ROLLOUT_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cardocs-cloud-run-rollout.XXXXXX")"
PREVIOUS_SERVICE_JSON="$CARDOCS_ROLLOUT_TEMP_DIR/service-before.json"
CANDIDATE_SERVICE_JSON="$CARDOCS_ROLLOUT_TEMP_DIR/service-candidate.json"
CANDIDATE_REVISION_JSON="$CARDOCS_ROLLOUT_TEMP_DIR/revision-candidate.json"
PROMOTED_SERVICE_JSON="$CARDOCS_ROLLOUT_TEMP_DIR/service-promoted.json"
ROLLBACK_SERVICE_JSON="$CARDOCS_ROLLOUT_TEMP_DIR/service-rollback.json"
PREVIOUS_TRAFFIC_REVISION=""
CANDIDATE_TAG=""
PROMOTION_STARTED="0"

describe_service() {
  gcloud run services describe "$SERVICE_ID" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format=json
}

describe_revision() {
  gcloud run revisions describe "$1" \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --format=json
}

smoke_revision() {
  CARDOCS_SMOKE_BASE_URL="${1%/}"
  CARDOCS_HEALTH_BODY="$(
    curl --fail --silent --show-error --max-time 15 \
      "$CARDOCS_SMOKE_BASE_URL/v1/health"
  )"
  node --input-type=module -e '
    const body = JSON.parse(process.argv[1]);
    if (body?.status !== "UP") process.exit(1);
    console.log("CLOUD_RUN_HEALTH=present");
  ' "$CARDOCS_HEALTH_BODY"

  CARDOCS_INVALID_TOKEN_STATUS="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --max-time 15 \
      --header 'Authorization: Bearer invalid' \
      "$CARDOCS_SMOKE_BASE_URL/v1/dashboard"
  )"
  if [ "$CARDOCS_INVALID_TOKEN_STATUS" != "401" ]; then
    echo "CLOUD_RUN_INVALID_TOKEN_RETURNS_401=mismatch_${CARDOCS_INVALID_TOKEN_STATUS}"
    return 1
  fi
  echo "CLOUD_RUN_INVALID_TOKEN_RETURNS_401=present"
}

rollback_on_failure() {
  CARDOCS_ROLLOUT_EXIT_STATUS="$?"
  trap - EXIT
  set +e

  if [ "$CARDOCS_ROLLOUT_EXIT_STATUS" -ne 0 ]; then
    if [ "$PROMOTION_STARTED" = "1" ] && [ -n "$PREVIOUS_TRAFFIC_REVISION" ]; then
      echo "CLOUD_RUN_ROLLBACK=started_${PREVIOUS_TRAFFIC_REVISION}"
      if gcloud run services update-traffic "$SERVICE_ID" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --to-revisions "${PREVIOUS_TRAFFIC_REVISION}=100" \
        --quiet; then
        if describe_service > "$ROLLBACK_SERVICE_JSON" && \
          node scripts/cloud-run-rollout-contract.mjs \
            service-assert-live "$PREVIOUS_TRAFFIC_REVISION" \
            < "$ROLLBACK_SERVICE_JSON"; then
          echo "CLOUD_RUN_ROLLBACK=verified"
        else
          echo "CLOUD_RUN_ROLLBACK=verification_failed"
        fi
      else
        echo "CLOUD_RUN_ROLLBACK=traffic_restore_failed"
      fi
    else
      echo "CLOUD_RUN_TRAFFIC=preserved"
    fi
  fi

  if [ -n "$CANDIDATE_TAG" ]; then
    gcloud run services update-traffic "$SERVICE_ID" \
      --region "$REGION" \
      --project "$PROJECT_ID" \
      --remove-tags "$CANDIDATE_TAG" \
      --quiet >/dev/null 2>&1 || true
  fi

  rm -rf "$CARDOCS_ROLLOUT_TEMP_DIR"
  exit "$CARDOCS_ROLLOUT_EXIT_STATUS"
}

trap rollback_on_failure EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

describe_service > "$PREVIOUS_SERVICE_JSON"
PREVIOUS_READY_REVISION="$(
  node scripts/cloud-run-rollout-contract.mjs service-latest-ready \
    < "$PREVIOUS_SERVICE_JSON"
)"
PREVIOUS_TRAFFIC_REVISION="$(
  node scripts/cloud-run-rollout-contract.mjs service-live-revision \
    < "$PREVIOUS_SERVICE_JSON"
)"
describe_revision "$PREVIOUS_TRAFFIC_REVISION" \
  | node scripts/cloud-run-rollout-contract.mjs \
      revision-assert-ready "$PREVIOUS_TRAFFIC_REVISION"
echo "CLOUD_RUN_PREVIOUS_READY_REVISION=$PREVIOUS_READY_REVISION"
echo "CLOUD_RUN_PREVIOUS_TRAFFIC_REVISION=$PREVIOUS_TRAFFIC_REVISION"

CARDOCS_COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
CANDIDATE_TAG="candidate-${CARDOCS_COMMIT_SHA}-$(date -u +%H%M%S)"

gcloud run deploy "$SERVICE_ID" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --update-env-vars "CARDOCS_IA_BASE_URL=${CARDOCS_IA_BASE_URL_VALUE},CARDOCS_IA_TIMEOUT_MS=${CARDOCS_IA_TIMEOUT_MS:-120000},CARDOCS_IA_PART_LIFE_TIMEOUT_MS=${CARDOCS_IA_PART_LIFE_TIMEOUT_MS:-8000},CARDOCS_APP_STORE_ENVIRONMENT=${CARDOCS_APP_STORE_ENVIRONMENT:-Sandbox},CARDOCS_IOS_BUNDLE_ID=${CARDOCS_IOS_BUNDLE_ID:-com.paivaapps.tarevisado},CARDOCS_APP_APPLE_ID=${CARDOCS_APP_APPLE_ID:-6771093806},CARDOCS_ANDROID_PACKAGE_NAME=${ANDROID_PACKAGE_NAME_VALUE},CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID=${GOOGLE_PLAY_MONTHLY_PRODUCT_ID_VALUE},CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID=${GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID_VALUE},CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID=${GOOGLE_PLAY_ANNUAL_PRODUCT_ID_VALUE},CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID=${GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID_VALUE}" \
  --remove-env-vars "GENKIT_INVOICE_EXTRACTION_ENABLED,GENKIT_INVOICE_MODEL,GENKIT_INVOICE_TIMEOUT_MS,GEMINI_INVOICE_EXTRACTION_ENABLED,GEMINI_INVOICE_MODEL,GEMINI_INVOICE_TIMEOUT_MS,GEMINI_PART_RECOMMENDATION_ENABLED,GEMINI_PART_RECOMMENDATION_MODEL,GEMINI_PART_RECOMMENDATION_TIMEOUT_MS,GOOGLE_AI_API_KEY,GEMINI_API_KEY,DOCUMENT_AI_OCR_ENABLED,DOCUMENT_AI_PROJECT_ID,DOCUMENT_AI_LOCATION,DOCUMENT_AI_OCR_PROCESSOR_ID,DOCUMENT_AI_OCR_TIMEOUT_MS" \
  --remove-secrets "GOOGLE_AI_API_KEY,GEMINI_API_KEY" \
  --no-traffic \
  --tag "$CANDIDATE_TAG" \
  --project "$PROJECT_ID" \
  --quiet

describe_service > "$CANDIDATE_SERVICE_JSON"
NEW_REVISION="$(
  node scripts/cloud-run-rollout-contract.mjs service-latest-created \
    < "$CANDIDATE_SERVICE_JSON"
)"
if [ "$NEW_REVISION" = "$PREVIOUS_TRAFFIC_REVISION" ]; then
  echo "CLOUD_RUN_CANDIDATE_REVISION=unchanged"
  exit 1
fi

describe_revision "$NEW_REVISION" > "$CANDIDATE_REVISION_JSON"
node scripts/cloud-run-rollout-contract.mjs revision-assert-candidate "$NEW_REVISION" \
  < "$CANDIDATE_REVISION_JSON"
CANDIDATE_URL="$(
  node scripts/cloud-run-rollout-contract.mjs \
    service-tag-url "$CANDIDATE_TAG" "$NEW_REVISION" \
    < "$CANDIDATE_SERVICE_JSON"
)"
smoke_revision "$CANDIDATE_URL"

describe_service \
  | node scripts/cloud-run-rollout-contract.mjs \
      service-assert-live "$PREVIOUS_TRAFFIC_REVISION"

PROMOTION_STARTED="1"
gcloud run services update-traffic "$SERVICE_ID" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --to-revisions "${NEW_REVISION}=100" \
  --quiet

describe_service > "$PROMOTED_SERVICE_JSON"
node scripts/cloud-run-rollout-contract.mjs service-assert-post-deploy "$NEW_REVISION" \
  < "$PROMOTED_SERVICE_JSON"
SERVICE_URL="$(
  node scripts/cloud-run-rollout-contract.mjs service-url \
    < "$PROMOTED_SERVICE_JSON"
)"
smoke_revision "$SERVICE_URL"
echo "CLOUD_RUN_ROLLOUT=complete_${NEW_REVISION}"

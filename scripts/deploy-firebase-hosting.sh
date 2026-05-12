#!/bin/sh
set -eu

if [ "${CARDOCS_ALLOW_DEPLOY:-}" != "1" ]; then
  echo "CARDOCS_ALLOW_DEPLOY=missing"
  echo "Set CARDOCS_ALLOW_DEPLOY=1 only after the Git Flow approval gate for the target environment."
  exit 1
fi

if [ "${CARDOCS_DEPLOY_TARGET:-}" != "develop" ]; then
  echo "CARDOCS_DEPLOY_TARGET=missing_or_not_develop"
  echo "Only develop channel deploys are allowed from this script."
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

firebase --project "$PROJECT_ID" hosting:channel:deploy develop --expires 30d

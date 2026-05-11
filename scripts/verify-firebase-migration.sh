#!/bin/sh
set -eu

if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  echo "GOOGLE_APPLICATION_CREDENTIALS=missing"
  echo "Set GOOGLE_APPLICATION_CREDENTIALS to a local service account path outside the repository."
  exit 1
fi

npm run verify:local
npm run check:firebase-deploy-readiness
npm run check:firebase-readiness

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCandidateRevision,
  assertPostDeployService,
  expectedGooglePlayEnvironment,
  latestCreatedRevision,
  latestReadyRevision,
  liveRevision,
  publicServiceUrl,
  taggedRevisionUrl
} from "../scripts/cloud-run-rollout-contract.mjs";

const REVISION = "cardocs-backend-00081-safe";
const PREVIOUS_REVISION = "cardocs-backend-00080-live";
const CANDIDATE_TAG = "candidate-812c766-120000";
const ENVIRONMENT = expectedGooglePlayEnvironment({});
const DEPLOY_SCRIPT = await readFile(new URL("../scripts/deploy-cloud-run.sh", import.meta.url), "utf8");
const PREFLIGHT_SCRIPT = await readFile(
  new URL("../scripts/check-firebase-deploy-readiness.mjs", import.meta.url),
  "utf8"
);
const POST_DEPLOY_SCRIPT = await readFile(
  new URL("../scripts/check-cloud-run-post-deploy.mjs", import.meta.url),
  "utf8"
);

test("decodes the current 100% revision and the tagged candidate URL", () => {
  const service = versionOneService();

  assert.equal(latestReadyRevision(service), REVISION);
  assert.equal(latestCreatedRevision(service), REVISION);
  assert.equal(liveRevision(service), REVISION);
  assert.equal(taggedRevisionUrl(service, CANDIDATE_TAG, REVISION), "https://candidate.example.run.app");
  assert.equal(publicServiceUrl(service), "https://service.example.run.app");
});

test("accepts both gcloud v1 and Cloud Run v2 post-deploy representations", () => {
  assert.equal(assertPostDeployService(versionOneService(), REVISION, ENVIRONMENT), REVISION);
  assert.equal(assertPostDeployService(versionTwoService(), REVISION, ENVIRONMENT), REVISION);
  assert.doesNotThrow(() => assertCandidateRevision(versionOneRevision(), REVISION, ENVIRONMENT));
});

test("fails closed for split traffic, mismatched environment or a non-Ready revision", () => {
  const splitTraffic = versionOneService();
  splitTraffic.status.traffic = [
    { revisionName: REVISION, percent: 50 },
    { revisionName: PREVIOUS_REVISION, percent: 50 }
  ];
  assert.throws(() => liveRevision(splitTraffic), /exactly one revision/);

  const mismatchedEnvironment = versionOneService();
  mismatchedEnvironment.spec.template.spec.containers[0].env.find(
    (entry) => entry.name === "CARDOCS_ANDROID_PACKAGE_NAME"
  ).value = "com.attacker.app";
  assert.throws(
    () => assertPostDeployService(mismatchedEnvironment, REVISION, ENVIRONMENT),
    /CARDOCS_ANDROID_PACKAGE_NAME/
  );

  const unavailableRevision = versionOneRevision();
  unavailableRevision.status.conditions[0].status = "False";
  assert.throws(
    () => assertCandidateRevision(unavailableRevision, REVISION, ENVIRONMENT),
    /is not Ready/
  );
});

test("keeps the remote preflight independent from the new revision environment", () => {
  for (const name of Object.keys(ENVIRONMENT)) {
    assert.equal(PREFLIGHT_SCRIPT.includes(name), false);
    assert.equal(POST_DEPLOY_SCRIPT.includes(name), false);
  }

  assert.match(PREFLIGHT_SCRIPT, /requiredServices/);
  assert.match(PREFLIGHT_SCRIPT, /CLOUD_RUN_100_PERCENT_TRAFFIC/);
  assert.match(POST_DEPLOY_SCRIPT, /assertPostDeployService/);
  assert.match(POST_DEPLOY_SCRIPT, /CLOUD_RUN_INVALID_TOKEN_RETURNS_401/);
});

test("deploys a candidate without traffic, smokes it, then promotes and post-checks it", () => {
  assert.match(DEPLOY_SCRIPT, /CARDOCS_ALLOW_TRAFFIC_PROMOTION/);
  assert.match(DEPLOY_SCRIPT, /git status --porcelain/);
  assert.match(DEPLOY_SCRIPT, /--no-traffic/);
  assert.match(DEPLOY_SCRIPT, /--tag "\$CANDIDATE_TAG"/);

  const candidateSmoke = DEPLOY_SCRIPT.indexOf("smoke_revision \"$CANDIDATE_URL\"");
  const promotion = DEPLOY_SCRIPT.indexOf("PROMOTION_STARTED=\"1\"");
  const postDeployContract = DEPLOY_SCRIPT.indexOf("service-assert-post-deploy");
  const promotedSmoke = DEPLOY_SCRIPT.indexOf("smoke_revision \"$SERVICE_URL\"");

  assert.ok(candidateSmoke >= 0);
  assert.ok(candidateSmoke < promotion);
  assert.ok(promotion < postDeployContract);
  assert.ok(postDeployContract < promotedSmoke);
});

test("rollback restores the captured live revision and preserves authorized mutations", () => {
  assert.match(DEPLOY_SCRIPT, /PREVIOUS_TRAFFIC_REVISION/);
  assert.match(DEPLOY_SCRIPT, /--to-revisions "\$\{PREVIOUS_TRAFFIC_REVISION\}=100"/);
  assert.match(DEPLOY_SCRIPT, /trap rollback_on_failure EXIT/);
  assert.match(DEPLOY_SCRIPT, /--remove-tags "\$CANDIDATE_TAG"/);
  assert.match(
    DEPLOY_SCRIPT,
    /--remove-secrets "GOOGLE_AI_API_KEY,GEMINI_API_KEY"/
  );
  assert.match(
    DEPLOY_SCRIPT,
    /--remove-env-vars "GENKIT_INVOICE_EXTRACTION_ENABLED,[^"]*DOCUMENT_AI_OCR_TIMEOUT_MS"/
  );
  assert.equal(DEPLOY_SCRIPT.includes("purchaseToken"), false);
  assert.equal(DEPLOY_SCRIPT.includes("subscriptions/google-play"), false);
});

function googlePlayEnvironmentEntries() {
  return Object.entries(ENVIRONMENT).map(([name, value]) => ({ name, value }));
}

function versionOneRevision() {
  return {
    metadata: { name: REVISION },
    spec: { containers: [{ env: googlePlayEnvironmentEntries() }] },
    status: { conditions: [{ type: "Ready", status: "True" }] }
  };
}

function versionOneService() {
  return {
    spec: { template: { spec: { containers: [{ env: googlePlayEnvironmentEntries() }] } } },
    status: {
      latestCreatedRevisionName: REVISION,
      latestReadyRevisionName: REVISION,
      url: "https://service.example.run.app",
      traffic: [
        { revisionName: REVISION, percent: 100 },
        {
          revisionName: REVISION,
          tag: CANDIDATE_TAG,
          url: "https://candidate.example.run.app"
        }
      ]
    }
  };
}

function versionTwoService() {
  return {
    latestCreatedRevision: `projects/cardocs-app/locations/southamerica-east1/services/cardocs-backend/revisions/${REVISION}`,
    latestReadyRevision: `projects/cardocs-app/locations/southamerica-east1/services/cardocs-backend/revisions/${REVISION}`,
    uri: "https://service.example.run.app",
    template: { containers: [{ env: googlePlayEnvironmentEntries() }] },
    trafficStatuses: [
      {
        revision: `projects/cardocs-app/locations/southamerica-east1/services/cardocs-backend/revisions/${REVISION}`,
        percent: 100
      }
    ]
  };
}

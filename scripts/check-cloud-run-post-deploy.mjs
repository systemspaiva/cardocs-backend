import { existsSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import {
  assertPostDeployService,
  googlePlayEnvironmentNames,
  latestReadyRevision,
  publicServiceUrl
} from "./cloud-run-rollout-contract.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "cardocs-app";
const region = process.env.CARDOCS_CLOUD_RUN_REGION ?? "southamerica-east1";
const serviceId = process.env.CARDOCS_CLOUD_RUN_SERVICE ?? "cardocs-backend";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const expectedRevision = process.env.CARDOCS_EXPECTED_REVISION;

let failed = false;

function report(name, status) {
  console.log(`${name}=${status}`);
  if (status !== "present") failed = true;
}

if (!credentialsPath || !existsSync(credentialsPath)) {
  report("GOOGLE_APPLICATION_CREDENTIALS", "missing");
  process.exit(1);
}
report("GOOGLE_APPLICATION_CREDENTIALS", "present");

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});
const client = await auth.getClient();

let cloudRunService;
try {
  const response = await client.request({
    url: `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/services/${serviceId}`
  });
  cloudRunService = response.data;
  report("CLOUD_RUN_SERVICE", cloudRunService?.name ? "present" : "missing");
} catch (error) {
  report("CLOUD_RUN_SERVICE", `failed_${String(error.response?.status ?? error.code ?? "request_failed")}`);
  process.exit(1);
}

const deployedRevision = expectedRevision ?? latestReadyRevision(cloudRunService);
try {
  assertPostDeployService(cloudRunService, deployedRevision);
  report("CLOUD_RUN_LATEST_READY_REVISION", "present");
  report("CLOUD_RUN_100_PERCENT_TRAFFIC", "present");
  for (const name of googlePlayEnvironmentNames) {
    report(`CLOUD_RUN_ENV_${name}`, "present");
  }
} catch (error) {
  console.error(`CLOUD_RUN_POST_DEPLOY_CONTRACT=failed_${error.message}`);
  failed = true;
}

let serviceUrl;
try {
  serviceUrl = publicServiceUrl(cloudRunService).replace(/\/$/, "");
  const healthResponse = await fetch(`${serviceUrl}/v1/health`, {
    signal: AbortSignal.timeout(15_000)
  });
  const healthBody = await healthResponse.json();
  report(
    "CLOUD_RUN_HEALTH",
    healthResponse.ok && healthBody?.status === "UP" ? "present" : "mismatch"
  );
} catch (error) {
  console.error(`CLOUD_RUN_HEALTH_REQUEST=failed_${error.name ?? "request_failed"}`);
  failed = true;
}

if (serviceUrl) {
  try {
    const response = await fetch(`${serviceUrl}/v1/dashboard`, {
      headers: { Authorization: "Bearer invalid" },
      signal: AbortSignal.timeout(15_000)
    });
    report("CLOUD_RUN_INVALID_TOKEN_RETURNS_401", response.status === 401 ? "present" : "mismatch");
  } catch (error) {
    console.error(`CLOUD_RUN_INVALID_TOKEN_REQUEST=failed_${error.name ?? "request_failed"}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);

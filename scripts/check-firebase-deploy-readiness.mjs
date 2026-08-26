import { existsSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "cardocs-app";
const region = process.env.CARDOCS_CLOUD_RUN_REGION ?? "southamerica-east1";
const serviceId = process.env.CARDOCS_CLOUD_RUN_SERVICE ?? "cardocs-backend";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const expectedGooglePlayEnvironment = {
  CARDOCS_ANDROID_PACKAGE_NAME:
    process.env.CARDOCS_ANDROID_PACKAGE_NAME ?? "com.luhenpa.cardocs",
  CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID:
    process.env.CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID ?? "tarevisado_premium",
  CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID:
    process.env.CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID ?? "monthly",
  CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID:
    process.env.CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID ?? "tarevisado_premium",
  CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID:
    process.env.CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID ?? "annual"
};

const requiredServices = [
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "androidpublisher.googleapis.com"
];

let failed = false;

function report(name, status) {
  console.log(`${name}=${status}`);
  if (status !== "enabled" && status !== "present") {
    failed = true;
  }
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

for (const service of requiredServices) {
  try {
    const response = await client.request({
      url: `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${service}`
    });
    report(`SERVICE_${service.replace(/\W/g, "_").toUpperCase()}`, response.data?.state === "ENABLED" ? "enabled" : "disabled");
  } catch (error) {
    report(`SERVICE_${service.replace(/\W/g, "_").toUpperCase()}`, `failed_${String(error.response?.status ?? error.code ?? "request_failed")}`);
  }
}

let cloudRunService = null;
try {
  const response = await client.request({
    url: `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/services/${serviceId}`
  });
  cloudRunService = response.data;
  report("CLOUD_RUN_SERVICE", cloudRunService?.name ? "present" : "missing");
} catch (error) {
  const status = String(error.response?.status ?? error.code ?? "request_failed");
  report("CLOUD_RUN_SERVICE", status === "404" ? "missing" : `failed_${status}`);
}

const deployedEnvironment = new Map(
  (cloudRunService?.template?.containers ?? [])
    .flatMap((container) => container.env ?? [])
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => [entry.name, entry.value])
);
for (const [name, expectedValue] of Object.entries(expectedGooglePlayEnvironment)) {
  const deployedValue = deployedEnvironment.get(name);
  report(
    `CLOUD_RUN_ENV_${name}`,
    deployedValue === expectedValue
      ? "present"
      : deployedValue === undefined
        ? "missing"
        : "mismatch"
  );
}

process.exit(failed ? 1 : 0);

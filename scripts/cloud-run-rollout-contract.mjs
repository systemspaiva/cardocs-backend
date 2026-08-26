import { fileURLToPath } from "node:url";

export const googlePlayEnvironmentNames = Object.freeze([
  "CARDOCS_ANDROID_PACKAGE_NAME",
  "CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID",
  "CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID",
  "CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID",
  "CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID"
]);

export function expectedGooglePlayEnvironment(environment = process.env) {
  return {
    CARDOCS_ANDROID_PACKAGE_NAME:
      environment.CARDOCS_ANDROID_PACKAGE_NAME ?? "com.luhenpa.cardocs",
    CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID:
      environment.CARDOCS_GOOGLE_PLAY_MONTHLY_PRODUCT_ID ?? "tarevisado_premium",
    CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID:
      environment.CARDOCS_GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID ?? "monthly",
    CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID:
      environment.CARDOCS_GOOGLE_PLAY_ANNUAL_PRODUCT_ID ?? "tarevisado_premium",
    CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID:
      environment.CARDOCS_GOOGLE_PLAY_ANNUAL_BASE_PLAN_ID ?? "annual"
  };
}

export function resourceName(resource) {
  return shortResourceName(resource?.metadata?.name ?? resource?.name);
}

export function latestReadyRevision(service) {
  return shortResourceName(
    service?.status?.latestReadyRevisionName ?? service?.latestReadyRevision
  );
}

export function latestCreatedRevision(service) {
  return shortResourceName(
    service?.status?.latestCreatedRevisionName ?? service?.latestCreatedRevision
  );
}

export function liveRevision(service) {
  const revisions = new Set(
    trafficStatuses(service)
      .filter((target) => Number(target?.percent) === 100)
      .map(trafficRevision)
      .filter(Boolean)
  );

  if (revisions.size !== 1) {
    throw new Error("Cloud Run must have exactly one revision receiving 100% of traffic");
  }

  return [...revisions][0];
}

export function taggedRevisionUrl(service, tag, expectedRevision) {
  const target = trafficStatuses(service).find((entry) => entry?.tag === tag);
  if (!target) {
    throw new Error(`Cloud Run candidate tag ${tag} is missing`);
  }

  const revision = trafficRevision(target);
  if (revision !== expectedRevision) {
    throw new Error(`Cloud Run candidate tag ${tag} targets an unexpected revision`);
  }

  const url = target.url ?? target.uri;
  assertHttpsUrl(url, `Cloud Run candidate tag ${tag}`);
  return url;
}

export function publicServiceUrl(service) {
  const url = service?.status?.url ?? service?.uri;
  assertHttpsUrl(url, "Cloud Run service");
  return url;
}

export function assertReadyRevision(revision, expectedRevision) {
  if (resourceName(revision) !== expectedRevision) {
    throw new Error("Cloud Run returned an unexpected revision");
  }

  const ready = conditions(revision).some((condition) =>
    condition?.type === "Ready" &&
      (condition?.status === "True" || condition?.state === "CONDITION_SUCCEEDED")
  );
  if (!ready) {
    throw new Error(`Cloud Run revision ${expectedRevision} is not Ready`);
  }
}

export function assertGooglePlayEnvironment(resource, expectedEnvironment) {
  const deployedEnvironment = new Map(
    containers(resource)
      .flatMap((container) => container?.env ?? [])
      .filter((entry) => typeof entry?.name === "string")
      .map((entry) => [entry.name, entry.value])
  );

  for (const name of googlePlayEnvironmentNames) {
    if (deployedEnvironment.get(name) !== expectedEnvironment[name]) {
      throw new Error(`Cloud Run environment ${name} is missing or mismatched`);
    }
  }
}

export function assertCandidateRevision(
  revision,
  expectedRevision,
  expectedEnvironment = expectedGooglePlayEnvironment()
) {
  assertReadyRevision(revision, expectedRevision);
  assertGooglePlayEnvironment(revision, expectedEnvironment);
}

export function assertPostDeployService(
  service,
  expectedRevision = latestReadyRevision(service),
  expectedEnvironment = expectedGooglePlayEnvironment()
) {
  if (!expectedRevision) {
    throw new Error("Cloud Run latest Ready revision is missing");
  }
  if (latestReadyRevision(service) !== expectedRevision) {
    throw new Error("Cloud Run latest Ready revision is not the expected revision");
  }

  const createdRevision = latestCreatedRevision(service);
  if (createdRevision && createdRevision !== expectedRevision) {
    throw new Error("Cloud Run latest created revision is not the expected revision");
  }
  if (liveRevision(service) !== expectedRevision) {
    throw new Error("Cloud Run expected revision is not receiving 100% of traffic");
  }

  assertGooglePlayEnvironment(service, expectedEnvironment);
  return expectedRevision;
}

function trafficStatuses(service) {
  return service?.status?.traffic ?? service?.status?.trafficStatuses ?? service?.trafficStatuses ?? [];
}

function trafficRevision(target) {
  return shortResourceName(target?.revisionName ?? target?.revision);
}

function conditions(resource) {
  return resource?.status?.conditions ?? resource?.conditions ?? [];
}

function containers(resource) {
  return resource?.spec?.containers ??
    resource?.spec?.template?.spec?.containers ??
    resource?.template?.containers ??
    resource?.template?.spec?.containers ??
    resource?.containers ??
    [];
}

function shortResourceName(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.split("/").at(-1) ?? "";
}

function assertHttpsUrl(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`${label} URL is missing or is not HTTPS`);
  }
}

async function readJsonFromStandardInput() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function runCommand() {
  const [command, ...arguments_] = process.argv.slice(2);
  const resource = await readJsonFromStandardInput();

  switch (command) {
    case "service-latest-ready":
      console.log(requiredScalar(latestReadyRevision(resource), "latest Ready revision"));
      break;
    case "service-latest-created":
      console.log(requiredScalar(latestCreatedRevision(resource), "latest created revision"));
      break;
    case "service-live-revision":
      console.log(liveRevision(resource));
      break;
    case "service-assert-live": {
      const expectedRevision = requiredArgument(arguments_[0], "expected revision");
      if (liveRevision(resource) !== expectedRevision) {
        throw new Error("Cloud Run traffic changed during the rollout");
      }
      console.log("CLOUD_RUN_TRAFFIC=preserved");
      break;
    }
    case "service-tag-url":
      console.log(taggedRevisionUrl(
        resource,
        requiredArgument(arguments_[0], "candidate tag"),
        requiredArgument(arguments_[1], "expected revision")
      ));
      break;
    case "service-url":
      console.log(publicServiceUrl(resource));
      break;
    case "service-assert-post-deploy": {
      const expectedRevision = requiredArgument(arguments_[0], "expected revision");
      assertPostDeployService(resource, expectedRevision);
      console.log("CLOUD_RUN_POST_DEPLOY_CONTRACT=present");
      break;
    }
    case "revision-assert-ready":
      assertReadyRevision(resource, requiredArgument(arguments_[0], "expected revision"));
      console.log("CLOUD_RUN_REVISION_READY=present");
      break;
    case "revision-assert-candidate":
      assertCandidateRevision(resource, requiredArgument(arguments_[0], "expected revision"));
      console.log("CLOUD_RUN_CANDIDATE_CONTRACT=present");
      break;
    default:
      throw new Error("Unsupported Cloud Run rollout contract command");
  }
}

function requiredArgument(value, label) {
  return requiredScalar(value, label);
}

function requiredScalar(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\n")) {
    throw new Error(`Cloud Run ${label} is missing or invalid`);
  }
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCommand().catch((error) => {
    console.error(`CLOUD_RUN_ROLLOUT_CONTRACT=failed_${error.message}`);
    process.exit(1);
  });
}

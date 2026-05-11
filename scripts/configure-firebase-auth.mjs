import { existsSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "cardocs-app";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const bundleId = process.env.CARDOCS_IOS_BUNDLE_ID ?? "com.paivaapps.cardocs";
const shouldApply = process.argv.includes("--apply");

let hasFailure = false;

function status(name, value) {
  console.log(`${name}=${value}`);
  const normalized = String(value);
  if (
    normalized === "missing_optional" ||
    normalized.startsWith("would_")
  ) {
    return;
  }

  if (
    normalized.startsWith("missing") ||
    normalized.startsWith("failed") ||
    normalized === "disabled"
  ) {
    hasFailure = true;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) status(name, "missing");
  return value;
}

if (!credentialsPath || !existsSync(credentialsPath)) {
  status("GOOGLE_APPLICATION_CREDENTIALS", "missing");
  process.exit(1);
}
status("GOOGLE_APPLICATION_CREDENTIALS", "present");
status("MODE", shouldApply ? "apply" : "dry_run");

const googleClientId = requireEnv("FIREBASE_AUTH_GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnv("FIREBASE_AUTH_GOOGLE_CLIENT_SECRET");
const appleTeamId = process.env.FIREBASE_AUTH_APPLE_TEAM_ID?.trim();
const appleKeyId = process.env.FIREBASE_AUTH_APPLE_KEY_ID?.trim();
const applePrivateKey = process.env.FIREBASE_AUTH_APPLE_PRIVATE_KEY?.trim();

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/identitytoolkit"
  ]
});

const client = await auth.getClient();
const identityBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}`;

async function request(method, url, data, query = {}) {
  if (!shouldApply && method !== "GET") {
    return { ok: true, data: null, dryRun: true };
  }

  try {
    const response = await client.request({ method, url, data, params: query });
    return { ok: true, data: response.data };
  } catch (error) {
    return { ok: false, status: String(error.response?.status ?? error.code ?? "request_failed") };
  }
}

async function upsertDefaultProvider(providerId, body) {
  const encodedProvider = encodeURIComponent(providerId);
  const name = `${identityBase}/defaultSupportedIdpConfigs/${encodedProvider}`;
  const existing = await request("GET", name);

  if (!existing.ok && existing.status !== "404") {
    status(`AUTH_${providerId.toUpperCase().replace(".", "_")}`, `failed_read_${existing.status}`);
    return;
  }

  if (existing.ok) {
    const patch = await request("PATCH", name, body, { updateMask: Object.keys(body).join(",") });
    status(`AUTH_${providerId.toUpperCase().replace(".", "_")}`, patch.ok ? (patch.dryRun ? "would_patch" : "enabled") : `failed_patch_${patch.status}`);
    return;
  }

  const create = await request("POST", `${identityBase}/defaultSupportedIdpConfigs`, body, { idpId: providerId });
  status(`AUTH_${providerId.toUpperCase().replace(".", "_")}`, create.ok ? (create.dryRun ? "would_create" : "enabled") : `failed_create_${create.status}`);
}

const emailPatch = await request(
  "PATCH",
  `${identityBase}/config`,
  { signIn: { email: { enabled: true, passwordRequired: true } } },
  { updateMask: "signIn.email.enabled,signIn.email.passwordRequired" }
);
status("AUTH_EMAIL_PASSWORD", emailPatch.ok ? (emailPatch.dryRun ? "would_enable" : "enabled") : `failed_${emailPatch.status}`);

if (googleClientId && googleClientSecret) {
  await upsertDefaultProvider("google.com", {
    enabled: true,
    clientId: googleClientId,
    clientSecret: googleClientSecret
  });
}

const appleBody = {
  enabled: true,
  appleSignInConfig: {
    bundleIds: [bundleId]
  }
};

if (appleTeamId && appleKeyId && applePrivateKey) {
  appleBody.appleSignInConfig.codeFlowConfig = {
    teamId: appleTeamId,
    keyId: appleKeyId,
    privateKey: applePrivateKey
  };
} else {
  status("FIREBASE_AUTH_APPLE_CODE_FLOW", "missing_optional");
}

await upsertDefaultProvider("apple.com", appleBody);

if (!shouldApply) {
  console.log("NEXT_STEP=rerun_with_--apply_after_review");
}

process.exit(hasFailure ? 1 : 0);

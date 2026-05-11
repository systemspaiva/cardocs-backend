import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "cardocs-app";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const iosPlistPath = process.env.CARDOCS_IOS_GOOGLE_PLIST ??
  path.resolve(process.cwd(), "../cardocs/cardocs/GoogleService-Info.plist");

let hasFailure = false;

function report(name, status) {
  console.log(`${name}=${status}`);
  if (status !== "ok" && status !== "present" && status !== "enabled") {
    hasFailure = true;
  }
}

function plistValue(xml, key) {
  const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<string>([^<]+)</string>`);
  return xml.match(pattern)?.[1] ?? "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (!credentialsPath || !existsSync(credentialsPath)) {
  report("GOOGLE_APPLICATION_CREDENTIALS", "missing");
  process.exit(1);
}
report("GOOGLE_APPLICATION_CREDENTIALS", "present");

if (!existsSync(iosPlistPath)) {
  report("IOS_GOOGLE_SERVICE_PLIST", "missing");
  process.exit(1);
}
report("IOS_GOOGLE_SERVICE_PLIST", "present");

const iosPlist = readFileSync(iosPlistPath, "utf8");
const googleAppId = plistValue(iosPlist, "GOOGLE_APP_ID");
for (const key of ["GOOGLE_APP_ID", "API_KEY", "CLIENT_ID", "REVERSED_CLIENT_ID"]) {
  report(`IOS_${key}`, plistValue(iosPlist, key) ? "present" : "missing");
}

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase.readonly",
    "https://www.googleapis.com/auth/identitytoolkit"
  ]
});

async function request(client, url) {
  try {
    return { ok: true, data: (await client.request({ url })).data };
  } catch (error) {
    return { ok: false, status: String(error.response?.status ?? error.code ?? "request_failed") };
  }
}

const client = await auth.getClient();

if (googleAppId) {
  const encodedAppId = encodeURIComponent(googleAppId);
  const configResponse = await request(
    client,
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/iosApps/${encodedAppId}/config`
  );
  if (configResponse.ok && configResponse.data?.configFileContents) {
    const remotePlist = Buffer.from(configResponse.data.configFileContents, "base64").toString("utf8");
    report("REMOTE_IOS_CLIENT_ID", plistValue(remotePlist, "CLIENT_ID") ? "present" : "missing");
    report("REMOTE_IOS_REVERSED_CLIENT_ID", plistValue(remotePlist, "REVERSED_CLIENT_ID") ? "present" : "missing");
  } else {
    report("REMOTE_IOS_CONFIG", `failed_${configResponse.status}`);
  }
}

const identityBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}`;
const authConfig = await request(client, `${identityBase}/config`);
if (authConfig.ok) {
  report("AUTH_EMAIL_PASSWORD", authConfig.data?.signIn?.email?.enabled === true ? "enabled" : "disabled");
} else {
  report("AUTH_CONFIG", `failed_${authConfig.status}`);
}

for (const provider of ["google.com", "apple.com"]) {
  const providerConfig = await request(
    client,
    `${identityBase}/defaultSupportedIdpConfigs/${encodeURIComponent(provider)}`
  );
  if (providerConfig.ok) {
    report(`AUTH_${provider.toUpperCase().replace(".", "_")}`, providerConfig.data?.enabled === true ? "enabled" : "disabled");
  } else if (providerConfig.status === "404") {
    report(`AUTH_${provider.toUpperCase().replace(".", "_")}`, "missing");
  } else {
    report(`AUTH_${provider.toUpperCase().replace(".", "_")}`, `failed_${providerConfig.status}`);
  }
}

process.exit(hasFailure ? 1 : 0);

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "cardocs-app";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const iosPlistPath = process.env.CARDOCS_IOS_GOOGLE_PLIST ??
  path.resolve(process.cwd(), "../cardocs/cardocs/GoogleService-Info.plist");
const shouldApply = process.argv.includes("--apply");

let hasFailure = false;

function report(name, status) {
  console.log(`${name}=${status}`);
  if (status !== "present" && status !== "would_write" && status !== "written") {
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

const currentPlist = readFileSync(iosPlistPath, "utf8");
const googleAppId = plistValue(currentPlist, "GOOGLE_APP_ID");
if (!googleAppId) {
  report("IOS_GOOGLE_APP_ID", "missing");
  process.exit(1);
}
report("IOS_GOOGLE_APP_ID", "present");

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase.readonly"
  ]
});

const client = await auth.getClient();
const encodedAppId = encodeURIComponent(googleAppId);
let response;
try {
  response = await client.request({
    url: `https://firebase.googleapis.com/v1beta1/projects/${projectId}/iosApps/${encodedAppId}/config`
  });
} catch (error) {
  report("REMOTE_IOS_CONFIG", `failed_${String(error.response?.status ?? error.code ?? "request_failed")}`);
  process.exit(1);
}

const configFileContents = response.data?.configFileContents;
if (!configFileContents) {
  report("REMOTE_IOS_CONFIG", "missing");
  process.exit(1);
}
report("REMOTE_IOS_CONFIG", "present");

const remotePlist = Buffer.from(configFileContents, "base64").toString("utf8");
for (const key of ["GOOGLE_APP_ID", "API_KEY", "CLIENT_ID", "REVERSED_CLIENT_ID"]) {
  report(`REMOTE_IOS_${key}`, plistValue(remotePlist, key) ? "present" : "missing");
}

if (hasFailure) {
  process.exit(1);
}

if (shouldApply) {
  writeFileSync(iosPlistPath, remotePlist);
  report("IOS_GOOGLE_SERVICE_PLIST_WRITE", "written");
} else {
  report("IOS_GOOGLE_SERVICE_PLIST_WRITE", "would_write");
  console.log("NEXT_STEP=rerun_with_--apply_after_review");
}

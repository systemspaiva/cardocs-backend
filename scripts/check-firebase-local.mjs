import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const backendDir = process.cwd();
const workspaceDir = path.resolve(backendDir, "..");
const iosDir = path.resolve(workspaceDir, "cardocs");

let failed = false;

function report(name, ok, detail = ok ? "ok" : "missing") {
  console.log(`${name}=${detail}`);
  if (!ok) failed = true;
}

function read(relativePath, base = backendDir) {
  const filePath = path.resolve(base, relativePath);
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8");
}

function json(relativePath, base = backendDir) {
  const content = read(relativePath, base);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const firebaseJson = json("firebase.json");
report("FIREBASE_JSON", Boolean(firebaseJson));
report("FIREBASE_FUNCTIONS_REMOVED", !firebaseJson?.functions);
report("FIREBASE_HOSTING_PUBLIC", firebaseJson?.hosting?.public === "public");
const rewrites = firebaseJson?.hosting?.rewrites ?? [];
const cloudRunRewrite = (rewrite) => (
  rewrite.run?.serviceId === "cardocs-backend" &&
  rewrite.run?.region === "southamerica-east1"
);
report("FIREBASE_HOSTING_V1_CLOUD_RUN_REWRITE", rewrites.some((rewrite) => rewrite.source === "/v1/**" && cloudRunRewrite(rewrite)));
report("FIREBASE_HOSTING_PUBLIC_REPORT_CLOUD_RUN_REWRITE", rewrites.some((rewrite) => rewrite.source === "/r/**" && cloudRunRewrite(rewrite)));
report("FIREBASE_FIRESTORE_RULES_CONFIGURED", firebaseJson?.firestore?.rules === "firestore.rules");
report("FIREBASE_FIRESTORE_INDEXES_CONFIGURED", firebaseJson?.firestore?.indexes === "firestore.indexes.json");
const gcloudIgnore = read(".gcloudignore");
report("GCLOUD_IGNORE_EXCLUDES_LOCAL_ARTIFACTS", gcloudIgnore.includes("node_modules") && gcloudIgnore.includes("*-firebase-adminsdk-*.json"));

const firestoreRules = read("firestore.rules");
report("FIRESTORE_RULES_DENY_CLIENT_ACCESS", /allow\s+read,\s*write:\s*if\s+false/.test(firestoreRules));

const packageJson = json("package.json");
report("NODE_BUILD_SCRIPT", packageJson?.scripts?.build === "tsc");
report("NODE_START_SCRIPT", packageJson?.scripts?.start === "node lib/index.js");
report("NODE_CLOUD_RUN_DEPLOY_SCRIPT", packageJson?.scripts?.["deploy:run"] === "sh scripts/deploy-cloud-run.sh");
report("NODE_FIREBASE_HOSTING_DEPLOY_SCRIPT", packageJson?.scripts?.["deploy:hosting"] === "sh scripts/deploy-firebase-hosting.sh");
report("NODE_DEPLOY_REQUIRES_APPROVAL", read("scripts/deploy-cloud-run.sh").includes("CARDOCS_ALLOW_DEPLOY") && read("scripts/deploy-firebase-hosting.sh").includes("CARDOCS_ALLOW_DEPLOY"));
report("NODE_NO_FIREBASE_FUNCTIONS_DEPENDENCY", !packageJson?.dependencies?.["firebase-functions"]);
report("NODE_REMOTE_READINESS_SCRIPT", Boolean(packageJson?.scripts?.["check:firebase-readiness"]));
report("NODE_REMOTE_DEPLOY_READINESS_SCRIPT", Boolean(packageJson?.scripts?.["check:firebase-deploy-readiness"]));
report("NODE_SENSITIVE_FILE_CHECK_SCRIPT", Boolean(packageJson?.scripts?.["check:no-sensitive-files"]));

const server = read("src/index.ts");
report("NODE_LISTENS_ON_PORT", server.includes("process.env.PORT") && server.includes("app.listen"));
report("NODE_NO_FUNCTIONS_ONREQUEST", !server.includes("onRequest") && !server.includes("firebase-functions"));

const routes = read("src/interfaces/http/routes.ts");
report("API_HEALTH_ROUTE", routes.includes("/v1/health"));
report("API_FIREBASE_AUTH_VERIFICATION", routes.includes("verifyIdToken"));
report("API_INVALID_TOKEN_RETURNS_UNAUTHORIZED", routes.includes("Firebase ID token invalido ou expirado"));
report("API_PUBLIC_REPORT_ROUTE", routes.includes("/r/:slug"));
report("API_PROVIDER_CALLS_FAIL_CLOSED", routes.includes("Provider real de consulta por placa ainda nao esta configurado.") && routes.includes("Provider real de OCR/IA ainda nao esta configurado.") && routes.includes("Provider real de OCR/IA ainda nao esta configurado para salvar documentos."));
report("API_MANUAL_REGISTRATION_NOT_MARKED_VERIFIED", read("src/domain/factories.ts").includes("statusTags: [\"Placa cadastrada\"]") && read("src/domain/factories.ts").includes("image: null"));

const repository = read("src/infrastructure/firebaseGarageRepository.ts");
report("FIRESTORE_REPOSITORY", repository.includes("collection(\"users\")") && repository.includes("collection(\"vehicles\")"));
report("FIRESTORE_TRANSACTIONAL_WRITES", repository.includes("runTransaction"));
report("PUBLIC_REPORT_SLUG_OWNER_SCOPED", read("src/domain/factories.ts").includes("publicReportSlug") && repository.includes("publicReportSlug(vehicle)"));

const iosInfo = read("cardocs/Info.plist", iosDir);
report("IOS_API_BASE_URL_FIREBASE_HOSTING", iosInfo.includes("https://cardocs-app.web.app"));
report("IOS_GOOGLE_CALLBACK_BASE_SCHEME", iosInfo.includes("<string>cardocs</string>"));

const iosApp = read("cardocs/cardocsApp.swift", iosDir);
report("IOS_FIREBASE_APP_CONFIGURE", iosApp.includes("FirebaseApp.configure()"));
report("IOS_GOOGLE_OPEN_URL_HANDLER", iosApp.includes("GIDSignIn.sharedInstance.handle(url)"));

const remoteAuth = read("cardocs/Data/RemoteAuthRepository.swift", iosDir);
report("IOS_EMAIL_PASSWORD_AUTH", remoteAuth.includes("signIn(") && remoteAuth.includes("createUser("));
report("IOS_APPLE_AUTH", remoteAuth.includes("OAuthProvider.appleCredential"));
report("IOS_GOOGLE_AUTH", remoteAuth.includes("GoogleAuthProvider.credential"));
report("IOS_FIREBASE_ID_TOKEN_PROVIDER", remoteAuth.includes("getIDToken"));

const remoteVehicle = read("cardocs/Data/RemoteVehicleRepository.swift", iosDir);
report("IOS_API_RETRIES_401_WITH_REFRESH", remoteVehicle.includes("statusCode == 401") && remoteVehicle.includes("forceRefresh: true"));
report("IOS_NO_MOCK_REPOSITORIES", !existsSync(path.resolve(iosDir, "cardocs/Data/MockAuthRepository.swift")) && !existsSync(path.resolve(iosDir, "cardocs/Data/MockVehicleRepository.swift")));

const entitlements = read("cardocs/cardocs.entitlements", iosDir);
report("IOS_APPLE_SIGN_IN_ENTITLEMENT", entitlements.includes("com.apple.developer.applesignin"));

const forbiddenBackend = /Cognito|AWS|Dynamo|amazonaws|execute-api|Mercado Livre|MercadoLivre|api\.mercadolibre/.test(
  [
    routes,
    repository,
    server,
    read("src/domain/factories.ts"),
    read("README.md")
  ].join("\n")
);
report("BACKEND_NO_LEGACY_PROVIDER_REFERENCES", !forbiddenBackend);

process.exit(failed ? 1 : 0);

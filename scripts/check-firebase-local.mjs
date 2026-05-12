import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function readAllSourceFiles(relativeDir, base = backendDir) {
  const directoryPath = path.resolve(base, relativeDir);
  if (!existsSync(directoryPath)) return "";

  const entries = [];
  const pending = [directoryPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        entries.push(readFileSync(entryPath, "utf8"));
      }
    }
  }

  return entries.join("\n");
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
report("FIREBASE_HOSTING_REMOVED", !firebaseJson?.hosting);
report("FIREBASE_HOSTING_EMULATOR_REMOVED", !firebaseJson?.emulators?.hosting);
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
report("NODE_FIREBASE_HOSTING_DEPLOY_REMOVED", !packageJson?.scripts?.["deploy:hosting"] && !existsSync(path.resolve(backendDir, "scripts/deploy-firebase-hosting.sh")));
report("NODE_DEPLOY_REQUIRES_APPROVAL", read("scripts/deploy-cloud-run.sh").includes("CARDOCS_ALLOW_DEPLOY"));
report("NODE_DEPLOY_DEVELOP_ONLY", read("scripts/deploy-cloud-run.sh").includes("CARDOCS_DEPLOY_TARGET"));
report("NODE_NO_FIREBASE_FUNCTIONS_DEPENDENCY", !packageJson?.dependencies?.["firebase-functions"]);
report("NODE_REMOTE_READINESS_SCRIPT", Boolean(packageJson?.scripts?.["check:firebase-readiness"]));
report("NODE_REMOTE_DEPLOY_READINESS_SCRIPT", Boolean(packageJson?.scripts?.["check:firebase-deploy-readiness"]));
report("NODE_SENSITIVE_FILE_CHECK_SCRIPT", Boolean(packageJson?.scripts?.["check:no-sensitive-files"]));

const server = read("src/index.ts");
report("NODE_LISTENS_ON_PORT", server.includes("process.env.PORT") && server.includes("app.listen"));
report("NODE_NO_FUNCTIONS_ONREQUEST", !server.includes("onRequest") && !server.includes("firebase-functions"));

const routes = read("src/interfaces/http/routes.ts");
const schemas = read("src/interfaces/http/schemas.ts");
const domainModels = read("src/domain/models.ts");
const plateProvider = read("src/infrastructure/apiplacasVehicleDataProvider.ts");
const invoiceUseCase = read("src/application/invoiceAnalysis.ts");
const geminiProvider = read("src/infrastructure/geminiInvoiceExtractionProvider.ts");
const accountDeletionUseCase = read("src/application/accountDeletion.ts");
const accountDataStore = read("src/infrastructure/firebaseAccountDataStore.ts");
const accountAuthStore = read("src/infrastructure/firebaseAccountAuthStore.ts");
report("API_HEALTH_ROUTE", routes.includes("/v1/health"));
report("API_FIREBASE_AUTH_VERIFICATION", routes.includes("verifyIdToken"));
report("API_INVALID_TOKEN_RETURNS_UNAUTHORIZED", routes.includes("Firebase ID token invalido ou expirado"));
report("API_PUBLIC_REPORT_ROUTE", routes.includes("/r/:slug"));
report("API_ACCOUNT_DELETE_ROUTE", routes.includes("router.delete(\"/v1/me\"") && routes.includes("accountDeletion.deleteAccount(requireOwnerId(request))"));
report("API_ACCOUNT_DELETE_REMOVES_DATA_FIRST", accountDeletionUseCase.includes("deleteAllForUser(ownerId)") && accountDeletionUseCase.indexOf("deleteAllForUser(ownerId)") < accountDeletionUseCase.indexOf("deleteUser(ownerId)"));
report("API_ACCOUNT_DELETE_REMOVES_FIRESTORE", accountDataStore.includes("recursiveDelete(userRef)") && accountDataStore.includes("collection(\"publicReports\")"));
report("API_ACCOUNT_DELETE_REMOVES_STORAGE", accountDataStore.includes("deleteFiles") && accountDataStore.includes("prefix: `users/${sanitizePathSegment(ownerId)}/`"));
report("API_ACCOUNT_DELETE_REMOVES_AUTH_USER", accountAuthStore.includes("deleteUser(ownerId)") && accountAuthStore.includes("auth/user-not-found"));
report("API_PLATE_LOOKUP_USES_APIPLACAS_PROVIDER", routes.includes("plateLookup.lookup(body.plate)") && plateProvider.includes("APIPLACAS_TOKEN") && plateProvider.includes("https://wdapi2.com.br"));
report("API_VEHICLE_REGISTRATION_REVALIDATES_PLATE", routes.includes("await plateLookup.lookup(body.plate)") && routes.includes("plateVerified: true"));
report("API_INVOICE_ANALYSIS_USES_OCR_TEXT", routes.includes("invoiceAnalysis.analyze(body)") && invoiceUseCase.includes("ocrText.length"));
report(
  "API_INVOICE_GEMINI_DOCUMENT_DIRECT",
  invoiceUseCase.includes("documentExtractionProvider.extractFromDocument") &&
    geminiProvider.includes("extractFromDocument") &&
    geminiProvider.includes("inline_data") &&
    !invoiceUseCase.includes("ocrProvider.recognize")
);
report("API_INVOICE_GEMINI_EXPLICITLY_ENABLED", geminiProvider.includes("GEMINI_INVOICE_EXTRACTION_ENABLED") && geminiProvider.includes("GOOGLE_AI_API_KEY") && geminiProvider.includes("GEMINI_API_KEY") && geminiProvider.includes("generativelanguage.googleapis.com"));
report("API_INVOICE_SAVE_ACCEPTS_FIREBASE_AI_DRAFT", routes.includes("invoiceAnalysis.toAutomationResult(body.draft)") && schemas.includes("draft: invoiceDraftSchema"));
report("API_INVOICE_SAVE_ACCEPTS_MANUAL_ENTRY", domainModels.includes("InvoiceSource = DocumentSource | \"manualEntry\"") && schemas.includes("\"manualEntry\"") && invoiceUseCase.includes("draft.source === \"manualEntry\""));
report("API_INVOICE_SAVE_PERSISTS_AUTOMATION_RESULT", routes.includes("saveAutomationResult(requireOwnerId(request), body.vehicleID, result)"));
report("API_PUBLIC_REPORT_BASE_URL_CLOUD_RUN", read("src/domain/factories.ts").includes("https://cardocs-backend-5qq5b33fha-rj.a.run.app") && !read("src/domain/factories.ts").includes("cardocs-app.web.app"));

const repository = read("src/infrastructure/firebaseGarageRepository.ts");
report("FIRESTORE_REPOSITORY", repository.includes("collection(\"users\")") && repository.includes("collection(\"vehicles\")"));
report("FIRESTORE_TRANSACTIONAL_WRITES", repository.includes("runTransaction"));
report("PUBLIC_REPORT_SLUG_OWNER_SCOPED", read("src/domain/factories.ts").includes("publicReportSlug") && repository.includes("publicReportSlug(vehicle)"));

const iosInfo = read("cardocs/Info.plist", iosDir);
report("IOS_API_BASE_URL_CLOUD_RUN", iosInfo.includes("https://cardocs-backend-5qq5b33fha-rj.a.run.app") && !/https:\/\/cardocs-app(?:--[a-z0-9-]+)?\.web\.app/.test(iosInfo));
report("IOS_GEMINI_MODEL_CONFIGURED", iosInfo.includes("CARDOCS_GEMINI_MODEL"));
report("IOS_FIREBASE_AI_KILL_SWITCH_CONFIGURED", iosInfo.includes("CARDOCS_FIREBASE_AI_ENABLED"));
report("IOS_GOOGLE_CALLBACK_BASE_SCHEME", iosInfo.includes("<string>cardocs</string>"));
report("IOS_INVOICE_CAPTURE_PERMISSIONS", iosInfo.includes("NSCameraUsageDescription") && iosInfo.includes("NSPhotoLibraryUsageDescription"));

const iosApp = read("cardocs/cardocsApp.swift", iosDir);
report("IOS_FIREBASE_APP_CONFIGURE", iosApp.includes("FirebaseApp.configure()"));
report("IOS_FIREBASE_APP_CHECK_CONFIGURE", iosApp.includes("AppCheck.setAppCheckProviderFactory"));
report("IOS_GOOGLE_OPEN_URL_HANDLER", iosApp.includes("GIDSignIn.sharedInstance.handle(url)"));

const remoteAuth = read("cardocs/Data/RemoteAuthRepository.swift", iosDir);
report("IOS_EMAIL_PASSWORD_AUTH", remoteAuth.includes("signIn(") && remoteAuth.includes("createUser("));
report("IOS_APPLE_AUTH", remoteAuth.includes("OAuthProvider.appleCredential"));
report("IOS_GOOGLE_AUTH", remoteAuth.includes("GoogleAuthProvider.credential"));
report("IOS_FIREBASE_ID_TOKEN_PROVIDER", remoteAuth.includes("getIDToken"));
report("IOS_ACCOUNT_DELETE_CALLS_BACKEND", remoteAuth.includes("deleteAccountAndData()") && remoteAuth.includes("deleteNoResponseThrowing(\"/v1/me\""));

const appView = read("cardocs/Presentation/Views/CarDocsAppView.swift", iosDir);
const flowSheets = read("cardocs/Presentation/Views/CarDocsFlowSheets.swift", iosDir);
report("IOS_PROFILE_OPENS_ACCOUNT_SHEET", appView.includes("isShowingAccountSheet = true") && appView.includes("AccountOptionsSheet"));
report("IOS_ACCOUNT_SHEET_HAS_SIGN_OUT", flowSheets.includes("Sair da conta") && appView.includes("onSignOut()"));
report("IOS_ACCOUNT_SHEET_HAS_DELETE_CONFIRMATION", flowSheets.includes("Apagar conta e todos os dados") && flowSheets.includes("uppercased() == \"APAGAR\""));

const remoteVehicle = read("cardocs/Data/RemoteVehicleRepository.swift", iosDir);
report("IOS_API_RETRIES_401_WITH_REFRESH", remoteVehicle.includes("statusCode == 401") && remoteVehicle.includes("forceRefresh: true"));
const iosInvoiceFlow = read("cardocs/Presentation/ViewModels/CarDocsViewModel.swift", iosDir);
report(
  "IOS_INVOICE_ANALYSIS_USES_FIREBASE_AI_DOCUMENT_UPLOAD",
  iosInvoiceFlow.includes("DefaultInvoiceDocumentPreparer") &&
    iosInvoiceFlow.includes("document: preparedDocument.content") &&
    iosInvoiceFlow.includes("invoiceDraftAnalyzer.analyze(input)") &&
    !iosInvoiceFlow.includes("repository.analyzeInvoice(input)") &&
    remoteVehicle.includes("draft: draft")
);
report("IOS_INVOICE_MANUAL_ENTRY_FLOW", appView.includes("onManualDraft: viewModel.createManualInvoiceDraft") && iosInvoiceFlow.includes("func createManualInvoiceDraft") && flowSheets.includes("Digitar manualmente") && flowSheets.includes("LerNotaManualEntryView"));
report("IOS_NO_MOCK_REPOSITORIES", !existsSync(path.resolve(iosDir, "cardocs/Data/MockAuthRepository.swift")) && !existsSync(path.resolve(iosDir, "cardocs/Data/MockVehicleRepository.swift")));
report("IOS_PUBLIC_REPORT_BASE_URL_CLOUD_RUN", read("cardocs/Domain/VehicleModels.swift", iosDir).includes("https://cardocs-backend-5qq5b33fha-rj.a.run.app") && !read("cardocs/Domain/VehicleModels.swift", iosDir).includes("cardocs-app--develop-huam4c96.web.app"));

const entitlements = read("cardocs/cardocs.entitlements", iosDir);
report("IOS_APPLE_SIGN_IN_ENTITLEMENT", entitlements.includes("com.apple.developer.applesignin"));

const forbiddenBackend = /Cognito|AWS|Dynamo|amazonaws|execute-api|Mercado Livre|MercadoLivre|api\.mercadolibre/.test(
  [
    readAllSourceFiles("src"),
    read("README.md")
  ].join("\n")
);
report("BACKEND_NO_LEGACY_PROVIDER_REFERENCES", !forbiddenBackend);

process.exit(failed ? 1 : 0);

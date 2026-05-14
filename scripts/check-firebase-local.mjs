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
const appStoreVerifier = read("src/infrastructure/appStoreSubscriptionVerifier.ts");
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
report("API_SUBSCRIPTION_STATUS_ROUTE", routes.includes("router.get(\"/v1/subscription/status\"") && routes.includes("router.post(\"/v1/subscription/sync\"") && schemas.includes("syncSubscriptionSchema"));
report("API_SUBSCRIPTION_APP_STORE_JWS_VERIFICATION", appStoreVerifier.includes("SignedDataVerifier") && appStoreVerifier.includes("verifyAndDecodeTransaction") && routes.includes("subscriptionVerifier.verify(body.signedTransactionInfo,") && !routes.includes("expiresAt: body.expiresAt"));
report("API_SUBSCRIPTION_APP_ACCOUNT_TOKEN_BOUND", routes.includes("appAccountTokenForOwnerId(ownerId)") && appStoreVerifier.includes("transaction.appAccountToken") && appStoreVerifier.includes("expectedAppAccountToken"));
report("API_SUBSCRIPTION_FREE_DAYS_PRIORITY", read("src/infrastructure/firebaseUserRepository.ts").includes("freeDaysUntil") && read("src/infrastructure/firebaseUserRepository.ts").indexOf("reason: \"freeDays\"") < read("src/infrastructure/firebaseUserRepository.ts").indexOf("reason: \"subscription\""));
report("API_INVOICE_SCAN_REQUIRES_ACCESS", routes.includes("ensureInvoiceScanAccess(userRepository, requireOwnerId(request))") && routes.includes("body.draft.source !== \"manualEntry\" || body.sourceDocument?.document"));
report("API_INVOICE_SAVE_PERSISTS_AUTOMATION_RESULT", routes.includes("saveAutomationResult(requireOwnerId(request), body.vehicleID, result)"));
report("API_VEHICLE_TRANSFER_REQUEST_ROUTE", routes.includes("router.post(\"/v1/vehicle-transfers\"") && routes.includes("getAuth().getUserByEmail") && schemas.includes("vehicleTransferRequestSchema"));
report("API_VEHICLE_TRANSFER_RESPOND_ROUTE", routes.includes("router.post(\"/v1/vehicle-transfers/respond\"") && schemas.includes("vehicleTransferResponseSchema"));
report("API_PUSH_DEVICE_TOKEN_ROUTES", routes.includes("router.post(\"/v1/device-tokens\"") && routes.includes("router.post(\"/v1/device-tokens/remove\"") && schemas.includes("pushDeviceTokenRegistrationSchema"));
report("API_TRANSFER_SENDS_PUSH_NOTIFICATIONS", routes.includes("void pushNotifications?.notifyVehicleTransferRequested(transfer)") && routes.includes("void pushNotifications?.notifyVehicleTransferAccepted(result.transfer)") && routes.includes("void pushNotifications?.notifyVehicleTransferDeclined(result.transfer)"));
report("API_PUBLIC_REPORT_BASE_URL_CLOUD_RUN", read("src/domain/factories.ts").includes("https://cardocs-backend-5qq5b33fha-rj.a.run.app") && !read("src/domain/factories.ts").includes("cardocs-app.web.app"));

const repository = read("src/infrastructure/firebaseGarageRepository.ts");
const pushUseCase = read("src/application/pushNotifications.ts");
const pushTokenStore = read("src/infrastructure/firebasePushDeviceTokenStore.ts");
const pushSender = read("src/infrastructure/firebaseCloudMessagingPushSender.ts");
report("FIRESTORE_REPOSITORY", repository.includes("collection(\"users\")") && repository.includes("collection(\"vehicles\")"));
report("FIRESTORE_TRANSACTIONAL_WRITES", repository.includes("runTransaction"));
report("FIRESTORE_VEHICLE_TRANSFER_MOVES_HISTORY", repository.includes("createVehicleTransferRequest") && repository.includes("respondToVehicleTransfer") && repository.includes("copyVehicleSubcollection") && repository.includes("transaction.delete(sourceVehicleRef)"));
report("FIRESTORE_OUTGOING_TRANSFER_STATUS_IN_DASHBOARD", repository.includes("loadOutgoingVehicleTransfers") && repository.includes("outgoingVehicleTransfers") && read("src/domain/models.ts").includes("interface OutgoingVehicleTransfer"));
report("FIRESTORE_OUTGOING_TRANSFER_PRESERVES_VEHICLE_DISPLAY", repository.includes("vehiclePlate: vehicle.plate") && repository.includes("vehicleTitle: `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.plate"));
const incomingTransfersLoader = repository.match(/private async loadIncomingVehicleTransfers[\s\S]*?private async loadOutgoingVehicleTransfers/)?.[0] ?? "";
report("FIRESTORE_INCOMING_TRANSFER_HISTORY_IN_DASHBOARD", incomingTransfersLoader.includes("incomingVehicleTransfers") && !incomingTransfersLoader.includes("transfer.status === \"pending\""));
report("FIRESTORE_PUSH_TOKENS_OWNER_SCOPED", pushTokenStore.includes("collection(\"pushDeviceTokens\")") && pushTokenStore.includes("createHash(\"sha256\")") && pushTokenStore.includes("doc(ownerId)"));
report("FIRESTORE_PUSH_TOKEN_GLOBAL_OWNERSHIP", pushTokenStore.includes("globalTokenRef") && pushTokenStore.includes("previousOwnerId") && pushTokenStore.includes("transaction.delete(this.tokenRef(previousOwnerId, registration.token))"));
report("FCM_PUSH_SENDER_BEST_EFFORT", pushUseCase.includes("sendBestEffort") && pushUseCase.includes("invalidTokens") && pushUseCase.includes("notifyVehicleTransferDeclined") && pushSender.includes("sendEachForMulticast"));
report("FIRESTORE_TRANSFER_SINGLE_PENDING_PER_VEHICLE", repository.includes("outgoingVehicleTransferRef") && repository.includes("Este veiculo ja possui uma transferencia pendente.") && repository.includes("toPendingOutgoingVehicleTransfer"));
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
report("IOS_PUSH_DELEGATE_CONFIGURED", iosApp.includes("@UIApplicationDelegateAdaptor(CarDocsAppDelegate.self)") && iosApp.includes("PushNotificationRegistrationService.shared.configure()"));

const remoteAuth = read("cardocs/Data/RemoteAuthRepository.swift", iosDir);
report("IOS_EMAIL_PASSWORD_AUTH", remoteAuth.includes("signIn(") && remoteAuth.includes("createUser("));
report("IOS_APPLE_AUTH", remoteAuth.includes("OAuthProvider.appleCredential"));
report("IOS_GOOGLE_AUTH", remoteAuth.includes("GoogleAuthProvider.credential"));
report("IOS_FIREBASE_ID_TOKEN_PROVIDER", remoteAuth.includes("getIDToken"));
report("IOS_ACCOUNT_DELETE_CALLS_BACKEND", remoteAuth.includes("deleteAccountAndData()") && remoteAuth.includes("deleteNoResponseThrowing(\"/v1/me\""));

const appView = read("cardocs/Presentation/Views/CarDocsAppView.swift", iosDir);
const flowSheets = read("cardocs/Presentation/Views/CarDocsFlowSheets.swift", iosDir);
const subscriptionView = read("cardocs/Presentation/Views/SubscriptionView.swift", iosDir);
const subscriptionViewModel = read("cardocs/Presentation/ViewModels/SubscriptionViewModel.swift", iosDir);
const storeKitSubscriptionClient = read("cardocs/Data/StoreKitSubscriptionClient.swift", iosDir);
report("IOS_PROFILE_OPENS_ACCOUNT_SHEET", appView.includes("isShowingAccountSheet = true") && appView.includes("AccountOptionsSheet"));
report("IOS_ACCOUNT_SHEET_HAS_SIGN_OUT", flowSheets.includes("Sair da conta") && appView.includes("onSignOut()"));
report("IOS_ACCOUNT_SHEET_HAS_DELETE_CONFIRMATION", flowSheets.includes("Apagar conta e todos os dados") && flowSheets.includes("uppercased() == \"APAGAR\""));

const remoteVehicle = read("cardocs/Data/RemoteVehicleRepository.swift", iosDir);
report("IOS_API_RETRIES_401_WITH_REFRESH", remoteVehicle.includes("statusCode == 401") && remoteVehicle.includes("forceRefresh: true"));
const iosInvoiceFlow = read("cardocs/Presentation/ViewModels/CarDocsViewModel.swift", iosDir);
const iosPushRegistration = read("cardocs/Data/PushNotificationRegistrationService.swift", iosDir);
report(
  "IOS_INVOICE_ANALYSIS_USES_FIREBASE_AI_DOCUMENT_UPLOAD",
  iosInvoiceFlow.includes("DefaultInvoiceDocumentPreparer") &&
    iosInvoiceFlow.includes("document: preparedDocument.content") &&
    iosInvoiceFlow.includes("invoiceDraftAnalyzer.analyze(input)") &&
    !iosInvoiceFlow.includes("repository.analyzeInvoice(input)") &&
    remoteVehicle.includes("draft: draft")
);
report("IOS_INVOICE_MANUAL_ENTRY_FLOW", appView.includes("onManualDraft: viewModel.createManualInvoiceDraft") && iosInvoiceFlow.includes("func createManualInvoiceDraft") && flowSheets.includes("Digitar manualmente") && flowSheets.includes("LerNotaManualEntryView"));
report("IOS_SUBSCRIPTION_BOTTOM_TAB", iosInvoiceFlow.includes("case subscription = \"Assinatura\"") && appView.includes("SubscriptionView(viewModel: subscriptionViewModel)") && read("cardocs/Presentation/Components/CarDocsComponents.swift", iosDir).includes("ForEach(CarDocsTab.allCases)"));
report("IOS_SUBSCRIPTION_STOREKIT_PRODUCTS", storeKitSubscriptionClient.includes("com.paivaapps.cardocs.premium.monthly") && storeKitSubscriptionClient.includes("com.paivaapps.cardocs.premium.annual") && iosInfo.includes("CARDOCS_SUBSCRIPTION_MONTHLY_PRODUCT_ID") && iosInfo.includes("CARDOCS_SUBSCRIPTION_ANNUAL_PRODUCT_ID"));
report("IOS_SUBSCRIPTION_PRICE_FROM_STOREKIT_ONLY", storeKitSubscriptionClient.includes("displayPrice: product.displayPrice") && !storeKitSubscriptionClient.includes("fallbackPrice") && !read("cardocs/Domain/SubscriptionModels.swift", iosDir).includes("R$"));
report("IOS_SUBSCRIPTION_PURCHASES_BOUND_TO_ACCOUNT", storeKitSubscriptionClient.includes(".appAccountToken(appAccountToken)") && subscriptionViewModel.includes("updateAppAccountToken") && appView.includes("subscriptionViewModel.updateAppAccountToken(session?.id)"));
report("IOS_SUBSCRIPTION_FREE_DAYS_BEFORE_STOREKIT", subscriptionViewModel.includes("backendStatus.isOnFreeDays") && subscriptionViewModel.indexOf("backendStatus.isOnFreeDays") < subscriptionViewModel.indexOf("storeKit.currentEntitlement()"));
report("IOS_SUBSCRIPTION_RESTORE_PURCHASES", storeKitSubscriptionClient.includes("AppStore.sync()") && subscriptionView.includes("Restaurar compras") && subscriptionViewModel.includes("restorePurchases()"));
report("IOS_INVOICE_SCAN_GATED_BY_SUBSCRIPTION", appView.includes("hasInvoiceScanAccess: subscriptionViewModel.hasInvoiceScanAccess") && appView.includes("onValidateInvoiceScanAccess: subscriptionViewModel.refreshInvoiceScanAccess") && flowSheets.includes("validateFreshInvoiceScanAccess") && flowSheets.includes("onRequestSubscription()") && subscriptionView.includes("7 dias grátis"));
report("IOS_MANUAL_INVOICE_STAYS_AVAILABLE_WITHOUT_SUBSCRIPTION", flowSheets.includes("onManual: openManualEntry") && flowSheets.includes("Você pode continuar digitando a nota manualmente sem pagar."));
report(
  "IOS_RESALE_FLOW_REQUESTS_TRANSFER_BY_EMAIL",
  appView.includes("VehicleTransferRequestSheet") &&
    iosInvoiceFlow.includes("func requestVehicleTransfer") &&
    remoteVehicle.includes("/v1/vehicle-transfers") &&
    flowSheets.includes("recipientEmail") &&
    flowSheets.includes("keyboardType: .emailAddress")
);
report("IOS_OUTGOING_TRANSFER_REFRESH_AFTER_REQUEST", iosInvoiceFlow.includes("let selectedGarageID = dashboard?.selectedGarageID") && iosInvoiceFlow.includes("repository.loadDashboard()") && iosInvoiceFlow.includes("dashboard = refreshed"));
report("IOS_INCOMING_TRANSFER_BOTTOM_SHEET", appView.includes("VehicleTransferAcceptanceSheet") && iosInvoiceFlow.includes("func respondToVehicleTransfer") && read("cardocs/Domain/VehicleModels.swift", iosDir).includes("incomingVehicleTransfers"));
report("IOS_TRANSFER_STATUS_TAB", iosInvoiceFlow.includes("case transfers = \"Transferências\"") && appView.includes("case .transfers") && appView.includes("TransfersView"));
report("IOS_INCOMING_TRANSFER_HISTORY_SCREEN", appView.includes("IncomingTransferStatusSection") && appView.includes("onRespondToIncomingTransfer") && iosInvoiceFlow.includes("func openIncomingTransfer") && iosInvoiceFlow.includes("first { $0.status == .pending }"));
report("IOS_EMPTY_GARAGE_TRANSFER_STATUS_SCROLL_REFRESH", appView.includes("EmptyGarageView(") && appView.includes("incomingTransfers: dashboard.incomingVehicleTransfers") && appView.includes(".refreshable {") && appView.includes("await viewModel.refreshDashboard()"));
report("IOS_ACCEPTED_TRANSFER_SELECTS_RECEIVED_VEHICLE", iosInvoiceFlow.includes("updatedDashboard.selectGarage(id: result.transfer.vehicleID)") && iosInvoiceFlow.includes("presentIncomingVehicleTransferIfNeeded(from: updatedDashboard)"));
report(
  "IOS_OUTGOING_TRANSFER_STATUS_SECTION",
  appView.includes("OutgoingTransferStatusSection") &&
    appView.includes("OutgoingVehicleTransfer") &&
    read("cardocs/Domain/VehicleModels.swift", iosDir).includes("outgoingVehicleTransfers")
);
report("IOS_PUSH_TOKEN_REGISTERS_WITH_BACKEND", iosPushRegistration.includes("FirebaseMessaging") && iosPushRegistration.includes("UNUserNotificationCenter") && iosPushRegistration.includes("/v1/device-tokens") && iosPushRegistration.includes("/v1/device-tokens/remove"));
report("IOS_PUSH_REFRESHES_DASHBOARD", iosPushRegistration.includes("didReceive response: UNNotificationResponse") && iosPushRegistration.includes("carDocsPushNotificationReceived") && read("cardocs/ContentView.swift", iosDir).includes("carDocsViewModel.refreshDashboard()"));
report("IOS_NO_MOCK_REPOSITORIES", !existsSync(path.resolve(iosDir, "cardocs/Data/MockAuthRepository.swift")) && !existsSync(path.resolve(iosDir, "cardocs/Data/MockVehicleRepository.swift")));
report("IOS_PUBLIC_REPORT_BASE_URL_CLOUD_RUN", read("cardocs/Domain/VehicleModels.swift", iosDir).includes("https://cardocs-backend-5qq5b33fha-rj.a.run.app") && !read("cardocs/Domain/VehicleModels.swift", iosDir).includes("cardocs-app--develop-huam4c96.web.app"));

const entitlements = read("cardocs/cardocs.entitlements", iosDir);
report("IOS_APPLE_SIGN_IN_ENTITLEMENT", entitlements.includes("com.apple.developer.applesignin"));
report("IOS_PUSH_ENTITLEMENT", entitlements.includes("aps-environment") && entitlements.includes("$(APS_ENVIRONMENT)") && read("Podfile", iosDir).includes("FirebaseMessaging"));

const forbiddenBackend = /Cognito|AWS|Dynamo|amazonaws|execute-api|Mercado Livre|MercadoLivre|api\.mercadolibre/.test(
  [
    readAllSourceFiles("src"),
    read("README.md")
  ].join("\n")
);
report("BACKEND_NO_LEGACY_PROVIDER_REFERENCES", !forbiddenBackend);

process.exit(failed ? 1 : 0);

import { NextFunction, Request, Response, Router } from "express";
import { randomUUID } from "crypto";
import { getAuth, type DecodedIdToken, type UserRecord } from "firebase-admin/auth";
import { DocumentAttachmentStore } from "../../application/documentAttachments.js";
import { DeleteAccountUseCase } from "../../application/accountDeletion.js";
import { buildAutomotiveChatContext, sanitizeAutomotiveChatMessages } from "../../application/automotiveChatContext.js";
import { PushNotificationService } from "../../application/pushNotifications.js";
import { CardocsIaGateway } from "../../application/cardocsIaGateway.js";
import {
  GooglePlayPurchaseVerifier,
  GooglePlaySubscriptionSyncService,
  SubscriptionTransactionVerifier,
  appStoreSubscriptionMetadata
} from "../../application/subscriptions.js";
import {
  deterministicUuid,
  partReplacementCatalog,
  publicReportSlug,
  toManualVehicleProfile,
  toVehicleProfile
} from "../../domain/factories.js";
import {
  InvoiceDocumentInput,
  ResaleDossier,
  VehicleGarage,
  VaultDocumentKind
} from "../../domain/models.js";
import { VehicleImageLookupUseCase, VehicleImageProvider } from "../../application/vehicleImageLookup.js";
import { InvoiceAnalysisUseCase } from "../../application/invoiceAnalysis.js";
import { VehiclePlateDataProvider, VehiclePlateLookupUseCase } from "../../application/vehiclePlateLookup.js";
import { FirebaseGarageRepository } from "../../infrastructure/firebaseGarageRepository.js";
import { FirebaseUserRepository } from "../../infrastructure/firebaseUserRepository.js";
import { ForbiddenError, NotFoundError, ProviderNotConfiguredError, UnauthorizedError, ValidationError } from "../../application/errors.js";
import {
  createInvoicePartReplacementSchema,
  createPartReplacementSchema,
  createVehicleInsuranceSchema,
  deleteVehicleSchema,
  createVehicleDocumentSchema,
  invoiceDocumentInputSchema,
  partReplacementRecommendationSchema,
  plateLookupSchema,
  pushDeviceTokenRegistrationSchema,
  pushDeviceTokenRemovalSchema,
  removePartReplacementSchema,
  resaleDossierRequestSchema,
  saveInvoiceSchema,
  syncGooglePlaySubscriptionSchema,
  syncSubscriptionSchema,
  syncUserProfileSchema,
  updateMaintenanceRecordSchema,
  updateVaultDocumentSchema,
  vehicleTransferRequestSchema,
  vehicleTransferResponseSchema,
  vehicleImageLookupSchema,
  vehicleRegistrationSchema,
  manualVehicleRegistrationSchema,
  addVehiclePhotoSchema,
  automotiveChatRequestSchema,
  removeVehiclePhotoSchema,
  reorderVehiclePhotosSchema,
  updateMileageSchema,
  updateVehiclePhotoSchema
} from "./schemas.js";

interface AuthenticatedRequest extends Request {
  ownerId?: string;
  authToken?: DecodedIdToken;
}

export interface FirebaseIdTokenVerifier {
  verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
}

const unauthorizedFirebaseIdTokenErrorCodes = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-disabled",
  "auth/user-not-found"
]);
const firebaseIdTokenShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function verifyAuthenticatedFirebaseIdToken(
  idToken: string,
  verifier: FirebaseIdTokenVerifier = getAuth()
): Promise<DecodedIdToken> {
  if (!firebaseIdTokenShape.test(idToken)) {
    throw new UnauthorizedError("Firebase ID token invalido, expirado ou revogado.");
  }
  try {
    return await verifier.verifyIdToken(idToken, true);
  } catch (error) {
    if (!isUnauthorizedFirebaseIdTokenError(error)) {
      throw error;
    }
    throw new UnauthorizedError("Firebase ID token invalido, expirado ou revogado.");
  }
}

function isUnauthorizedFirebaseIdTokenError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return unauthorizedFirebaseIdTokenErrorCodes.has(String(error.code));
}

export function createRouter(
  repository: FirebaseGarageRepository,
  userRepository: FirebaseUserRepository,
  accountDeletion: DeleteAccountUseCase,
  vehiclePlateProvider: VehiclePlateDataProvider | null = null,
  vehicleImageProvider: VehicleImageProvider | null = null,
  cardocsIa: CardocsIaGateway | null = null,
  documentAttachmentStore: DocumentAttachmentStore | null = null,
  pushNotifications: PushNotificationService | null = null,
  subscriptionVerifier: SubscriptionTransactionVerifier | null = null,
  googlePlaySubscriptionVerifier: GooglePlayPurchaseVerifier | null = null
): Router {
  const router = Router();
  const plateLookup = new VehiclePlateLookupUseCase(vehiclePlateProvider);
  const imageLookup = new VehicleImageLookupUseCase(vehicleImageProvider);
  const invoiceAnalysis = new InvoiceAnalysisUseCase();
  const googlePlaySubscriptions = googlePlaySubscriptionVerifier
    ? new GooglePlaySubscriptionSyncService(googlePlaySubscriptionVerifier, userRepository)
    : null;

  router.get("/v1/health", (_request, response) => {
    response.json({ status: "UP", runtime: "node" });
  });

  router.get("/v1/public/reports/:slug", asyncHandler(async (request, response) => {
    response.json(await repository.findPublicDossier(String(request.params.slug)));
  }));

  router.get("/r/:slug", asyncHandler(async (request, response) => {
    const dossier = await repository.findPublicDossier(String(request.params.slug));
    response.type("html").send(renderPublicDossierPage(dossier));
  }));

  router.use("/v1", asyncHandler(authenticateFirebaseToken));

  router.post("/v1/me", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = syncUserProfileSchema.parse(request.body ?? {});
    const authToken = requireAuthToken(request);
    const userRecord = await getAuth().getUser(authToken.uid);
    response.json(await userRepository.upsertFromAuth(toUserProfile(authToken, userRecord), body.legalAcceptance));
  }));

  router.delete("/v1/me", asyncHandler(async (request: AuthenticatedRequest, response) => {
    await accountDeletion.deleteAccount(requireOwnerId(request));
    response.status(204).send();
  }));

  router.post("/v1/device-tokens", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = pushDeviceTokenRegistrationSchema.parse(request.body);
    await pushNotifications?.registerDeviceToken(requireOwnerId(request), body);
    response.status(204).send();
  }));

  router.post("/v1/device-tokens/remove", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = pushDeviceTokenRemovalSchema.parse(request.body);
    await pushNotifications?.unregisterDeviceToken(requireOwnerId(request), body.token);
    response.status(204).send();
  }));

  router.get("/v1/dashboard", asyncHandler(async (request: AuthenticatedRequest, response) => {
    response.json(await repository.loadDashboard(requireOwnerId(request)));
  }));

  router.get("/v1/subscription/status", asyncHandler(async (request: AuthenticatedRequest, response) => {
    response.json(await userRepository.getUserAccessStatus(requireOwnerId(request)));
  }));

  router.post("/v1/subscription/sync", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = syncSubscriptionSchema.parse(request.body);
    if (!subscriptionVerifier) {
      throw new ProviderNotConfiguredError("Validador de assinatura da App Store nao configurado.");
    }
    const ownerId = requireOwnerId(request);
    await userRepository.syncSubscription(
      ownerId,
      await subscriptionVerifier.verify(body.signedTransactionInfo),
      appStoreSubscriptionMetadata
    );
    response.status(204).send();
  }));

  router.post("/v1/subscription/google-play/sync", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = syncGooglePlaySubscriptionSchema.parse(request.body);
    if (!googlePlaySubscriptions) {
      throw new ProviderNotConfiguredError("Validador de assinatura Google Play nao configurado.");
    }
    await googlePlaySubscriptions.sync(body, requireOwnerId(request));
    response.status(204).send();
  }));

  router.delete("/v1/subscription", asyncHandler(async (request: AuthenticatedRequest, response) => {
    await userRepository.clearSubscription(requireOwnerId(request));
    response.status(204).send();
  }));

  router.post("/v1/vehicles/plate-lookup", asyncHandler(async (request, response) => {
    const body = plateLookupSchema.parse(request.body);
    response.json(await plateLookup.lookup(body.plate));
  }));

  router.post("/v1/vehicles/image", asyncHandler(async (request, response) => {
    const body = vehicleImageLookupSchema.parse(request.body);
    const image = await imageLookup.lookup(body);
    if (!image) {
      response.status(404).send();
      return;
    }

    response.json(image);
  }));

  router.post("/v1/vehicles", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = vehicleRegistrationSchema.parse(request.body);
    const candidate = await plateLookup.lookup(body.plate);
    const vehicle = toVehicleProfile(requireOwnerId(request), candidate, body.initialMileage, { plateVerified: true });
    response.status(201).json(await repository.saveVehicle(requireOwnerId(request), vehicle));
  }));

  router.post("/v1/vehicles/manual", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = manualVehicleRegistrationSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const vehicle = toManualVehicleProfile(ownerId, body);
    response.status(201).json(await repository.saveVehicle(ownerId, vehicle));
  }));

  router.delete("/v1/vehicles/:vehicleID", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = deleteVehicleSchema.parse({
      vehicleID: request.params.vehicleID
    });
    response.json(await repository.deleteVehicle(requireOwnerId(request), body.vehicleID));
  }));

  router.post("/v1/vehicles/mileage", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = updateMileageSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const updated = await repository.updateMileage(ownerId, body.vehicleID, body.mileage);
    enqueueResaleDossierRefresh(repository, cardocsIa, ownerId, body.vehicleID, "mileage_updated");
    response.json(updated);
  }));

  router.post("/v1/vehicles/photo", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = updateVehiclePhotoSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const updated = await repository.updateVehiclePhoto(ownerId, body.vehicleID, {
      mimeType: body.mimeType,
      base64Data: body.base64Data
    });
    response.json(updated);
  }));

  router.post("/v1/vehicles/photos/add", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = addVehiclePhotoSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const updated = await repository.addVehiclePhoto(ownerId, body.vehicleID, {
      mimeType: body.mimeType,
      base64Data: body.base64Data,
      makePrimary: body.makePrimary
    });
    response.json(updated);
  }));

  router.post("/v1/vehicles/photos/remove", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = removeVehiclePhotoSchema.parse(request.body);
    const updated = await repository.removeVehiclePhoto(requireOwnerId(request), body.vehicleID, body.photoURL);
    response.json(updated);
  }));

  router.post("/v1/vehicles/photos/reorder", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = reorderVehiclePhotosSchema.parse(request.body);
    const updated = await repository.reorderVehiclePhotos(requireOwnerId(request), body.vehicleID, body.photoURLs);
    response.json(updated);
  }));

  router.post("/v1/invoices/analyze", asyncHandler(async (request: AuthenticatedRequest, response) => {
    await ensureInvoiceScanAccess(userRepository, requireOwnerId(request));
    const body = invoiceDocumentInputSchema.parse(request.body);
    response.json(await requireCardocsIa(cardocsIa).analyzeInvoice(body));
  }));

  router.post("/v1/invoices", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = saveInvoiceSchema.parse(request.body);
    if (body.draft.source !== "manualEntry" || body.sourceDocument?.document) {
      await ensureInvoiceScanAccess(userRepository, requireOwnerId(request));
    }

    const result = invoiceAnalysis.toAutomationResult(body.draft);
    if (body.sourceDocument?.document) {
      await repository.ensureVehicleExists(requireOwnerId(request), body.vehicleID);
      const attachment = await uploadRequiredAttachment(documentAttachmentStore, {
        ownerId: requireOwnerId(request),
        vehicleId: body.vehicleID,
        documentId: result.document.id,
        kind: "expenseReceipt",
        document: body.sourceDocument
      });
      result.record.attachment = attachment;
      result.document.attachment = attachment;
    }

    // Enriquece os entries de vida útil com serviceDate da NF — sem isso
    // o saveAutomationResult não consegue persistir as trocas de peça
    // detectadas pela IA no momento do scan.
    const partLifeEntries = body.partLifeEntries.map((entry) => ({
      ...entry,
      serviceDate: body.draft.date
    }));

    const ownerId = requireOwnerId(request);
    const dashboard = await repository.saveAutomationResult(
      ownerId,
      body.vehicleID,
      result,
      partLifeEntries
    );
    if (partLifeEntries.length > 0) {
      enqueueResaleDossierRefresh(repository, cardocsIa, ownerId, body.vehicleID, "part_replaced");
    }
    response.status(201).json(dashboard);
  }));

  router.post("/v1/part-replacements", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = createPartReplacementSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    await repository.savePartReplacement(ownerId, body);
    enqueueResaleDossierRefresh(repository, cardocsIa, ownerId, body.vehicleID, "part_replaced");
    response.status(201).json(await repository.loadDashboard(ownerId));
  }));

  router.post("/v1/part-replacements/from-invoice", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = createInvoicePartReplacementSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    await repository.saveInvoicePartReplacement(ownerId, body);
    enqueueResaleDossierRefresh(repository, cardocsIa, ownerId, body.vehicleID, "part_replaced");
    response.status(201).json(await repository.loadDashboard(ownerId));
  }));

  router.post("/v1/part-replacements/remove", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = removePartReplacementSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const dashboard = await repository.removePartReplacement(ownerId, body);
    enqueueResaleDossierRefresh(repository, cardocsIa, ownerId, body.vehicleID, "part_replaced");
    response.json(dashboard);
  }));

  router.post("/v1/part-replacements/recommendation", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = partReplacementRecommendationSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const canUseAi = await hasPartRecommendationAiAccess(userRepository, ownerId);
    response.json(await requireCardocsIa(cardocsIa).recommendPartReplacement({
      partName: body.partName,
      useProvider: canUseAi
    }));
  }));

  router.get("/v1/part-replacements/catalog", asyncHandler(async (_request: AuthenticatedRequest, response) => {
    response.json(partReplacementCatalog());
  }));

  router.post("/v1/ai/chat", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = automotiveChatRequestSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    await ensureAutomotiveChatAccess(userRepository, ownerId);
    const dashboard = await repository.loadDashboard(ownerId);
    const gateway = requireCardocsIa(cardocsIa);
    const controller = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    });
    writeSseHeaders(response);
    try {
      for await (const event of gateway.streamAutomotiveChat({
        messages: sanitizeAutomotiveChatMessages(body.messages),
        context: buildAutomotiveChatContext(dashboard)
      }, { signal: controller.signal })) {
        if (response.destroyed) {
          controller.abort();
          break;
        }
        writeSseEvent(response, event.type, event);
      }
    } catch (error) {
      console.warn("automotive_chat_stream_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
      if (!response.destroyed) {
        writeSseEvent(response, "error", {
          type: "error",
          message: "A IA automotiva nao conseguiu responder agora."
        });
      }
    } finally {
      response.end();
    }
  }));

  router.post("/v1/vehicle-insurance", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = createVehicleInsuranceSchema.parse(request.body);
    response.status(201).json(await repository.saveVehicleInsurance(requireOwnerId(request), body));
  }));

  router.post("/v1/documents", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = createVehicleDocumentSchema.parse(request.body);
    const documentId = randomUUID();
    await repository.ensureVehicleExists(requireOwnerId(request), body.vehicleID);
    const attachment = await uploadRequiredAttachment(documentAttachmentStore, {
      ownerId: requireOwnerId(request),
      vehicleId: body.vehicleID,
      documentId,
      kind: "vehicleDocument",
      document: body.sourceDocument
    });

    response.status(201).json(await repository.saveVaultDocument(requireOwnerId(request), body.vehicleID, {
      id: documentId,
      title: body.title,
      date: body.date,
      amount: 0,
      status: "Anexado",
      kind: "vehicleDocument",
      checklistKind: body.checklistKind ?? null,
      documentType: body.documentType,
      notes: body.notes ?? null,
      supplierName: null,
      serviceTitle: body.title,
      purchaseSummary: body.documentType,
      source: body.sourceDocument.source,
      lineItems: [],
      attachment
    }));
  }));

  router.post("/v1/documents/update", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = updateVaultDocumentSchema.parse(request.body);
    const { vehicleID, documentID, ...update } = body;
    response.json(await repository.updateVaultDocument(requireOwnerId(request), vehicleID, documentID, update));
  }));

  router.post("/v1/maintenance-records/update", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = updateMaintenanceRecordSchema.parse(request.body);
    const { vehicleID, recordID, ...update } = body;
    response.json(await repository.updateMaintenanceRecord(requireOwnerId(request), vehicleID, recordID, update));
  }));

  router.post("/v1/resale-dossiers", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = resaleDossierRequestSchema.parse(request.body);
    const ownerId = requireOwnerId(request);
    const dossier = await refreshResaleDossierWithAi(repository, requireCardocsIa(cardocsIa), ownerId, body.vehicleID, "manual", { failOnError: true });
    if (!dossier) {
      throw new ProviderNotConfiguredError("Backend de IA ainda nao configurado.");
    }
    response.json(dossier);
  }));

  router.post("/v1/vehicle-transfers", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = vehicleTransferRequestSchema.parse(request.body);
    const authToken = requireAuthToken(request);
    const targetUser = await findUserByEmail(body.recipientEmail);
    const ownerId = requireOwnerId(request);
    if (targetUser.uid === ownerId) {
      throw new ValidationError("Informe o e-mail de outro usuario para transferir o veiculo.");
    }

    const transfer = await repository.createVehicleTransferRequest({
      fromOwnerId: ownerId,
      fromOwnerEmail: authToken.email ?? null,
      fromOwnerName: authToken.name ?? null,
      toOwnerId: targetUser.uid,
      toOwnerEmail: targetUser.email ?? body.recipientEmail,
      vehicleId: body.vehicleID
    });
    void pushNotifications?.notifyVehicleTransferRequested(transfer);
    response.status(201).json(transfer);
  }));

  router.post("/v1/vehicle-transfers/respond", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = vehicleTransferResponseSchema.parse(request.body);
    const result = await repository.respondToVehicleTransfer(
      requireOwnerId(request),
      body.transferID,
      body.action
    );
    if (body.action === "accept") {
      void pushNotifications?.notifyVehicleTransferAccepted(result.transfer);
    } else {
      void pushNotifications?.notifyVehicleTransferDeclined(result.transfer);
    }
    response.json(result);
  }));

  return router;
}

async function findUserByEmail(email: string): Promise<UserRecord> {
  try {
    return await getAuth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new NotFoundError("Usuario nao encontrado para este e-mail.");
    }
    throw error;
  }
}

async function uploadRequiredAttachment(
  store: DocumentAttachmentStore | null,
  input: {
    ownerId: string;
    vehicleId: string;
    documentId: string;
    kind: VaultDocumentKind;
    document: InvoiceDocumentInput;
  }
) {
  if (!store) {
    throw new ProviderNotConfiguredError("Firebase Storage ainda nao configurado para anexos.");
  }

  return store.save(input);
}

async function authenticateFirebaseToken(request: AuthenticatedRequest, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new UnauthorizedError();
  }

  const decodedToken = await verifyAuthenticatedFirebaseIdToken(match[1]);

  request.ownerId = decodedToken.uid;
  request.authToken = decodedToken;
  next();
}

function requireOwnerId(request: AuthenticatedRequest): string {
  if (!request.ownerId) {
    throw new UnauthorizedError();
  }
  return request.ownerId;
}

function requireAuthToken(request: AuthenticatedRequest): DecodedIdToken {
  if (!request.authToken) {
    throw new UnauthorizedError();
  }
  return request.authToken;
}

function requireCardocsIa(cardocsIa: CardocsIaGateway | null): CardocsIaGateway {
  if (!cardocsIa) {
    throw new ProviderNotConfiguredError("Backend de IA ainda nao configurado.");
  }
  return cardocsIa;
}

function enqueueResaleDossierRefresh(
  repository: FirebaseGarageRepository,
  cardocsIa: CardocsIaGateway | null,
  ownerId: string,
  vehicleId: string,
  trigger: "mileage_updated" | "part_replaced"
): void {
  void refreshResaleDossierWithAi(repository, cardocsIa, ownerId, vehicleId, trigger);
}

async function refreshResaleDossierWithAi(
  repository: FirebaseGarageRepository,
  cardocsIa: CardocsIaGateway | null,
  ownerId: string,
  vehicleId: string,
  trigger: "manual" | "mileage_updated" | "part_replaced",
  options: { failOnError?: boolean } = {}
): Promise<ResaleDossier | null> {
  if (!cardocsIa) return null;

  try {
    const garage = await repository.findGarage(ownerId, vehicleId);
    const aiDossier = await cardocsIa.generateResaleDossier({ garage, trigger });
    const dossier = toAiResaleDossier(garage, aiDossier);
    return await repository.upsertResaleDossier(ownerId, vehicleId, dossier);
  } catch (error) {
    if (options.failOnError) throw error;
    console.warn(JSON.stringify({
      severity: "WARNING",
      message: "resale_dossier_ai_refresh_failed",
      trigger,
      errorName: error instanceof Error ? error.name : "unknown"
    }));
    return null;
  }
}

function toAiResaleDossier(
  garage: VehicleGarage,
  aiDossier: Awaited<ReturnType<CardocsIaGateway["generateResaleDossier"]>>
): ResaleDossier {
  const publicReportURL = garage.resaleDossier.publicReportURL ||
    `https://cardocs-backend-5qq5b33fha-rj.a.run.app/r/${publicReportSlug(garage.vehicle)}`;
  const seed = `${garage.id}:${garage.vehicle.id}:${aiDossier.title}:${aiDossier.estimatedValueIncrease}`;

  return {
    title: aiDossier.title,
    summary: aiDossier.summary,
    score: clampInteger(aiDossier.score, 0, 100),
    estimatedValueIncrease: Math.round(aiDossier.estimatedValueIncrease),
    publicReportURL,
    highlights: aiDossier.highlights.slice(0, 6).map((highlight, index) => ({
      id: deterministicUuid("resale-highlight-ai", `${seed}:${index}:${highlight.title}`),
      iconName: highlight.iconName,
      title: highlight.title,
      value: highlight.value
    })),
    checks: aiDossier.checks.slice(0, 8),
    reportSections: aiDossier.reportSections.slice(0, 8).map((section, index) => ({
      id: deterministicUuid("resale-section-ai", `${seed}:${index}:${section.title}`),
      iconName: section.iconName,
      title: section.title,
      status: section.status,
      detail: section.detail
    }))
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function writeSseHeaders(response: Response): void {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
}

function writeSseEvent(response: Response, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function ensureInvoiceScanAccess(userRepository: FirebaseUserRepository, ownerId: string): Promise<void> {
  const access = await userRepository.getUserAccessStatus(ownerId);
  if (!access.hasAccess) {
    throw new ForbiddenError("Assinatura ativa necessaria para escanear notas fiscais.");
  }
}

async function hasPartRecommendationAiAccess(userRepository: FirebaseUserRepository, ownerId: string): Promise<boolean> {
  const access = await userRepository.getUserAccessStatus(ownerId);
  return access.hasAccess;
}

async function ensureAutomotiveChatAccess(userRepository: FirebaseUserRepository, ownerId: string): Promise<void> {
  const access = await userRepository.getUserAccessStatus(ownerId);
  if (!access.hasAccess) {
    throw new ForbiddenError("Assinatura ativa necessaria para usar a IA automotiva.");
  }
}

function toUserProfile(decodedToken: DecodedIdToken, userRecord: UserRecord) {
  const identities = decodedToken.firebase.identities ?? {};
  return {
    id: decodedToken.uid,
    email: userRecord.email ?? decodedToken.email ?? null,
    displayName: userRecord.displayName ?? decodedToken.name ?? null,
    photoURL: userRecord.photoURL ?? decodedToken.picture ?? null,
    emailVerified: userRecord.emailVerified === true || decodedToken.email_verified === true,
    signInProvider: decodedToken.firebase.sign_in_provider ?? null,
    providerIds: [
      ...new Set([
        ...userRecord.providerData.map((provider) => provider.providerId),
        ...Object.keys(identities)
      ])
    ].sort()
  };
}

function renderPublicDossierPage(dossier: ResaleDossier): string {
  const highlights = dossier.highlights
    .map((highlight) => `<li><strong>${escapeHtml(highlight.title)}</strong><span>${escapeHtml(highlight.value)}</span></li>`)
    .join("");
  const checks = dossier.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("");
  const sections = dossier.reportSections
    .map((section) => `
      <article>
        <header>
          <strong>${escapeHtml(section.title)}</strong>
          <span>${escapeHtml(section.status)}</span>
        </header>
        <p>${escapeHtml(section.detail)}</p>
      </article>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(dossier.title)} | Tá Revisado</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f5f7f8; }
    body { margin: 0; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
    h1 { margin: 0 0 12px; font-size: clamp(2rem, 6vw, 4rem); line-height: 1; letter-spacing: 0; }
    p { color: #40515c; line-height: 1.55; }
    .score { display: inline-flex; gap: 10px; align-items: baseline; margin: 24px 0; padding: 14px 18px; border: 1px solid #d5dde2; background: white; border-radius: 8px; }
    .score strong { font-size: 2rem; }
    ul { padding: 0; list-style: none; display: grid; gap: 10px; }
    li, article { border: 1px solid #d5dde2; background: white; border-radius: 8px; padding: 14px 16px; }
    li { display: flex; justify-content: space-between; gap: 16px; }
    article header { display: flex; justify-content: space-between; gap: 16px; color: #172026; }
    section { margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(dossier.title)}</h1>
    <p>${escapeHtml(dossier.summary)}</p>
    <div class="score"><strong>${escapeHtml(String(dossier.score))}</strong><span>score Tá Revisado</span></div>
    <section><h2>Destaques</h2><ul>${highlights}</ul></section>
    <section><h2>Checklist</h2><ul>${checks}</ul></section>
    <section><h2>Relatorio</h2>${sections}</section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function asyncHandler<T extends Request = Request>(
  handler: (request: T, response: Response, next: NextFunction) => Promise<void> | void
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    Promise.resolve(handler(request as T, response, next)).catch(next);
  };
}

import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import {
  AutomationResult,
  InvoiceLineItem,
  InvestmentSummary,
  MaintenanceRecord,
  MaintenanceRecordUpdate,
  OutgoingVehicleTransfer,
  ResaleDossier,
  VehicleFipeQuote,
  VehicleDashboard,
  VehicleGarage,
  VehiclePlateDetails,
  VehicleProfile,
  VehicleTransferDecisionResult,
  VehicleTransferRequest,
  VaultDocument,
  VaultDocumentUpdate
} from "../domain/models.js";
import {
  deterministicUuid,
  emptyDetectedVehicle,
  generateResaleDossier,
  normalizePublicReportSlug,
  pendingHealth,
  publicReportSlug,
  roundMoney,
  safeMoney,
  zeroInvestment,
  zeroUuid
} from "../domain/factories.js";
import { NotFoundError, ValidationError } from "../application/errors.js";

export class FirebaseGarageRepository {
  constructor(private readonly db: Firestore) {}

  async loadDashboard(ownerId: string): Promise<VehicleDashboard> {
    const [vehicles, incomingVehicleTransfers, outgoingVehicleTransfers] = await Promise.all([
      this.db
        .collection("users")
        .doc(ownerId)
        .collection("vehicles")
        .orderBy("createdAt", "asc")
        .get(),
      this.loadIncomingVehicleTransfers(ownerId),
      this.loadOutgoingVehicleTransfers(ownerId)
    ]);

    const garages = await Promise.all(
      vehicles.docs.map(async (doc) => this.loadGarageFromVehicleDoc(ownerId, doc.id, doc.data()))
    );

    return {
      id: deterministicUuid("dashboard", ownerId),
      garages,
      selectedGarageID: garages[0]?.id ?? zeroUuid,
      detectedVehicle: emptyDetectedVehicle(),
      incomingVehicleTransfers,
      outgoingVehicleTransfers
    };
  }

  async saveVehicle(ownerId: string, vehicle: VehicleProfile): Promise<VehicleProfile> {
    const vehicleRef = this.vehicleRef(ownerId, vehicle.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vehicleRef);
      transaction.set(
        vehicleRef,
        {
          vehicle,
          ...(snapshot.exists ? {} : { investment: zeroInvestment, createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });
    return vehicle;
  }

  async findGarage(ownerId: string, vehicleId: string): Promise<VehicleGarage> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const snapshot = await vehicleRef.get();
    if (!snapshot.exists) {
      throw new NotFoundError("Veiculo nao encontrado.");
    }
    return this.loadGarageFromVehicleDoc(ownerId, snapshot.id, snapshot.data() ?? {});
  }

  async ensureVehicleExists(ownerId: string, vehicleId: string): Promise<void> {
    await this.resolveVehicleRef(ownerId, vehicleId);
  }

  async saveAutomationResult(ownerId: string, vehicleId: string, result: AutomationResult): Promise<AutomationResult> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const timelineRef = vehicleRef.collection("timeline").doc(result.record.id);
    const documentsRef = vehicleRef.collection("vaultDocuments").doc(result.document.id);

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, recordDoc, documentDoc] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(timelineRef),
        transaction.get(documentsRef)
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para salvar documento.");
      }

      const currentInvestment = toInvestmentSummary(vehicleDoc.data()?.investment);
      const shouldApplyInvestment = !recordDoc.exists && !documentDoc.exists;
      const nextInvestment: InvestmentSummary = {
        total: roundMoney(currentInvestment.total + (shouldApplyInvestment ? safeMoney(result.investmentDelta.total) : 0)),
        maintenance: roundMoney(currentInvestment.maintenance + (shouldApplyInvestment ? safeMoney(result.investmentDelta.maintenance) : 0)),
        documentsAndTaxes: roundMoney(currentInvestment.documentsAndTaxes + (shouldApplyInvestment ? safeMoney(result.investmentDelta.documentsAndTaxes) : 0))
      };

      transaction.set(timelineRef, withTimestamps(result.record, recordDoc.exists), { merge: true });
      transaction.set(documentsRef, withTimestamps(result.document, documentDoc.exists), { merge: true });
      transaction.set(
        vehicleRef,
        {
          investment: nextInvestment,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    return result;
  }

  async saveVaultDocument(ownerId: string, vehicleId: string, document: VaultDocument): Promise<VaultDocument> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const documentRef = vehicleRef.collection("vaultDocuments").doc(document.id);

    await this.db.runTransaction(async (transaction) => {
      const vehicleDoc = await transaction.get(vehicleRef);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para salvar documento.");
      }

      transaction.set(documentRef, withTimestamps(document, false), { merge: true });
      transaction.set(vehicleRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    return document;
  }

  async updateVaultDocument(
    ownerId: string,
    vehicleId: string,
    documentId: string,
    update: VaultDocumentUpdate
  ): Promise<VaultDocument> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const documentRef = vehicleRef.collection("vaultDocuments").doc(documentId);
    const patch = compactUpdate(update);
    let nextDocument: VaultDocument | null = null;

    await this.db.runTransaction(async (transaction) => {
      const documentDoc = await transaction.get(documentRef);
      if (!documentDoc.exists) {
        throw new NotFoundError("Documento nao encontrado.");
      }

      const nextData = { ...documentDoc.data(), ...patch };
      nextDocument = toVaultDocument(nextData, documentDoc.id);
      transaction.set(documentRef, withTimestamps(patch, true), { merge: true });
      transaction.set(vehicleRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!nextDocument) {
      throw new NotFoundError("Documento nao encontrado.");
    }
    return nextDocument;
  }

  async updateMaintenanceRecord(
    ownerId: string,
    vehicleId: string,
    recordId: string,
    update: MaintenanceRecordUpdate
  ): Promise<MaintenanceRecord> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const recordRef = vehicleRef.collection("timeline").doc(recordId);
    const patch = compactUpdate(update);
    let nextRecord: MaintenanceRecord | null = null;

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, recordDoc] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(recordRef)
      ]);
      if (!vehicleDoc.exists || !recordDoc.exists) {
        throw new NotFoundError("Nota nao encontrada.");
      }

      const recordData = recordDoc.data() ?? {};
      const currentRecord = toMaintenanceRecord(recordData, recordDoc.id);
      const nextData = { ...recordData, ...patch };
      nextRecord = toMaintenanceRecord(nextData, recordDoc.id);

      const amountDelta = typeof patch.amount === "number"
        ? roundMoney(safeMoney(patch.amount) - safeMoney(currentRecord.amount))
        : 0;
      const currentInvestment = toInvestmentSummary(vehicleDoc.data()?.investment);
      const documentOrTax = isDocumentOrTaxRecord(currentRecord);
      const nextInvestment: InvestmentSummary = {
        total: roundMoney(currentInvestment.total + amountDelta),
        maintenance: roundMoney(currentInvestment.maintenance + (documentOrTax ? 0 : amountDelta)),
        documentsAndTaxes: roundMoney(currentInvestment.documentsAndTaxes + (documentOrTax ? amountDelta : 0))
      };

      transaction.set(recordRef, withTimestamps(patch, true), { merge: true });
      transaction.set(
        vehicleRef,
        {
          investment: nextInvestment,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    if (!nextRecord) {
      throw new NotFoundError("Nota nao encontrada.");
    }
    return nextRecord;
  }

  async upsertResaleDossier(ownerId: string, vehicleId: string, dossier: ResaleDossier): Promise<ResaleDossier> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const vehicleDoc = await vehicleRef.get();
    if (!vehicleDoc.exists) {
      throw new NotFoundError("Veiculo nao encontrado.");
    }

    const vehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, vehicleDoc.id, { idOverride: vehicleDoc.id });
    const slug = publicReportSlug(vehicle);
    await Promise.all([
      vehicleRef.collection("dossiers").doc("current").set(withTimestamps(dossier, false), { merge: true }),
      this.db.collection("publicReports").doc(slug).set(withTimestamps(dossier, false), { merge: true })
    ]);
    return dossier;
  }

  async findPublicDossier(slug: string): Promise<ResaleDossier> {
    const snapshot = await this.db.collection("publicReports").doc(normalizePublicReportSlug(slug)).get();
    if (!snapshot.exists) {
      throw new NotFoundError("Relatorio publico nao encontrado.");
    }
    return toResaleDossier(snapshot.data());
  }

  async createVehicleTransferRequest(input: {
    fromOwnerId: string;
    fromOwnerEmail?: string | null;
    fromOwnerName?: string | null;
    toOwnerId: string;
    toOwnerEmail: string;
    vehicleId: string;
  }): Promise<VehicleTransferRequest> {
    const sourceVehicleRef = await this.resolveVehicleRef(input.fromOwnerId, input.vehicleId);
    const transferId = deterministicUuid("vehicle-transfer", `${input.fromOwnerId}:${sourceVehicleRef.id}:${input.toOwnerId}`);
    const transferRef = this.incomingVehicleTransferRef(input.toOwnerId, transferId);
    const outgoingTransferRef = this.outgoingVehicleTransferRef(input.fromOwnerId, sourceVehicleRef.id);
    let transfer: VehicleTransferRequest | null = null;

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, transferDoc, outgoingTransferDoc] = await Promise.all([
        transaction.get(sourceVehicleRef),
        transaction.get(transferRef),
        transaction.get(outgoingTransferRef)
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para transferencia.");
      }
      const pendingOutgoingTransfer = toPendingOutgoingVehicleTransfer(outgoingTransferDoc.data());
      if (pendingOutgoingTransfer && pendingOutgoingTransfer.toOwnerID !== input.toOwnerId) {
        throw new ValidationError("Este veiculo ja possui uma transferencia pendente.");
      }

      const vehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, sourceVehicleRef.id, { idOverride: sourceVehicleRef.id });
      transfer = {
        id: transferId,
        vehicleID: sourceVehicleRef.id,
        vehiclePlate: vehicle.plate,
        vehicleTitle: `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.plate,
        fromOwnerID: input.fromOwnerId,
        fromOwnerEmail: input.fromOwnerEmail ?? null,
        fromOwnerName: input.fromOwnerName ?? null,
        toOwnerID: input.toOwnerId,
        toOwnerEmail: input.toOwnerEmail,
        status: "pending"
      };

      transaction.set(transferRef, withTimestamps(transfer, transferDoc.exists), { merge: true });
      transaction.set(outgoingTransferRef, withTimestamps({
        transferID: transferId,
        vehicleID: sourceVehicleRef.id,
        vehiclePlate: vehicle.plate,
        vehicleTitle: `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.plate,
        toOwnerID: input.toOwnerId,
        toOwnerEmail: input.toOwnerEmail,
        status: "pending"
      }, outgoingTransferDoc.exists), { merge: true });
    });

    if (!transfer) {
      throw new NotFoundError("Veiculo nao encontrado para transferencia.");
    }
    return transfer;
  }

  async respondToVehicleTransfer(
    ownerId: string,
    transferId: string,
    action: "accept" | "decline"
  ): Promise<VehicleTransferDecisionResult> {
    const transferRef = this.incomingVehicleTransferRef(ownerId, transferId);
    let transfer: VehicleTransferRequest | null = null;

    await this.db.runTransaction(async (transaction) => {
      const transferDoc = await transaction.get(transferRef);
      if (!transferDoc.exists) {
        throw new NotFoundError("Transferencia nao encontrada.");
      }

      const currentTransfer = toVehicleTransferRequest(transferDoc.data() ?? {}, transferDoc.id);
      if (currentTransfer.toOwnerID !== ownerId) {
        throw new NotFoundError("Transferencia nao encontrada.");
      }
      if (currentTransfer.status !== "pending") {
        throw new ValidationError("Esta transferencia ja foi respondida.");
      }

      if (action === "decline") {
        transfer = { ...currentTransfer, status: "declined" };
        transaction.set(transferRef, withTimestamps(transfer, true), { merge: true });
        transaction.set(this.outgoingVehicleTransferRef(currentTransfer.fromOwnerID, currentTransfer.vehicleID), {
          status: "declined",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return;
      }

      const sourceVehicleRef = this.vehicleRef(currentTransfer.fromOwnerID, currentTransfer.vehicleID);
      const targetVehicleRef = this.vehicleRef(ownerId, currentTransfer.vehicleID);
      const [sourceVehicleDoc, targetVehicleDoc, timelineSnapshot, documentSnapshot, dossierSnapshot] = await Promise.all([
        transaction.get(sourceVehicleRef),
        transaction.get(targetVehicleRef),
        transaction.get(sourceVehicleRef.collection("timeline")),
        transaction.get(sourceVehicleRef.collection("vaultDocuments")),
        transaction.get(sourceVehicleRef.collection("dossiers"))
      ]);
      if (!sourceVehicleDoc.exists) {
        throw new NotFoundError("Veiculo original nao encontrado para transferencia.");
      }
      if (targetVehicleDoc.exists) {
        throw new ValidationError("Voce ja possui este veiculo na sua garagem.");
      }

      const vehicleData = sourceVehicleDoc.data() ?? {};
      transaction.set(targetVehicleRef, {
        ...vehicleData,
        transferredFromOwnerID: currentTransfer.fromOwnerID,
        transferredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      copyVehicleSubcollection(transaction, targetVehicleRef, timelineSnapshot);
      copyVehicleSubcollection(transaction, targetVehicleRef, documentSnapshot);
      copyVehicleSubcollection(transaction, targetVehicleRef, dossierSnapshot);

      for (const doc of [...timelineSnapshot.docs, ...documentSnapshot.docs, ...dossierSnapshot.docs]) {
        transaction.delete(doc.ref);
      }
      transaction.delete(sourceVehicleRef);

      transfer = { ...currentTransfer, status: "accepted" };
      transaction.set(transferRef, withTimestamps(transfer, true), { merge: true });
      transaction.set(this.outgoingVehicleTransferRef(currentTransfer.fromOwnerID, currentTransfer.vehicleID), {
        status: "accepted",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });

    if (!transfer) {
      throw new NotFoundError("Transferencia nao encontrada.");
    }

    return {
      transfer,
      dashboard: await this.loadDashboard(ownerId)
    };
  }

  private async loadGarageFromVehicleDoc(ownerId: string, vehicleId: string, data: FirebaseFirestore.DocumentData): Promise<VehicleGarage> {
    const vehicle = toVehicleProfile(data.vehicle, vehicleId, { idOverride: vehicleId });
    const [timelineSnapshot, documentSnapshot, dossierSnapshot] = await Promise.all([
      this.vehicleRef(ownerId, vehicleId).collection("timeline").orderBy("createdAt", "desc").get(),
      this.vehicleRef(ownerId, vehicleId).collection("vaultDocuments").orderBy("createdAt", "desc").get(),
      this.vehicleRef(ownerId, vehicleId).collection("dossiers").doc("current").get()
    ]);

    const timeline = timelineSnapshot.docs.map((doc) => toMaintenanceRecord(doc.data(), doc.id));
    const vaultDocuments = documentSnapshot.docs.map((doc) => toVaultDocument(doc.data(), doc.id));
    const garageBase = {
      id: vehicleId,
      vehicle,
      investment: toInvestmentSummary(data.investment),
      timeline,
      healthItems: pendingHealth(vehicle),
      vaultDocuments,
      resaleDossier: generateResaleDossier(vehicle, { timeline, vaultDocuments })
    };

    return {
      ...garageBase,
      resaleDossier: dossierSnapshot.exists ? toResaleDossier(dossierSnapshot.data()) : garageBase.resaleDossier
    };
  }

  private async resolveVehicleRef(ownerId: string, vehicleId: string): Promise<FirebaseFirestore.DocumentReference> {
    const normalizedVehicleId = vehicleId.trim().toLowerCase();
    const directRef = this.vehicleRef(ownerId, normalizedVehicleId);
    const directSnapshot = await directRef.get();
    if (directSnapshot.exists) {
      return directRef;
    }

    const legacySnapshot = await this.db
      .collection("users")
      .doc(ownerId)
      .collection("vehicles")
      .where("vehicle.id", "==", normalizedVehicleId)
      .limit(1)
      .get();

    const legacyDoc = legacySnapshot.docs[0];
    if (!legacyDoc) {
      throw new NotFoundError("Veiculo nao encontrado.");
    }

    return legacyDoc.ref;
  }

  private async loadIncomingVehicleTransfers(ownerId: string): Promise<VehicleTransferRequest[]> {
    const snapshot = await this.db
      .collection("users")
      .doc(ownerId)
      .collection("incomingVehicleTransfers")
      .get();

    return snapshot.docs.map((doc) => toVehicleTransferRequest(doc.data(), doc.id));
  }

  private async loadOutgoingVehicleTransfers(ownerId: string): Promise<OutgoingVehicleTransfer[]> {
    const snapshot = await this.db
      .collection("users")
      .doc(ownerId)
      .collection("outgoingVehicleTransfers")
      .get();

    return snapshot.docs.map((doc) => toOutgoingVehicleTransfer(doc.data(), doc.id));
  }

  private incomingVehicleTransferRef(ownerId: string, transferId: string) {
    return this.db.collection("users").doc(ownerId).collection("incomingVehicleTransfers").doc(transferId);
  }

  private outgoingVehicleTransferRef(ownerId: string, vehicleId: string) {
    return this.db.collection("users").doc(ownerId).collection("outgoingVehicleTransfers").doc(vehicleId);
  }

  private vehicleRef(ownerId: string, vehicleId: string) {
    return this.db.collection("users").doc(ownerId).collection("vehicles").doc(vehicleId);
  }
}

function withTimestamps<T extends object>(
  value: T,
  alreadyExists: boolean
): T & { createdAt?: FieldValue; updatedAt: FieldValue } {
  return {
    ...value,
    ...(alreadyExists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp()
  };
}

function copyVehicleSubcollection(
  transaction: FirebaseFirestore.Transaction,
  targetVehicleRef: FirebaseFirestore.DocumentReference,
  snapshot: FirebaseFirestore.QuerySnapshot
) {
  for (const doc of snapshot.docs) {
    transaction.set(targetVehicleRef.collection(doc.ref.parent.id).doc(doc.id), doc.data());
  }
}

function toVehicleProfile(value: unknown, fallbackId: string, options: { idOverride?: string } = {}): VehicleProfile {
  const data = value as Partial<VehicleProfile> | undefined;
  return {
    id: options.idOverride ?? stringValue(data?.id, fallbackId),
    kind: data?.kind === "motorcycle" ? "motorcycle" : "car",
    plate: stringValue(data?.plate),
    maskedPlate: stringValue(data?.maskedPlate),
    brand: stringValue(data?.brand),
    model: stringValue(data?.model),
    year: stringValue(data?.year),
    color: stringValue(data?.color),
    mileage: numberValue(data?.mileage),
    nextServiceTitle: stringValue(data?.nextServiceTitle, "Primeira organizacao"),
    nextServiceDistance: stringValue(data?.nextServiceDistance, "Pronto para importar historico"),
    statusTags: Array.isArray(data?.statusTags) ? data.statusTags.map(String) : ["Placa Verificada"],
    image: data?.image ?? null,
    fipe: toVehicleFipeQuote(data?.fipe),
    details: toVehiclePlateDetails(data?.details)
  };
}

function toVehicleTransferRequest(value: FirebaseFirestore.DocumentData, fallbackId: string): VehicleTransferRequest {
  const status = value.status === "accepted" || value.status === "declined" ? value.status : "pending";
  return {
    id: stringValue(value.id, fallbackId),
    vehicleID: stringValue(value.vehicleID),
    vehiclePlate: stringValue(value.vehiclePlate),
    vehicleTitle: stringValue(value.vehicleTitle),
    fromOwnerID: stringValue(value.fromOwnerID),
    fromOwnerEmail: nullableStringValue(value.fromOwnerEmail),
    fromOwnerName: nullableStringValue(value.fromOwnerName),
    toOwnerID: stringValue(value.toOwnerID),
    toOwnerEmail: stringValue(value.toOwnerEmail),
    status
  };
}

function toOutgoingVehicleTransfer(value: FirebaseFirestore.DocumentData, fallbackId: string): OutgoingVehicleTransfer {
  const status = value.status === "accepted" || value.status === "declined" ? value.status : "pending";
  const vehicleID = stringValue(value.vehicleID, fallbackId);
  const vehiclePlate = stringValue(value.vehiclePlate);
  const vehicleTitle = stringValue(value.vehicleTitle, vehiclePlate || "Veiculo transferido");
  return {
    transferID: stringValue(value.transferID, fallbackId),
    vehicleID,
    vehiclePlate,
    vehicleTitle,
    toOwnerID: nullableStringValue(value.toOwnerID),
    toOwnerEmail: stringValue(value.toOwnerEmail),
    status
  };
}

function toPendingOutgoingVehicleTransfer(value: FirebaseFirestore.DocumentData | undefined): { toOwnerID: string } | null {
  if (!value || value.status !== "pending") {
    return null;
  }
  const toOwnerID = nullableStringValue(value.toOwnerID);
  if (!toOwnerID) {
    return null;
  }
  return {
    toOwnerID
  };
}

function toVehicleFipeQuote(value: unknown): VehicleFipeQuote | null {
  const data = value as Partial<VehicleFipeQuote> | undefined;
  const quote: VehicleFipeQuote = {
    code: stringValue(data?.code),
    brand: stringValue(data?.brand),
    model: stringValue(data?.model),
    modelYear: stringValue(data?.modelYear),
    fuel: stringValue(data?.fuel),
    referenceMonth: stringValue(data?.referenceMonth),
    formattedValue: stringValue(data?.formattedValue),
    value: nullableNumberValue(data?.value)
  };

  return hasAnyValue(quote) ? quote : null;
}

function toVehiclePlateDetails(value: unknown): VehiclePlateDetails | null {
  const data = value as Partial<VehiclePlateDetails> | undefined;
  const details: VehiclePlateDetails = {
    alternatePlate: nullableStringValue(data?.alternatePlate),
    brandLogoURL: nullableHttpsUrlString(data?.brandLogoURL),
    municipality: nullableStringValue(data?.municipality),
    state: nullableStringValue(data?.state),
    origin: nullableStringValue(data?.origin),
    situation: nullableStringValue(data?.situation),
    fuel: nullableStringValue(data?.fuel),
    engineDisplacement: nullableStringValue(data?.engineDisplacement),
    vehicleType: nullableStringValue(data?.vehicleType),
    segment: nullableStringValue(data?.segment),
    subSegment: nullableStringValue(data?.subSegment),
    passengerCapacity: nullableStringValue(data?.passengerCapacity),
    bodyType: nullableStringValue(data?.bodyType)
  };

  return hasAnyValue(details) ? details : null;
}

function toInvestmentSummary(value: unknown): InvestmentSummary {
  const data = value as Partial<InvestmentSummary> | undefined;
  return {
    total: numberValue(data?.total),
    maintenance: numberValue(data?.maintenance),
    documentsAndTaxes: numberValue(data?.documentsAndTaxes)
  };
}

function toMaintenanceRecord(value: FirebaseFirestore.DocumentData, fallbackId: string): MaintenanceRecord {
  const title = stringValue(value.title);
  const subtitle = stringValue(value.subtitle);
  const supplierName = stringValue(value.supplierName, subtitle) || null;
  const serviceTitle = stringValue(value.serviceTitle, title) || null;
  return {
    id: stringValue(value.id, fallbackId),
    iconName: stringValue(value.iconName),
    title,
    subtitle,
    date: stringValue(value.date),
    amount: numberValue(value.amount),
    isAIValidated: Boolean(value.isAIValidated),
    supplierName,
    serviceTitle,
    purchaseSummary: stringValue(value.purchaseSummary, serviceTitle ?? title) || null,
    documentID: nullableStringValue(value.documentID),
    attachment: toDocumentAttachment(value.attachment)
  };
}

function toVaultDocument(value: FirebaseFirestore.DocumentData, fallbackId: string): VaultDocument {
  const title = stringValue(value.title);
  const serviceTitle = stringValue(value.serviceTitle, title) || null;
  const lineItems = Array.isArray(value.lineItems) ? value.lineItems.map(toInvoiceLineItem) : [];
  return {
    id: stringValue(value.id, fallbackId),
    title,
    date: stringValue(value.date),
    amount: numberValue(value.amount),
    status: stringValue(value.status),
    kind: value.kind === "vehicleDocument" || value.kind === "expenseReceipt" ? value.kind : null,
    documentType: nullableStringValue(value.documentType),
    notes: nullableStringValue(value.notes),
    supplierName: stringValue(value.supplierName) || null,
    serviceTitle,
    purchaseSummary: stringValue(value.purchaseSummary, summarizePurchasedInvoiceLineItems(lineItems, serviceTitle ?? title)) || null,
    source: value.source === "cameraScan" || value.source === "fileImport" || value.source === "photoLibrary" || value.source === "manualEntry" ? value.source : null,
    lineItems,
    attachment: toDocumentAttachment(value.attachment)
  };
}

function toDocumentAttachment(value: unknown) {
  const data = value as FirebaseFirestore.DocumentData | undefined;
  if (!data) return null;

  const attachment = {
    storagePath: stringValue(data.storagePath),
    downloadURL: nullableHttpsUrlString(data.downloadURL),
    mimeType: stringValue(data.mimeType),
    fileName: stringValue(data.fileName),
    sizeBytes: numberValue(data.sizeBytes),
    pageCount: numberValue(data.pageCount),
    source: data.source === "cameraScan" || data.source === "fileImport" || data.source === "photoLibrary" ? data.source : "fileImport"
  };

  return attachment.storagePath && attachment.mimeType && attachment.fileName ? attachment : null;
}

function summarizePurchasedInvoiceLineItems(items: InvoiceLineItem[], fallback: string): string {
  const descriptions = items
    .map((item) => stringValue(item.description).split(/\s+/).join(" ").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);

  if (descriptions.length === 0) return fallback;
  if (descriptions.length === 1) return descriptions[0];
  if (descriptions.length === 2) return `${descriptions[0]} e ${descriptions[1]}`.slice(0, 120);
  return `${descriptions[0]}, ${descriptions[1]} e mais ${descriptions.length - 2} itens`.slice(0, 120);
}

function toInvoiceLineItem(value: FirebaseFirestore.DocumentData): InvoiceLineItem {
  return {
    id: stringValue(value.id),
    description: stringValue(value.description),
    quantity: nullableNumberValue(value.quantity),
    unitAmount: nullableNumberValue(value.unitAmount),
    totalAmount: numberValue(value.totalAmount)
  };
}

function toResaleDossier(value: FirebaseFirestore.DocumentData | undefined): ResaleDossier {
  return {
    title: stringValue(value?.title),
    summary: stringValue(value?.summary),
    score: numberValue(value?.score),
    estimatedValueIncrease: numberValue(value?.estimatedValueIncrease),
    publicReportURL: stringValue(value?.publicReportURL),
    highlights: Array.isArray(value?.highlights) ? value.highlights : [],
    checks: Array.isArray(value?.checks) ? value.checks.map(String) : [],
    reportSections: Array.isArray(value?.reportSections) ? value.reportSections : []
  };
}

function stringValue(value: unknown, fallback = ""): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text ? text : null;
}

function nullableHttpsUrlString(value: unknown): string | null {
  const text = nullableStringValue(value);
  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasAnyValue(value: object): boolean {
  return Object.values(value).some((item) => item !== null && item !== undefined && String(item).trim().length > 0);
}

function compactUpdate<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}

function isDocumentOrTaxRecord(record: MaintenanceRecord): boolean {
  const normalized = `${record.iconName} ${record.title} ${record.serviceTitle ?? ""} ${record.purchaseSummary ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /(doc|imposto|ipva|licenciamento|taxa|seguro)/.test(normalized);
}

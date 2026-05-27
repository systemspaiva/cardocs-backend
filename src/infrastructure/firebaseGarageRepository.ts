import { randomUUID } from "crypto";
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import {
  AutomationResult,
  InvoiceLineItem,
  InvoicePartLifeEntry,
  InvestmentSummary,
  MaintenanceRecord,
  MaintenanceRecordUpdate,
  OutgoingVehicleTransfer,
  PartPosition,
  PartReplacementRecord,
  PartReplacementScope,
  ResaleDossier,
  VehicleFipeQuote,
  VehicleDashboard,
  VehicleGarage,
  VehicleImage,
  VehicleInsurance,
  VehiclePlateDetails,
  VehicleProfile,
  VehicleTransferDecisionResult,
  VehicleTransferRequest,
  VaultDocument,
  VaultDocumentUpdate
} from "../domain/models.js";
import {
  calculatePartHealth,
  deterministicUuid,
  emptyDetectedVehicle,
  generateResaleDossier,
  iconNameForPartName,
  normalizePublicReportSlug,
  partGroupKey as domainPartGroupKey,
  partIdentityKey as domainPartIdentityKey,
  publicReportSlug,
  resolvePartPosition,
  roundMoney,
  safeMoney,
  zeroInvestment,
  zeroUuid
} from "../domain/factories.js";
import { NotFoundError, ValidationError } from "../application/errors.js";

const maxVehiclePhotos = 12;

type InvoicePartLifePersistenceEntry = InvoicePartLifeEntry & {
  serviceDate: string;
  mileageAtService: number;
};

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

  async updateMileage(ownerId: string, vehicleId: string, mileage: number): Promise<VehicleProfile> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    let updatedVehicle: VehicleProfile | null = null;

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(vehicleRef);
      if (!snapshot.exists) throw new NotFoundError("Veiculo nao encontrado.");
      const current = snapshot.data()?.vehicle ?? {};
      const next = { ...current, mileage: Math.max(0, Math.trunc(mileage)) };
      updatedVehicle = next as VehicleProfile;
      transaction.set(vehicleRef, { vehicle: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!updatedVehicle) throw new NotFoundError("Veiculo nao encontrado.");
    return updatedVehicle;
  }

  async updateVehiclePhoto(
    ownerId: string,
    vehicleId: string,
    photo: { mimeType: string; base64Data: string }
  ): Promise<VehicleProfile> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    await this.assertVehicleExists(vehicleRef);
    const vehicleImage = await uploadVehiclePhoto(ownerId, vehicleRef.id, photo, `photo.${imageExtension(photo.mimeType)}`);

    let updatedVehicle: VehicleProfile | null = null;
    await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(vehicleRef);
      if (!snap.exists) throw new NotFoundError("Veiculo nao encontrado.");
      const current = toVehicleProfile(snap.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const [, ...remainingPhotos] = current.photos;
      const next: VehicleProfile = {
        ...current,
        image: vehicleImage,
        photos: [vehicleImage, ...remainingPhotos]
      };
      updatedVehicle = next as VehicleProfile;
      transaction.set(vehicleRef, { vehicle: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!updatedVehicle) throw new NotFoundError("Veiculo nao encontrado.");
    return updatedVehicle;
  }

  async addVehiclePhoto(
    ownerId: string,
    vehicleId: string,
    photo: { mimeType: string; base64Data: string; makePrimary: boolean }
  ): Promise<VehicleProfile> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const snapshot = await this.assertVehicleExists(vehicleRef);
    const current = toVehicleProfile(snapshot.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
    if (current.photos.length >= maxVehiclePhotos) {
      throw new ValidationError("Limite de fotos do veiculo atingido.");
    }
    const vehicleImage = await uploadVehiclePhoto(
      ownerId,
      vehicleRef.id,
      photo,
      `photos/${randomUUID()}.${imageExtension(photo.mimeType)}`
    );

    let updatedVehicle: VehicleProfile | null = null;
    await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(vehicleRef);
      if (!snap.exists) throw new NotFoundError("Veiculo nao encontrado.");
      const current = toVehicleProfile(snap.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      if (current.photos.length >= maxVehiclePhotos) {
        throw new ValidationError("Limite de fotos do veiculo atingido.");
      }
      const photos = photo.makePrimary || current.photos.length === 0
        ? [vehicleImage, ...current.photos]
        : [...current.photos, vehicleImage];
      const next: VehicleProfile = {
        ...current,
        image: photos[0] ?? null,
        photos
      };
      updatedVehicle = next;
      transaction.set(vehicleRef, { vehicle: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!updatedVehicle) throw new NotFoundError("Veiculo nao encontrado.");
    return updatedVehicle;
  }

  async removeVehiclePhoto(ownerId: string, vehicleId: string, photoURL: string): Promise<VehicleProfile> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    let updatedVehicle: VehicleProfile | null = null;

    await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(vehicleRef);
      if (!snap.exists) throw new NotFoundError("Veiculo nao encontrado.");
      const current = toVehicleProfile(snap.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const photos = current.photos.filter((photo) => photo.url !== photoURL);
      if (photos.length === current.photos.length) {
        throw new NotFoundError("Foto nao encontrada.");
      }
      const next: VehicleProfile = {
        ...current,
        image: photos[0] ?? null,
        photos
      };
      updatedVehicle = next;
      transaction.set(vehicleRef, { vehicle: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!updatedVehicle) throw new NotFoundError("Veiculo nao encontrado.");
    return updatedVehicle;
  }

  async reorderVehiclePhotos(ownerId: string, vehicleId: string, photoURLs: string[]): Promise<VehicleProfile> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    let updatedVehicle: VehicleProfile | null = null;

    await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(vehicleRef);
      if (!snap.exists) throw new NotFoundError("Veiculo nao encontrado.");
      const current = toVehicleProfile(snap.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const photosByURL = new Map(current.photos.map((photo) => [photo.url, photo]));
      const uniqueURLs = new Set(photoURLs);
      if (uniqueURLs.size !== photoURLs.length || uniqueURLs.size !== photosByURL.size) {
        throw new ValidationError("A nova ordem precisa conter exatamente as fotos atuais.");
      }
      const photos = photoURLs.map((url) => photosByURL.get(url));
      if (photos.some((photo) => !photo)) {
        throw new ValidationError("A nova ordem precisa conter exatamente as fotos atuais.");
      }
      const orderedPhotos = photos as VehicleImage[];
      const next: VehicleProfile = {
        ...current,
        image: orderedPhotos[0] ?? null,
        photos: orderedPhotos
      };
      updatedVehicle = next;
      transaction.set(vehicleRef, { vehicle: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    if (!updatedVehicle) throw new NotFoundError("Veiculo nao encontrado.");
    return updatedVehicle;
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

  async saveAutomationResult(
    ownerId: string,
    vehicleId: string,
    result: AutomationResult,
    partLifeEntries: InvoicePartLifePersistenceEntry[] = []
  ): Promise<AutomationResult> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, vehicleId);
    const timelineRef = vehicleRef.collection("timeline").doc(result.record.id);
    const documentsRef = vehicleRef.collection("vaultDocuments").doc(result.document.id);
    const partReplacements = invoicePartLifeEntriesToReplacements(ownerId, vehicleRef, result.record.id, partLifeEntries);

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, recordDoc, documentDoc, ...replacementDocs] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(timelineRef),
        transaction.get(documentsRef),
        ...partReplacements.map((replacement) => transaction.get(replacement.ref))
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para salvar documento.");
      }

      const currentVehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const currentInvestment = toInvestmentSummary(vehicleDoc.data()?.investment);
      const shouldApplyInvestment = !recordDoc.exists && !documentDoc.exists;
      const nextInvestment: InvestmentSummary = {
        total: roundMoney(currentInvestment.total + (shouldApplyInvestment ? safeMoney(result.investmentDelta.total) : 0)),
        maintenance: roundMoney(currentInvestment.maintenance + (shouldApplyInvestment ? safeMoney(result.investmentDelta.maintenance) : 0)),
        documentsAndTaxes: roundMoney(currentInvestment.documentsAndTaxes + (shouldApplyInvestment ? safeMoney(result.investmentDelta.documentsAndTaxes) : 0))
      };
      const maxReplacementMileage = Math.max(0, ...partReplacements.map((entry) => entry.value.mileageAtService));
      const vehiclePatch = maxReplacementMileage > currentVehicle.mileage
        ? {
            vehicle: { ...currentVehicle, mileage: maxReplacementMileage },
            investment: nextInvestment,
            updatedAt: FieldValue.serverTimestamp()
          }
        : {
            investment: nextInvestment,
            updatedAt: FieldValue.serverTimestamp()
          };

      transaction.set(timelineRef, withTimestamps(result.record, recordDoc.exists), { merge: true });
      transaction.set(documentsRef, withTimestamps(result.document, documentDoc.exists), { merge: true });
      partReplacements.forEach((replacement, index) => {
        transaction.set(replacement.ref, withTimestamps(replacement.value, replacementDocs[index]?.exists ?? false), { merge: true });
      });
      transaction.set(vehicleRef, vehiclePatch, { merge: true });
    });

    return result;
  }

  async savePartReplacement(ownerId: string, input: {
    vehicleID: string;
    partName: string;
    brandName?: string | null;
    amount: number;
    serviceDate: string;
    mileageAtService: number;
    scheduledRevisionMileage?: number | null;
    scheduledRevisionWorkshopKind?: "dealership" | "other" | null;
    lifeKm?: number | null;
    lifeMonths?: number | null;
    quantity?: number | null;
    expectedQuantity?: number | null;
    scope?: PartReplacementScope | null;
    position?: PartPosition | null;
  }): Promise<VehicleDashboard> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, input.vehicleID);
    const partName = partNameFromServiceLabel(input.partName);
    const position = resolvePartPosition({ position: input.position ?? null, scope: input.scope ?? null });
    const replacementId = deterministicUuid(
      "part-replacement",
      `${ownerId}:${vehicleRef.id}:${partName}:${position}:${input.serviceDate}:${input.mileageAtService}:${input.lifeKm ?? ""}:${input.lifeMonths ?? ""}`.toLowerCase()
    );
    const recordId = deterministicUuid("maintenance-record", replacementId);
    const replacementRef = vehicleRef.collection("partReplacements").doc(replacementId);
    const recordRef = vehicleRef.collection("timeline").doc(recordId);
    const iconName = iconNameForPartName(partName);
    const amount = roundMoney(safeMoney(input.amount));
    const mileageAtService = Math.max(0, Math.trunc(input.mileageAtService));
    const serviceTitle = `Troca de ${partName}`;
    const brandName = nullableStringValue(input.brandName);
    const scheduledRevisionMileage = nullableNumberValue(input.scheduledRevisionMileage);
    const scheduledRevisionWorkshopKind = input.scheduledRevisionWorkshopKind === "dealership" || input.scheduledRevisionWorkshopKind === "other"
      ? input.scheduledRevisionWorkshopKind
      : null;

    let purchaseSummary = maintenancePlanSummary(input.lifeKm ?? null, input.lifeMonths ?? null);
    let recordSubtitle = brandName ? `${brandName} - ${purchaseSummary}` : purchaseSummary;

    if (scheduledRevisionMileage && scheduledRevisionWorkshopKind) {
      const workshopLabel = scheduledRevisionWorkshopKind === "dealership" ? "Concessionária" : "Oficina";
      const revisionSummary = `Revisão de ${scheduledRevisionMileage.toLocaleString("pt-BR")} km em ${workshopLabel}`;
      recordSubtitle = revisionSummary;
      purchaseSummary = `${brandName ? `Marca: ${brandName}. ` : ""}${purchaseSummary}. ${revisionSummary}`;
    } else if (brandName) {
      purchaseSummary = `Marca: ${brandName}. ${purchaseSummary}`;
    }

    const replacement: PartReplacementRecord = {
      id: replacementId,
      partName,
      brandName,
      serviceTitle,
      iconName,
      serviceDate: input.serviceDate,
      amount,
      mileageAtService,
      lifeKm: input.lifeKm ?? null,
      lifeMonths: input.lifeMonths ?? null,
      scheduledRevisionMileage,
      scheduledRevisionWorkshopKind,
      maintenanceRecordID: recordId,
      quantity: nullableNumberValue(input.quantity),
      expectedQuantity: nullableNumberValue(input.expectedQuantity),
      scope: input.scope ?? null,
      position
    };
    const record: MaintenanceRecord = {
      id: recordId,
      iconName,
      title: serviceTitle,
      subtitle: recordSubtitle,
      date: input.serviceDate,
      amount,
      isAIValidated: false,
      supplierName: null,
      serviceTitle,
      purchaseSummary,
      documentID: null,
      attachment: null
    };

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, recordDoc, replacementDoc] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(recordRef),
        transaction.get(replacementRef)
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para salvar troca de peca.");
      }

      const currentVehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const existingRecordAmount = recordDoc.exists ? numberValue(recordDoc.data()?.amount) : 0;
      const investmentDelta = roundMoney(recordDoc.exists ? amount - existingRecordAmount : amount);
      const currentInvestment = toInvestmentSummary(vehicleDoc.data()?.investment);
      const nextInvestment: InvestmentSummary = {
        total: roundMoney(Math.max(0, currentInvestment.total + investmentDelta)),
        maintenance: roundMoney(Math.max(0, currentInvestment.maintenance + investmentDelta)),
        documentsAndTaxes: currentInvestment.documentsAndTaxes
      };
      const vehicleUpdate = mileageAtService > currentVehicle.mileage
        ? { ...currentVehicle, mileage: mileageAtService }
        : currentVehicle;

      transaction.set(replacementRef, withTimestamps(replacement, replacementDoc.exists), { merge: true });
      transaction.set(recordRef, withTimestamps(record, recordDoc.exists), { merge: true });
      transaction.set(
        vehicleRef,
        {
          vehicle: vehicleUpdate,
          investment: nextInvestment,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    });

    return this.loadDashboard(ownerId);
  }

  async saveInvoicePartReplacement(ownerId: string, input: {
    vehicleID: string;
    documentID: string;
    partName: string;
    serviceDate: string;
    mileageAtService: number;
    amount?: number | null;
    lifeKm?: number | null;
    lifeMonths?: number | null;
    quantity?: number | null;
    expectedQuantity?: number | null;
    scope?: PartReplacementScope | null;
    position?: PartPosition | null;
  }): Promise<VehicleDashboard> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, input.vehicleID);
    const documentRef = vehicleRef.collection("vaultDocuments").doc(input.documentID);
    const partName = partNameFromServiceLabel(input.partName);
    const partKey = domainPartIdentityKey(partName);
    if (!partKey) {
      throw new ValidationError("Informe a peca que deseja monitorar.");
    }
    const position = resolvePartPosition({ position: input.position ?? null, scope: input.scope ?? null });
    const replacementId = deterministicUuid(
      "invoice-part-replacement",
      `${ownerId}:${vehicleRef.id}:${input.documentID}:${partKey}:${position}`.toLowerCase()
    );
    const replacementRef = vehicleRef.collection("partReplacements").doc(replacementId);
    const timelineQuery = vehicleRef.collection("timeline").where("documentID", "==", input.documentID).limit(1);
    const mileageAtService = Math.max(1, Math.trunc(input.mileageAtService));

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, documentDoc, replacementDoc, timelineSnapshot] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(documentRef),
        transaction.get(replacementRef),
        transaction.get(timelineQuery)
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para monitorar peca.");
      }
      if (!documentDoc.exists) {
        throw new NotFoundError("Nota fiscal nao encontrada para monitorar peca.");
      }
      const documentKind = documentDoc.data()?.kind;
      if (documentKind && documentKind !== "expenseReceipt") {
        throw new ValidationError("Apenas notas fiscais podem iniciar acompanhamento de peca.");
      }

      const currentVehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const maintenanceRecordID = timelineSnapshot.docs[0]?.id ?? input.documentID;
      const serviceTitle = `Troca de ${partName}`;
      const replacement: PartReplacementRecord = {
        id: replacementId,
        partName,
        brandName: null,
        serviceTitle,
        iconName: iconNameForPartName(partName),
        serviceDate: input.serviceDate,
        amount: roundMoney(safeMoney(input.amount ?? 0)),
        mileageAtService,
        lifeKm: input.lifeKm ?? null,
        lifeMonths: input.lifeMonths ?? null,
        scheduledRevisionMileage: null,
        scheduledRevisionWorkshopKind: null,
        maintenanceRecordID,
        quantity: nullableNumberValue(input.quantity),
        expectedQuantity: nullableNumberValue(input.expectedQuantity),
        scope: input.scope ?? null,
        position
      };
      const vehicleUpdate = mileageAtService > currentVehicle.mileage
        ? { vehicle: { ...currentVehicle, mileage: mileageAtService }, updatedAt: FieldValue.serverTimestamp() }
        : { updatedAt: FieldValue.serverTimestamp() };

      transaction.set(replacementRef, withTimestamps(replacement, replacementDoc.exists), { merge: true });
      transaction.set(vehicleRef, vehicleUpdate, { merge: true });
    });

    return this.loadDashboard(ownerId);
  }

  async removePartReplacement(ownerId: string, input: {
    vehicleID: string;
    partName: string;
    position?: PartPosition | null;
  }): Promise<VehicleDashboard> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, input.vehicleID);
    const requestedPartName = partNameFromServiceLabel(input.partName);
    const requestedKey = domainPartIdentityKey(requestedPartName);
    // Quando `position` vem null/undefined, remove TODAS as posições da
    // peça (legado / "apagar tudo desse nome"). Com position definido,
    // remove só o grupo daquela posição.
    const requestedPosition = input.position ?? null;

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, replacementSnapshot] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(vehicleRef.collection("partReplacements"))
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para remover peca monitorada.");
      }

      const matchingDocs = replacementSnapshot.docs.filter((doc) => {
        const record = toPartReplacementRecord(doc.data(), doc.id);
        if (domainPartIdentityKey(partNameFromServiceLabel(record.partName)) !== requestedKey) {
          return false;
        }
        if (requestedPosition === null) return true;
        return resolvePartPosition(record) === requestedPosition;
      });

      if (matchingDocs.length === 0) {
        throw new NotFoundError("Peca monitorada nao encontrada.");
      }

      matchingDocs.forEach((doc) => transaction.delete(doc.ref));
      transaction.set(vehicleRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    return this.loadDashboard(ownerId);
  }

  async saveVehicleInsurance(ownerId: string, input: {
    vehicleID: string;
    insurerName: string;
    premiumAmount: number;
    premiumPeriod: "monthly" | "annual";
    coverages: string;
    deductibleAmount?: number | null;
    deductibleNotes?: string | null;
    validUntil: string;
  }): Promise<VehicleDashboard> {
    const vehicleRef = await this.resolveVehicleRef(ownerId, input.vehicleID);
    const insurance: VehicleInsurance = {
      insurerName: cleanLabel(input.insurerName, "Seguradora"),
      premiumAmount: roundMoney(safeMoney(input.premiumAmount)),
      premiumPeriod: input.premiumPeriod === "annual" ? "annual" : "monthly",
      coverages: cleanLabel(input.coverages, "Coberturas informadas manualmente"),
      deductibleAmount: nullableNumberValue(input.deductibleAmount),
      deductibleNotes: nullableStringValue(input.deductibleNotes),
      validUntil: input.validUntil,
      updatedAt: new Date().toISOString()
    };

    await this.db.runTransaction(async (transaction) => {
      const [vehicleDoc, timelineSnapshot, documentSnapshot, replacementSnapshot] = await Promise.all([
        transaction.get(vehicleRef),
        transaction.get(vehicleRef.collection("timeline")),
        transaction.get(vehicleRef.collection("vaultDocuments")),
        transaction.get(vehicleRef.collection("partReplacements"))
      ]);
      if (!vehicleDoc.exists) {
        throw new NotFoundError("Veiculo nao encontrado para salvar seguro.");
      }

      const vehicle = toVehicleProfile(vehicleDoc.data()?.vehicle, vehicleRef.id, { idOverride: vehicleRef.id });
      const timeline = timelineSnapshot.docs.map((doc) => toMaintenanceRecord(doc.data(), doc.id));
      const vaultDocuments = documentSnapshot.docs.map((doc) => toVaultDocument(doc.data(), doc.id));
      const partReplacements = replacementSnapshot.docs.map((doc) => toPartReplacementRecord(doc.data(), doc.id));
      const dossier = generateResaleDossier(vehicle, { timeline, vaultDocuments, insurance, partReplacements });
      const slug = publicReportSlug(vehicle);

      transaction.set(
        vehicleRef,
        {
          insurance,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      transaction.set(vehicleRef.collection("dossiers").doc("current"), withTimestamps(dossier, false), { merge: true });
      transaction.set(this.db.collection("publicReports").doc(slug), withTimestamps(dossier, false), { merge: true });
    });

    return this.loadDashboard(ownerId);
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
      const [sourceVehicleDoc, targetVehicleDoc, timelineSnapshot, documentSnapshot, dossierSnapshot, replacementSnapshot] = await Promise.all([
        transaction.get(sourceVehicleRef),
        transaction.get(targetVehicleRef),
        transaction.get(sourceVehicleRef.collection("timeline")),
        transaction.get(sourceVehicleRef.collection("vaultDocuments")),
        transaction.get(sourceVehicleRef.collection("dossiers")),
        transaction.get(sourceVehicleRef.collection("partReplacements"))
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
      copyVehicleSubcollection(transaction, targetVehicleRef, replacementSnapshot);

      for (const doc of [...timelineSnapshot.docs, ...documentSnapshot.docs, ...dossierSnapshot.docs, ...replacementSnapshot.docs]) {
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
    const [timelineSnapshot, documentSnapshot, dossierSnapshot, replacementSnapshot] = await Promise.all([
      this.vehicleRef(ownerId, vehicleId).collection("timeline").orderBy("createdAt", "desc").get(),
      this.vehicleRef(ownerId, vehicleId).collection("vaultDocuments").orderBy("createdAt", "desc").get(),
      this.vehicleRef(ownerId, vehicleId).collection("dossiers").doc("current").get(),
      this.vehicleRef(ownerId, vehicleId).collection("partReplacements").orderBy("createdAt", "desc").get()
    ]);

    const timeline = timelineSnapshot.docs.map((doc) => toMaintenanceRecord(doc.data(), doc.id));
    const vaultDocuments = documentSnapshot.docs.map((doc) => toVaultDocument(doc.data(), doc.id));
    const partReplacements = replacementSnapshot.docs.map((doc) => toPartReplacementRecord(doc.data(), doc.id));
    const insurance = toVehicleInsurance(data.insurance);
    const garageBase = {
      id: vehicleId,
      vehicle,
      investment: toInvestmentSummary(data.investment),
      timeline,
      healthItems: calculatePartHealth(vehicle, partReplacements),
      partReplacements,
      vaultDocuments,
      insurance,
      resaleDossier: generateResaleDossier(vehicle, { timeline, vaultDocuments, insurance, partReplacements })
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

  private async assertVehicleExists(
    vehicleRef: FirebaseFirestore.DocumentReference
  ): Promise<FirebaseFirestore.DocumentSnapshot> {
    const snapshot = await vehicleRef.get();
    if (!snapshot.exists) {
      throw new NotFoundError("Veiculo nao encontrado.");
    }
    return snapshot;
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
  const image = toVehicleImage(data?.image);
  const photos = toVehiclePhotos(data, image);
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
    image: photos[0] ?? image,
    photos,
    fipe: toVehicleFipeQuote(data?.fipe),
    details: toVehiclePlateDetails(data?.details)
  };
}

async function uploadVehiclePhoto(
  ownerId: string,
  vehicleId: string,
  photo: { mimeType: string; base64Data: string },
  fileName: string
): Promise<VehicleImage> {
  const { getStorage } = await import("firebase-admin/storage");
  const buffer = Buffer.from(photo.base64Data, "base64");
  const storagePath = `users/${ownerId}/vehicles/${vehicleId}/${fileName}`;

  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, { contentType: photo.mimeType, resumable: false });
  await file.makePublic();

  return {
    url: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
    thumbnailUrl: null,
    mime: photo.mimeType,
    width: null,
    height: null,
    accentColor: null,
    source: "userPhoto"
  };
}

function imageExtension(mimeType: string): string {
  return mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
}

function toVehiclePhotos(data: Partial<VehicleProfile> | undefined, fallbackImage: VehicleImage | null): VehicleImage[] {
  const photos = Array.isArray(data?.photos)
    ? data.photos.map(toVehicleImage).filter((photo): photo is VehicleImage => photo !== null)
    : [];
  if (photos.length > 0) {
    return photos;
  }
  return fallbackImage ? [fallbackImage] : [];
}

function toVehicleImage(value: unknown): VehicleImage | null {
  const data = value as Partial<VehicleImage> | undefined;
  const url = stringValue(data?.url);
  if (!url) {
    return null;
  }
  return {
    url,
    thumbnailUrl: nullableStringValue(data?.thumbnailUrl),
    mime: nullableStringValue(data?.mime),
    width: nullableNumberValue(data?.width),
    height: nullableNumberValue(data?.height),
    accentColor: nullableStringValue(data?.accentColor),
    source: stringValue(data?.source, "userPhoto")
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

function toVehicleInsurance(value: unknown): VehicleInsurance | null {
  const data = value as Partial<VehicleInsurance> | undefined;
  if (!data) return null;

  const insurance: VehicleInsurance = {
    insurerName: stringValue(data.insurerName),
    premiumAmount: numberValue(data.premiumAmount),
    premiumPeriod: data.premiumPeriod === "annual" ? "annual" : "monthly",
    coverages: stringValue(data.coverages),
    deductibleAmount: nullableNumberValue(data.deductibleAmount),
    deductibleNotes: nullableStringValue(data.deductibleNotes),
    validUntil: stringValue(data.validUntil),
    updatedAt: stringValue(data.updatedAt)
  };

  return insurance.insurerName && insurance.validUntil ? insurance : null;
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

const VALID_POSITIONS: ReadonlySet<PartPosition> = new Set([
  "complete",
  "front_axle",
  "rear_axle",
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
  "partial"
]);

function toPartReplacementRecord(value: FirebaseFirestore.DocumentData, fallbackId: string): PartReplacementRecord {
  const partName = cleanLabel(value.partName, stringValue(value.serviceTitle, "Peca"));
  const scopeRaw = typeof value.scope === "string" ? value.scope : null;
  const scope = scopeRaw === "complete" || scopeRaw === "front" || scopeRaw === "rear" || scopeRaw === "partial"
    ? scopeRaw
    : null;
  const positionRaw = typeof value.position === "string" ? value.position : null;
  const storedPosition = positionRaw && VALID_POSITIONS.has(positionRaw as PartPosition)
    ? (positionRaw as PartPosition)
    : null;
  // Migração lazy: registro antigo sem `position` reaproveita o `scope` legado.
  // Pendente sem nenhum dos dois vira "complete".
  const position = resolvePartPosition({ position: storedPosition, scope });
  return {
    id: stringValue(value.id, fallbackId),
    partName,
    brandName: nullableStringValue(value.brandName),
    serviceTitle: cleanLabel(value.serviceTitle, partName),
    iconName: stringValue(value.iconName, iconNameForPartName(partName)),
    serviceDate: stringValue(value.serviceDate),
    amount: numberValue(value.amount),
    mileageAtService: numberValue(value.mileageAtService),
    lifeKm: nullableNumberValue(value.lifeKm),
    lifeMonths: nullableNumberValue(value.lifeMonths),
    scheduledRevisionMileage: nullableNumberValue(value.scheduledRevisionMileage),
    scheduledRevisionWorkshopKind: value.scheduledRevisionWorkshopKind === "dealership" || value.scheduledRevisionWorkshopKind === "other"
      ? value.scheduledRevisionWorkshopKind
      : null,
    maintenanceRecordID: stringValue(value.maintenanceRecordID),
    quantity: nullableNumberValue(value.quantity),
    expectedQuantity: nullableNumberValue(value.expectedQuantity),
    scope,
    position
  };
}

const VAULT_DOCUMENT_CHECKLIST_KINDS: ReadonlySet<string> = new Set([
  "cautelar",
  "transferencia",
  "ipva",
  "nfCompra"
]);

function toVaultDocument(value: FirebaseFirestore.DocumentData, fallbackId: string): VaultDocument {
  const title = stringValue(value.title);
  const serviceTitle = stringValue(value.serviceTitle, title) || null;
  const lineItems = Array.isArray(value.lineItems) ? value.lineItems.map(toInvoiceLineItem) : [];
  const checklistKind = typeof value.checklistKind === "string" && VAULT_DOCUMENT_CHECKLIST_KINDS.has(value.checklistKind)
    ? (value.checklistKind as VaultDocument["checklistKind"])
    : null;
  return {
    id: stringValue(value.id, fallbackId),
    title,
    date: stringValue(value.date),
    amount: numberValue(value.amount),
    status: stringValue(value.status),
    kind: value.kind === "vehicleDocument" || value.kind === "expenseReceipt" ? value.kind : null,
    checklistKind,
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

function cleanLabel(value: unknown, fallback: string): string {
  const cleaned = stringValue(value, fallback).split(/\s+/).join(" ").trim();
  return cleaned || fallback;
}

function invoicePartLifeEntriesToReplacements(
  ownerId: string,
  vehicleRef: FirebaseFirestore.DocumentReference,
  maintenanceRecordId: string,
  entries: InvoicePartLifePersistenceEntry[]
): Array<{ ref: FirebaseFirestore.DocumentReference; value: PartReplacementRecord }> {
  // Deduplica por (canonical name + position) — duas linhas da mesma NF
  // podendo representar "par dianteiro" e "par traseiro" do mesmo nome.
  const uniqueEntries = new Map<string, InvoicePartLifePersistenceEntry & { partName: string; position: PartPosition }>();

  for (const entry of entries) {
    const partName = partNameFromServiceLabel(entry.partName);
    const identityKey = domainPartIdentityKey(partName);
    if (!identityKey) continue;
    if (!entry.lifeKm && !entry.lifeMonths) continue;
    const position = resolvePartPosition({ position: entry.position ?? null, scope: entry.scope ?? null });
    const groupKey = domainPartGroupKey(partName, position);
    if (uniqueEntries.has(groupKey)) continue;
    uniqueEntries.set(groupKey, { ...entry, partName, position });
  }

  return Array.from(uniqueEntries.entries()).map(([groupKey, entry]) => {
    const replacementId = deterministicUuid(
      "invoice-part-replacement",
      `${ownerId}:${vehicleRef.id}:${maintenanceRecordId}:${groupKey}`.toLowerCase()
    );
    const serviceTitle = `Troca de ${entry.partName}`;
    const value: PartReplacementRecord = {
      id: replacementId,
      partName: entry.partName,
      brandName: null,
      serviceTitle,
      iconName: iconNameForPartName(entry.partName),
      serviceDate: entry.serviceDate,
      amount: 0,
      mileageAtService: Math.max(0, Math.trunc(entry.mileageAtService)),
      lifeKm: entry.lifeKm ?? null,
      lifeMonths: entry.lifeMonths ?? null,
      scheduledRevisionMileage: null,
      scheduledRevisionWorkshopKind: null,
      maintenanceRecordID: maintenanceRecordId,
      quantity: nullableNumberValue(entry.quantity),
      expectedQuantity: nullableNumberValue(entry.expectedQuantity),
      scope: entry.scope ?? null,
      position: entry.position
    };

    return {
      ref: vehicleRef.collection("partReplacements").doc(replacementId),
      value
    };
  });
}

function partNameFromServiceLabel(value: unknown): string {
  const cleaned = cleanLabel(value, "Peca");
  const partName = cleaned
    .replace(/^(troca|substituicao|revisao|servico|manutencao)\s+(de|do|da|dos|das)?\s*/i, "")
    .trim();
  return partName || cleaned;
}

function maintenancePlanSummary(lifeKm: number | null, lifeMonths: number | null): string {
  const parts = [
    typeof lifeKm === "number" && Number.isFinite(lifeKm) && lifeKm > 0
      ? `${Math.trunc(lifeKm).toLocaleString("pt-BR")} km`
      : null,
    typeof lifeMonths === "number" && Number.isFinite(lifeMonths) && lifeMonths > 0
      ? `${Math.trunc(lifeMonths)} meses`
      : null
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? `Vida util planejada: ${parts.join(" / ")}` : "Vida util em acompanhamento";
}

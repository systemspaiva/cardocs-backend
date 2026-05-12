import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import {
  AutomationResult,
  InvoiceLineItem,
  InvestmentSummary,
  MaintenanceRecord,
  ResaleDossier,
  VehicleDashboard,
  VehicleGarage,
  VehicleProfile,
  VaultDocument
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
import { NotFoundError } from "../application/errors.js";

export class FirebaseGarageRepository {
  constructor(private readonly db: Firestore) {}

  async loadDashboard(ownerId: string): Promise<VehicleDashboard> {
    const vehicles = await this.db
      .collection("users")
      .doc(ownerId)
      .collection("vehicles")
      .orderBy("createdAt", "asc")
      .get();

    const garages = await Promise.all(
      vehicles.docs.map(async (doc) => this.loadGarageFromVehicleDoc(ownerId, doc.id, doc.data()))
    );

    return {
      id: deterministicUuid("dashboard", ownerId),
      garages,
      selectedGarageID: garages[0]?.id ?? zeroUuid,
      detectedVehicle: emptyDetectedVehicle()
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
    image: data?.image ?? null
  };
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
    purchaseSummary: stringValue(value.purchaseSummary, serviceTitle ?? title) || null
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
    supplierName: stringValue(value.supplierName) || null,
    serviceTitle,
    purchaseSummary: stringValue(value.purchaseSummary, summarizePurchasedInvoiceLineItems(lineItems, serviceTitle ?? title)) || null,
    source: value.source === "cameraScan" || value.source === "fileImport" || value.source === "photoLibrary" ? value.source : null,
    lineItems
  };
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

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

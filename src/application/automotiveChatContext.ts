import {
  AutomotiveChatContext,
  AutomotiveChatMessage
} from "./cardocsIaGateway.js";
import {
  MaintenanceRecord,
  PartReplacementRecord,
  PartHealth,
  VaultDocument,
  VehicleDashboard,
  VehicleGarage,
  VehicleProfile
} from "../domain/models.js";

export function buildAutomotiveChatContext(dashboard: VehicleDashboard): AutomotiveChatContext {
  const selectedGarageIndex = Math.max(
    0,
    dashboard.garages.findIndex((garage) => garage.id === dashboard.selectedGarageID)
  );

  return {
    selectedGarageIndex,
    garages: dashboard.garages.slice(0, 20).map(toGarageContext)
  };
}

export function sanitizeAutomotiveChatMessages(messages: AutomotiveChatMessage[]): AutomotiveChatMessage[] {
  return messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => ({
      role: "user",
      content: cleanText(message.content).slice(0, 2000)
    }));
}

function toGarageContext(garage: VehicleGarage) {
  return compactObject({
    vehicle: toVehicleContext(garage.vehicle),
    maintenanceHistory: garage.timeline.slice(0, 80).map(toMaintenanceContext),
    partsHealth: garage.healthItems.slice(0, 80).map(toPartHealthContext),
    partReplacements: garage.partReplacements.slice(0, 80).map(toPartReplacementContext),
    documents: garage.vaultDocuments.slice(0, 80).map(toDocumentContext),
    insurance: garage.insurance ? compactObject({
      hasInsurance: true,
      coverages: cleanText(garage.insurance.coverages),
      validUntil: cleanText(garage.insurance.validUntil)
    }) : undefined
  });
}

function toVehicleContext(vehicle: VehicleProfile) {
  return compactObject({
    kind: vehicle.kind,
    brand: cleanText(vehicle.brand),
    model: cleanText(vehicle.model),
    year: cleanText(vehicle.year),
    color: cleanText(vehicle.color),
    mileage: vehicle.mileage,
    nextServiceTitle: cleanText(vehicle.nextServiceTitle),
    nextServiceDistance: cleanText(vehicle.nextServiceDistance),
    statusTags: vehicle.statusTags.map(cleanText).filter(Boolean).slice(0, 12),
    fipe: vehicle.fipe ? compactObject({
      brand: cleanText(vehicle.fipe.brand),
      model: cleanText(vehicle.fipe.model),
      modelYear: cleanText(vehicle.fipe.modelYear),
      fuel: cleanText(vehicle.fipe.fuel),
      referenceMonth: cleanText(vehicle.fipe.referenceMonth),
      formattedValue: cleanText(vehicle.fipe.formattedValue)
    }) : undefined,
    technicalDetails: vehicle.details ? compactObject({
      fuel: cleanText(vehicle.details.fuel ?? ""),
      engineDisplacement: cleanText(vehicle.details.engineDisplacement ?? ""),
      vehicleType: cleanText(vehicle.details.vehicleType ?? ""),
      segment: cleanText(vehicle.details.segment ?? ""),
      subSegment: cleanText(vehicle.details.subSegment ?? ""),
      passengerCapacity: cleanText(vehicle.details.passengerCapacity ?? ""),
      bodyType: cleanText(vehicle.details.bodyType ?? "")
    }) : undefined
  });
}

function toMaintenanceContext(record: MaintenanceRecord) {
  return compactObject({
    title: cleanText(record.title),
    subtitle: cleanText(record.subtitle),
    date: cleanText(record.date),
    isAIValidated: record.isAIValidated,
    serviceTitle: cleanText(record.serviceTitle ?? ""),
    purchaseSummary: cleanText(record.purchaseSummary ?? ""),
    expenseKind: record.expenseKind ?? undefined
  });
}

function toPartHealthContext(item: PartHealth) {
  return compactObject({
    name: cleanText(item.name),
    message: cleanText(item.message),
    percentage: item.percentage,
    replacedAt: cleanText(item.replacedAt),
    limit: cleanText(item.limit),
    tone: item.tone,
    lastServiceDate: cleanText(item.lastServiceDate ?? ""),
    nextServiceDate: cleanText(item.nextServiceDate ?? "")
  });
}

function toPartReplacementContext(record: PartReplacementRecord) {
  return compactObject({
    partName: cleanText(record.partName),
    brandName: cleanText(record.brandName ?? ""),
    serviceTitle: cleanText(record.serviceTitle),
    serviceDate: cleanText(record.serviceDate),
    mileageAtService: record.mileageAtService,
    lifeKm: record.lifeKm ?? undefined,
    lifeMonths: record.lifeMonths ?? undefined,
    scheduledRevisionMileage: record.scheduledRevisionMileage ?? undefined,
    scheduledRevisionWorkshopKind: record.scheduledRevisionWorkshopKind ?? undefined
  });
}

function toDocumentContext(document: VaultDocument) {
  return compactObject({
    title: cleanText(document.title),
    date: cleanText(document.date),
    status: cleanText(document.status),
    kind: document.kind ?? undefined,
    documentType: cleanText(document.documentType ?? ""),
    serviceTitle: cleanText(document.serviceTitle ?? ""),
    purchaseSummary: cleanText(document.purchaseSummary ?? ""),
    expenseKind: document.expenseKind ?? undefined,
    source: document.source ?? undefined,
    lineItems: document.lineItems
      ?.map((item) => cleanText(item.description))
      .filter(Boolean)
      .slice(0, 30)
  });
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null || entry === "") return false;
      if (Array.isArray(entry) && entry.length === 0) return false;
      if (typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) return false;
      return true;
    })
  ) as Partial<T>;
}

function cleanText(value: string): string {
  return redactSensitiveText(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bhttps?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/\bgs:\/\/\S+/gi, "[STORAGE_URL_REDACTED]")
    .replace(/\b(?:firebasestorage|storage)\.googleapis\.com\/\S+/gi, "[STORAGE_URL_REDACTED]")
    .replace(/\busers\/[^\s]+\/vehicles\/[^\s]+/gi, "[STORAGE_PATH_REDACTED]")
    .replace(/\b(?:\d[\s.-]?){44}\b/g, "[CHAVE_ACESSO_REDACTED]")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[CHASSI_REDACTED]")
    .replace(/\b[A-Z]{3}[-\s]?\d[A-Z0-9]\d{2}\b/gi, "[PLACA_REDACTED]")
    .replace(/\b[A-Z]{3}[-\s]?\d{4}\b/gi, "[PLACA_REDACTED]")
    .replace(/\b(?:renavam|ie|inscricao estadual|inscri[cç][aã]o estadual)\s*[:.-]?\s*[A-Z0-9./-]+\b/gi, "[DOCUMENTO_REDACTED]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ_REDACTED]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF_REDACTED]")
    .replace(/\b\d{5}-?\d{3}\b/g, "[CEP_REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g, "[TELEFONE_REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[TOKEN_REDACTED]");
}

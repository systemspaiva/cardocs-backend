import {
  AutomotiveChatContext,
  AutomotiveChatMessage,
  AutomotiveChatReference
} from "./cardocsIaGateway.js";
import {
  MaintenanceRecord,
  PartReplacementRecord,
  PartHealth,
  InvestmentSummary,
  InvoiceLineItem,
  VaultDocument,
  VehicleInsurance,
  VehicleDashboard,
  VehicleGarage,
  VehicleProfile
} from "../domain/models.js";

export function buildAutomotiveChatContext(dashboard: VehicleDashboard): AutomotiveChatContext {
  const selectedGarageIndex = Math.max(
    0,
    dashboard.garages.findIndex((garage) => garage.id === dashboard.selectedGarageID)
  );
  const garages = dashboard.garages.slice(0, 20);

  return {
    selectedGarageIndex,
    garages: garages.map(toGarageContext),
    references: garages.flatMap(toReferenceContext).slice(0, 120)
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

function toGarageContext(garage: VehicleGarage, garageIndex: number) {
  return compactObject({
    vehicle: toVehicleContext(garage.vehicle),
    investment: toInvestmentContext(garage.investment),
    maintenanceHistory: garage.timeline.slice(0, 80).map((record, index) => toMaintenanceContext(record, referenceID(garageIndex, "service", index))),
    partsHealth: garage.healthItems.slice(0, 80).map(toPartHealthContext),
    partReplacements: garage.partReplacements.slice(0, 80).map((record, index) => toPartReplacementContext(record, referenceID(garageIndex, "part", index))),
    documents: garage.vaultDocuments.slice(0, 80).map((document, index) => toDocumentContext(document, referenceID(garageIndex, "document", index))),
    insurance: garage.insurance ? toInsuranceContext(garage.insurance) : undefined
  });
}

function toReferenceContext(garage: VehicleGarage, garageIndex: number): AutomotiveChatReference[] {
  return [
    ...garage.timeline.slice(0, 80).map((record, index) => compactObject({
      type: "maintenance_record" as const,
      referenceID: referenceID(garageIndex, "service", index),
      itemID: record.id,
      title: displayRecordTitle(record),
      subtitle: cleanText(record.purchaseSummary ?? record.serviceTitle ?? record.subtitle),
      date: cleanText(record.date),
      amount: money(record.amount)
    })),
    ...garage.vaultDocuments.slice(0, 80).map((document, index) => compactObject({
      type: "vault_document" as const,
      referenceID: referenceID(garageIndex, "document", index),
      itemID: document.id,
      title: displayDocumentTitle(document),
      subtitle: cleanText(document.purchaseSummary ?? document.serviceTitle ?? document.documentType ?? document.status),
      date: cleanText(document.date),
      amount: money(document.amount)
    })),
    ...garage.partReplacements.slice(0, 80).map((record, index) => compactObject({
      type: "part_replacement" as const,
      referenceID: referenceID(garageIndex, "part", index),
      itemID: record.maintenanceRecordID,
      title: cleanText(record.partName),
      subtitle: cleanText(record.serviceTitle),
      date: cleanText(record.serviceDate),
      amount: money(record.amount)
    }))
  ] as AutomotiveChatReference[];
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

function toInvestmentContext(investment: InvestmentSummary) {
  return compactObject({
    total: money(investment.total),
    maintenance: money(investment.maintenance),
    documentsAndTaxes: money(investment.documentsAndTaxes)
  });
}

function toMaintenanceContext(record: MaintenanceRecord, referenceIDValue: string) {
  return compactObject({
    referenceID: referenceIDValue,
    title: cleanText(record.title),
    subtitle: cleanText(record.subtitle),
    date: cleanText(record.date),
    amount: money(record.amount),
    isAIValidated: record.isAIValidated,
    supplierName: cleanText(record.supplierName ?? ""),
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

function toPartReplacementContext(record: PartReplacementRecord, referenceIDValue: string) {
  return compactObject({
    referenceID: referenceIDValue,
    partName: cleanText(record.partName),
    brandName: cleanText(record.brandName ?? ""),
    serviceTitle: cleanText(record.serviceTitle),
    serviceDate: cleanText(record.serviceDate),
    amount: money(record.amount),
    mileageAtService: record.mileageAtService,
    lifeKm: record.lifeKm ?? undefined,
    lifeMonths: record.lifeMonths ?? undefined,
    scheduledRevisionMileage: record.scheduledRevisionMileage ?? undefined,
    scheduledRevisionWorkshopKind: record.scheduledRevisionWorkshopKind ?? undefined
  });
}

function toDocumentContext(document: VaultDocument, referenceIDValue: string) {
  return compactObject({
    referenceID: referenceIDValue,
    title: cleanText(document.title),
    date: cleanText(document.date),
    amount: money(document.amount),
    status: cleanText(document.status),
    kind: document.kind ?? undefined,
    documentType: cleanText(document.documentType ?? ""),
    supplierName: cleanText(document.supplierName ?? ""),
    serviceTitle: cleanText(document.serviceTitle ?? ""),
    purchaseSummary: cleanText(document.purchaseSummary ?? ""),
    expenseKind: document.expenseKind ?? undefined,
    source: document.source ?? undefined,
    lineItems: document.lineItems
      ?.map(toLineItemContext)
      .filter((item) => Object.keys(item).length > 0)
      .slice(0, 30)
  });
}

function toLineItemContext(item: InvoiceLineItem) {
  return compactObject({
    description: cleanText(item.description),
    quantity: item.quantity ?? undefined,
    unitAmount: money(item.unitAmount),
    totalAmount: money(item.totalAmount)
  });
}

function toInsuranceContext(insurance: VehicleInsurance) {
  return compactObject({
    hasInsurance: true,
    insurerName: cleanText(insurance.insurerName),
    premiumAmount: money(insurance.premiumAmount),
    premiumPeriod: insurance.premiumPeriod,
    deductibleAmount: money(insurance.deductibleAmount),
    deductibleNotes: cleanText(insurance.deductibleNotes ?? ""),
    coverages: cleanText(insurance.coverages),
    validUntil: cleanText(insurance.validUntil)
  });
}

function referenceID(garageIndex: number, kind: "service" | "document" | "part", itemIndex: number): string {
  return `g${garageIndex + 1}_${kind}_${itemIndex + 1}`;
}

function displayRecordTitle(record: MaintenanceRecord): string {
  return cleanText(record.supplierName ?? record.title);
}

function displayDocumentTitle(document: VaultDocument): string {
  return cleanText(document.supplierName ?? document.title);
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

function money(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return Math.round(value * 100) / 100;
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

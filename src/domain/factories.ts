import { createHash } from "node:crypto";
import {
  InvestmentSummary,
  PartHealth,
  PartReplacementRecord,
  ResaleDossier,
  VehicleCandidate,
  VehicleGarage,
  VehicleInsurance,
  VehicleKind,
  VehicleProfile
} from "./models.js";
import { ValidationError } from "../application/errors.js";

export const zeroUuid = "00000000-0000-5000-8000-000000000000";
export const zeroInvestment: InvestmentSummary = {
  total: 0,
  maintenance: 0,
  documentsAndTaxes: 0
};

export function deterministicUuid(namespace: string, value: string): string {
  const bytes = createHash("sha256").update(`${namespace}:${value}`).digest();
  const uuid = Buffer.from(bytes.subarray(0, 16));
  uuid[6] = (uuid[6] & 0x0f) | 0x50;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = uuid.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizePlate(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizePublicReportSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
}

export function publicReportSlug(vehicle: Pick<VehicleProfile, "id" | "plate">): string {
  const plate = normalizePlate(vehicle.plate);
  const vehicleSuffix = normalizePlate(vehicle.id).slice(0, 8);
  return normalizePublicReportSlug(vehicleSuffix ? `${plate}-${vehicleSuffix}` : plate);
}

export function assertValidBrazilianPlate(value: string): void {
  const plate = normalizePlate(value);
  const isValid =
    plate.length === 7 &&
    /^[A-Z]{3}/.test(plate.slice(0, 3)) &&
    /^\d$/.test(plate[3]) &&
    /^[A-Z0-9]$/.test(plate[4]) &&
    /^\d{2}$/.test(plate.slice(5));

  if (!isValid) {
    throw new ValidationError("Informe uma placa brasileira valida.");
  }
}

export function normalizeKind(value: string): VehicleKind {
  const normalized = value.trim().toLowerCase();
  if (["car", "cars", "auto", "automovel"].includes(normalized)) return "car";
  if (["motorcycle", "moto", "motorbike"].includes(normalized)) return "motorcycle";
  throw new ValidationError("Tipo de veiculo invalido.");
}

export function assertRealVehicleData(candidate: Pick<VehicleCandidate, "brand" | "model" | "year">): void {
  const fields = [candidate.brand, candidate.model, candidate.year];
  const invalid = fields.some((field) => {
    const normalized = field.trim().toLowerCase();
    return (
      normalized.length === 0 ||
      normalized === "veiculo" ||
      normalized === "veículo" ||
      normalized === "a confirmar" ||
      normalized === "nao informado" ||
      normalized === "não informado"
    );
  });

  if (invalid) {
    throw new ValidationError("Marca, modelo e ano reais sao obrigatorios para cadastrar ou buscar foto do veiculo.");
  }
}

export function toVehicleProfile(
  ownerId: string,
  candidate: VehicleCandidate,
  initialMileage: number,
  options: { plateVerified?: boolean } = {}
): VehicleProfile {
  const plate = normalizePlate(candidate.plate);
  assertValidBrazilianPlate(plate);
  assertRealVehicleData(candidate);

  return {
    id: deterministicUuid("vehicle", `${ownerId}:${plate}`),
    kind: normalizeKind(candidate.kind),
    plate,
    maskedPlate: maskLastCharacter(plate),
    brand: candidate.brand.trim(),
    model: candidate.model.trim(),
    year: candidate.year.trim(),
    color: candidate.color.trim(),
    mileage: Math.max(0, Math.trunc(initialMileage || 0)),
    nextServiceTitle: "Primeira organizacao",
    nextServiceDistance: "Pronto para importar historico",
    statusTags: [options.plateVerified ? "Placa Verificada" : "Placa cadastrada"],
    image: candidate.image ?? null,
    photos: candidate.image ? [candidate.image] : [],
    fipe: candidate.fipe ?? null,
    details: candidate.details ?? null
  };
}

export function toManualVehicleProfile(
  ownerId: string,
  input: { kind: string; brand: string; model: string; year: string; color: string; initialMileage: number }
): VehicleProfile {
  const brand = input.brand.trim();
  const model = input.model.trim();
  const year = input.year.trim();
  const color = input.color.trim() || "Não informado";

  // Gera um ID determinístico baseado em marca+modelo+ano+owner (sem placa)
  const id = deterministicUuid("manual-vehicle", `${ownerId}:${brand}:${model}:${year}`.toLowerCase());

  return {
    id,
    kind: normalizeKind(input.kind),
    plate: "MANUAL",
    maskedPlate: "------",
    brand,
    model,
    year,
    color,
    mileage: Math.max(0, Math.trunc(input.initialMileage || 0)),
    nextServiceTitle: "Primeira organização",
    nextServiceDistance: "Pronto para importar histórico",
    statusTags: ["Cadastrado manualmente"],
    image: null,
    photos: [],
    fipe: null,
    details: null
  };
}

export function pendingHealth(vehicle: VehicleProfile): PartHealth[] {
  return [
    partHealth(vehicle, "oil", "drop", "Oleo e Filtros", "Aguardando primeira nota"),
    partHealth(vehicle, "tires", "circle.dotted", "Pneus", "Sem historico importado"),
    partHealth(vehicle, "brakes", "record.circle", "Freios", "Aguardando revisao"),
    partHealth(vehicle, "battery", "bolt.fill", "Bateria", "Sem registro ainda")
  ];
}

export function calculatePartHealth(vehicle: VehicleProfile, replacements: PartReplacementRecord[]): PartHealth[] {
  if (replacements.length === 0) {
    return pendingHealth(vehicle);
  }

  const latestByPart = new Map<string, PartReplacementRecord>();
  for (const replacement of replacements) {
    const key = partIdentityKey(replacement.partName);
    const current = latestByPart.get(key);
    if (!current || isReplacementNewer(replacement, current)) {
      latestByPart.set(key, replacement);
    }
  }

  return Array.from(latestByPart.values())
    .map((replacement) => toPartHealth(vehicle, replacement))
    .sort((left, right) => {
      if (left.tone !== right.tone) return toneRank(left.tone) - toneRank(right.tone);
      return left.percentage - right.percentage;
    });
}

export function iconNameForPartName(value: string): string {
  const normalized = partIdentityKey(value);
  if (/oleo|oil|filtro/.test(normalized)) return "drop";
  if (/pneu|tire|roda/.test(normalized)) return "circle.dotted";
  if (/freio|brake|pastilha|disco/.test(normalized)) return "record.circle";
  if (/bateria|battery/.test(normalized)) return "bolt.fill";
  if (/suspens|amortecedor/.test(normalized)) return "car.side";
  if (/correia|belt/.test(normalized)) return "link";
  if (/vela|ignicao/.test(normalized)) return "sparkplug";
  return "wrench.adjustable";
}

export function generateResaleDossier(
  vehicle: VehicleProfile,
  garage: Pick<VehicleGarage, "timeline" | "vaultDocuments"> & { insurance?: VehicleInsurance | null },
  publicReportBaseURL = "https://cardocs-backend-5qq5b33fha-rj.a.run.app"
): ResaleDossier {
  const hasHistory = garage.timeline.length > 0 || garage.vaultDocuments.length > 0;
  const hasInsurance = Boolean(garage.insurance?.insurerName);
  const slug = publicReportSlug(vehicle);
  const maintenanceTotal = garage.timeline.reduce((sum, record) => sum + safeMoney(record.amount), 0);
  const documentCount = garage.vaultDocuments.length;
  const estimatedIncrease = hasHistory ? roundMoney(maintenanceTotal * 0.2) : 0;
  const score = hasHistory ? Math.min(96, Math.max(50, 50 + garage.timeline.length * 8 + documentCount * 10 + (hasInsurance ? 8 : 0))) : 42;

  return {
    title: hasHistory ? "Dossie CarDocs" : "Dossie em preparo",
    summary: hasHistory ?
      "Historico consolidado com manutencoes, documentos e sinais de procedencia." :
      "Importe notas e documentos para transformar este veiculo em um historico pronto para venda.",
    score,
    estimatedValueIncrease: estimatedIncrease,
    publicReportURL: `${publicReportBaseURL}/r/${slug}`,
    highlights: [
      {
        id: deterministicUuid("resale-highlight", `${slug}:origin`),
        iconName: "checkmark.seal.fill",
        title: "Procedencia",
        value: vehicle.statusTags.includes("Placa Verificada") ? "Placa verificada" : "Placa cadastrada"
      },
      {
        id: deterministicUuid("resale-highlight", `${slug}:documents`),
        iconName: "doc.text.fill",
        title: "Documentos",
        value: `${documentCount} anexos`
      },
      {
        id: deterministicUuid("resale-highlight", `${slug}:value`),
        iconName: "chart.line.uptrend.xyaxis",
        title: "Valorizacao",
        value: hasHistory ? `+${estimatedIncrease.toFixed(2)}` : "Pendente"
      },
      {
        id: deterministicUuid("resale-highlight", `${slug}:insurance`),
        iconName: "shield.lefthalf.filled",
        title: "Seguro",
        value: hasInsurance ? garage.insurance!.insurerName : "Nao informado"
      }
    ],
    checks: hasHistory ?
      ["Placa cadastrada", "Manutencoes registradas", "Documentos centralizados", ...(hasInsurance ? ["Seguro registrado"] : [])] :
      ["Placa cadastrada", "Aguardando notas fiscais", "Aguardando documentos"],
    reportSections: [
      {
        id: deterministicUuid("resale-section", `${slug}:maintenance`),
        iconName: "wrench.adjustable",
        title: "Historico de manutencao",
        status: garage.timeline.length > 0 ? "Completo" : "Pendente",
        detail: garage.timeline.length > 0 ?
          `${garage.timeline.length} registros organizados no historico.` :
          "Leia notas para preencher revisoes, oleo, pneus, freios e bateria."
      },
      {
        id: deterministicUuid("resale-section", `${slug}:documents`),
        iconName: "doc.text.fill",
        title: "Documentos e impostos",
        status: documentCount > 0 ? "Organizado" : "Pendente",
        detail: documentCount > 0 ?
          `${documentCount} documentos no cofre digital.` :
          "Adicione comprovantes para fortalecer o relatorio publico."
      },
      {
        id: deterministicUuid("resale-section", `${slug}:trust`),
        iconName: "shield.lefthalf.filled",
        title: "Confianca para comprador",
        status: hasHistory ? "Pronto" : "Em preparo",
        detail: hasHistory ?
          "Relatorio publico gerado a partir dos dados salvos no CarDocs." :
          "O link sera mais forte quando houver documentos validados."
      },
      {
        id: deterministicUuid("resale-section", `${slug}:insurance`),
        iconName: "shield.checkered",
        title: "Seguro do veiculo",
        status: hasInsurance ? "Registrado" : "Pendente",
        detail: hasInsurance ?
          `${garage.insurance!.insurerName} ate ${garage.insurance!.validUntil}.` :
          "Adicione seguradora, coberturas, franquias e validade para completar o dossie."
      }
    ]
  };
}

export function emptyDetectedVehicle(): VehicleCandidate {
  return {
    id: zeroUuid,
    kind: "car",
    plate: "",
    brand: "",
    model: "",
    year: "",
    color: "",
    image: null,
    fipe: null,
    details: null
  };
}

export function safeMoney(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function maskLastCharacter(value: string): string {
  return value.length === 0 ? "*" : `${value.slice(0, -1)}*`;
}

function partHealth(vehicle: VehicleProfile, key: string, iconName: string, name: string, message: string): PartHealth {
  return {
    id: deterministicUuid("part-health", `${vehicle.id}:${key}`),
    iconName,
    name,
    message,
    percentage: 0,
    replacedAt: "Nao informado",
    limit: "Nao informado",
    tone: "neutral",
    lastServiceDate: null,
    nextServiceDate: null
  };
}

function toPartHealth(vehicle: VehicleProfile, replacement: PartReplacementRecord): PartHealth {
  const currentMileage = Math.max(0, Math.trunc(vehicle.mileage || 0));
  const lifeKm = positiveIntegerOrNull(replacement.lifeKm);
  const lifeMonths = positiveIntegerOrNull(replacement.lifeMonths);
  const serviceDate = parseMaintenanceDate(replacement.serviceDate);
  const dueDate = serviceDate && lifeMonths ? addMonths(serviceDate, lifeMonths) : null;
  const nextMileage = lifeKm ? replacement.mileageAtService + lifeKm : null;
  const kmRemaining = nextMileage === null ? null : nextMileage - currentMileage;
  const dayRemaining = dueDate ? wholeDaysBetween(startOfToday(), dueDate) : null;
  const percentages = [
    lifeKm ? clampPercent(Math.round(((nextMileage! - currentMileage) / lifeKm) * 100)) : null,
    serviceDate && dueDate ? clampPercent(Math.round((wholeDaysBetween(startOfToday(), dueDate) / Math.max(1, wholeDaysBetween(serviceDate, dueDate))) * 100)) : null
  ].filter((value): value is number => value !== null);
  const percentage = percentages.length > 0 ? Math.min(...percentages) : 100;
  const limitParts = [
    nextMileage === null ? null : `${formatMileage(nextMileage)} km`,
    dueDate === null ? null : formatMaintenanceDate(dueDate)
  ].filter((value): value is string => Boolean(value));

  return {
    id: deterministicUuid("part-health", `${vehicle.id}:${partIdentityKey(replacement.partName)}`),
    iconName: replacement.iconName || iconNameForPartName(replacement.partName),
    name: replacement.partName,
    message: replacementStatusMessage(percentage, kmRemaining, dayRemaining),
    percentage,
    replacedAt: `${formatMileage(replacement.mileageAtService)} km`,
    limit: limitParts.join(" / ") || "Nao informado",
    tone: percentage <= 35 ? "warning" : "healthy",
    lastServiceDate: replacement.serviceDate,
    nextServiceDate: dueDate === null ? null : formatMaintenanceDate(dueDate)
  };
}

function replacementStatusMessage(percentage: number, kmRemaining: number | null, dayRemaining: number | null): string {
  if (percentage <= 0) return "Troca vencida";
  if (kmRemaining !== null && kmRemaining <= 1000) return `Troca em ${formatMileage(Math.max(0, kmRemaining))} km`;
  if (dayRemaining !== null && dayRemaining <= 30) return `Troca em ${Math.max(0, dayRemaining)} dias`;
  if (percentage <= 35) return "Planeje a proxima troca";
  return "Dentro do plano";
}

function normalizePartKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function partIdentityKey(value: string): string {
  return stripServicePrefix(normalizePartKey(value)) || normalizePartKey(value);
}

function stripServicePrefix(value: string): string {
  return value
    .replace(/^(troca|substituicao|revisao|servico|manutencao)\s+(de|do|da|dos|das)?\s*/i, "")
    .trim();
}

function isReplacementNewer(left: PartReplacementRecord, right: PartReplacementRecord): boolean {
  if (left.mileageAtService !== right.mileageAtService) {
    return left.mileageAtService > right.mileageAtService;
  }
  return maintenanceDateTime(left.serviceDate) >= maintenanceDateTime(right.serviceDate);
}

function toneRank(tone: PartHealth["tone"]): number {
  switch (tone) {
    case "warning":
      return 0;
    case "neutral":
      return 1;
    case "healthy":
      return 2;
  }
}

function positiveIntegerOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function parseMaintenanceDate(value: string): Date | null {
  const trimmed = value.trim();
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maintenanceDateTime(value: string): number {
  return parseMaintenanceDate(value)?.getTime() ?? 0;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDayOfTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return next;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function wholeDaysBetween(start: Date, end: Date): number {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.ceil((endDay.getTime() - startDay.getTime()) / 86_400_000);
}

function formatMaintenanceDate(date: Date): string {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getFullYear())
  ].join("/");
}

function formatMileage(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("pt-BR");
}

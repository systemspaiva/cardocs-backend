import { createHash } from "node:crypto";
import {
  InvestmentSummary,
  PartHealth,
  ResaleDossier,
  VehicleCandidate,
  VehicleGarage,
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

export function toVehicleProfile(ownerId: string, candidate: VehicleCandidate, initialMileage: number): VehicleProfile {
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
    statusTags: ["Placa cadastrada"],
    image: null
  };
}

export function pendingHealth(vehicle: VehicleProfile): PartHealth[] {
  return [
    partHealth(vehicle, "oil", "drop", "Oleo e Filtros", "Aguardando primeira nota"),
    partHealth(vehicle, "tires", "circle.dotted", "Pneus", "Sem historico importado"),
    partHealth(vehicle, "brakes", "record.circle", "Freios", "Aguardando revisao"),
    partHealth(vehicle, "battery", "bolt.heart", "Bateria", "Sem registro ainda")
  ];
}

export function generateResaleDossier(
  vehicle: VehicleProfile,
  garage: Pick<VehicleGarage, "timeline" | "vaultDocuments">,
  publicReportBaseURL = "https://cardocs-app.web.app"
): ResaleDossier {
  const hasHistory = garage.timeline.length > 0 || garage.vaultDocuments.length > 0;
  const slug = publicReportSlug(vehicle);
  const maintenanceTotal = garage.timeline.reduce((sum, record) => sum + safeMoney(record.amount), 0);
  const documentCount = garage.vaultDocuments.length;
  const estimatedIncrease = hasHistory ? roundMoney(maintenanceTotal * 0.2) : 0;
  const score = hasHistory ? Math.min(96, Math.max(50, 50 + garage.timeline.length * 8 + documentCount * 10)) : 42;

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
      }
    ],
    checks: hasHistory ?
      ["Placa cadastrada", "Manutencoes registradas", "Documentos centralizados"] :
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
    image: null
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
    tone: "neutral"
  };
}

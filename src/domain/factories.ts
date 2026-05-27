import { createHash } from "node:crypto";
import {
  InvestmentSummary,
  MultiUnitPartCatalogEntry,
  PartHealth,
  PartHealthHistoryEntry,
  PartPosition,
  PartPositionOption,
  PartReplacementCatalog,
  PartReplacementRecord,
  PartReplacementScope,
  ResaleDossier,
  VehicleCandidate,
  VehicleGarage,
  VehicleInsurance,
  VehicleKind,
  VehicleProfile
} from "./models.js";
import { ValidationError } from "../application/errors.js";

const maximumHistoryEntries = 8;

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

interface MultiUnitPattern {
  id: string;
  displayName: string;
  expectedUnits: number;
  patterns: RegExp[];
}

/**
 * Peças que existem em múltiplas unidades no veículo. Quando o nome casa
 * um padrão aqui, o formulário de adição obriga o usuário a escolher
 * `position` (par dianteiro, traseiro esquerdo, etc.) e o cálculo de
 * saúde isola cada grupo.
 */
const MULTI_UNIT_PART_PATTERNS: MultiUnitPattern[] = [
  {
    id: "pneu",
    displayName: "Pneus",
    expectedUnits: 4,
    patterns: [/\bpneu/]
  },
  {
    id: "disco-freio",
    displayName: "Discos de freio",
    expectedUnits: 4,
    patterns: [/\bdisco/]
  },
  {
    id: "pastilha-freio",
    displayName: "Pastilhas de freio",
    expectedUnits: 4,
    patterns: [/\bpastilha/]
  },
  {
    id: "amortecedor",
    displayName: "Amortecedores",
    expectedUnits: 4,
    patterns: [/\bamortecedor/]
  },
  {
    id: "mola",
    displayName: "Molas",
    expectedUnits: 4,
    patterns: [/\bmola/]
  }
];

export function findMultiUnitCatalogEntry(partName: string): MultiUnitPattern | null {
  const key = partIdentityKey(partName);
  return MULTI_UNIT_PART_PATTERNS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(key))
  ) ?? null;
}

export function isMultiUnitPart(partName: string): boolean {
  return findMultiUnitCatalogEntry(partName) !== null;
}

export const POSITION_OPTIONS: PartPositionOption[] = [
  { value: "complete", label: "Jogo completo", units: null },
  { value: "front_axle", label: "Par dianteiro", units: 2 },
  { value: "rear_axle", label: "Par traseiro", units: 2 },
  { value: "front_left", label: "Dianteiro esquerdo", units: 1 },
  { value: "front_right", label: "Dianteiro direito", units: 1 },
  { value: "rear_left", label: "Traseiro esquerdo", units: 1 },
  { value: "rear_right", label: "Traseiro direito", units: 1 }
];

const POSITION_LABEL = new Map<PartPosition, string>([
  ["complete", "Jogo completo"],
  ["front_axle", "Par dianteiro"],
  ["rear_axle", "Par traseiro"],
  ["front_left", "Dianteiro esquerdo"],
  ["front_right", "Dianteiro direito"],
  ["rear_left", "Traseiro esquerdo"],
  ["rear_right", "Traseiro direito"],
  ["partial", "Troca parcial"]
]);

export function positionLabel(position: PartPosition): string {
  return POSITION_LABEL.get(position) ?? "Jogo completo";
}

/**
 * Migra scope legado pra position. Registros antigos sem nenhuma das
 * duas viram "complete" (jogo completo) por padrão.
 */
export function migrateScopeToPosition(scope: PartReplacementScope | null | undefined): PartPosition {
  if (!scope) return "complete";
  if (scope === "front") return "front_axle";
  if (scope === "rear") return "rear_axle";
  if (scope === "partial") return "partial";
  return "complete";
}

/**
 * Resolve a `position` efetiva de um replacement, priorizando o campo novo
 * mas caindo no `scope` legado pra registros antigos no Firestore.
 */
export function resolvePartPosition(record: {
  position?: PartPosition | null;
  scope?: PartReplacementScope | null;
}): PartPosition {
  if (record.position) return record.position;
  return migrateScopeToPosition(record.scope ?? null);
}

/**
 * Identidade de um grupo monitorado: nome canônico da peça + posição.
 * Determina como `calculatePartHealth` agrupa registros e como o iOS
 * exibe linhas separadas pra cada grupo de saúde.
 */
export function partGroupKey(partName: string, position: PartPosition): string {
  return `${partIdentityKey(partName)}:${position}`;
}

export function partReplacementCatalog(): PartReplacementCatalog {
  const parts: MultiUnitPartCatalogEntry[] = MULTI_UNIT_PART_PATTERNS.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    expectedUnits: entry.expectedUnits,
    matchPatterns: entry.patterns.map((pattern) => pattern.source)
  }));
  return { parts, positions: POSITION_OPTIONS };
}

export function calculatePartHealth(vehicle: VehicleProfile, replacements: PartReplacementRecord[]): PartHealth[] {
  if (replacements.length === 0) {
    return pendingHealth(vehicle);
  }

  // Agrupa por (canonical name + position) — cada grupo vira um PartHealth
  // independente, com cálculo isolado de % e histórico.
  const groupedByGroup = new Map<string, PartReplacementRecord[]>();
  // Index reverso: quais positions específicas existem por canonical name.
  // Usado pra suprimir o grupo "complete" legado quando o usuário já tem
  // entradas mais específicas (front_axle, rear_left, etc.) — evita o
  // "item fantasma vencido" causado pela migração de registros antigos.
  const specificPositionsByPart = new Map<string, Set<PartPosition>>();
  for (const replacement of replacements) {
    const position = resolvePartPosition(replacement);
    const identity = partIdentityKey(replacement.partName);
    const key = `${identity}:${position}`;
    const bucket = groupedByGroup.get(key) ?? [];
    bucket.push(replacement);
    groupedByGroup.set(key, bucket);

    if (position !== "complete" && position !== "partial") {
      const set = specificPositionsByPart.get(identity) ?? new Set<PartPosition>();
      set.add(position);
      specificPositionsByPart.set(identity, set);
    }
  }

  return Array.from(groupedByGroup.entries())
    .filter(([key]) => {
      // Se uma peça tem positions específicas (front_axle, rear_left, etc.),
      // não exibir o grupo "complete" — ele representa registro legado que
      // foi refinado por entradas mais específicas. O histórico continua
      // no timeline; só some da tela de saúde.
      const [identity, position] = key.split(":");
      if (position !== "complete") return true;
      const specifics = specificPositionsByPart.get(identity);
      return !specifics || specifics.size === 0;
    })
    .map(([, group]) => {
      const sorted = [...group].sort((a, b) => (isReplacementNewer(a, b) ? -1 : 1));
      const latest = sorted[0];
      return toPartHealth(vehicle, latest, sorted);
    })
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
  if (/suspens|amortecedor|mola/.test(normalized)) return "car.side";
  if (/correia|belt/.test(normalized)) return "link";
  if (/vela|ignicao/.test(normalized)) return "sparkplug";
  return "wrench.adjustable";
}

export function generateResaleDossier(
  vehicle: VehicleProfile,
  garage: Pick<VehicleGarage, "timeline" | "vaultDocuments"> & {
    insurance?: VehicleInsurance | null;
    partReplacements?: PartReplacementRecord[];
  },
  publicReportBaseURL = "https://cardocs-backend-5qq5b33fha-rj.a.run.app"
): ResaleDossier {
  const hasHistory = garage.timeline.length > 0 || garage.vaultDocuments.length > 0;
  const hasInsurance = Boolean(garage.insurance?.insurerName);
  const slug = publicReportSlug(vehicle);
  const maintenanceTotal = garage.timeline.reduce((sum, record) => sum + safeMoney(record.amount), 0);
  const documentCount = garage.vaultDocuments.length;
  const estimatedIncrease = hasHistory ? roundMoney(maintenanceTotal * 0.2) : 0;
  const score = hasHistory ? Math.min(96, Math.max(50, 50 + garage.timeline.length * 8 + documentCount * 10 + (hasInsurance ? 8 : 0))) : 42;
  // Saúde por grupo (position): se houver partReplacements, calcula PartHealth
  // e seleciona os críticos (≤35%) pra destacar no dossiê. Comprador potencial
  // vê "Pastilhas traseiras a 12%" em vez de só "Pastilhas".
  const healthItems = garage.partReplacements
    ? calculatePartHealth(vehicle, garage.partReplacements)
    : [];
  const criticalHealthItems = healthItems
    .filter((item) => item.tone === "warning" && item.percentage <= 35)
    .sort((a, b) => a.percentage - b.percentage);
  const partsHealthDetail = healthItems.length === 0
    ? "Sem trocas registradas — adicione manutenções para gerar a saúde de peças."
    : criticalHealthItems.length === 0
      ? `${healthItems.length} ${healthItems.length === 1 ? "grupo monitorado" : "grupos monitorados"} dentro do plano.`
      : criticalHealthItems
          .slice(0, 4)
          .map((item) => {
            const positionSuffix = item.isMultiUnit ? ` (${item.positionLabel.toLowerCase()})` : "";
            return `${item.name}${positionSuffix} ${item.percentage}%`;
          })
          .join(" · ");
  const partsHealthStatus = healthItems.length === 0
    ? "Pendente"
    : criticalHealthItems.length === 0
      ? "Em dia"
      : `${criticalHealthItems.length} ${criticalHealthItems.length === 1 ? "grupo" : "grupos"} em atenção`;

  return {
    title: hasHistory ? "Dossie Tá Revisado" : "Dossie em preparo",
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
          "Relatorio publico gerado a partir dos dados salvos no Tá Revisado" :
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
      },
      {
        id: deterministicUuid("resale-section", `${slug}:parts-health`),
        iconName: "gauge.with.dots.needle.50percent",
        title: "Saude de pecas monitoradas",
        status: partsHealthStatus,
        detail: partsHealthDetail
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
    nextServiceDate: null,
    replacementCount: 0,
    lastQuantity: null,
    expectedQuantity: null,
    lastScope: null,
    position: "complete",
    isMultiUnit: isMultiUnitPart(name),
    positionLabel: positionLabel("complete"),
    history: []
  };
}

function toPartHealth(vehicle: VehicleProfile, replacement: PartReplacementRecord, group: PartReplacementRecord[] = [replacement]): PartHealth {
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

  const position = resolvePartPosition(replacement);
  const multiUnit = isMultiUnitPart(replacement.partName);
  const positionDescription = positionLabel(position);

  const history: PartHealthHistoryEntry[] = group.slice(0, maximumHistoryEntries).map((entry) => ({
    id: deterministicUuid("part-health-history", `${vehicle.id}:${entry.id}`),
    serviceDate: entry.serviceDate,
    mileageAtService: entry.mileageAtService,
    amount: entry.amount,
    quantity: entry.quantity ?? null,
    expectedQuantity: entry.expectedQuantity ?? null,
    scope: entry.scope ?? null,
    position: resolvePartPosition(entry),
    supplierLabel: null
  }));

  return {
    id: deterministicUuid("part-health", `${vehicle.id}:${partGroupKey(replacement.partName, position)}`),
    iconName: replacement.iconName || iconNameForPartName(replacement.partName),
    name: replacement.partName,
    message: replacementStatusMessage(
      percentage,
      kmRemaining,
      dayRemaining,
      position,
      multiUnit,
      replacement.quantity ?? null,
      replacement.expectedQuantity ?? null
    ),
    percentage,
    replacedAt: `${formatMileage(replacement.mileageAtService)} km`,
    limit: limitParts.join(" / ") || "Nao informado",
    tone: percentage <= 35 ? "warning" : "healthy",
    lastServiceDate: replacement.serviceDate,
    nextServiceDate: dueDate === null ? null : formatMaintenanceDate(dueDate),
    replacementCount: group.length,
    lastQuantity: replacement.quantity ?? null,
    expectedQuantity: replacement.expectedQuantity ?? null,
    lastScope: replacement.scope ?? null,
    position,
    isMultiUnit: multiUnit,
    positionLabel: positionDescription,
    history
  };
}

function replacementStatusMessage(
  percentage: number,
  kmRemaining: number | null,
  dayRemaining: number | null,
  position: PartPosition,
  isMultiUnit: boolean,
  quantity: number | null,
  expectedQuantity: number | null
): string {
  const baseMessage = baseReplacementStatusMessage(percentage, kmRemaining, dayRemaining);
  const positionNote = describePosition(position, isMultiUnit, quantity, expectedQuantity);
  return positionNote ? `${baseMessage} · ${positionNote}` : baseMessage;
}

function baseReplacementStatusMessage(percentage: number, kmRemaining: number | null, dayRemaining: number | null): string {
  if (percentage <= 0) return "Troca vencida";
  if (kmRemaining !== null && kmRemaining <= 1000) return `Troca em ${formatMileage(Math.max(0, kmRemaining))} km`;
  if (dayRemaining !== null && dayRemaining <= 30) return `Troca em ${Math.max(0, dayRemaining)} dias`;
  if (percentage <= 35) return "Planeje a proxima troca";
  return "Dentro do plano";
}

function describePosition(
  position: PartPosition,
  isMultiUnit: boolean,
  quantity: number | null,
  expectedQuantity: number | null
): string | null {
  if (position === "partial") {
    if (quantity && expectedQuantity) return `${quantity} de ${expectedQuantity} trocadas`;
    return "troca parcial";
  }
  if (position === "complete") {
    if (isMultiUnit && quantity && expectedQuantity && quantity < expectedQuantity) {
      return `${quantity} de ${expectedQuantity} trocadas`;
    }
    return isMultiUnit ? "jogo completo" : null;
  }
  return positionLabel(position).toLowerCase();
}

function normalizePartKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function partIdentityKey(value: string): string {
  const stripped = stripServicePrefix(normalizePartKey(value));
  const semantic = stripAxleScope(stripFillerWords(singularize(stripped)));
  return semantic || stripped || normalizePartKey(value);
}

function stripServicePrefix(value: string): string {
  return value
    .replace(/^(troca|substituicao|revisao|servico|manutencao)\s+(de|do|da|dos|das)?\s*/i, "")
    .trim();
}

/// Remove descritor de eixo pra "pastilhas dianteiras" colapsar com "pastilhas".
/// O scope/eixo é armazenado separadamente no PartReplacementRecord.
function stripAxleScope(value: string): string {
  return value
    .replace(/\b(dianteir[ao]s?|traseir[ao]s?|trazeir[ao]s?|diant|tras|front|rear|frontal|completo|completa|kit|jogo|conjunto)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/// Heurística leve pra colapsar plurais portugueses ("amortecedores" → "amortecedor",
/// "pastilhas" → "pastilha"). Não cobre todos os casos mas resolve o comum.
function singularize(value: string): string {
  return value
    .split(" ")
    .map((token) => {
      if (token.length <= 3) return token;
      if (token.endsWith("oes")) return token.slice(0, -3) + "ao"; // alternadores → alternador (não comum), mas botões → botão
      if (token.endsWith("aes")) return token.slice(0, -3) + "ao";
      if (token.endsWith("es")) return token.slice(0, -2);
      if (token.endsWith("s")) return token.slice(0, -1);
      return token;
    })
    .join(" ");
}

/// Tira preposições que viram ruído no match ("pastilha de freio" e "pastilha"
/// devem casar). Mantém substantivos significativos.
function stripFillerWords(value: string): string {
  const filler = new Set(["de", "do", "da", "dos", "das", "e", "para", "p"]);
  return value
    .split(" ")
    .filter((token) => token.length > 0 && !filler.has(token))
    .join(" ");
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

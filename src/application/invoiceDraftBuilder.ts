import {
  InvoiceDocumentInput,
  InvoiceDraftMissingField,
  InvoiceExpenseKind,
  InvoiceLineItem,
  InvoicePartLifeRecommendation,
  InvoiceScanDraft,
  PartReplacementScope
} from "../domain/models.js";
import { deterministicUuid, roundMoney, safeMoney } from "../domain/factories.js";

export type InvoiceExtractionExpenseKind = "vehicleService" | "partOrProduct" | "documentOrTax" | "unknown";

export interface InvoiceExtractionItem {
  description: string;
  quantity: number | null;
  unitAmount: number | null;
  totalAmount: number;
}

export interface InvoiceExtraction {
  supplier: { name: string | null; taxId: string | null };
  issuedAt: { date: string | null; time: string | null };
  totalAmount: number | null;
  mileage: number | null;
  expenseKind: InvoiceExtractionExpenseKind;
  items: InvoiceExtractionItem[];
  confidence: number;
}

export interface PartLifeSuggestionItem {
  partName: string;
  lifeKm: number | null;
  lifeMonths: number | null;
  confidence: number;
  rationale: string;
  sourceDescriptions: string[];
  expectedQuantity?: number | null;
  detectedQuantity?: number | null;
  scope?: PartReplacementScope | null;
}

export function buildInvoiceScanDraft(
  extraction: InvoiceExtraction,
  input: InvoiceDocumentInput,
  partLifeSuggestions: PartLifeSuggestionItem[] = []
): InvoiceScanDraft {
  const date = normalizeBrazilianDate(extraction.issuedAt.date);
  const time = normalizeTime(extraction.issuedAt.time);
  const amount = clampMoney(extraction.totalAmount);
  const mileage = Math.max(0, Math.trunc(extraction.mileage ?? 0));
  const supplierName = sanitizeLabel(extraction.supplier.name) ?? "";

  const isDocumentOrTax = extraction.expenseKind === "documentOrTax";
  const expenseKind = mapExpenseKind(extraction.expenseKind);
  const lineItems = normalizeLineItems(extraction.items);
  const serviceTitle = sanitizeLabel(suggestServiceTitle(extraction, lineItems)) ?? "";
  const category = inferCategory(extraction.expenseKind, serviceTitle, lineItems);

  const baseSeed = `${date || "missing-date"}:${amount || "missing-amount"}:${supplierName || "missing-supplier"}:${serviceTitle || "missing-service"}`;
  const draftId = deterministicUuid("invoice-draft", baseSeed);
  const confidence = clampConfidence(extraction.confidence);

  const items = lineItems.map((item, index) => ({
    id: deterministicUuid("invoice-line-item", `${draftId}:${index}:${item.description}:${item.totalAmount}`),
    description: item.description,
    quantity: item.quantity ?? null,
    unitAmount: item.unitAmount ?? null,
    totalAmount: roundMoney(safeMoney(item.totalAmount))
  } satisfies InvoiceLineItem));

  const missingFields: InvoiceDraftMissingField[] = [];
  if (!supplierName) missingFields.push("supplierName");
  if (!serviceTitle) missingFields.push("serviceTitle");
  if (!date) missingFields.push("date");
  if (amount <= 0) missingFields.push("amount");
  if (expenseKind === "unknown") missingFields.push("expenseKind");

  return {
    id: draftId,
    source: input.source,
    supplierName,
    serviceTitle,
    category,
    expenseKind,
    date,
    time,
    amount,
    mileage,
    confidence,
    lineItems: items,
    extractedFields: [
      field(draftId, "Fornecedor", supplierName || "Pendente", supplierName ? confidence : 0),
      field(draftId, "Tipo da nota", titleForExpenseKind(expenseKind, isDocumentOrTax), confidence),
      field(draftId, "Data", date || "Pendente", date ? confidence : 0),
      ...(time ? [field(draftId, "Hora", time, confidence)] : []),
      field(draftId, "Valor total", amount > 0 ? formatBRL(amount) : "Pendente", amount > 0 ? confidence : 0),
      ...(mileage > 0 ? [field(draftId, "Quilometragem", `${mileage} km`, Math.max(45, confidence - 8))] : []),
      field(draftId, "Produtos/servicos", `${items.length} item(ns)`, Math.max(45, confidence - 5))
    ],
    healthImpacts: [
      {
        id: deterministicUuid("invoice-health-impact", `${draftId}:history`),
        iconName: iconForCategory(category),
        title: serviceTitle || "Nota fiscal",
        detail: "Registro importado da nota fiscal reconhecida pela IA."
      },
      {
        id: deterministicUuid("invoice-health-impact", `${draftId}:vault`),
        iconName: "lock.doc.fill",
        title: "Cofre digital",
        detail: "Documento pronto para compor historico e dossie de revenda."
      }
    ],
    partLifeRecommendations: buildPartLifeRecommendations(draftId, partLifeSuggestions),
    requiresUserInput: missingFields.length > 0,
    missingFields
  };
}

function buildPartLifeRecommendations(
  draftId: string,
  suggestions: PartLifeSuggestionItem[]
): InvoicePartLifeRecommendation[] {
  return suggestions
    .filter((item) => item.partName.trim().length > 0)
    .slice(0, 12)
    .map((item, index) => ({
      id: deterministicUuid("invoice-part-life", `${draftId}:${index}:${item.partName}`),
      partName: item.partName.trim(),
      lifeKm: item.lifeKm,
      lifeMonths: item.lifeMonths,
      confidence: clampConfidence(item.confidence),
      rationale: item.rationale,
      sourceDescriptions: item.sourceDescriptions.slice(0, 6),
      expectedQuantity: item.expectedQuantity ?? null,
      detectedQuantity: item.detectedQuantity ?? null,
      scope: item.scope ?? null
    }));
}

function mapExpenseKind(value: InvoiceExtractionExpenseKind): InvoiceExpenseKind {
  if (value === "vehicleService") return "vehicleService";
  if (value === "partOrProduct" || value === "documentOrTax") return "partOrProduct";
  return "unknown";
}

function suggestServiceTitle(extraction: InvoiceExtraction, items: InvoiceExtractionItem[]): string | null {
  if (extraction.expenseKind === "documentOrTax") return "Documento ou imposto do veiculo";
  const description = items[0]?.description?.trim();
  if (description) return description.slice(0, 90);
  if (extraction.supplier.name?.trim()) return `Compra em ${extraction.supplier.name.trim().slice(0, 60)}`;
  return null;
}

function inferCategory(
  expenseKind: InvoiceExtractionExpenseKind,
  serviceTitle: string,
  items: InvoiceExtractionItem[]
): string {
  if (expenseKind === "documentOrTax") return "Documentos e impostos";

  const haystack = stripAccents(`${serviceTitle}\n${items.map((item) => item.description).join("\n")}`).toLowerCase();
  if (/(ipva|licenciamento|seguro|taxa)/.test(haystack)) return "Documentos e impostos";
  if (/(oleo|filtro|lubrificant)/.test(haystack)) return "Oleo e filtros";
  if (/(pneu|rodizio)/.test(haystack)) return "Pneus";
  if (/(freio|pastilha|disco)/.test(haystack)) return "Freios";
  if (/(bateria|alternador|eletric)/.test(haystack)) return "Bateria";
  if (/(alinhamento|balanceamento|suspens|amortecedor)/.test(haystack)) return "Suspensao e direcao";
  if (/(vela|ignicao|injetor)/.test(haystack)) return "Motor";
  return expenseKind === "partOrProduct" ? "Pecas e produtos" : "Manutencao";
}

function iconForCategory(category: string): string {
  const normalized = stripAccents(category).toLowerCase();
  if (/document|imposto|ipva|licenciamento/.test(normalized)) return "doc.text.fill";
  if (/oleo|filtro/.test(normalized)) return "drop.fill";
  if (/pneu/.test(normalized)) return "circle.dotted";
  if (/freio/.test(normalized)) return "record.circle";
  if (/bateria|eletric/.test(normalized)) return "bolt.heart.fill";
  if (/suspens|direcao/.test(normalized)) return "car.side";
  if (/motor/.test(normalized)) return "engine.combustion.fill";
  return "wrench.adjustable.fill";
}

function titleForExpenseKind(value: InvoiceExpenseKind, isDocumentOrTax: boolean): string {
  if (isDocumentOrTax) return "Documento ou imposto";
  switch (value) {
  case "vehicleService":
    return "Serviço no carro";
  case "partOrProduct":
    return "Peça ou produto";
  case "unknown":
    return "Não identificado pela IA";
  }
}

function normalizeLineItems(items: InvoiceExtractionItem[]): InvoiceExtractionItem[] {
  return items
    .map((item) => ({
      description: sanitizeLabel(item.description) ?? "",
      quantity: positiveNumberOrNull(item.quantity),
      unitAmount: positiveNumberOrNull(item.unitAmount),
      totalAmount: positiveNumberOrNull(item.totalAmount) ?? 0
    }))
    .filter((item) => item.description && item.totalAmount > 0)
    .slice(0, 20);
}

function normalizeBrazilianDate(value: string | null): string {
  if (!value) return "";
  const isoMatch = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const [year, month, day] = [isoMatch[1], isoMatch[2], isoMatch[3]].map(Number);
    if (isValidDate(year, month, day)) {
      return `${pad(day)}/${pad(month)}/${year}`;
    }
  }
  const brMatch = value.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = brMatch[3].length === 2 ? 2000 + Number(brMatch[3]) : Number(brMatch[3]);
    if (isValidDate(year, month, day)) {
      return `${pad(day)}/${pad(month)}/${year}`;
    }
  }
  return "";
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2099) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clampMoney(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 0;
  const rounded = roundMoney(safeMoney(value));
  return rounded <= 250000 ? rounded : 0;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function positiveNumberOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function sanitizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.split(/\s+/).join(" ").trim();
  if (!cleaned || cleaned.toLowerCase() === "null") return null;
  return cleaned.slice(0, 120);
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function field(draftId: string, label: string, value: string, confidence: number) {
  return {
    id: deterministicUuid("invoice-field", `${draftId}:${label}:${value}`),
    label,
    value,
    confidence: clampConfidence(confidence)
  };
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

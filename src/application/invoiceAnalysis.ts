import {
  AutomationResult,
  InvoiceDocumentContent,
  InvoiceDocumentInput,
  InvoiceScanDraft
} from "../domain/models.js";
import {
  deterministicUuid,
  roundMoney,
  safeMoney
} from "../domain/factories.js";
import { ProviderNotConfiguredError, ValidationError } from "./errors.js";

const maximumInvoiceAmount = 250000;
const maximumItemTotalDrift = 0.25;

export interface InvoiceExtractionProvider {
  extract(input: InvoiceTextInput): Promise<Partial<InvoiceExtraction>>;
}

export interface InvoiceDocumentExtractionProvider {
  extractFromDocument(input: InvoiceDocumentInputWithDocument): Promise<InvoiceExtraction>;
}

export type InvoiceTextInput = InvoiceDocumentInput & {
  ocrText: string;
};

export type InvoiceDocumentInputWithDocument = InvoiceDocumentInput & {
  document: InvoiceDocumentContent;
};

export interface InvoiceExtraction {
  supplierName: string | null;
  serviceTitle: string | null;
  category: string | null;
  date: string | null;
  time: string | null;
  amount: number | null;
  mileage: number | null;
  confidence: number;
  lineItems: DraftInvoiceLineItem[];
}

export interface DraftInvoiceLineItem {
  description: string;
  quantity?: number | null;
  unitAmount?: number | null;
  totalAmount: number;
}

export class InvoiceAnalysisUseCase {
  constructor(
    private readonly extractionProvider: InvoiceExtractionProvider | null = null,
    private readonly documentExtractionProvider: InvoiceDocumentExtractionProvider | null = null
  ) {}

  async analyze(input: InvoiceDocumentInput): Promise<InvoiceScanDraft> {
    if (input.document) {
      if (!this.documentExtractionProvider) {
        throw new ProviderNotConfiguredError("IA multimodal de documentos ainda nao configurada no backend.");
      }

      const extraction = await this.documentExtractionProvider.extractFromDocument({
        ...input,
        document: input.document
      });
      return buildDraft(input, extraction, evidenceTextFromExtraction(extraction, input));
    }

    const preparedInput = this.prepareTextInput(input);
    const ocrText = normalizeOCRText(preparedInput.ocrText);
    if (ocrText.length < 16) {
      throw new ValidationError("Nao foi possivel reconhecer texto suficiente na nota fiscal.");
    }

    const deterministic = extractDeterministically(ocrText);
    let providerExtraction: Partial<InvoiceExtraction> = {};
    if (this.extractionProvider) {
      try {
        providerExtraction = await this.extractionProvider.extract({ ...preparedInput, ocrText });
      } catch {
        providerExtraction = {};
      }
    }

    return buildDraft(preparedInput, mergeExtractions(deterministic, providerExtraction, ocrText), ocrText);
  }

  private prepareTextInput(input: InvoiceDocumentInput): InvoiceTextInput {
    const providedOCRText = normalizeOCRText(input.ocrText ?? "");
    return {
      ...input,
      ocrText: providedOCRText
    };
  }

  toAutomationResult(draft: InvoiceScanDraft): AutomationResult {
    const isDocumentOrTax = /document|imposto|ipva|licenciamento|taxa/i.test(draft.category);
    const maintenance = isDocumentOrTax ? 0 : draft.amount;
    const documentsAndTaxes = isDocumentOrTax ? draft.amount : 0;
    const purchaseSummary = summarizePurchasedItems(draft.lineItems, draft.serviceTitle);
    const documentID = deterministicUuid("vault-document", draft.id);

    return {
      title: draft.serviceTitle,
      message: "Nota fiscal lida pela IA e organizada no historico do veiculo.",
      investmentDelta: {
        total: draft.amount,
        maintenance,
        documentsAndTaxes
      },
      record: {
        id: deterministicUuid("maintenance-record", draft.id),
        iconName: iconNameForCategory(draft.category),
        title: draft.serviceTitle,
        subtitle: purchaseSummary,
        date: draft.time ? `${draft.date} ${draft.time}` : draft.date,
        amount: draft.amount,
        isAIValidated: draft.confidence >= 70,
        supplierName: draft.supplierName,
        serviceTitle: draft.serviceTitle,
        purchaseSummary,
        documentID
      },
      document: {
        id: documentID,
        title: draft.serviceTitle,
        date: draft.time ? `${draft.date} ${draft.time}` : draft.date,
        amount: draft.amount,
        status: draft.confidence >= 70 ? "Validado por IA" : "Validado pela leitura",
        kind: "expenseReceipt",
        documentType: isDocumentOrTax ? "Documento ou imposto" : "Nota fiscal",
        supplierName: draft.supplierName,
        serviceTitle: draft.serviceTitle,
        purchaseSummary,
        source: draft.source,
        lineItems: draft.lineItems
      }
    };
  }
}

function summarizePurchasedItems(items: DraftInvoiceLineItem[], fallback: string): string {
  const descriptions = items
    .map((item) => sanitizeLabel(item.description))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);

  if (descriptions.length === 0) {
    return fallback;
  }

  if (descriptions.length === 1) {
    return descriptions[0];
  }

  if (descriptions.length === 2) {
    return `${descriptions[0]} e ${descriptions[1]}`.slice(0, 120);
  }

  return `${descriptions[0]}, ${descriptions[1]} e mais ${descriptions.length - 2} itens`.slice(0, 120);
}

function buildDraft(
  input: InvoiceDocumentInput,
  extraction: InvoiceExtraction,
  evidenceText: string
): InvoiceScanDraft {
  const amount = roundMoney(safeMoney(extraction.amount ?? 0));
  const date = normalizeDate(extraction.date);
  if (!date || !isAcceptableInvoiceDate(date) || amount <= 0 || amount > maximumInvoiceAmount) {
    throw new ValidationError("Nao encontramos data e valor total suficientes para revisar essa nota.");
  }

  const draftId = deterministicUuid("invoice-draft", `${date}:${amount}:${evidenceText}`);
  const lineItems = normalizeLineItems(extraction.lineItems)
    .map((item, index) => ({
      id: deterministicUuid("invoice-line-item", `${draftId}:${index}:${item.description}:${item.totalAmount}`),
      description: item.description,
      quantity: item.quantity ?? null,
      unitAmount: item.unitAmount ?? null,
      totalAmount: roundMoney(safeMoney(item.totalAmount))
    }));
  validateLineItemsAgainstTotal(lineItems, amount);

  const supplierName = sanitizeLabel(extraction.supplierName);
  const serviceTitle = sanitizeLabel(extraction.serviceTitle) ?? lineItems[0]?.description;
  if (!supplierName || !serviceTitle) {
    throw new ValidationError("Nao encontramos fornecedor e servico reais suficientes para revisar essa nota.");
  }

  const category = sanitizeLabel(extraction.category) ?? inferCategory(`${serviceTitle}\n${evidenceText}`);
  const confidence = Math.max(0, Math.min(100, Math.trunc(extraction.confidence || 58)));
  const mileage = Math.max(0, Math.trunc(extraction.mileage ?? 0));
  const time = normalizeTime(extraction.time);

  return {
    id: draftId,
    source: input.source,
    supplierName,
    serviceTitle,
    category,
    date,
    time,
    amount,
    mileage,
    confidence,
    lineItems,
    extractedFields: [
      extractedField(draftId, "Fornecedor", supplierName, confidence),
      extractedField(draftId, "Data", date, confidence),
      ...(time ? [extractedField(draftId, "Hora", time, confidence)] : []),
      extractedField(draftId, "Valor total", formatBRL(amount), confidence),
      ...(mileage > 0 ? [extractedField(draftId, "Quilometragem", `${mileage} km`, Math.max(45, confidence - 8))] : []),
      extractedField(draftId, "Produtos/servicos", `${lineItems.length} item(ns)`, Math.max(45, confidence - 5))
    ],
    healthImpacts: healthImpactsForCategory(draftId, category, serviceTitle)
  };
}

function evidenceTextFromExtraction(extraction: InvoiceExtraction, input: InvoiceDocumentInput): string {
  return [
    input.displayName,
    extraction.supplierName,
    extraction.serviceTitle,
    extraction.category,
    extraction.date,
    extraction.time,
    extraction.amount?.toFixed(2),
    extraction.mileage ? `${extraction.mileage} km` : null,
    ...extraction.lineItems.map((item) => [
      item.description,
      item.quantity?.toString(),
      item.unitAmount?.toFixed(2),
      item.totalAmount.toFixed(2)
    ].filter(Boolean).join(" "))
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function mergeExtractions(
  fallback: InvoiceExtraction,
  preferred: Partial<InvoiceExtraction>,
  ocrText: string
): InvoiceExtraction {
  const preferredDate = normalizeDate(preferred.date ?? null);
  const preferredTime = normalizeTime(preferred.time ?? null);
  const preferredAmount = positiveNumber(preferred.amount);
  const groundedDate = preferredDate && dateAppearsInText(ocrText, preferredDate)
    ? preferredDate
    : null;
  const groundedTime = preferredTime && timeAppearsInText(ocrText, preferredTime)
    ? preferredTime
    : null;
  const groundedAmount = preferredAmount && moneyAppearsInText(ocrText, preferredAmount)
    ? preferredAmount
    : null;
  return {
    supplierName: fallback.supplierName,
    serviceTitle: fallback.serviceTitle,
    category: fallback.category,
    date: groundedDate ?? fallback.date,
    time: groundedTime ?? fallback.time,
    amount: selectGroundedAmount(fallback.amount, groundedAmount),
    mileage: positiveNumber(preferred.mileage) ?? fallback.mileage,
    confidence: Math.max(fallback.confidence, Math.trunc(preferred.confidence ?? 0)),
    lineItems: fallback.lineItems
  };
}

function selectGroundedAmount(fallbackAmount: number | null, preferredAmount: number | null): number | null {
  if (!preferredAmount) return fallbackAmount;
  if (!fallbackAmount) return preferredAmount;
  const drift = Math.abs(preferredAmount - fallbackAmount);
  const allowedDrift = Math.max(1, fallbackAmount * 0.02);
  return drift <= allowedDrift ? preferredAmount : fallbackAmount;
}

function extractDeterministically(text: string): InvoiceExtraction {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lineItems = extractLineItems(lines);
  const amount = extractTotalAmount(lines) ?? sumLineItems(lineItems);
  const supplierName = extractSupplier(lines);
  const date = normalizeDate(firstMatch(text, /\b([0-3]?\d[\/.-][01]?\d[\/.-](?:20)?\d{2})\b/));
  const time = normalizeTime(firstMatch(text, /\b([0-2]?\d:[0-5]\d(?::[0-5]\d)?)\b/));
  const mileage = extractMileage(text);
  const serviceTitle = inferServiceTitle(text, lineItems);
  const category = inferCategory(`${serviceTitle ?? ""}\n${text}`);

  return {
    supplierName,
    serviceTitle,
    category,
    date,
    time,
    amount,
    mileage,
    confidence: amount && date ? 62 : 38,
    lineItems
  };
}

function extractSupplier(lines: string[]): string | null {
  const ignored = /^(danfe|nf-e|nfe|nota fiscal|cupom fiscal|documento auxiliar|cnpj|cpf|extrato|emissao|emitida)/i;
  return sanitizeLabel(lines.find((line) => /[a-zA-Z]/.test(line) && !ignored.test(line) && line.length >= 3 && line.length <= 80));
}

function extractTotalAmount(lines: string[]): number | null {
  const labeledCandidates = lines
    .filter((line) => /(valor\s+total|total\s+(da\s+)?nota|total\s+a\s+pagar|vlr?\s*total|total\s+r\$)/i.test(line))
    .map((line) => extractMoneyValues(line).at(-1))
    .filter((value): value is number => value !== undefined);
  if (labeledCandidates.length > 0) {
    return roundMoney(Math.max(...labeledCandidates));
  }

  return null;
}

function extractLineItems(lines: string[]): DraftInvoiceLineItem[] {
  const blocked = /(total|subtotal|troco|desconto|acrescimo|forma de pagamento|pix|cartao|cnpj|cpf|chave de acesso|consulta)/i;
  return lines
    .flatMap((line): DraftInvoiceLineItem[] => {
      const values = extractMoneyValues(line);
      const totalAmount = values.at(-1);
      const description = sanitizeLabel(line.replace(moneyPattern, "").replace(/\s{2,}/g, " "));
      if (!description || totalAmount === undefined || blocked.test(line)) return [];
      return [{
        description: description.slice(0, 90),
        quantity: extractQuantity(line),
        unitAmount: values.length > 1 ? values[0] : null,
        totalAmount
      }];
    })
    .slice(0, 12);
}

function sumLineItems(lineItems: DraftInvoiceLineItem[]): number | null {
  if (lineItems.length === 0) return null;
  const total = lineItems.reduce((sum, item) => sum + safeMoney(item.totalAmount), 0);
  return total > 0 ? roundMoney(total) : null;
}

function normalizeLineItems(items: DraftInvoiceLineItem[]): DraftInvoiceLineItem[] {
  return items
    .map((item) => ({
      ...item,
      description: sanitizeLabel(item.description) ?? ""
    }))
    .filter((item) => item.description && safeMoney(item.totalAmount) > 0)
    .slice(0, 12);
}

function validateLineItemsAgainstTotal(items: DraftInvoiceLineItem[], amount: number): void {
  if (items.length === 0) return;
  const itemTotal = roundMoney(items.reduce((sum, item) => sum + safeMoney(item.totalAmount), 0));
  if (itemTotal <= 0) return;

  const drift = Math.abs(itemTotal - amount);
  const allowedDrift = Math.max(5, amount * maximumItemTotalDrift);
  if (drift > allowedDrift) {
    throw new ValidationError("Total da nota diverge dos itens reconhecidos.");
  }
}

function inferServiceTitle(text: string, lineItems: DraftInvoiceLineItem[]): string | null {
  const normalized = stripAccents(text).toLowerCase();
  if (/(oleo|filtro|lubrificant)/.test(normalized)) return "Troca de oleo e filtros";
  if (/(pneu|rodizio|alinhamento|balanceamento)/.test(normalized)) return "Pneus, alinhamento e balanceamento";
  if (/(freio|pastilha|disco)/.test(normalized)) return "Servico de freios";
  if (/(bateria|alternador|eletric)/.test(normalized)) return "Servico eletrico";
  if (/(revisao|manutencao|oficina|mecanica|peca|auto center)/.test(normalized)) return "Manutencao do veiculo";
  return sanitizeLabel(lineItems[0]?.description);
}

function inferCategory(text: string): string {
  const normalized = stripAccents(text).toLowerCase();
  if (/(ipva|licenciamento|documento|taxa|seguro)/.test(normalized)) return "Documentos e impostos";
  if (/(oleo|filtro|lubrificant)/.test(normalized)) return "Oleo e filtros";
  if (/(pneu|rodizio|alinhamento|balanceamento)/.test(normalized)) return "Pneus";
  if (/(freio|pastilha|disco)/.test(normalized)) return "Freios";
  if (/(bateria|alternador|eletric)/.test(normalized)) return "Bateria";
  return "Manutencao";
}

function healthImpactsForCategory(draftId: string, category: string, title: string) {
  const iconName = iconNameForCategory(category);
  return [
    {
      id: deterministicUuid("invoice-health-impact", `${draftId}:history`),
      iconName,
      title,
      detail: "Registro importado da nota fiscal reconhecida pela IA."
    },
    {
      id: deterministicUuid("invoice-health-impact", `${draftId}:vault`),
      iconName: "lock.doc.fill",
      title: "Cofre digital",
      detail: "Documento pronto para compor historico e dossie de revenda."
    }
  ];
}

function iconNameForCategory(category: string): string {
  const normalized = stripAccents(category).toLowerCase();
  if (/document|imposto|ipva|licenciamento/.test(normalized)) return "doc.text.fill";
  if (/oleo|filtro/.test(normalized)) return "drop.fill";
  if (/pneu/.test(normalized)) return "circle.dotted";
  if (/freio/.test(normalized)) return "record.circle";
  if (/bateria|eletric/.test(normalized)) return "bolt.heart.fill";
  return "wrench.adjustable.fill";
}

function extractedField(draftId: string, label: string, value: string, confidence: number) {
  return {
    id: deterministicUuid("invoice-field", `${draftId}:${label}:${value}`),
    label,
    value,
    confidence: Math.max(0, Math.min(100, Math.trunc(confidence)))
  };
}

const moneyPattern = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/g;

function extractMoneyValues(value: string): number[] {
  return Array.from(value.matchAll(moneyPattern))
    .map((match) => parseMoney(match[1]))
    .filter((amount): amount is number => amount !== null);
}

function moneyAppearsInText(text: string, amount: number): boolean {
  return extractMoneyValues(text).some((value) => Math.abs(value - amount) <= 0.01);
}

function dateAppearsInText(text: string, normalizedDate: string): boolean {
  const [day, month, year] = normalizedDate.split("/");
  const shortYear = year.slice(-2);
  const pattern = new RegExp(`\\b0?${Number(day)}[\\/. -]0?${Number(month)}[\\/. -](?:${year}|${shortYear})\\b`);
  return pattern.test(text);
}

function timeAppearsInText(text: string, normalizedTime: string): boolean {
  const [hour, minute] = normalizedTime.split(":");
  const pattern = new RegExp(`\\b0?${Number(hour)}:${minute}(?::[0-5]\\d)?\\b`);
  return pattern.test(text);
}

function parseMoney(value: string): number | null {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? roundMoney(amount) : null;
}

function extractMileage(text: string): number | null {
  const match = text.match(/\b(\d{1,3}(?:\.\d{3}){1,2}|\d{4,6})\s*(?:km|quilometr)/i);
  if (!match) return null;
  const mileage = Number(match[1].replace(/\./g, ""));
  return Number.isFinite(mileage) ? mileage : null;
}

function extractQuantity(value: string): number | null {
  const match = value.match(/\b(\d+(?:[,.]\d+)?)\s*(?:un|und|x|qtde?|qtd)\b/i);
  if (!match) return null;
  const quantity = Number(match[1].replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function normalizeOCRText(value: string): string {
  return value
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.split(/\s+/).filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 60000);
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:20)?\d{2})\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 2000 || year > 2099) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function isAcceptableInvoiceDate(value: string): boolean {
  const [day, month, year] = value.split("/").map(Number);
  const invoiceDate = new Date(Date.UTC(year, month - 1, day));
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return invoiceDate.getTime() <= tomorrow.getTime();
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\b([0-2]?\d):([0-5]\d)(?::[0-5]\d)?\b/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sanitizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const sanitized = value.split(/\s+/).join(" ").trim();
  if (!sanitized || sanitized.toLowerCase() === "null") return null;
  return sanitized.slice(0, 120);
}

function firstMatch(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1] ?? null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

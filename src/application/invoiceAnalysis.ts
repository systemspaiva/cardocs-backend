import {
  AutomationResult,
  InvoiceLineItem,
  InvoiceScanDraft
} from "../domain/models.js";
import { deterministicUuid } from "../domain/factories.js";
import { ValidationError } from "./errors.js";

export class InvoiceAnalysisUseCase {
  toAutomationResult(draft: InvoiceScanDraft): AutomationResult {
    if (draft.expenseKind === "unknown") {
      throw new ValidationError("Selecione se a nota e de servico ou de peca/produto antes de salvar.");
    }
    if (
      draft.requiresUserInput
      || draft.missingFields.length > 0
      || !draft.supplierName.trim()
      || !draft.serviceTitle.trim()
      || !draft.date.trim()
      || draft.amount <= 0
    ) {
      throw new ValidationError("Complete os dados pendentes da nota antes de salvar.");
    }

    const isDocumentOrTax = /document|imposto|ipva|licenciamento|taxa/i.test(draft.category);
    const maintenance = isDocumentOrTax ? 0 : draft.amount;
    const documentsAndTaxes = isDocumentOrTax ? draft.amount : 0;
    const purchaseSummary = summarizePurchasedItems(draft.lineItems, draft.serviceTitle);
    const documentType = isDocumentOrTax
      ? "Documento ou imposto"
      : draft.expenseKind === "vehicleService"
        ? "Nota de serviço"
        : "Nota de peça ou produto";
    const documentID = deterministicUuid("vault-document", draft.id);
    const isManualEntry = draft.source === "manualEntry";
    const isAIValidated = !isManualEntry && draft.confidence >= 70;

    return {
      title: draft.serviceTitle,
      message: isManualEntry
        ? "Nota fiscal lancada manualmente e organizada no historico do veiculo."
        : "Nota fiscal lida pela IA e organizada no historico do veiculo.",
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
        isAIValidated,
        supplierName: draft.supplierName,
        serviceTitle: draft.serviceTitle,
        purchaseSummary,
        expenseKind: draft.expenseKind,
        documentID
      },
      document: {
        id: documentID,
        title: draft.serviceTitle,
        date: draft.time ? `${draft.date} ${draft.time}` : draft.date,
        amount: draft.amount,
        status: isManualEntry ? "Lancamento manual" : isAIValidated ? "Validado por IA" : "Validado pela leitura",
        kind: "expenseReceipt",
        documentType,
        supplierName: draft.supplierName,
        serviceTitle: draft.serviceTitle,
        purchaseSummary,
        expenseKind: draft.expenseKind,
        source: draft.source,
        lineItems: draft.lineItems
      }
    };
  }
}

function summarizePurchasedItems(items: InvoiceLineItem[], fallback: string): string {
  const descriptions = items
    .map((item) => sanitizeLabel(item.description))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);

  if (descriptions.length === 0) return fallback;
  if (descriptions.length === 1) return descriptions[0];
  if (descriptions.length === 2) return `${descriptions[0]} e ${descriptions[1]}`.slice(0, 120);
  return `${descriptions[0]}, ${descriptions[1]} e mais ${descriptions.length - 2} itens`.slice(0, 120);
}

function iconNameForCategory(category: string): string {
  const normalized = category.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/document|imposto|ipva|licenciamento/.test(normalized)) return "doc.text.fill";
  if (/oleo|filtro/.test(normalized)) return "drop.fill";
  if (/pneu/.test(normalized)) return "circle.dotted";
  if (/freio/.test(normalized)) return "record.circle";
  if (/bateria|eletric/.test(normalized)) return "bolt.heart.fill";
  return "wrench.adjustable.fill";
}

function sanitizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.split(/\s+/).join(" ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

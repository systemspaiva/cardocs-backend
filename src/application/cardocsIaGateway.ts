import {
  InvoiceDocumentInput,
  InvoiceScanDraft
} from "../domain/models.js";

export interface PartReplacementRecommendationRequest {
  partName: string;
  useProvider?: boolean;
}

export interface PartReplacementRecommendation {
  partName: string;
  lifeKm: number | null;
  lifeMonths: number | null;
  confidence: number;
  rationale: string;
  source: "ai" | "catalog";
}

export interface CardocsIaGateway {
  analyzeInvoice(input: InvoiceDocumentInput): Promise<InvoiceScanDraft>;
  recommendPartReplacement(input: PartReplacementRecommendationRequest): Promise<PartReplacementRecommendation>;
}

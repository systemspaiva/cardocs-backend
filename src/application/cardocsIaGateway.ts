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

export type AutomotiveChatRole = "user" | "assistant";
export type AutomotiveChatScope = "automotive" | "out_of_scope";

export interface AutomotiveChatMessage {
  role: AutomotiveChatRole;
  content: string;
}

export interface AutomotiveChatContext {
  selectedGarageIndex?: number;
  garages: unknown[];
}

export interface AutomotiveChatRequest {
  messages: AutomotiveChatMessage[];
  context: AutomotiveChatContext;
}

export interface AutomotiveChatResponse {
  answer: string;
  scope: AutomotiveChatScope;
}

export type AutomotiveChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; scope: AutomotiveChatScope };

export interface AutomotiveChatStreamOptions {
  signal?: AbortSignal;
}

export interface CardocsIaGateway {
  analyzeInvoice(input: InvoiceDocumentInput): Promise<InvoiceScanDraft>;
  recommendPartReplacement(input: PartReplacementRecommendationRequest): Promise<PartReplacementRecommendation>;
  streamAutomotiveChat(input: AutomotiveChatRequest, options?: AutomotiveChatStreamOptions): AsyncIterable<AutomotiveChatStreamEvent>;
}

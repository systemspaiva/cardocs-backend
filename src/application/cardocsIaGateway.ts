import {
  InvoiceDocumentInput,
  InvoiceExpenseKind,
  InvoiceScanDraft,
  PartReplacementScope,
  VehicleGarage
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

export interface PartLifeSuggestionRequestItem {
  description: string;
  quantity?: number | null;
}

export interface PartLifeSuggestionRequest {
  items: PartLifeSuggestionRequestItem[];
  context?: {
    expenseKind?: InvoiceExpenseKind;
    serviceTitle?: string;
  };
}

export interface PartLifeRecommendation {
  partName: string;
  lifeKm: number | null;
  lifeMonths: number | null;
  confidence: number;
  rationale: string;
  sourceDescriptions?: string[];
  expectedQuantity?: number | null;
  detectedQuantity?: number | null;
  scope?: PartReplacementScope | null;
}

export interface PartLifeSuggestionResponse {
  recommendations: PartLifeRecommendation[];
}

export type AutomotiveChatRole = "user" | "assistant";
export type AutomotiveChatScope = "automotive" | "out_of_scope";

export interface AutomotiveChatMessage {
  role: AutomotiveChatRole;
  content: string;
}

export type AutomotiveChatReferenceType = "maintenance_record" | "vault_document" | "part_replacement";

export interface AutomotiveChatReference {
  type: AutomotiveChatReferenceType;
  referenceID: string;
  itemID: string;
  title: string;
  subtitle?: string;
  date?: string;
  amount?: number;
}

export interface AutomotiveChatContext {
  selectedGarageIndex?: number;
  garages: unknown[];
  references?: AutomotiveChatReference[];
}

export interface AutomotiveChatRequest {
  messages: AutomotiveChatMessage[];
  context: AutomotiveChatContext;
}

export interface AutomotiveChatResponse {
  answer: string;
  scope: AutomotiveChatScope;
}

export type ResaleDossierGenerationTrigger = "manual" | "mileage_updated" | "part_replaced";

export interface ResaleDossierGenerationInput {
  garage: VehicleGarage;
  trigger: ResaleDossierGenerationTrigger;
}

export interface ResaleDossierAiHighlight {
  iconName: string;
  title: string;
  value: string;
}

export interface ResaleDossierAiSection {
  iconName: string;
  title: string;
  status: string;
  detail: string;
}

export interface ResaleDossierAiResponse {
  title: string;
  summary: string;
  score: number;
  estimatedValueIncrease: number;
  highlights: ResaleDossierAiHighlight[];
  checks: string[];
  reportSections: ResaleDossierAiSection[];
}

export type AutomotiveChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "reference"; reference: AutomotiveChatReference }
  | { type: "done"; scope: AutomotiveChatScope };

export interface AutomotiveChatStreamOptions {
  signal?: AbortSignal;
}

export interface CardocsIaGateway {
  analyzeInvoice(input: InvoiceDocumentInput): Promise<InvoiceScanDraft>;
  recommendPartReplacement(input: PartReplacementRecommendationRequest): Promise<PartReplacementRecommendation>;
  suggestPartLife(input: PartLifeSuggestionRequest): Promise<PartLifeSuggestionResponse>;
  generateResaleDossier(input: ResaleDossierGenerationInput): Promise<ResaleDossierAiResponse>;
  streamAutomotiveChat(input: AutomotiveChatRequest, options?: AutomotiveChatStreamOptions): AsyncIterable<AutomotiveChatStreamEvent>;
}

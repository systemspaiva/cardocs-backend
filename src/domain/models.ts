export type VehicleKind = "car" | "motorcycle";
export type PartHealthTone = "healthy" | "warning" | "neutral";
export type DocumentSource = "cameraScan" | "fileImport" | "photoLibrary";
export type InvoiceSource = DocumentSource | "manualEntry";
export type InvoiceExpenseKind = "vehicleService" | "partOrProduct" | "unknown";
export type VaultDocumentKind = "expenseReceipt" | "vehicleDocument";
/**
 * Categoria explícita do documento dentro da checklist pós-onboarding do
 * veículo (laudo cautelar, transferência, IPVA, NF de compra). Independente
 * de `VaultDocumentKind`/`documentType` — esses ficam pra texto livre e
 * legacy. Usado pra detectar "passos pendentes" sem heurística por keyword.
 */
export type VaultDocumentChecklistKind =
  | "cautelar"
  | "transferencia"
  | "ipva"
  | "nfCompra";
export type VehicleTransferStatus = "pending" | "accepted" | "declined";
export type InsurancePremiumPeriod = "monthly" | "annual";

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  signInProvider: string | null;
  providerIds: string[];
}

export interface LegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  source: "ios" | "android";
}

export type SubscriptionPlan = "monthly" | "annual";

export interface UserSubscription {
  plan: SubscriptionPlan;
  productId: string;
  expiresAt: string;
  transactionId: string;
  originalTransactionId: string;
  syncedAt: string;
}

export type UserAccessReason = "freeDays" | "subscription" | "none";

export interface UserAccessStatus {
  hasAccess: boolean;
  reason: UserAccessReason;
  freeDaysUntil: string | null;
  subscription: UserSubscription | null;
}

export interface VehicleImage {
  url: string;
  thumbnailUrl?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  accentColor?: string | null;
  source: string;
}

export interface VehicleFipeQuote {
  code: string;
  brand: string;
  model: string;
  modelYear: string;
  fuel: string;
  referenceMonth: string;
  formattedValue: string;
  value: number | null;
}

export interface VehiclePlateDetails {
  alternatePlate?: string | null;
  brandLogoURL?: string | null;
  municipality?: string | null;
  state?: string | null;
  origin?: string | null;
  situation?: string | null;
  fuel?: string | null;
  engineDisplacement?: string | null;
  vehicleType?: string | null;
  segment?: string | null;
  subSegment?: string | null;
  passengerCapacity?: string | null;
  bodyType?: string | null;
}

export interface VehicleCandidate {
  id: string;
  kind: VehicleKind;
  plate: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  image?: VehicleImage | null;
  fipe?: VehicleFipeQuote | null;
  details?: VehiclePlateDetails | null;
}

export interface VehicleProfile extends VehicleCandidate {
  maskedPlate: string;
  mileage: number;
  nextServiceTitle: string;
  nextServiceDistance: string;
  statusTags: string[];
  photos: VehicleImage[];
}

export interface InvestmentSummary {
  total: number;
  maintenance: number;
  documentsAndTaxes: number;
}

export interface VehicleInsurance {
  insurerName: string;
  premiumAmount: number;
  premiumPeriod: InsurancePremiumPeriod;
  coverages: string;
  deductibleAmount?: number | null;
  deductibleNotes?: string | null;
  validUntil: string;
  updatedAt: string;
}

export interface MaintenanceRecord {
  id: string;
  iconName: string;
  title: string;
  subtitle: string;
  date: string;
  amount: number;
  isAIValidated: boolean;
  supplierName?: string | null;
  serviceTitle?: string | null;
  purchaseSummary?: string | null;
  expenseKind?: InvoiceExpenseKind | null;
  documentID?: string | null;
  attachment?: DocumentAttachment | null;
}

/**
 * Legado: complete/front/rear/partial. Mantido para leitura de registros
 * antigos no Firestore. Novos registros usam `PartPosition`.
 */
export type PartReplacementScope = "complete" | "front" | "rear" | "partial";

/**
 * Posição/grupo da peça multi-unidade no veículo. Cada combinação
 * (partName + position) é um grupo independente na saúde — calcula o
 * próprio percentual, histórico e mensagem.
 */
export type PartPosition =
  | "complete"      // jogo único (todas as unidades trocadas juntas)
  | "front_axle"    // par dianteiro
  | "rear_axle"     // par traseiro
  | "front_left"    // dianteiro esquerdo
  | "front_right"   // dianteiro direito
  | "rear_left"     // traseiro esquerdo
  | "rear_right"    // traseiro direito
  | "partial";      // legado / fallback

export interface PartHealthHistoryEntry {
  id: string;
  serviceDate: string;
  mileageAtService: number;
  amount: number;
  quantity?: number | null;
  expectedQuantity?: number | null;
  scope?: PartReplacementScope | null;
  position?: PartPosition | null;
  supplierLabel?: string | null;
}

export interface PartHealth {
  id: string;
  iconName: string;
  name: string;
  message: string;
  percentage: number;
  replacedAt: string;
  limit: string;
  tone: PartHealthTone;
  lastServiceDate?: string | null;
  nextServiceDate?: string | null;
  /** Quantas trocas desse grupo já foram registradas (histórico). */
  replacementCount: number;
  /** Quantidade trocada na última manutenção (ex.: 2 de 4 pastilhas). */
  lastQuantity?: number | null;
  /** Quantidade total esperada pela peça (ex.: 4 pneus, 4 amortecedores). */
  expectedQuantity?: number | null;
  /** Escopo legado da última troca. */
  lastScope?: PartReplacementScope | null;
  /** Posição/grupo desta entrada (front_axle, rear_left, complete, etc.). */
  position: PartPosition;
  /** Indica se a peça suporta múltiplas posições/unidades no veículo. */
  isMultiUnit: boolean;
  /** Rótulo amigável da posição (ex.: "Par dianteiro", "Jogo completo"). */
  positionLabel: string;
  /** Trocas anteriores em ordem cronológica decrescente. Cap em 8 entradas. */
  history: PartHealthHistoryEntry[];
}

export interface PartReplacementRecord {
  id: string;
  partName: string;
  brandName?: string | null;
  serviceTitle: string;
  iconName: string;
  serviceDate: string;
  amount: number;
  mileageAtService: number;
  lifeKm?: number | null;
  lifeMonths?: number | null;
  scheduledRevisionMileage?: number | null;
  scheduledRevisionWorkshopKind?: "dealership" | "other" | null;
  maintenanceRecordID: string;
  /** Quantos itens foram trocados nesse serviço. null se desconhecido. */
  quantity?: number | null;
  /** Quantidade total esperada pela peça (vem do catálogo IA). */
  expectedQuantity?: number | null;
  /** Escopo legado da troca. Migrado para `position` na leitura. */
  scope?: PartReplacementScope | null;
  /** Posição/grupo da peça (front_axle, rear_left, complete, etc.). */
  position: PartPosition;
}

export interface MultiUnitPartCatalogEntry {
  /** Chave canônica usada para casar peças (ex.: "pneu", "disco freio"). */
  id: string;
  /** Rótulo amigável pra UI (ex.: "Pneus"). */
  displayName: string;
  /** Quantidade total de unidades no veículo (ex.: 4 pneus). */
  expectedUnits: number;
  /** Padrão de regex compilado pelo backend; serializado como string. */
  matchPatterns: string[];
}

export interface PartPositionOption {
  value: PartPosition;
  label: string;
  /** Quantas unidades cobrem (null = depende da peça, ex.: jogo completo). */
  units: number | null;
}

export interface PartReplacementCatalog {
  parts: MultiUnitPartCatalogEntry[];
  positions: PartPositionOption[];
}

export interface VaultDocument {
  id: string;
  title: string;
  date: string;
  amount: number;
  status: string;
  kind?: VaultDocumentKind | null;
  /** Categoria do documento na checklist pós-onboarding (laudo, IPVA, NF). */
  checklistKind?: VaultDocumentChecklistKind | null;
  documentType?: string | null;
  notes?: string | null;
  supplierName?: string | null;
  serviceTitle?: string | null;
  purchaseSummary?: string | null;
  expenseKind?: InvoiceExpenseKind | null;
  source?: InvoiceSource | null;
  lineItems?: InvoiceLineItem[];
  attachment?: DocumentAttachment | null;
}

export interface DocumentAttachment {
  storagePath: string;
  downloadURL?: string | null;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  source: DocumentSource;
}

export interface ResaleHighlight {
  id: string;
  iconName: string;
  title: string;
  value: string;
}

export interface ResaleReportSection {
  id: string;
  iconName: string;
  title: string;
  status: string;
  detail: string;
}

export interface ResaleDossier {
  title: string;
  summary: string;
  score: number;
  estimatedValueIncrease: number;
  publicReportURL: string;
  highlights: ResaleHighlight[];
  checks: string[];
  reportSections: ResaleReportSection[];
}

export interface VehicleGarage {
  id: string;
  vehicle: VehicleProfile;
  investment: InvestmentSummary;
  timeline: MaintenanceRecord[];
  healthItems: PartHealth[];
  partReplacements: PartReplacementRecord[];
  vaultDocuments: VaultDocument[];
  insurance?: VehicleInsurance | null;
  resaleDossier: ResaleDossier;
}

export interface VehicleDashboard {
  id: string;
  garages: VehicleGarage[];
  selectedGarageID: string;
  detectedVehicle: VehicleCandidate;
  incomingVehicleTransfers: VehicleTransferRequest[];
  outgoingVehicleTransfers: OutgoingVehicleTransfer[];
}

export interface VehicleTransferRequest {
  id: string;
  vehicleID: string;
  vehiclePlate: string;
  vehicleTitle: string;
  fromOwnerID: string;
  fromOwnerEmail?: string | null;
  fromOwnerName?: string | null;
  toOwnerID: string;
  toOwnerEmail: string;
  status: VehicleTransferStatus;
}

export interface OutgoingVehicleTransfer {
  transferID: string;
  vehicleID: string;
  vehiclePlate: string;
  vehicleTitle: string;
  toOwnerID?: string | null;
  toOwnerEmail: string;
  status: VehicleTransferStatus;
}

export interface VehicleTransferDecisionResult {
  transfer: VehicleTransferRequest;
  dashboard: VehicleDashboard;
}

export interface InvoiceDocumentInput {
  source: DocumentSource;
  displayName: string;
  ocrText?: string;
  pageCount: number;
  document?: InvoiceDocumentContent | null;
}

export interface InvoiceDocumentContent {
  mimeType: string;
  base64Data: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity?: number | null;
  unitAmount?: number | null;
  totalAmount: number;
}

export interface InvoiceExtractedField {
  id: string;
  label: string;
  value: string;
  confidence: number;
}

export interface InvoiceHealthImpact {
  id: string;
  iconName: string;
  title: string;
  detail: string;
}

export interface InvoicePartLifeRecommendation {
  id: string;
  partName: string;
  lifeKm?: number | null;
  lifeMonths?: number | null;
  confidence: number;
  rationale: string;
  sourceDescriptions: string[];
  expectedQuantity?: number | null;
  detectedQuantity?: number | null;
  scope?: PartReplacementScope | null;
  position?: PartPosition | null;
}

export interface InvoicePartLifeEntry {
  partName: string;
  lifeKm?: number | null;
  lifeMonths?: number | null;
  mileageAtService: number;
  quantity?: number | null;
  expectedQuantity?: number | null;
  scope?: PartReplacementScope | null;
  position?: PartPosition | null;
}

export type InvoiceDraftMissingField =
  | "supplierName"
  | "serviceTitle"
  | "date"
  | "amount"
  | "expenseKind";

export interface InvoiceScanDraft {
  id: string;
  source: InvoiceSource;
  supplierName: string;
  serviceTitle: string;
  category: string;
  expenseKind: InvoiceExpenseKind;
  date: string;
  time?: string | null;
  amount: number;
  mileage: number;
  confidence: number;
  lineItems: InvoiceLineItem[];
  extractedFields: InvoiceExtractedField[];
  healthImpacts: InvoiceHealthImpact[];
  partLifeRecommendations: InvoicePartLifeRecommendation[];
  requiresUserInput: boolean;
  missingFields: InvoiceDraftMissingField[];
}

export interface InvestmentDelta {
  total: number;
  maintenance: number;
  documentsAndTaxes: number;
}

export interface AutomationResult {
  title: string;
  message: string;
  investmentDelta: InvestmentDelta;
  record: MaintenanceRecord;
  document: VaultDocument;
}

export interface VaultDocumentUpdate {
  title?: string;
  date?: string;
  amount?: number;
  status?: string;
  checklistKind?: VaultDocumentChecklistKind | null;
  documentType?: string | null;
  notes?: string | null;
  supplierName?: string | null;
  serviceTitle?: string | null;
  purchaseSummary?: string | null;
}

export interface MaintenanceRecordUpdate {
  title?: string;
  subtitle?: string;
  date?: string;
  amount?: number;
  supplierName?: string | null;
  serviceTitle?: string | null;
  purchaseSummary?: string | null;
}

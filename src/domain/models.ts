export type VehicleKind = "car" | "motorcycle";
export type PartHealthTone = "healthy" | "warning" | "neutral";
export type DocumentSource = "cameraScan" | "fileImport" | "photoLibrary";
export type InvoiceSource = DocumentSource | "manualEntry";
export type InvoiceExpenseKind = "vehicleService" | "partOrProduct" | "unknown";
export type VaultDocumentKind = "expenseReceipt" | "vehicleDocument";
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
  source: "ios";
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
}

export interface VaultDocument {
  id: string;
  title: string;
  date: string;
  amount: number;
  status: string;
  kind?: VaultDocumentKind | null;
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

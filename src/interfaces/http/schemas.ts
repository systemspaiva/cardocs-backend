import { z } from "zod";
import { isMultiUnitPart, normalizeKind } from "../../domain/factories.js";

const moneyNumberSchema = z.coerce.number().finite();
const positiveMoneyNumberSchema = moneyNumberSchema.positive();
const nonNegativeIntegerSchema = z.coerce.number().int().min(0);
const confidenceSchema = z.coerce.number().int().min(0).max(100);
const vehicleIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const transferIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const documentIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const optionalEditableTextSchema = z.string().trim().min(1).max(160).optional();
const optionalNullableLongTextSchema = z.string().trim().max(2000).nullable().optional();
const documentSourceSchema = z.enum(["cameraScan", "fileImport", "photoLibrary"]);
const invoiceSourceSchema = z.enum(["cameraScan", "fileImport", "photoLibrary", "manualEntry"]);
const invoiceExpenseKindSchema = z.enum(["vehicleService", "partOrProduct", "unknown"]);
const invoiceDraftMissingFieldSchema = z.enum([
  "supplierName",
  "serviceTitle",
  "date",
  "amount",
  "expenseKind"
]);
const pushDeviceTokenSchema = z.string().trim().min(16).max(4096);
const legalDocumentVersionSchema = z.string().trim().min(1).max(80);
const maintenanceDateSchema = z
  .string()
  .trim()
  .min(8)
  .max(20)
  .refine((value) => {
    const date = parseMaintenanceDate(value);
    return date !== null && date.getTime() <= endOfToday().getTime();
  }, "Data de manutencao invalida.");
const validityDateSchema = z
  .string()
  .trim()
  .min(8)
  .max(20)
  .refine((value) => {
    const dateKey = maintenanceInputDateKey(value);
    return dateKey !== null && dateKey >= todayDateKeyInSaoPaulo();
  }, "Data de validade invalida.");
const isoDateStringSchema = z
  .string()
  .trim()
  .min(10)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Data ISO8601 invalida.");

function parseMaintenanceDate(value: string): Date | null {
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (brMatch) {
    const [, day, month, year] = brMatch.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function maintenanceInputDateKey(value: string): number | null {
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (brMatch) {
    const [, day, month, year] = brMatch.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return year * 10_000 + month * 100 + day;
    }
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return saoPauloDateKey(new Date(timestamp));
}

function todayDateKeyInSaoPaulo(): number {
  return saoPauloDateKey(new Date());
}

function saoPauloDateKey(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return year * 10_000 + month * 100 + day;
}

export const syncSubscriptionSchema = z
  .object({
    signedTransactionInfo: z.string().trim().min(64).max(20000)
  })
  .strict();

export const syncGooglePlaySubscriptionSchema = z
  .object({
    packageName: z
      .string()
      .trim()
      .min(3)
      .max(255)
      .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/),
    productId: z.string().trim().min(1).max(255),
    purchaseToken: z.string().trim().min(16).max(4096)
  })
  .strict();

export const syncUserProfileSchema = z
  .object({
    legalAcceptance: z
      .object({
        termsVersion: legalDocumentVersionSchema,
        privacyVersion: legalDocumentVersionSchema,
        acceptedAt: isoDateStringSchema,
        source: z.enum(["ios", "android"])
      })
      .optional()
  })
  .strict();

export const vehicleImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  mime: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  source: z.string().min(1)
});

export const vehicleFipeQuoteSchema = z.object({
  code: z.string(),
  brand: z.string(),
  model: z.string(),
  modelYear: z.string(),
  fuel: z.string(),
  referenceMonth: z.string(),
  formattedValue: z.string(),
  value: z.number().finite().nullable()
});

export const vehiclePlateDetailsSchema = z.object({
  alternatePlate: z.string().nullable().optional(),
  brandLogoURL: z.string().url().nullable().optional(),
  municipality: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  situation: z.string().nullable().optional(),
  fuel: z.string().nullable().optional(),
  engineDisplacement: z.string().nullable().optional(),
  vehicleType: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  subSegment: z.string().nullable().optional(),
  passengerCapacity: z.string().nullable().optional(),
  bodyType: z.string().nullable().optional()
});

export const vehicleCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.string().transform(normalizeKind),
  plate: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1),
  color: z.string().min(1),
  image: vehicleImageSchema.nullable().optional(),
  photos: z.array(vehicleImageSchema).optional(),
  fipe: vehicleFipeQuoteSchema.nullable().optional(),
  details: vehiclePlateDetailsSchema.nullable().optional()
});

export const vehicleRegistrationSchema = z.object({
  plate: z.string().min(1),
  initialMileage: z.number().int().min(0).default(0)
});

export const manualVehicleRegistrationSchema = z.object({
  kind: z.string().default("car"),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: z.string().trim().min(4).max(10),
  color: z.string().trim().min(1).max(40).default("Não informado"),
  initialMileage: z.number().int().min(0).default(0)
});

export const updateMileageSchema = z.object({
  vehicleID: vehicleIDSchema,
  mileage: z.number().int().min(0)
});

export const deleteVehicleSchema = z.object({
  vehicleID: vehicleIDSchema
});

export const updateVehiclePhotoSchema = z.object({
  vehicleID: vehicleIDSchema,
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  base64Data: z.string().min(16).max(10_000_000)
});

export const addVehiclePhotoSchema = updateVehiclePhotoSchema.extend({
  makePrimary: z.boolean().default(false)
});

export const removeVehiclePhotoSchema = z.object({
  vehicleID: vehicleIDSchema,
  photoURL: z.string().url()
});

export const reorderVehiclePhotosSchema = z.object({
  vehicleID: vehicleIDSchema,
  photoURLs: z.array(z.string().url()).min(1).max(12)
});

export const plateLookupSchema = z.object({
  plate: z.string().min(1)
});

export const vehicleImageLookupSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1)
});

const invoiceDocumentContentSchema = z.object({
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/gif",
    "image/bmp",
    "image/webp",
    "image/heic",
    "image/heif"
  ]),
  base64Data: z.string().min(16).max(20_000_000)
});

export const invoiceDocumentInputSchema = z.object({
  source: documentSourceSchema,
  displayName: z.string().min(1).max(160),
  ocrText: z.string().max(60000).optional(),
  pageCount: z.number().int().positive().max(20),
  document: invoiceDocumentContentSchema.nullable().optional()
}).superRefine((input, context) => {
  const hasOCRText = (input.ocrText ?? "").trim().length >= 16;
  const hasDocument = Boolean(input.document?.base64Data);
  if (!hasOCRText && !hasDocument) {
    context.addIssue({
      code: "custom",
      path: ["ocrText"],
      message: "Informe texto de OCR ou documento para leitura."
    });
  }
});

const requiredDocumentInputSchema = z.object({
  source: documentSourceSchema,
  displayName: z.string().min(1).max(160),
  pageCount: z.number().int().positive().max(20),
  document: invoiceDocumentContentSchema
});

const documentAttachmentSchema = z.object({
  storagePath: z.string().min(1),
  downloadURL: z.string().url().nullable().optional(),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  pageCount: z.number().int().positive().max(20),
  source: documentSourceSchema
});

export const maintenanceRecordSchema = z.object({
  id: z.string().min(1),
  iconName: z.string(),
  title: z.string(),
  subtitle: z.string(),
  date: z.string(),
  amount: moneyNumberSchema,
  isAIValidated: z.boolean(),
  supplierName: z.string().nullable().optional(),
  serviceTitle: z.string().nullable().optional(),
  purchaseSummary: z.string().nullable().optional(),
  documentID: z.string().nullable().optional(),
  attachment: documentAttachmentSchema.nullable().optional()
});

export const vaultDocumentChecklistKindSchema = z.enum([
  "cautelar",
  "transferencia",
  "ipva",
  "nfCompra"
]);

export const vaultDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  date: z.string(),
  amount: moneyNumberSchema,
  status: z.string(),
  kind: z.enum(["expenseReceipt", "vehicleDocument"]).nullable().optional(),
  checklistKind: vaultDocumentChecklistKindSchema.nullable().optional(),
  documentType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  serviceTitle: z.string().nullable().optional(),
  purchaseSummary: z.string().nullable().optional(),
  source: invoiceSourceSchema.nullable().optional(),
  lineItems: z.array(z.lazy(() => invoiceLineItemSchema)).optional(),
  attachment: documentAttachmentSchema.nullable().optional()
});

export const investmentDeltaSchema = z.object({
  total: moneyNumberSchema,
  maintenance: moneyNumberSchema,
  documentsAndTaxes: moneyNumberSchema
});

export const invoiceLineItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  quantity: positiveMoneyNumberSchema.nullable().optional(),
  unitAmount: positiveMoneyNumberSchema.nullable().optional(),
  totalAmount: positiveMoneyNumberSchema
});

const partReplacementScopeSchema = z.enum(["complete", "front", "rear", "partial"]);

const partPositionSchema = z.enum([
  "complete",
  "front_axle",
  "rear_axle",
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
  "partial"
]);

const invoicePartLifeRecommendationSchema = z.object({
  id: z.string().min(1),
  partName: z.string().trim().min(2).max(80),
  lifeKm: z.coerce.number().int().positive().max(500_000).nullable().optional(),
  lifeMonths: z.coerce.number().int().positive().max(240).nullable().optional(),
  confidence: confidenceSchema,
  rationale: z.string().trim().min(1),
  sourceDescriptions: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  expectedQuantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  detectedQuantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  scope: partReplacementScopeSchema.nullable().optional(),
  position: partPositionSchema.nullable().optional()
}).superRefine((input, context) => {
  if (!input.lifeKm && !input.lifeMonths) {
    context.addIssue({
      code: "custom",
      path: ["lifeKm"],
      message: "Informe a vida util em km ou meses."
    });
  }
});

const invoicePartLifeEntrySchema = z.object({
  partName: z.string().trim().min(2).max(80),
  lifeKm: z.coerce.number().int().positive().max(500_000).nullable().optional(),
  lifeMonths: z.coerce.number().int().positive().max(240).nullable().optional(),
  mileageAtService: z.coerce.number().int().positive().max(2_000_000),
  quantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  expectedQuantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  scope: partReplacementScopeSchema.nullable().optional(),
  position: partPositionSchema.nullable().optional()
}).superRefine((input, context) => {
  if (!input.lifeKm && !input.lifeMonths) {
    context.addIssue({
      code: "custom",
      path: ["lifeKm"],
      message: "Informe a vida util em km ou meses."
    });
  }
});

export const invoiceDraftSchema = z.object({
  id: z.string().min(1),
  source: invoiceSourceSchema,
  supplierName: z.string().max(160),
  serviceTitle: z.string().max(160),
  category: z.string().min(1),
  expenseKind: invoiceExpenseKindSchema,
  date: z.string().max(20),
  time: z.string().nullable().optional(),
  amount: moneyNumberSchema.min(0),
  mileage: nonNegativeIntegerSchema,
  confidence: confidenceSchema,
  lineItems: z.array(invoiceLineItemSchema).default([]),
  extractedFields: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    value: z.string(),
    confidence: confidenceSchema
  })),
  healthImpacts: z.array(z.object({
    id: z.string().min(1),
    iconName: z.string(),
    title: z.string(),
    detail: z.string()
  })),
  partLifeRecommendations: z.array(invoicePartLifeRecommendationSchema).max(12).default([]),
  requiresUserInput: z.boolean().default(false),
  missingFields: z.array(invoiceDraftMissingFieldSchema).default([])
});

export const saveInvoiceSchema = z.object({
  vehicleID: vehicleIDSchema,
  draft: invoiceDraftSchema,
  sourceDocument: requiredDocumentInputSchema.nullable().optional(),
  partLifeEntries: z.array(invoicePartLifeEntrySchema).max(12).default([])
}).superRefine((input, context) => {
  const draft = input.draft;
  if (
    draft.requiresUserInput
    || draft.missingFields.length > 0
    || !draft.supplierName.trim()
    || !draft.serviceTitle.trim()
    || !draft.date.trim()
    || draft.amount <= 0
    || draft.expenseKind === "unknown"
  ) {
    context.addIssue({
      code: "custom",
      path: ["draft"],
      message: "Complete os dados pendentes da nota antes de salvar."
    });
  }
});

export const createPartReplacementSchema = z.object({
  vehicleID: vehicleIDSchema,
  partName: z.string().trim().min(2).max(80),
  brandName: z.string().trim().min(1).max(80).nullable().optional(),
  amount: moneyNumberSchema.min(0).default(0),
  serviceDate: maintenanceDateSchema,
  mileageAtService: nonNegativeIntegerSchema,
  scheduledRevisionMileage: nonNegativeIntegerSchema.nullable().optional(),
  scheduledRevisionWorkshopKind: z.enum(["dealership", "other"]).nullable().optional(),
  lifeKm: z.coerce.number().int().positive().max(500_000).nullable().optional(),
  lifeMonths: z.coerce.number().int().positive().max(240).nullable().optional(),
  quantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  expectedQuantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  scope: partReplacementScopeSchema.nullable().optional(),
  position: partPositionSchema.nullable().optional()
}).superRefine((input, context) => {
  if (!input.lifeKm && !input.lifeMonths) {
    context.addIssue({
      code: "custom",
      path: ["lifeKm"],
      message: "Informe a vida util em km ou meses."
    });
  }
  const hasRevisionMileage = input.scheduledRevisionMileage !== undefined && input.scheduledRevisionMileage !== null;
  const hasWorkshopKind = input.scheduledRevisionWorkshopKind !== undefined && input.scheduledRevisionWorkshopKind !== null;
  if (hasRevisionMileage !== hasWorkshopKind) {
    context.addIssue({
      code: "custom",
      path: ["scheduledRevisionMileage"],
      message: "Informe a quilometragem e o tipo de oficina da revisao."
    });
  }
  if (hasRevisionMileage && (input.scheduledRevisionMileage! <= 0 || input.scheduledRevisionMileage! % 10_000 !== 0)) {
    context.addIssue({
      code: "custom",
      path: ["scheduledRevisionMileage"],
      message: "A revisao deve seguir a agenda de 10.000 km."
    });
  }
  if (isMultiUnitPart(input.partName) && !input.position) {
    context.addIssue({
      code: "custom",
      path: ["position"],
      message: "Selecione a posicao da peca (par dianteiro, traseiro, etc.)."
    });
  }
});

export const createInvoicePartReplacementSchema = z.object({
  vehicleID: vehicleIDSchema,
  documentID: documentIDSchema,
  partName: z.string().trim().min(2).max(80),
  serviceDate: maintenanceDateSchema,
  mileageAtService: z.coerce.number().int().positive().max(2_000_000),
  amount: moneyNumberSchema.min(0).nullable().optional(),
  lifeKm: z.coerce.number().int().positive().max(500_000).nullable().optional(),
  lifeMonths: z.coerce.number().int().positive().max(240).nullable().optional(),
  quantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  expectedQuantity: z.coerce.number().int().positive().max(99).nullable().optional(),
  scope: partReplacementScopeSchema.nullable().optional(),
  position: partPositionSchema.nullable().optional()
}).superRefine((input, context) => {
  if (!input.lifeKm && !input.lifeMonths) {
    context.addIssue({
      code: "custom",
      path: ["lifeKm"],
      message: "Informe a vida util em km ou meses."
    });
  }
  if (isMultiUnitPart(input.partName) && !input.position) {
    context.addIssue({
      code: "custom",
      path: ["position"],
      message: "Selecione a posicao da peca (par dianteiro, traseiro, etc.)."
    });
  }
});

export const removePartReplacementSchema = z.object({
  vehicleID: vehicleIDSchema,
  partName: z.string().trim().min(2).max(80),
  position: partPositionSchema.nullable().optional()
});

export const partReplacementRecommendationSchema = z.object({
  partName: z.string().trim().min(2).max(80)
});

const automotiveChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000)
}).strict();

export const automotiveChatRequestSchema = z.object({
  messages: z.array(automotiveChatMessageSchema).min(1).max(12)
}).strict().superRefine((input, context) => {
  if (input.messages[input.messages.length - 1]?.role !== "user") {
    context.addIssue({
      code: "custom",
      path: ["messages"],
      message: "A ultima mensagem deve ser do usuario."
    });
  }
});

export const createVehicleInsuranceSchema = z.object({
  vehicleID: vehicleIDSchema,
  insurerName: z.string().trim().min(2).max(120),
  premiumAmount: positiveMoneyNumberSchema,
  premiumPeriod: z.enum(["monthly", "annual"]),
  coverages: z.string().trim().min(2).max(1200),
  deductibleAmount: moneyNumberSchema.min(0).nullable().optional(),
  deductibleNotes: z.string().trim().max(800).nullable().optional(),
  validUntil: validityDateSchema
});

export const resaleDossierRequestSchema = z.object({
  vehicleID: vehicleIDSchema
});

export const vehicleTransferRequestSchema = z.object({
  vehicleID: vehicleIDSchema,
  recipientEmail: z.string().trim().email().transform((value) => value.toLowerCase())
});

export const vehicleTransferResponseSchema = z.object({
  transferID: transferIDSchema,
  action: z.enum(["accept", "decline"])
});

export const pushDeviceTokenRegistrationSchema = z.object({
  token: pushDeviceTokenSchema,
  platform: z.enum(["ios", "android"])
});

export const pushDeviceTokenRemovalSchema = z.object({
  token: pushDeviceTokenSchema
});

export const createVehicleDocumentSchema = z.object({
  vehicleID: vehicleIDSchema,
  title: z.string().trim().min(1).max(160),
  documentType: z.string().trim().min(1).max(80),
  checklistKind: vaultDocumentChecklistKindSchema.nullable().optional(),
  date: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).nullable().optional(),
  sourceDocument: requiredDocumentInputSchema
});

export const updateVaultDocumentSchema = z.object({
  vehicleID: vehicleIDSchema,
  documentID: documentIDSchema,
  title: optionalEditableTextSchema,
  date: optionalEditableTextSchema,
  amount: moneyNumberSchema.min(0).optional(),
  status: optionalEditableTextSchema,
  checklistKind: vaultDocumentChecklistKindSchema.nullable().optional(),
  documentType: z.string().trim().min(1).max(80).nullable().optional(),
  notes: optionalNullableLongTextSchema,
  supplierName: z.string().trim().min(1).max(160).nullable().optional(),
  serviceTitle: z.string().trim().min(1).max(160).nullable().optional(),
  purchaseSummary: z.string().trim().min(1).max(240).nullable().optional()
});

export const updateMaintenanceRecordSchema = z.object({
  vehicleID: vehicleIDSchema,
  recordID: documentIDSchema,
  title: optionalEditableTextSchema,
  subtitle: z.string().trim().min(1).max(240).optional(),
  date: optionalEditableTextSchema,
  amount: moneyNumberSchema.min(0).optional(),
  supplierName: z.string().trim().min(1).max(160).nullable().optional(),
  serviceTitle: z.string().trim().min(1).max(160).nullable().optional(),
  purchaseSummary: z.string().trim().min(1).max(240).nullable().optional()
});

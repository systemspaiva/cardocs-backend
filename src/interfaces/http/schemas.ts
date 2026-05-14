import { z } from "zod";
import { normalizeKind } from "../../domain/factories.js";

const moneyNumberSchema = z.coerce.number().finite();
const positiveMoneyNumberSchema = moneyNumberSchema.positive();
const nonNegativeIntegerSchema = z.coerce.number().int().min(0);
const confidenceSchema = z.coerce.number().int().min(0).max(100);
const vehicleIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const transferIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const documentIDSchema = z.string().trim().min(1);
const optionalEditableTextSchema = z.string().trim().min(1).max(160).optional();
const optionalNullableLongTextSchema = z.string().trim().max(2000).nullable().optional();
const documentSourceSchema = z.enum(["cameraScan", "fileImport", "photoLibrary"]);
const invoiceSourceSchema = z.enum(["cameraScan", "fileImport", "photoLibrary", "manualEntry"]);
const pushDeviceTokenSchema = z.string().trim().min(16).max(4096);
const legalDocumentVersionSchema = z.string().trim().min(1).max(80);
const isoDateStringSchema = z
  .string()
  .trim()
  .min(10)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Data ISO8601 invalida.");

export const syncUserProfileSchema = z
  .object({
    legalAcceptance: z
      .object({
        termsVersion: legalDocumentVersionSchema,
        privacyVersion: legalDocumentVersionSchema,
        acceptedAt: isoDateStringSchema,
        source: z.enum(["ios"])
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

export const updateVehiclePhotoSchema = z.object({
  vehicleID: vehicleIDSchema,
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  base64Data: z.string().min(16).max(10_000_000)
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
    "image/webp"
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

export const vaultDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  date: z.string(),
  amount: moneyNumberSchema,
  status: z.string(),
  kind: z.enum(["expenseReceipt", "vehicleDocument"]).nullable().optional(),
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

export const invoiceDraftSchema = z.object({
  id: z.string().min(1),
  source: invoiceSourceSchema,
  supplierName: z.string().min(1),
  serviceTitle: z.string().min(1),
  category: z.string().min(1),
  date: z.string().min(1),
  time: z.string().nullable().optional(),
  amount: positiveMoneyNumberSchema,
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
  }))
});

export const saveInvoiceSchema = z.object({
  vehicleID: vehicleIDSchema,
  draft: invoiceDraftSchema,
  sourceDocument: requiredDocumentInputSchema.nullable().optional()
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
  platform: z.enum(["ios"])
});

export const pushDeviceTokenRemovalSchema = z.object({
  token: pushDeviceTokenSchema
});

export const createVehicleDocumentSchema = z.object({
  vehicleID: vehicleIDSchema,
  title: z.string().trim().min(1).max(160),
  documentType: z.string().trim().min(1).max(80),
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

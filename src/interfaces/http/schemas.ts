import { z } from "zod";
import { normalizeKind } from "../../domain/factories.js";

const moneyNumberSchema = z.coerce.number().finite();
const positiveMoneyNumberSchema = moneyNumberSchema.positive();
const nonNegativeIntegerSchema = z.coerce.number().int().min(0);
const confidenceSchema = z.coerce.number().int().min(0).max(100);
const vehicleIDSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());

export const vehicleImageSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  mime: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  source: z.string().min(1)
});

export const vehicleCandidateSchema = z.object({
  id: z.string().min(1),
  kind: z.string().transform(normalizeKind),
  plate: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1),
  color: z.string().min(1),
  image: vehicleImageSchema.nullable().optional()
});

export const vehicleRegistrationSchema = z.object({
  plate: z.string().min(1),
  initialMileage: z.number().int().min(0).default(0)
});

export const plateLookupSchema = z.object({
  plate: z.string().min(1)
});

export const vehicleImageLookupSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1)
});

export const invoiceDocumentInputSchema = z.object({
  source: z.enum(["cameraScan", "fileImport", "photoLibrary"]),
  displayName: z.string().min(1).max(160),
  ocrText: z.string().max(60000).optional(),
  pageCount: z.number().int().positive().max(20),
  document: z.object({
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
  }).nullable().optional()
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
  purchaseSummary: z.string().nullable().optional()
});

export const vaultDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  date: z.string(),
  amount: moneyNumberSchema,
  status: z.string(),
  supplierName: z.string().nullable().optional(),
  serviceTitle: z.string().nullable().optional(),
  purchaseSummary: z.string().nullable().optional()
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
  source: z.enum(["cameraScan", "fileImport", "photoLibrary"]),
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
  draft: invoiceDraftSchema
});

export const resaleDossierRequestSchema = z.object({
  vehicleID: vehicleIDSchema
});

import { z } from "zod";
import { normalizeKind } from "../../domain/factories.js";

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
  displayName: z.string().min(1)
});

export const maintenanceRecordSchema = z.object({
  id: z.string().min(1),
  iconName: z.string(),
  title: z.string(),
  subtitle: z.string(),
  date: z.string(),
  amount: z.number(),
  isAIValidated: z.boolean()
});

export const vaultDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  date: z.string(),
  amount: z.number(),
  status: z.string()
});

export const investmentDeltaSchema = z.object({
  total: z.number(),
  maintenance: z.number(),
  documentsAndTaxes: z.number()
});

export const invoiceDraftSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["cameraScan", "fileImport", "photoLibrary"]),
  supplierName: z.string().min(1),
  serviceTitle: z.string().min(1),
  category: z.string().min(1),
  date: z.string().min(1),
  amount: z.number(),
  mileage: z.number().int().min(0),
  confidence: z.number().int().min(0).max(100),
  extractedFields: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    value: z.string(),
    confidence: z.number().int().min(0).max(100)
  })),
  healthImpacts: z.array(z.object({
    id: z.string().min(1),
    iconName: z.string(),
    title: z.string(),
    detail: z.string()
  }))
});

export const saveInvoiceSchema = z.object({
  vehicleID: z.string().min(1),
  draft: invoiceDraftSchema
});

export const resaleDossierRequestSchema = z.object({
  vehicleID: z.string().min(1)
});

import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import {
  DocumentAttachmentStore,
  SaveDocumentAttachmentInput
} from "../application/documentAttachments.js";
import { DocumentAttachment } from "../domain/models.js";

type StorageBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

const extensionByMimeType: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/webp": "webp"
};

export class FirebaseStorageDocumentAttachmentStore implements DocumentAttachmentStore {
  constructor(private readonly bucket: StorageBucket) {}

  static fromDefaultBucket(): FirebaseStorageDocumentAttachmentStore {
    return new FirebaseStorageDocumentAttachmentStore(getStorage().bucket());
  }

  async save(input: SaveDocumentAttachmentInput): Promise<DocumentAttachment> {
    if (!input.document.document) {
      throw new Error("Documento ausente para upload.");
    }

    const mimeType = input.document.document.mimeType;
    const data = Buffer.from(input.document.document.base64Data, "base64");
    if (data.length === 0) {
      throw new Error("Documento vazio para upload.");
    }

    const extension = extensionByMimeType[mimeType] ?? "bin";
    const safeDisplayName = sanitizeFileName(input.document.displayName);
    const fileName = `${safeDisplayName}.${extension}`;
    const storagePath = [
      "users",
      sanitizePathSegment(input.ownerId),
      "vehicles",
      sanitizePathSegment(input.vehicleId),
      input.kind === "vehicleDocument" ? "vehicle-documents" : "expense-receipts",
      sanitizePathSegment(input.documentId),
      fileName
    ].join("/");
    const downloadToken = randomUUID();

    await this.bucket.file(storagePath).save(data, {
      resumable: false,
      contentType: mimeType,
      metadata: {
        contentType: mimeType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    return {
      storagePath,
      downloadURL: firebaseDownloadURL(this.bucket.name, storagePath, downloadToken),
      mimeType,
      fileName,
      sizeBytes: data.length,
      pageCount: input.document.pageCount,
      source: input.document.source
    };
  }
}

function firebaseDownloadURL(bucketName: string, storagePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || "documento";
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "unknown";
}

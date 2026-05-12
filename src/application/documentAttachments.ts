import {
  DocumentAttachment,
  InvoiceDocumentInput,
  VaultDocumentKind
} from "../domain/models.js";

export interface SaveDocumentAttachmentInput {
  ownerId: string;
  vehicleId: string;
  documentId: string;
  kind: VaultDocumentKind;
  document: InvoiceDocumentInput;
}

export interface DocumentAttachmentStore {
  save(input: SaveDocumentAttachmentInput): Promise<DocumentAttachment>;
}

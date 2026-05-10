package com.cardocs.api.documents;

import java.time.Instant;
import java.util.UUID;

public record DocumentUploadUrlResponse(
    UUID documentId,
    String uploadUrl,
    String storageKey,
    Instant expiresAt,
    VehicleDocumentResponse document
) {
}

package com.cardocs.api.documents;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record VehicleDocumentResponse(
    UUID id,
    UUID vehicleId,
    UUID userId,
    DocumentType type,
    String fileName,
    String contentType,
    Long fileSize,
    String storageKey,
    String storageBucket,
    OcrStatus ocrStatus,
    String ocrRawText,
    Map<String, Object> ocrStructuredData,
    Map<String, Object> reviewedData,
    ReviewStatus reviewStatus,
    Instant createdAt,
    Instant updatedAt
) {
    public static VehicleDocumentResponse from(VehicleDocument document) {
        return new VehicleDocumentResponse(
            document.getId(),
            document.getVehicleId(),
            document.getUserId(),
            document.getType(),
            document.getFileName(),
            document.getContentType(),
            document.getFileSize(),
            document.getStorageKey(),
            document.getStorageBucket(),
            document.getOcrStatus(),
            document.getOcrRawText(),
            document.getOcrStructuredData(),
            document.getReviewedData(),
            document.getReviewStatus(),
            document.getCreatedAt(),
            document.getUpdatedAt()
        );
    }
}

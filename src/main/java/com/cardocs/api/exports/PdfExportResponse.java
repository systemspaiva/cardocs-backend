package com.cardocs.api.exports;

import java.time.Instant;
import java.util.UUID;

public record PdfExportResponse(
    UUID id,
    UUID userId,
    UUID vehicleId,
    PdfExportType type,
    ExportStatus status,
    String storageKey,
    String errorMessage,
    Instant createdAt,
    Instant completedAt
) {
    public static PdfExportResponse from(PdfExportRequest request) {
        return new PdfExportResponse(
            request.getId(),
            request.getUserId(),
            request.getVehicleId(),
            request.getType(),
            request.getStatus(),
            request.getStorageKey(),
            request.getErrorMessage(),
            request.getCreatedAt(),
            request.getCompletedAt()
        );
    }
}

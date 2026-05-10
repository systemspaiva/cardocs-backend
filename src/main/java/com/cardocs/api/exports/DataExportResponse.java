package com.cardocs.api.exports;

import java.time.Instant;
import java.util.UUID;

public record DataExportResponse(
    UUID id,
    UUID userId,
    ExportStatus status,
    String storageKey,
    String errorMessage,
    Instant createdAt,
    Instant completedAt
) {
    public static DataExportResponse from(DataExportRequest request) {
        return new DataExportResponse(
            request.getId(),
            request.getUserId(),
            request.getStatus(),
            request.getStorageKey(),
            request.getErrorMessage(),
            request.getCreatedAt(),
            request.getCompletedAt()
        );
    }
}

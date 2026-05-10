package com.cardocs.api.exports;

import java.util.UUID;

public record PdfExportPayload(UUID exportId, UUID vehicleId, UUID userId, PdfExportType type) {
}

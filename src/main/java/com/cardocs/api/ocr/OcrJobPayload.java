package com.cardocs.api.ocr;

import java.util.UUID;

public record OcrJobPayload(UUID documentId, UUID vehicleId, UUID userId) {
}

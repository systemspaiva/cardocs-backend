package com.cardocs.api.exports;

import java.util.UUID;

public record DataExportPayload(UUID exportId, UUID userId) {
}

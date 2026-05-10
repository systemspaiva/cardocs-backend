package com.cardocs.api.storage;

import java.time.Instant;

public record PresignedUrlResponse(
    String url,
    String storageKey,
    Instant expiresAt
) {
}

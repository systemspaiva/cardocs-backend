package com.cardocs.api.consents;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ConsentResponse(
    UUID id,
    UUID userId,
    ConsentType type,
    boolean granted,
    Instant grantedAt,
    Instant revokedAt,
    Map<String, Object> metadata,
    Instant createdAt
) {
    public static ConsentResponse from(ConsentRecord record) {
        return new ConsentResponse(
            record.getId(),
            record.getUserId(),
            record.getType(),
            record.isGranted(),
            record.getGrantedAt(),
            record.getRevokedAt(),
            record.getMetadata(),
            record.getCreatedAt()
        );
    }
}

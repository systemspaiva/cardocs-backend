package com.cardocs.api.audit;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AuditLogResponse(
    UUID id,
    UUID userId,
    UUID organizationId,
    String entityType,
    UUID entityId,
    AuditAction action,
    Map<String, Object> metadata,
    Instant createdAt
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
            log.getId(),
            log.getUserId(),
            log.getOrganizationId(),
            log.getEntityType(),
            log.getEntityId(),
            log.getAction(),
            log.getMetadata(),
            log.getCreatedAt()
        );
    }
}

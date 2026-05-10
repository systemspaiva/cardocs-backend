package com.cardocs.api.sharelinks;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ShareLinkResponse(
    UUID id,
    UUID vehicleId,
    ShareLinkStatus status,
    String token,
    Instant expiresAt,
    List<String> allowedSections,
    String publicTitle,
    Instant createdAt,
    Instant revokedAt,
    Instant lastAccessedAt
) {
    public static ShareLinkResponse from(ShareLink link) {
        return new ShareLinkResponse(
            link.getId(),
            link.getVehicleId(),
            link.getStatus(),
            link.getToken(),
            link.getExpiresAt(),
            link.getAllowedSections(),
            link.getPublicTitle(),
            link.getCreatedAt(),
            link.getRevokedAt(),
            link.getLastAccessedAt()
        );
    }
}

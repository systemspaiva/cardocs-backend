package com.cardocs.api.users;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
    UUID id,
    String name,
    String email,
    UserRole role,
    UUID organizationId,
    Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
            user.getId(),
            user.getName(),
            user.getEmail(),
            user.getRole(),
            user.getOrganizationId(),
            user.getCreatedAt()
        );
    }
}

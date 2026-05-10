package com.cardocs.api.sharelinks;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "share_links")
public class ShareLink extends BaseEntity {

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, unique = true)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ShareLinkStatus status;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_sections", columnDefinition = "jsonb")
    private List<String> allowedSections;

    @Column(name = "public_title")
    private String publicTitle;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "last_accessed_at")
    private Instant lastAccessedAt;
}

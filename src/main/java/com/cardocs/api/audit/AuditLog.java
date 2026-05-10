package com.cardocs.api.audit;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.Map;
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
@Table(name = "audit_logs")
public class AuditLog extends BaseEntity {

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "organization_id")
    private UUID organizationId;

    @Column(name = "entity_type")
    private String entityType;

    @Column(name = "entity_id")
    private UUID entityId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuditAction action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent")
    private String userAgent;
}

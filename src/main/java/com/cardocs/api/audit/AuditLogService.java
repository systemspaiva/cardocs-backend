package com.cardocs.api.audit;

import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    @Transactional
    public void record(UUID userId, UUID organizationId, String entityType, UUID entityId, AuditAction action) {
        record(userId, organizationId, entityType, entityId, action, Map.of());
    }

    @Transactional
    public void record(
        UUID userId,
        UUID organizationId,
        String entityType,
        UUID entityId,
        AuditAction action,
        Map<String, Object> metadata
    ) {
        auditLogRepository.save(AuditLog.builder()
            .userId(userId)
            .organizationId(organizationId)
            .entityType(entityType)
            .entityId(entityId)
            .action(action)
            .metadata(metadata)
            .build());
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> list(Pageable pageable) {
        return auditLogRepository.findAll(pageable).map(AuditLogResponse::from);
    }
}

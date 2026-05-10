package com.cardocs.api.consents;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.users.User;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ConsentService {

    private final ConsentRecordRepository repository;
    private final AuditLogService auditLogService;

    @Transactional(readOnly = true)
    public List<ConsentResponse> list(User user) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId())
            .stream()
            .map(ConsentResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public boolean hasGranted(User user, ConsentType type) {
        return repository.findFirstByUserIdAndTypeAndGrantedIsTrueAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId(), type).isPresent();
    }

    @Transactional
    public ConsentResponse create(User user, CreateConsentRequest request) {
        ConsentRecord record = ConsentRecord.builder()
            .userId(user.getId())
            .type(request.type())
            .granted(request.granted())
            .grantedAt(request.granted() ? Instant.now() : null)
            .revokedAt(request.granted() ? null : Instant.now())
            .metadata(request.metadata())
            .build();
        repository.save(record);
        auditLogService.record(
            user.getId(),
            user.getOrganizationId(),
            "ConsentRecord",
            record.getId(),
            request.granted() ? AuditAction.CONSENT_GRANTED : AuditAction.CONSENT_REVOKED
        );
        return ConsentResponse.from(record);
    }

    @Transactional
    public ConsentResponse revoke(User user, UUID consentId) {
        ConsentRecord record = repository.findByIdAndUserIdAndDeletedAtIsNull(consentId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Consentimento não encontrado"));
        record.setGranted(false);
        record.setRevokedAt(Instant.now());
        auditLogService.record(user.getId(), user.getOrganizationId(), "ConsentRecord", record.getId(), AuditAction.CONSENT_REVOKED);
        return ConsentResponse.from(record);
    }
}

package com.cardocs.api.admin;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogResponse;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.documents.VehicleDocumentRepository;
import com.cardocs.api.documents.VehicleDocumentResponse;
import com.cardocs.api.integrations.queue.QueueName;
import com.cardocs.api.integrations.queue.QueueProvider;
import com.cardocs.api.ocr.OcrJobPayload;
import com.cardocs.api.sharelinks.ShareLinkService;
import com.cardocs.api.users.User;
import com.cardocs.api.users.UserRepository;
import com.cardocs.api.users.UserResponse;
import com.cardocs.api.vehicles.VehicleRepository;
import com.cardocs.api.vehicles.VehicleResponse;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleDocumentRepository documentRepository;
    private final QueueProvider queueProvider;
    private final ShareLinkService shareLinkService;
    private final AuditLogService auditLogService;

    @Transactional
    public Page<UserResponse> users(User actor, Pageable pageable) {
        recordAdminAction(actor, "Admin", null, "LIST_USERS");
        return userRepository.findAll(pageable).map(UserResponse::from);
    }

    @Transactional
    public UserResponse user(User actor, UUID userId) {
        recordAdminAction(actor, "User", userId, "GET_USER");
        return userRepository.findById(userId)
            .filter(user -> !user.isDeleted())
            .map(UserResponse::from)
            .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }

    @Transactional
    public List<VehicleResponse> userVehicles(User actor, UUID userId) {
        recordAdminAction(actor, "User", userId, "LIST_USER_VEHICLES");
        return vehicleRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(userId)
            .stream()
            .map(VehicleResponse::from)
            .toList();
    }

    @Transactional
    public Page<AuditLogResponse> auditLogs(User actor, Pageable pageable) {
        recordAdminAction(actor, "AuditLog", null, "LIST_AUDIT_LOGS");
        return auditLogService.list(pageable);
    }

    @Transactional
    public Page<VehicleDocumentResponse> ocrJobs(User actor, Pageable pageable) {
        recordAdminAction(actor, "VehicleDocument", null, "LIST_OCR_JOBS");
        return documentRepository.findAll(pageable).map(VehicleDocumentResponse::from);
    }

    @Transactional
    public void retryOcr(User actor, UUID jobId) {
        var document = documentRepository.findById(jobId)
            .filter(candidate -> !candidate.isDeleted())
            .orElseThrow(() -> new ResourceNotFoundException("Job OCR não encontrado"));
        queueProvider.send(QueueName.OCR_PROCESSING, new OcrJobPayload(document.getId(), document.getVehicleId(), document.getUserId()));
        recordAdminAction(actor, "VehicleDocument", document.getId(), "RETRY_OCR");
        auditLogService.record(document.getUserId(), null, "VehicleDocument", document.getId(), AuditAction.ADMIN_ACTION);
    }

    @Transactional
    public void revokeShareLink(User actor, UUID shareLinkId) {
        recordAdminAction(actor, "ShareLink", shareLinkId, "REVOKE_SHARE_LINK");
        shareLinkService.adminRevoke(shareLinkId);
    }

    private void recordAdminAction(User actor, String entityType, UUID entityId, String operation) {
        auditLogService.record(
            actor.getId(),
            actor.getOrganizationId(),
            entityType,
            entityId,
            AuditAction.ADMIN_ACTION,
            Map.of("operation", operation)
        );
    }
}

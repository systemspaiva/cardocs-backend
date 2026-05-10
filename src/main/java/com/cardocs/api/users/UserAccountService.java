package com.cardocs.api.users;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.consents.ConsentRecordRepository;
import com.cardocs.api.documents.VehicleDocumentRepository;
import com.cardocs.api.exports.DataExportRequestRepository;
import com.cardocs.api.exports.PdfExportRequestRepository;
import com.cardocs.api.maintenance.MaintenanceRecordRepository;
import com.cardocs.api.reminders.ReminderRepository;
import com.cardocs.api.sharelinks.ShareLinkRepository;
import com.cardocs.api.sharelinks.ShareLinkStatus;
import com.cardocs.api.vehicles.VehicleRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserAccountService {

    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleDocumentRepository documentRepository;
    private final MaintenanceRecordRepository maintenanceRepository;
    private final ReminderRepository reminderRepository;
    private final ShareLinkRepository shareLinkRepository;
    private final ConsentRecordRepository consentRepository;
    private final PdfExportRequestRepository pdfExportRepository;
    private final DataExportRequestRepository dataExportRepository;
    private final AuditLogService auditLogService;

    @Transactional
    public void deleteCurrentAccount(User user) {
        Instant now = Instant.now();
        shareLinkRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(link -> {
            link.setStatus(ShareLinkStatus.REVOKED);
            link.setRevokedAt(now);
            link.markDeleted();
        });
        documentRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(document -> document.markDeleted());
        maintenanceRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(record -> record.markDeleted());
        reminderRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(reminder -> reminder.markDeleted());
        vehicleRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId()).forEach(vehicle -> vehicle.markDeleted());
        consentRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId()).forEach(consent -> {
            consent.setGranted(false);
            consent.setRevokedAt(now);
            consent.markDeleted();
        });
        pdfExportRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(export -> export.markDeleted());
        dataExportRepository.findByUserIdAndDeletedAtIsNull(user.getId()).forEach(export -> export.markDeleted());
        user.setStatus(UserStatus.DELETED);
        user.markDeleted();
        userRepository.save(user);
        auditLogService.record(user.getId(), user.getOrganizationId(), "User", user.getId(), AuditAction.USER_DELETED);
    }
}

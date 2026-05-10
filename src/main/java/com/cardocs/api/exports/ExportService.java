package com.cardocs.api.exports;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.integrations.queue.QueueName;
import com.cardocs.api.integrations.queue.QueueProvider;
import com.cardocs.api.integrations.storage.StorageProvider;
import com.cardocs.api.storage.PresignedUrlResponse;
import com.cardocs.api.users.User;
import com.cardocs.api.vehicles.VehicleService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ExportService {

    private final PdfExportRequestRepository pdfRepository;
    private final DataExportRequestRepository dataRepository;
    private final VehicleService vehicleService;
    private final QueueProvider queueProvider;
    private final StorageProvider storageProvider;
    private final AuditLogService auditLogService;

    @Transactional
    public PdfExportResponse createPdf(User user, UUID vehicleId, CreatePdfExportRequest request) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        PdfExportRequest export = PdfExportRequest.builder()
            .userId(user.getId())
            .vehicleId(vehicleId)
            .type(request.normalizedType())
            .status(ExportStatus.PENDING)
            .build();
        pdfRepository.save(export);
        queueProvider.send(QueueName.PDF_EXPORT, new PdfExportPayload(export.getId(), vehicleId, user.getId(), export.getType()));
        return PdfExportResponse.from(export);
    }

    @Transactional(readOnly = true)
    public PdfExportResponse getPdf(User user, UUID exportId) {
        return PdfExportResponse.from(pdfRepository.findByIdAndUserIdAndDeletedAtIsNull(exportId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação PDF não encontrada")));
    }

    @Transactional(readOnly = true)
    public PresignedUrlResponse pdfDownloadUrl(User user, UUID exportId) {
        PdfExportRequest export = pdfRepository.findByIdAndUserIdAndDeletedAtIsNull(exportId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação PDF não encontrada"));
        if (export.getStatus() != ExportStatus.COMPLETED || export.getStorageKey() == null || export.getStorageKey().isBlank()) {
            throw new BadRequestException("Exportação PDF ainda não concluída");
        }
        return storageProvider.createDownloadUrl(export.getStorageKey());
    }

    @Transactional
    public DataExportResponse requestDataExport(User user) {
        DataExportRequest export = DataExportRequest.builder()
            .userId(user.getId())
            .status(ExportStatus.PENDING)
            .build();
        dataRepository.save(export);
        queueProvider.send(QueueName.DATA_EXPORT, new DataExportPayload(export.getId(), user.getId()));
        auditLogService.record(user.getId(), user.getOrganizationId(), "DataExportRequest", export.getId(), AuditAction.DATA_EXPORTED);
        return DataExportResponse.from(export);
    }

    @Transactional(readOnly = true)
    public DataExportResponse getDataExport(User user, UUID exportId) {
        return DataExportResponse.from(dataRepository.findByIdAndUserIdAndDeletedAtIsNull(exportId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação de dados não encontrada")));
    }

    @Transactional(readOnly = true)
    public PresignedUrlResponse dataExportDownloadUrl(User user, UUID exportId) {
        DataExportRequest export = dataRepository.findByIdAndUserIdAndDeletedAtIsNull(exportId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação de dados não encontrada"));
        if (export.getStatus() != ExportStatus.COMPLETED || export.getStorageKey() == null || export.getStorageKey().isBlank()) {
            throw new BadRequestException("Exportação de dados ainda não concluída");
        }
        return storageProvider.createDownloadUrl(export.getStorageKey());
    }

    @Transactional(readOnly = true)
    public Page<DataExportResponse> listDataExports(User user, Pageable pageable) {
        return dataRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId(), pageable)
            .map(DataExportResponse::from);
    }
}

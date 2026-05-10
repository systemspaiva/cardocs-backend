package com.cardocs.api.documents;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.config.AppProperties;
import com.cardocs.api.consents.ConsentService;
import com.cardocs.api.consents.ConsentType;
import com.cardocs.api.integrations.queue.QueueName;
import com.cardocs.api.integrations.queue.QueueProvider;
import com.cardocs.api.integrations.storage.StorageProvider;
import com.cardocs.api.ocr.OcrJobPayload;
import com.cardocs.api.storage.PresignedUrlResponse;
import com.cardocs.api.users.User;
import com.cardocs.api.vehicles.VehicleService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class VehicleDocumentService {

    private final VehicleDocumentRepository documentRepository;
    private final VehicleService vehicleService;
    private final StorageProvider storageProvider;
    private final QueueProvider queueProvider;
    private final AppProperties properties;
    private final AuditLogService auditLogService;
    private final ConsentService consentService;

    @Transactional
    public DocumentUploadUrlResponse createUploadUrl(User user, UUID vehicleId, CreateUploadUrlRequest request) {
        requireConsent(user, ConsentType.DOCUMENT_STORAGE);
        vehicleService.getOwnedVehicle(user, vehicleId);
        VehicleDocument document = buildDocument(user, vehicleId, request.type(), request.fileName(), request.contentType(), request.fileSize(), "pending");
        documentRepository.save(document);
        PresignedUrlResponse uploadUrl = storageProvider.createUploadUrl(user.getId(), vehicleId, document.getId(), request.fileName(), request.contentType(), request.fileSize());
        document.setStorageKey(uploadUrl.storageKey());
        document.setStorageBucket(properties.getAws().getS3Bucket());
        auditLogService.record(user.getId(), user.getOrganizationId(), "VehicleDocument", document.getId(), AuditAction.DOCUMENT_UPLOADED);
        return new DocumentUploadUrlResponse(document.getId(), uploadUrl.url(), uploadUrl.storageKey(), uploadUrl.expiresAt(), VehicleDocumentResponse.from(document));
    }

    @Transactional
    public VehicleDocumentResponse create(User user, UUID vehicleId, CreateVehicleDocumentRequest request) {
        requireConsent(user, ConsentType.DOCUMENT_STORAGE);
        vehicleService.getOwnedVehicle(user, vehicleId);
        VehicleDocument document = buildDocument(user, vehicleId, request.type(), request.fileName(), request.contentType(), request.fileSize(), request.storageKey());
        document.setStorageBucket(properties.getAws().getS3Bucket());
        documentRepository.save(document);
        auditLogService.record(user.getId(), user.getOrganizationId(), "VehicleDocument", document.getId(), AuditAction.DOCUMENT_UPLOADED);
        return VehicleDocumentResponse.from(document);
    }

    @Transactional(readOnly = true)
    public List<VehicleDocumentResponse> list(User user, UUID vehicleId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return documentRepository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(vehicleId, user.getId())
            .stream()
            .map(VehicleDocumentResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public VehicleDocument getOwnedDocument(User user, UUID vehicleId, UUID documentId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return documentRepository.findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(documentId, vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Documento não encontrado"));
    }

    @Transactional(readOnly = true)
    public VehicleDocumentResponse get(User user, UUID vehicleId, UUID documentId) {
        return VehicleDocumentResponse.from(getOwnedDocument(user, vehicleId, documentId));
    }

    @Transactional(readOnly = true)
    public PresignedUrlResponse downloadUrl(User user, UUID vehicleId, UUID documentId) {
        VehicleDocument document = getOwnedDocument(user, vehicleId, documentId);
        return storageProvider.createDownloadUrl(document.getStorageKey());
    }

    @Transactional
    public void delete(User user, UUID vehicleId, UUID documentId) {
        VehicleDocument document = getOwnedDocument(user, vehicleId, documentId);
        document.markDeleted();
        auditLogService.record(user.getId(), user.getOrganizationId(), "VehicleDocument", document.getId(), AuditAction.DOCUMENT_DELETED);
    }

    @Transactional
    public VehicleDocumentResponse enqueueOcr(User user, UUID vehicleId, UUID documentId) {
        if (!properties.getFeatures().isOcrIntegration()) {
            throw new BadRequestException("OCR está desativado por feature flag");
        }
        requireConsent(user, ConsentType.OCR_PROCESSING);
        VehicleDocument document = getOwnedDocument(user, vehicleId, documentId);
        document.setOcrStatus(OcrStatus.PENDING);
        queueProvider.send(QueueName.OCR_PROCESSING, new OcrJobPayload(documentId, vehicleId, user.getId()));
        return VehicleDocumentResponse.from(document);
    }

    @Transactional
    public VehicleDocumentResponse review(User user, UUID vehicleId, UUID documentId, ReviewDocumentRequest request) {
        VehicleDocument document = getOwnedDocument(user, vehicleId, documentId);
        document.setReviewedData(request.reviewedData());
        document.setReviewStatus(ReviewStatus.REVIEWED);
        return VehicleDocumentResponse.from(document);
    }

    private VehicleDocument buildDocument(User user, UUID vehicleId, DocumentType type, String fileName, String contentType, long fileSize, String storageKey) {
        return VehicleDocument.builder()
            .vehicleId(vehicleId)
            .userId(user.getId())
            .type(type)
            .fileName(fileName.trim())
            .contentType(contentType.trim())
            .fileSize(fileSize)
            .storageKey(storageKey)
            .storageBucket(properties.getAws().getS3Bucket())
            .ocrStatus(OcrStatus.PENDING)
            .reviewStatus(ReviewStatus.NOT_REVIEWED)
            .build();
    }

    private void requireConsent(User user, ConsentType type) {
        if (!consentService.hasGranted(user, type)) {
            throw new BadRequestException("Consentimento " + type.name() + " é obrigatório para esta operação");
        }
    }
}

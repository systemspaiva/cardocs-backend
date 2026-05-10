package com.cardocs.api.ocr;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.documents.OcrStatus;
import com.cardocs.api.documents.ReviewStatus;
import com.cardocs.api.documents.VehicleDocument;
import com.cardocs.api.documents.VehicleDocumentRepository;
import com.cardocs.api.integrations.ocr.OcrProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OcrJobService {

    private final VehicleDocumentRepository documentRepository;
    private final OcrProvider ocrProvider;
    private final AuditLogService auditLogService;

    @Transactional
    public void process(OcrJobPayload payload) {
        VehicleDocument document = documentRepository.findById(payload.documentId())
            .filter(candidate -> !candidate.isDeleted())
            .orElseThrow(() -> new ResourceNotFoundException("Documento não encontrado para OCR"));
        document.setOcrStatus(OcrStatus.PROCESSING);
        var result = ocrProvider.process(document);
        document.setOcrRawText(result.rawText());
        document.setOcrStructuredData(result.structuredData());
        document.setOcrStatus(result.requiresReview() ? OcrStatus.REVIEW_REQUIRED : OcrStatus.COMPLETED);
        document.setReviewStatus(result.requiresReview() ? ReviewStatus.REVIEW_REQUIRED : ReviewStatus.NOT_REVIEWED);
        auditLogService.record(document.getUserId(), null, "VehicleDocument", document.getId(), AuditAction.OCR_PROCESSED);
    }
}

package com.cardocs.api.exports;

import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.integrations.ocr.PdfExportProvider;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ExportJobService {

    private final PdfExportRequestRepository pdfRepository;
    private final DataExportRequestRepository dataRepository;
    private final PdfExportProvider pdfExportProvider;

    @Transactional
    public void processPdf(PdfExportPayload payload) {
        PdfExportRequest request = pdfRepository.findById(payload.exportId())
            .filter(candidate -> !candidate.isDeleted())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação PDF não encontrada"));
        request.setStatus(ExportStatus.PROCESSING);
        request.setStorageKey(pdfExportProvider.render(request));
        request.setStatus(ExportStatus.COMPLETED);
        request.setCompletedAt(Instant.now());
    }

    @Transactional
    public void processDataExport(DataExportPayload payload) {
        DataExportRequest request = dataRepository.findById(payload.exportId())
            .filter(candidate -> !candidate.isDeleted())
            .orElseThrow(() -> new ResourceNotFoundException("Exportação de dados não encontrada"));
        request.setStatus(ExportStatus.PROCESSING);
        request.setStorageKey("users/%s/privacy-exports/%s.json".formatted(request.getUserId(), request.getId()));
        request.setStatus(ExportStatus.COMPLETED);
        request.setCompletedAt(Instant.now());
    }
}

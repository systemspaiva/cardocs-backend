package com.cardocs.api.exports;

import com.cardocs.api.security.CurrentUserService;
import com.cardocs.api.storage.PresignedUrlResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ExportController {

    private final ExportService exportService;
    private final CurrentUserService currentUserService;

    @PostMapping("/vehicles/{vehicleId}/exports/pdf")
    @ResponseStatus(HttpStatus.CREATED)
    PdfExportResponse createPdf(@PathVariable UUID vehicleId, @Valid @RequestBody CreatePdfExportRequest request) {
        return exportService.createPdf(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @GetMapping("/exports/{exportId}")
    PdfExportResponse getPdf(@PathVariable UUID exportId) {
        return exportService.getPdf(currentUserService.getCurrentUser(), exportId);
    }

    @GetMapping("/exports/{exportId}/download-url")
    PresignedUrlResponse pdfDownloadUrl(@PathVariable UUID exportId) {
        return exportService.pdfDownloadUrl(currentUserService.getCurrentUser(), exportId);
    }
}

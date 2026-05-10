package com.cardocs.api.exports;

public record CreatePdfExportRequest(PdfExportType type) {
    public PdfExportType normalizedType() {
        return type == null ? PdfExportType.FULL_HISTORY : type;
    }
}

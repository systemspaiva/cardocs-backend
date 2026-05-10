package com.cardocs.api.integrations.ocr;

import com.cardocs.api.exports.PdfExportRequest;

public interface PdfExportProvider {
    String render(PdfExportRequest request);
}

package com.cardocs.api.integrations.ocr;

import com.cardocs.api.exports.PdfExportRequest;
import org.springframework.stereotype.Component;

@Component
public class MockPdfExportProvider implements PdfExportProvider {

    @Override
    public String render(PdfExportRequest request) {
        return "users/%s/vehicles/%s/exports/%s.pdf".formatted(request.getUserId(), request.getVehicleId(), request.getId());
    }
}

package com.cardocs.api.integrations.ocr;

import com.cardocs.api.documents.VehicleDocument;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "ocr", havingValue = "mock", matchIfMissing = true)
public class MockOcrProvider implements OcrProvider {

    @Override
    public OcrResult process(VehicleDocument document) {
        return new OcrResult(
            "OCR mockado para " + document.getFileName(),
            Map.of("documentType", document.getType().name(), "confidence", 0.99),
            true
        );
    }
}

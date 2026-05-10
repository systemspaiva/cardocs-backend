package com.cardocs.api.integrations.ocr;

import com.cardocs.api.documents.VehicleDocument;

public interface OcrProvider {
    OcrResult process(VehicleDocument document);
}

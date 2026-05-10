package com.cardocs.api.integrations.ocr;

import java.util.Map;

public record OcrResult(
    String rawText,
    Map<String, Object> structuredData,
    boolean requiresReview
) {
}

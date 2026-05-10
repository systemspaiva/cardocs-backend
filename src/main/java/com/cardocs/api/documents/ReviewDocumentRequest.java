package com.cardocs.api.documents;

import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record ReviewDocumentRequest(@NotNull Map<String, Object> reviewedData) {
}

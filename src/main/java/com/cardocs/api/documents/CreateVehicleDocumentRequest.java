package com.cardocs.api.documents;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateVehicleDocumentRequest(
    @NotNull DocumentType type,
    @NotBlank String fileName,
    @NotBlank String contentType,
    @Min(1) long fileSize,
    @NotBlank String storageKey
) {
}

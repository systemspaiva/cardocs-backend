package com.cardocs.api.maintenance;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateMaintenanceRequest(
    @NotNull MaintenanceType type,
    @NotBlank String title,
    String description,
    @NotNull LocalDate serviceDate,
    Integer mileage,
    BigDecimal amount,
    String currency,
    String vendorName,
    UUID documentId
) {
}

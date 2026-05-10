package com.cardocs.api.maintenance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record UpdateMaintenanceRequest(
    MaintenanceType type,
    String title,
    String description,
    LocalDate serviceDate,
    Integer mileage,
    BigDecimal amount,
    String currency,
    String vendorName,
    UUID documentId
) {
}

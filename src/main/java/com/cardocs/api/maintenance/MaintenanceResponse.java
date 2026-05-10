package com.cardocs.api.maintenance;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record MaintenanceResponse(
    UUID id,
    UUID vehicleId,
    UUID userId,
    MaintenanceType type,
    String title,
    String description,
    LocalDate serviceDate,
    Integer mileage,
    BigDecimal amount,
    String currency,
    String vendorName,
    UUID documentId,
    Instant createdAt,
    Instant updatedAt
) {
    public static MaintenanceResponse from(MaintenanceRecord record) {
        return new MaintenanceResponse(
            record.getId(),
            record.getVehicleId(),
            record.getUserId(),
            record.getType(),
            record.getTitle(),
            record.getDescription(),
            record.getServiceDate(),
            record.getMileage(),
            record.getAmount(),
            record.getCurrency(),
            record.getVendorName(),
            record.getDocumentId(),
            record.getCreatedAt(),
            record.getUpdatedAt()
        );
    }
}

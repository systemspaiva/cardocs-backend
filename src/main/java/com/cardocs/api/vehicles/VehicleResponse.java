package com.cardocs.api.vehicles;

import java.time.Instant;
import java.util.UUID;

public record VehicleResponse(
    UUID id,
    UUID userId,
    UUID organizationId,
    String plate,
    VehicleType type,
    String brand,
    String model,
    String version,
    Integer year,
    Integer manufactureYear,
    String color,
    FuelType fuelType,
    String chassisLastDigits,
    String renavamMasked,
    Integer currentMileage,
    Instant createdAt,
    Instant updatedAt
) {
    public static VehicleResponse from(Vehicle vehicle) {
        return new VehicleResponse(
            vehicle.getId(),
            vehicle.getUserId(),
            vehicle.getOrganizationId(),
            vehicle.getPlate(),
            vehicle.getType(),
            vehicle.getBrand(),
            vehicle.getModel(),
            vehicle.getVersion(),
            vehicle.getYear(),
            vehicle.getManufactureYear(),
            vehicle.getColor(),
            vehicle.getFuelType(),
            vehicle.getChassisLastDigits(),
            vehicle.getRenavamMasked(),
            vehicle.getCurrentMileage(),
            vehicle.getCreatedAt(),
            vehicle.getUpdatedAt()
        );
    }
}

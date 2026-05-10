package com.cardocs.api.vehicles;

import java.util.UUID;

public record PublicVehicleResponse(
    UUID id,
    String plate,
    VehicleType type,
    String brand,
    String model,
    String version,
    Integer year,
    Integer manufactureYear,
    String color,
    FuelType fuelType
) {
    public static PublicVehicleResponse from(Vehicle vehicle) {
        return new PublicVehicleResponse(
            vehicle.getId(),
            vehicle.getPlate(),
            vehicle.getType(),
            vehicle.getBrand(),
            vehicle.getModel(),
            vehicle.getVersion(),
            vehicle.getYear(),
            vehicle.getManufactureYear(),
            vehicle.getColor(),
            vehicle.getFuelType()
        );
    }
}

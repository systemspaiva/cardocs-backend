package com.cardocs.api.vehicles;

public record UpdateVehicleRequest(
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
    Integer currentMileage
) {
}

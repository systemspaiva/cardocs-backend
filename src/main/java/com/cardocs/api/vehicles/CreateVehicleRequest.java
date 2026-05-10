package com.cardocs.api.vehicles;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateVehicleRequest(
    @NotBlank @Size(max = 12) String plate,
    @NotNull VehicleType type,
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

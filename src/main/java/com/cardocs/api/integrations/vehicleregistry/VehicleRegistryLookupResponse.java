package com.cardocs.api.integrations.vehicleregistry;

import com.cardocs.api.vehicles.FuelType;
import com.cardocs.api.vehicles.VehicleType;

public record VehicleRegistryLookupResponse(
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
    boolean found,
    String provider
) {
}

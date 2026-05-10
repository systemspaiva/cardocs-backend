package com.cardocs.api.integrations.vehicleregistry;

import com.cardocs.api.vehicles.FuelType;
import com.cardocs.api.vehicles.VehicleType;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "vehicle-registry", havingValue = "mock", matchIfMissing = true)
public class MockVehicleRegistryProvider implements VehicleRegistryProvider {

    @Override
    public VehicleRegistryLookupResponse lookupByPlate(String plate) {
        String normalizedPlate = plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        return new VehicleRegistryLookupResponse(
            normalizedPlate,
            VehicleType.CAR,
            "Mock Motors",
            "CarDocs Seed",
            "MVP",
            2024,
            2024,
            "Prata",
            FuelType.FLEX,
            "0000",
            "***0000",
            true,
            "mock"
        );
    }
}

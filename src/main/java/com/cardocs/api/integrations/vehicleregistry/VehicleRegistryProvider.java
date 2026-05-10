package com.cardocs.api.integrations.vehicleregistry;

public interface VehicleRegistryProvider {
    VehicleRegistryLookupResponse lookupByPlate(String plate);
}

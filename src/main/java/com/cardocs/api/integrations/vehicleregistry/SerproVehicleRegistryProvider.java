package com.cardocs.api.integrations.vehicleregistry;

import com.cardocs.api.common.BadRequestException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "vehicle-registry", havingValue = "serpro")
public class SerproVehicleRegistryProvider implements VehicleRegistryProvider {

    @Override
    public VehicleRegistryLookupResponse lookupByPlate(String plate) {
        throw new BadRequestException("Provider SERPRO depende de autorização/contrato e está desativado no MVP");
    }
}

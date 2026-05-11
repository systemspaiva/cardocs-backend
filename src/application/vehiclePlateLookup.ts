import { ProviderNotConfiguredError } from "./errors.js";
import { assertValidBrazilianPlate, normalizePlate } from "../domain/factories.js";
import { VehicleCandidate } from "../domain/models.js";

export interface VehiclePlateDataProvider {
  lookupByPlate(plate: string): Promise<VehicleCandidate>;
}

export class VehiclePlateLookupUseCase {
  constructor(private readonly provider: VehiclePlateDataProvider | null) {}

  async lookup(plate: string): Promise<VehicleCandidate> {
    const normalizedPlate = normalizePlate(plate);
    assertValidBrazilianPlate(normalizedPlate);

    if (!this.provider) {
      throw new ProviderNotConfiguredError("Provider real de consulta por placa ainda nao esta configurado.");
    }

    return this.provider.lookupByPlate(normalizedPlate);
  }
}

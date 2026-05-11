import { ProviderNotConfiguredError } from "./errors.js";
import { assertRealVehicleData } from "../domain/factories.js";
import { VehicleImage } from "../domain/models.js";

export interface VehicleImageLookupInput {
  brand: string;
  model: string;
  year: string;
}

export interface VehicleImageProvider {
  lookupImage(vehicle: VehicleImageLookupInput): Promise<VehicleImage | null>;
}

export class VehicleImageLookupUseCase {
  constructor(private readonly provider: VehicleImageProvider | null) {}

  async lookup(vehicle: VehicleImageLookupInput): Promise<VehicleImage | null> {
    assertRealVehicleData(vehicle);

    if (!this.provider) {
      throw new ProviderNotConfiguredError("Provider real de imagens de veiculo ainda nao esta configurado.");
    }

    return this.provider.lookupImage({
      brand: vehicle.brand.trim(),
      model: vehicle.model.trim(),
      year: vehicle.year.trim()
    });
  }
}

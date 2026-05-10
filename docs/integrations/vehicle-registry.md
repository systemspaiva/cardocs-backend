# Vehicle Registry Integration

The application depends on `VehicleRegistryProvider` for plate lookup. `VehicleService` does not call official registry APIs directly.

## Current Provider

`MockVehicleRegistryProvider` is enabled by default with:

```env
VEHICLE_REGISTRY_PROVIDER=mock
FEATURE_VEHICLE_REGISTRY_INTEGRATION=true
```

It returns deterministic mock data and does not call SERPRO, WSDenatran, Mercado Livre, or any other external API.

## Future Providers

Place official providers under `com.cardocs.api.integrations.vehicleregistry`:

- `SerproVehicleRegistryProvider`
- `WsDenatranVehicleRegistryProvider`

They are intentionally inactive in the MVP because official vehicle registry access depends on authorization, contract terms, LGPD review, and credential management through AWS Secrets Manager or Parameter Store.

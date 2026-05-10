package com.cardocs.api.vehicles;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.config.AppProperties;
import com.cardocs.api.integrations.vehicleregistry.VehicleRegistryLookupResponse;
import com.cardocs.api.integrations.vehicleregistry.VehicleRegistryProvider;
import com.cardocs.api.users.User;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class VehicleService {

    private final VehicleRepository vehicleRepository;
    private final VehicleRegistryProvider vehicleRegistryProvider;
    private final AppProperties properties;
    private final AuditLogService auditLogService;

    @Transactional
    public VehicleResponse create(User user, CreateVehicleRequest request) {
        String plate = normalizePlate(request.plate());
        if (vehicleRepository.existsByUserIdAndPlateAndDeletedAtIsNull(user.getId(), plate)) {
            throw new BadRequestException("Veículo já cadastrado para este usuário");
        }

        Vehicle vehicle = Vehicle.builder()
            .userId(user.getId())
            .organizationId(user.getOrganizationId())
            .plate(plate)
            .type(request.type())
            .brand(trim(request.brand()))
            .model(trim(request.model()))
            .version(trim(request.version()))
            .year(request.year())
            .manufactureYear(request.manufactureYear())
            .color(trim(request.color()))
            .fuelType(request.fuelType())
            .chassisLastDigits(trim(request.chassisLastDigits()))
            .renavamMasked(trim(request.renavamMasked()))
            .currentMileage(request.currentMileage())
            .build();
        vehicleRepository.save(vehicle);
        auditLogService.record(user.getId(), user.getOrganizationId(), "Vehicle", vehicle.getId(), AuditAction.VEHICLE_CREATED);
        return VehicleResponse.from(vehicle);
    }

    @Transactional(readOnly = true)
    public List<VehicleResponse> list(User user) {
        return vehicleRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId())
            .stream()
            .map(VehicleResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public Vehicle getOwnedVehicle(User user, UUID vehicleId) {
        return vehicleRepository.findByIdAndUserIdAndDeletedAtIsNull(vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Veículo não encontrado"));
    }

    @Transactional(readOnly = true)
    public Vehicle getPublicVehicle(UUID vehicleId) {
        return vehicleRepository.findByIdAndDeletedAtIsNull(vehicleId)
            .orElseThrow(() -> new ResourceNotFoundException("Veículo não encontrado"));
    }

    @Transactional(readOnly = true)
    public VehicleResponse get(User user, UUID vehicleId) {
        return VehicleResponse.from(getOwnedVehicle(user, vehicleId));
    }

    @Transactional
    public VehicleResponse update(User user, UUID vehicleId, UpdateVehicleRequest request) {
        Vehicle vehicle = getOwnedVehicle(user, vehicleId);
        if (request.type() != null) {
            vehicle.setType(request.type());
        }
        vehicle.setBrand(trim(request.brand()));
        vehicle.setModel(trim(request.model()));
        vehicle.setVersion(trim(request.version()));
        vehicle.setYear(request.year());
        vehicle.setManufactureYear(request.manufactureYear());
        vehicle.setColor(trim(request.color()));
        vehicle.setFuelType(request.fuelType());
        vehicle.setChassisLastDigits(trim(request.chassisLastDigits()));
        vehicle.setRenavamMasked(trim(request.renavamMasked()));
        vehicle.setCurrentMileage(request.currentMileage());
        auditLogService.record(user.getId(), user.getOrganizationId(), "Vehicle", vehicle.getId(), AuditAction.VEHICLE_UPDATED);
        return VehicleResponse.from(vehicle);
    }

    @Transactional
    public void delete(User user, UUID vehicleId) {
        Vehicle vehicle = getOwnedVehicle(user, vehicleId);
        vehicle.markDeleted();
        auditLogService.record(user.getId(), user.getOrganizationId(), "Vehicle", vehicle.getId(), AuditAction.VEHICLE_UPDATED);
    }

    @Transactional(readOnly = true)
    public VehicleRegistryLookupResponse lookup(User user, LookupPlateRequest request) {
        if (!properties.getFeatures().isVehicleRegistryIntegration()) {
            throw new BadRequestException("Consulta por placa está desativada por feature flag");
        }
        return vehicleRegistryProvider.lookupByPlate(normalizePlate(request.plate()));
    }

    private String normalizePlate(String plate) {
        return plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

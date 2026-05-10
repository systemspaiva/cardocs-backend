package com.cardocs.api.maintenance;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.documents.VehicleDocumentRepository;
import com.cardocs.api.users.User;
import com.cardocs.api.vehicles.VehicleService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MaintenanceService {

    private final MaintenanceRecordRepository repository;
    private final VehicleService vehicleService;
    private final VehicleDocumentRepository documentRepository;
    private final AuditLogService auditLogService;

    @Transactional
    public MaintenanceResponse create(User user, UUID vehicleId, CreateMaintenanceRequest request) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        validateDocumentOwnership(user, vehicleId, request.documentId());
        MaintenanceRecord record = MaintenanceRecord.builder()
            .vehicleId(vehicleId)
            .userId(user.getId())
            .type(request.type())
            .title(request.title().trim())
            .description(request.description())
            .serviceDate(request.serviceDate())
            .mileage(request.mileage())
            .amount(request.amount())
            .currency(request.currency() == null ? "BRL" : request.currency())
            .vendorName(request.vendorName())
            .documentId(request.documentId())
            .build();
        repository.save(record);
        auditLogService.record(user.getId(), user.getOrganizationId(), "MaintenanceRecord", record.getId(), AuditAction.MAINTENANCE_CREATED);
        return MaintenanceResponse.from(record);
    }

    @Transactional(readOnly = true)
    public List<MaintenanceResponse> list(User user, UUID vehicleId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return repository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByServiceDateDesc(vehicleId, user.getId())
            .stream()
            .map(MaintenanceResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public MaintenanceRecord getOwned(User user, UUID vehicleId, UUID maintenanceId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return repository.findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(maintenanceId, vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Manutenção não encontrada"));
    }

    @Transactional(readOnly = true)
    public MaintenanceResponse get(User user, UUID vehicleId, UUID maintenanceId) {
        return MaintenanceResponse.from(getOwned(user, vehicleId, maintenanceId));
    }

    @Transactional
    public MaintenanceResponse update(User user, UUID vehicleId, UUID maintenanceId, UpdateMaintenanceRequest request) {
        MaintenanceRecord record = getOwned(user, vehicleId, maintenanceId);
        validateDocumentOwnership(user, vehicleId, request.documentId());
        if (request.type() != null) record.setType(request.type());
        if (request.title() != null) record.setTitle(request.title().trim());
        if (request.description() != null) record.setDescription(request.description());
        if (request.serviceDate() != null) record.setServiceDate(request.serviceDate());
        if (request.mileage() != null) record.setMileage(request.mileage());
        if (request.amount() != null) record.setAmount(request.amount());
        if (request.currency() != null) record.setCurrency(request.currency());
        if (request.vendorName() != null) record.setVendorName(request.vendorName());
        if (request.documentId() != null) record.setDocumentId(request.documentId());
        return MaintenanceResponse.from(record);
    }

    @Transactional
    public void delete(User user, UUID vehicleId, UUID maintenanceId) {
        getOwned(user, vehicleId, maintenanceId).markDeleted();
    }

    private void validateDocumentOwnership(User user, UUID vehicleId, UUID documentId) {
        if (documentId == null) {
            return;
        }
        documentRepository.findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(documentId, vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Documento vinculado não encontrado para este veículo"));
    }
}

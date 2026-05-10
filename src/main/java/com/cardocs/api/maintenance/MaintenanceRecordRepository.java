package com.cardocs.api.maintenance;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MaintenanceRecordRepository extends JpaRepository<MaintenanceRecord, UUID> {
    List<MaintenanceRecord> findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByServiceDateDesc(UUID vehicleId, UUID userId);

    List<MaintenanceRecord> findByUserIdAndDeletedAtIsNull(UUID userId);

    Optional<MaintenanceRecord> findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(UUID id, UUID vehicleId, UUID userId);
}

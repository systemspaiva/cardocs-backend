package com.cardocs.api.documents;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleDocumentRepository extends JpaRepository<VehicleDocument, UUID> {
    List<VehicleDocument> findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID vehicleId, UUID userId);

    List<VehicleDocument> findByUserIdAndDeletedAtIsNull(UUID userId);

    Optional<VehicleDocument> findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(UUID id, UUID vehicleId, UUID userId);
}

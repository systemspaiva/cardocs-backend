package com.cardocs.api.vehicles;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {
    List<Vehicle> findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID userId);

    Optional<Vehicle> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<Vehicle> findByIdAndDeletedAtIsNull(UUID id);

    boolean existsByUserIdAndPlateAndDeletedAtIsNull(UUID userId, String plate);
}

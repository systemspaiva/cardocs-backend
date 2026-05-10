package com.cardocs.api.sharelinks;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShareLinkRepository extends JpaRepository<ShareLink, UUID> {
    List<ShareLink> findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID vehicleId, UUID userId);

    List<ShareLink> findByUserIdAndDeletedAtIsNull(UUID userId);

    Optional<ShareLink> findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(UUID id, UUID vehicleId, UUID userId);

    Optional<ShareLink> findByTokenAndDeletedAtIsNull(String token);
}

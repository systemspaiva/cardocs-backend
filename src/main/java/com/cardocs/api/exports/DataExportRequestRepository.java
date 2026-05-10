package com.cardocs.api.exports;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DataExportRequestRepository extends JpaRepository<DataExportRequest, UUID> {
    Optional<DataExportRequest> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Page<DataExportRequest> findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    List<DataExportRequest> findByUserIdAndDeletedAtIsNull(UUID userId);
}

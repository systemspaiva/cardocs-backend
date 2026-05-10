package com.cardocs.api.exports;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PdfExportRequestRepository extends JpaRepository<PdfExportRequest, UUID> {
    Optional<PdfExportRequest> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    List<PdfExportRequest> findByUserIdAndDeletedAtIsNull(UUID userId);
}

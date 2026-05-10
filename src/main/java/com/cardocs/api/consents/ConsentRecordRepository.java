package com.cardocs.api.consents;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentRecordRepository extends JpaRepository<ConsentRecord, UUID> {
    List<ConsentRecord> findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID userId);

    Optional<ConsentRecord> findFirstByUserIdAndTypeAndGrantedIsTrueAndDeletedAtIsNullOrderByCreatedAtDesc(UUID userId, ConsentType type);

    Optional<ConsentRecord> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);
}

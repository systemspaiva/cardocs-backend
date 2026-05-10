package com.cardocs.api.reminders;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReminderRepository extends JpaRepository<Reminder, UUID> {
    List<Reminder> findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID vehicleId, UUID userId);

    List<Reminder> findByUserIdAndDeletedAtIsNull(UUID userId);

    Optional<Reminder> findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(UUID id, UUID vehicleId, UUID userId);

    List<Reminder> findByStatusAndDueDateBeforeAndDeletedAtIsNull(ReminderStatus status, LocalDate date);
}

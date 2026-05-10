package com.cardocs.api.reminders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ReminderResponse(
    UUID id,
    UUID vehicleId,
    UUID userId,
    ReminderType type,
    String title,
    String description,
    LocalDate dueDate,
    Integer dueMileage,
    Integer currentMileageSnapshot,
    ReminderStatus status,
    boolean notificationEnabled,
    Instant completedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static ReminderResponse from(Reminder reminder) {
        return new ReminderResponse(
            reminder.getId(),
            reminder.getVehicleId(),
            reminder.getUserId(),
            reminder.getType(),
            reminder.getTitle(),
            reminder.getDescription(),
            reminder.getDueDate(),
            reminder.getDueMileage(),
            reminder.getCurrentMileageSnapshot(),
            reminder.getStatus(),
            reminder.isNotificationEnabled(),
            reminder.getCompletedAt(),
            reminder.getCreatedAt(),
            reminder.getUpdatedAt()
        );
    }
}

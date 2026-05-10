package com.cardocs.api.reminders;

import java.time.LocalDate;

public record UpdateReminderRequest(
    ReminderType type,
    String title,
    String description,
    LocalDate dueDate,
    Integer dueMileage,
    ReminderStatus status,
    Boolean notificationEnabled
) {
}

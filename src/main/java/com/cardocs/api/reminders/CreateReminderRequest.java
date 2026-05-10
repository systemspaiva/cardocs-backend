package com.cardocs.api.reminders;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record CreateReminderRequest(
    @NotNull ReminderType type,
    @NotBlank String title,
    String description,
    LocalDate dueDate,
    Integer dueMileage,
    Boolean notificationEnabled
) {
}

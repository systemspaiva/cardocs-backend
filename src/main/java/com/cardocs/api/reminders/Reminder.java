package com.cardocs.api.reminders;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "reminders")
public class Reminder extends BaseEntity {

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReminderType type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "due_mileage")
    private Integer dueMileage;

    @Column(name = "current_mileage_snapshot")
    private Integer currentMileageSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReminderStatus status;

    @Column(name = "notification_enabled", nullable = false)
    private boolean notificationEnabled;

    @Column(name = "completed_at")
    private Instant completedAt;
}

package com.cardocs.api.reminders;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.integrations.notification.NotificationProvider;
import com.cardocs.api.notifications.NotificationEvent;
import com.cardocs.api.users.User;
import com.cardocs.api.vehicles.Vehicle;
import com.cardocs.api.vehicles.VehicleService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReminderService {

    private final ReminderRepository reminderRepository;
    private final VehicleService vehicleService;
    private final NotificationProvider notificationProvider;
    private final AuditLogService auditLogService;

    @Transactional
    public ReminderResponse create(User user, UUID vehicleId, CreateReminderRequest request) {
        Vehicle vehicle = vehicleService.getOwnedVehicle(user, vehicleId);
        if (request.dueDate() == null && request.dueMileage() == null) {
            throw new BadRequestException("Informe data ou quilometragem de vencimento");
        }
        Reminder reminder = Reminder.builder()
            .vehicleId(vehicleId)
            .userId(user.getId())
            .type(request.type())
            .title(request.title().trim())
            .description(request.description())
            .dueDate(request.dueDate())
            .dueMileage(request.dueMileage())
            .currentMileageSnapshot(vehicle.getCurrentMileage())
            .status(ReminderStatus.PENDING)
            .notificationEnabled(request.notificationEnabled() == null || request.notificationEnabled())
            .build();
        reminderRepository.save(reminder);
        auditLogService.record(user.getId(), user.getOrganizationId(), "Reminder", reminder.getId(), AuditAction.REMINDER_CREATED);
        return ReminderResponse.from(reminder);
    }

    @Transactional(readOnly = true)
    public List<ReminderResponse> list(User user, UUID vehicleId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return reminderRepository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(vehicleId, user.getId())
            .stream()
            .map(ReminderResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public Reminder getOwned(User user, UUID vehicleId, UUID reminderId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return reminderRepository.findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(reminderId, vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Lembrete não encontrado"));
    }

    @Transactional
    public ReminderResponse update(User user, UUID vehicleId, UUID reminderId, UpdateReminderRequest request) {
        Reminder reminder = getOwned(user, vehicleId, reminderId);
        if (request.type() != null) reminder.setType(request.type());
        if (request.title() != null) reminder.setTitle(request.title().trim());
        if (request.description() != null) reminder.setDescription(request.description());
        if (request.dueDate() != null) reminder.setDueDate(request.dueDate());
        if (request.dueMileage() != null) reminder.setDueMileage(request.dueMileage());
        if (request.status() != null) reminder.setStatus(request.status());
        if (request.notificationEnabled() != null) reminder.setNotificationEnabled(request.notificationEnabled());
        return ReminderResponse.from(reminder);
    }

    @Transactional
    public ReminderResponse complete(User user, UUID vehicleId, UUID reminderId) {
        Reminder reminder = getOwned(user, vehicleId, reminderId);
        reminder.setStatus(ReminderStatus.DONE);
        reminder.setCompletedAt(Instant.now());
        return ReminderResponse.from(reminder);
    }

    @Transactional
    public void delete(User user, UUID vehicleId, UUID reminderId) {
        getOwned(user, vehicleId, reminderId).markDeleted();
    }

    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void markOverdue() {
        reminderRepository.findByStatusAndDueDateBeforeAndDeletedAtIsNull(ReminderStatus.PENDING, LocalDate.now())
            .forEach(reminder -> {
                reminder.setStatus(ReminderStatus.OVERDUE);
                if (reminder.isNotificationEnabled()) {
                    notificationProvider.notify(reminder.getUserId(), NotificationEvent.REMINDER_OVERDUE, Map.of("reminderId", reminder.getId().toString()));
                }
            });
    }
}

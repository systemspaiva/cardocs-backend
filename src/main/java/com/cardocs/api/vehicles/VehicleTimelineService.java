package com.cardocs.api.vehicles;

import com.cardocs.api.documents.VehicleDocumentRepository;
import com.cardocs.api.maintenance.MaintenanceRecordRepository;
import com.cardocs.api.reminders.ReminderRepository;
import com.cardocs.api.users.User;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class VehicleTimelineService {

    private final VehicleService vehicleService;
    private final VehicleDocumentRepository documentRepository;
    private final MaintenanceRecordRepository maintenanceRepository;
    private final ReminderRepository reminderRepository;

    @Transactional(readOnly = true)
    public List<VehicleTimelineEventResponse> timeline(User user, UUID vehicleId) {
        Vehicle vehicle = vehicleService.getOwnedVehicle(user, vehicleId);
        List<VehicleTimelineEventResponse> events = new ArrayList<>();
        events.add(new VehicleTimelineEventResponse(
            vehicle.getId(),
            "VEHICLE_CREATED",
            "Veículo cadastrado",
            vehicle.getBrand() + " " + vehicle.getModel(),
            vehicle.getCreatedAt(),
            "Vehicle",
            vehicle.getId(),
            Map.of("plate", vehicle.getPlate())
        ));

        documentRepository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(vehicleId, user.getId()).forEach(document -> {
            events.add(new VehicleTimelineEventResponse(
                document.getId(),
                "DOCUMENT_UPLOADED",
                "Documento enviado",
                document.getFileName(),
                document.getCreatedAt(),
                "VehicleDocument",
                document.getId(),
                Map.of("type", document.getType().name(), "ocrStatus", document.getOcrStatus().name())
            ));
            if (document.getOcrRawText() != null) {
                events.add(new VehicleTimelineEventResponse(
                    document.getId(),
                    "OCR_PROCESSED",
                    "OCR processado",
                    document.getFileName(),
                    document.getUpdatedAt(),
                    "VehicleDocument",
                    document.getId(),
                    Map.of("ocrStatus", document.getOcrStatus().name())
                ));
            }
        });

        maintenanceRepository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByServiceDateDesc(vehicleId, user.getId()).forEach(record ->
            events.add(new VehicleTimelineEventResponse(
                record.getId(),
                "MAINTENANCE_CREATED",
                record.getTitle(),
                record.getDescription(),
                record.getServiceDate().atStartOfDay().toInstant(ZoneOffset.UTC),
                "MaintenanceRecord",
                record.getId(),
                Map.of("type", record.getType().name())
            ))
        );

        reminderRepository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(vehicleId, user.getId()).forEach(reminder -> {
            events.add(new VehicleTimelineEventResponse(
                reminder.getId(),
                "REMINDER_CREATED",
                reminder.getTitle(),
                reminder.getDescription(),
                reminder.getCreatedAt(),
                "Reminder",
                reminder.getId(),
                Map.of("status", reminder.getStatus().name())
            ));
            if (reminder.getCompletedAt() != null) {
                events.add(new VehicleTimelineEventResponse(
                    reminder.getId(),
                    "REMINDER_COMPLETED",
                    reminder.getTitle(),
                    reminder.getDescription(),
                    reminder.getCompletedAt(),
                    "Reminder",
                    reminder.getId(),
                    Map.of("status", reminder.getStatus().name())
                ));
            }
        });

        return events.stream()
            .sorted(Comparator.comparing(VehicleTimelineEventResponse::eventDate).reversed())
            .toList();
    }
}

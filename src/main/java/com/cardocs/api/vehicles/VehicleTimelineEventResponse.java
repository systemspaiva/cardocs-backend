package com.cardocs.api.vehicles;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record VehicleTimelineEventResponse(
    UUID id,
    String type,
    String title,
    String description,
    Instant eventDate,
    String sourceType,
    UUID sourceId,
    Map<String, Object> metadata
) {
}

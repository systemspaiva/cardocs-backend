package com.cardocs.api.vehicles;

import com.cardocs.api.security.CurrentUserService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/vehicles/{vehicleId}/timeline")
public class VehicleTimelineController {

    private final VehicleTimelineService timelineService;
    private final CurrentUserService currentUserService;

    @GetMapping
    List<VehicleTimelineEventResponse> timeline(@PathVariable UUID vehicleId) {
        return timelineService.timeline(currentUserService.getCurrentUser(), vehicleId);
    }
}

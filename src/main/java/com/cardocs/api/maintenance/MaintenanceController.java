package com.cardocs.api.maintenance;

import com.cardocs.api.security.CurrentUserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/vehicles/{vehicleId}/maintenance")
public class MaintenanceController {

    private final MaintenanceService maintenanceService;
    private final CurrentUserService currentUserService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    MaintenanceResponse create(@PathVariable UUID vehicleId, @Valid @RequestBody CreateMaintenanceRequest request) {
        return maintenanceService.create(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @GetMapping
    List<MaintenanceResponse> list(@PathVariable UUID vehicleId) {
        return maintenanceService.list(currentUserService.getCurrentUser(), vehicleId);
    }

    @GetMapping("/{maintenanceId}")
    MaintenanceResponse get(@PathVariable UUID vehicleId, @PathVariable UUID maintenanceId) {
        return maintenanceService.get(currentUserService.getCurrentUser(), vehicleId, maintenanceId);
    }

    @PutMapping("/{maintenanceId}")
    MaintenanceResponse update(@PathVariable UUID vehicleId, @PathVariable UUID maintenanceId, @Valid @RequestBody UpdateMaintenanceRequest request) {
        return maintenanceService.update(currentUserService.getCurrentUser(), vehicleId, maintenanceId, request);
    }

    @DeleteMapping("/{maintenanceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID vehicleId, @PathVariable UUID maintenanceId) {
        maintenanceService.delete(currentUserService.getCurrentUser(), vehicleId, maintenanceId);
    }
}

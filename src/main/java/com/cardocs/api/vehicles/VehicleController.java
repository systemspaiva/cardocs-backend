package com.cardocs.api.vehicles;

import com.cardocs.api.integrations.vehicleregistry.VehicleRegistryLookupResponse;
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
@RequestMapping("/vehicles")
public class VehicleController {

    private final VehicleService vehicleService;
    private final CurrentUserService currentUserService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    VehicleResponse create(@Valid @RequestBody CreateVehicleRequest request) {
        return vehicleService.create(currentUserService.getCurrentUser(), request);
    }

    @GetMapping
    List<VehicleResponse> list() {
        return vehicleService.list(currentUserService.getCurrentUser());
    }

    @GetMapping("/{vehicleId}")
    VehicleResponse get(@PathVariable UUID vehicleId) {
        return vehicleService.get(currentUserService.getCurrentUser(), vehicleId);
    }

    @PutMapping("/{vehicleId}")
    VehicleResponse update(@PathVariable UUID vehicleId, @Valid @RequestBody UpdateVehicleRequest request) {
        return vehicleService.update(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @DeleteMapping("/{vehicleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID vehicleId) {
        vehicleService.delete(currentUserService.getCurrentUser(), vehicleId);
    }

    @PostMapping("/lookup-by-plate")
    VehicleRegistryLookupResponse lookup(@Valid @RequestBody LookupPlateRequest request) {
        return vehicleService.lookup(currentUserService.getCurrentUser(), request);
    }
}

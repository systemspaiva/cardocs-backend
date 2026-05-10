package com.cardocs.api.reminders;

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
@RequestMapping("/vehicles/{vehicleId}/reminders")
public class ReminderController {

    private final ReminderService reminderService;
    private final CurrentUserService currentUserService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ReminderResponse create(@PathVariable UUID vehicleId, @Valid @RequestBody CreateReminderRequest request) {
        return reminderService.create(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @GetMapping
    List<ReminderResponse> list(@PathVariable UUID vehicleId) {
        return reminderService.list(currentUserService.getCurrentUser(), vehicleId);
    }

    @PutMapping("/{reminderId}")
    ReminderResponse update(@PathVariable UUID vehicleId, @PathVariable UUID reminderId, @Valid @RequestBody UpdateReminderRequest request) {
        return reminderService.update(currentUserService.getCurrentUser(), vehicleId, reminderId, request);
    }

    @PostMapping("/{reminderId}/complete")
    ReminderResponse complete(@PathVariable UUID vehicleId, @PathVariable UUID reminderId) {
        return reminderService.complete(currentUserService.getCurrentUser(), vehicleId, reminderId);
    }

    @DeleteMapping("/{reminderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID vehicleId, @PathVariable UUID reminderId) {
        reminderService.delete(currentUserService.getCurrentUser(), vehicleId, reminderId);
    }
}

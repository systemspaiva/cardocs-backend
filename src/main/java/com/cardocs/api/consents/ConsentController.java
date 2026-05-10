package com.cardocs.api.consents;

import com.cardocs.api.security.CurrentUserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/consents")
public class ConsentController {

    private final ConsentService consentService;
    private final CurrentUserService currentUserService;

    @GetMapping
    List<ConsentResponse> list() {
        return consentService.list(currentUserService.getCurrentUser());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ConsentResponse create(@Valid @RequestBody CreateConsentRequest request) {
        return consentService.create(currentUserService.getCurrentUser(), request);
    }

    @PutMapping("/{consentId}/revoke")
    ConsentResponse revoke(@PathVariable UUID consentId) {
        return consentService.revoke(currentUserService.getCurrentUser(), consentId);
    }
}

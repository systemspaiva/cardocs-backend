package com.cardocs.api.sharelinks;

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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/vehicles/{vehicleId}/share-links")
public class ShareLinkController {

    private final ShareLinkService shareLinkService;
    private final CurrentUserService currentUserService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ShareLinkResponse create(@PathVariable UUID vehicleId, @Valid @RequestBody CreateShareLinkRequest request) {
        return shareLinkService.create(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @GetMapping
    List<ShareLinkResponse> list(@PathVariable UUID vehicleId) {
        return shareLinkService.list(currentUserService.getCurrentUser(), vehicleId);
    }

    @DeleteMapping("/{shareLinkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID vehicleId, @PathVariable UUID shareLinkId) {
        shareLinkService.revoke(currentUserService.getCurrentUser(), vehicleId, shareLinkId);
    }
}

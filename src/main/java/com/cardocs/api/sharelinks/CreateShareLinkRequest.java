package com.cardocs.api.sharelinks;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;

public record CreateShareLinkRequest(
    Instant expiresAt,
    List<String> allowedSections,
    @NotBlank String publicTitle
) {
}

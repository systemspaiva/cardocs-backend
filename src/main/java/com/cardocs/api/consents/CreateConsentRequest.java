package com.cardocs.api.consents;

import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record CreateConsentRequest(
    @NotNull ConsentType type,
    @NotNull Boolean granted,
    Map<String, Object> metadata
) {
}

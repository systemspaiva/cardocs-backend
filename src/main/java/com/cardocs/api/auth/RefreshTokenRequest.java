package com.cardocs.api.auth;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(@NotBlank String refreshToken) {
}

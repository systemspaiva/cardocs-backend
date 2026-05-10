package com.cardocs.api.auth;

import com.cardocs.api.users.UserResponse;

public record AuthResponse(
    String accessToken,
    String refreshToken,
    String tokenType,
    UserResponse user
) {
}

package com.cardocs.api.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank String name,
    @Email @NotBlank String email,
    @NotBlank @Size(min = 8, max = 120) String password
) {
}

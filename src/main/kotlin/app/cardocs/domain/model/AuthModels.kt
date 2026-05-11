package app.cardocs.domain.model

import java.time.Instant
import java.util.UUID

data class AuthSession(
    val id: UUID,
    val email: String,
    val displayName: String,
    val accessToken: String,
    val idToken: String,
    val refreshToken: String?,
    val expiresAt: Instant
)

data class SignUpResult(
    val email: String,
    val deliveryMedium: String?,
    val destination: String?
)

data class SignInRequest(
    val email: String,
    val password: String
)

data class SignUpRequest(
    val name: String,
    val email: String,
    val password: String
)

data class ConfirmSignUpRequest(
    val email: String,
    val code: String
)

data class ResendSignUpCodeRequest(
    val email: String
)

data class RefreshSessionRequest(
    val refreshToken: String
)

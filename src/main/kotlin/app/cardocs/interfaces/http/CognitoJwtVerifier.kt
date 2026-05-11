package app.cardocs.interfaces.http

import org.springframework.beans.factory.annotation.Value
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.stereotype.Component
import java.time.Instant

data class AuthenticatedOwner(
    val ownerId: String,
    val email: String?
)

@Component
class CognitoJwtVerifier(
    @param:Value("\${cardocs.security.cognito.region:}") private val region: String,
    @param:Value("\${cardocs.security.cognito.user-pool-id:}") private val userPoolId: String,
    @param:Value("\${cardocs.security.cognito.app-client-id:}") private val appClientId: String
) {
    private val issuer: String
        get() = "https://cognito-idp.$region.amazonaws.com/$userPoolId"

    private val decoder: NimbusJwtDecoder? by lazy {
        if (!isConfigured) {
            null
        } else {
            NimbusJwtDecoder
                .withJwkSetUri("$issuer/.well-known/jwks.json")
                .build()
        }
    }

    val isConfigured: Boolean
        get() = region.isNotBlank() && userPoolId.isNotBlank() && appClientId.isNotBlank()

    fun verify(bearerToken: String): AuthenticatedOwner {
        val jwt = try {
            decoder?.decode(bearerToken) ?: throw JwtException("Cognito nao configurado.")
        } catch (error: JwtException) {
            throw InvalidBearerTokenException()
        }

        if (jwt.issuer?.toString() != issuer) {
            throw InvalidBearerTokenException()
        }
        if (jwt.expiresAt?.isBefore(Instant.now()) == true) {
            throw InvalidBearerTokenException()
        }
        if (!jwt.matchesConfiguredClient()) {
            throw InvalidBearerTokenException()
        }
        if (jwt.tokenUse != "access") {
            throw InvalidBearerTokenException()
        }

        val ownerId = jwt.subject?.takeIf { it.isNotBlank() }
            ?: throw InvalidBearerTokenException()

        return AuthenticatedOwner(
            ownerId = ownerId,
            email = jwt.getClaimAsString("email")
        )
    }

    private fun Jwt.matchesConfiguredClient(): Boolean {
        val clientId = getClaimAsString("client_id")
        return clientId == appClientId || audience.contains(appClientId)
    }

    private val Jwt.tokenUse: String?
        get() = getClaimAsString("token_use")
}

class InvalidBearerTokenException : RuntimeException()

package app.cardocs.interfaces.http

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import java.security.MessageDigest

@Configuration
class ApiAccessConfiguration(
    @param:Value("\${cardocs.security.api-key:}") private val apiKey: String,
    private val cognitoJwtVerifier: CognitoJwtVerifier
) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(ApiAccessInterceptor(apiKey, cognitoJwtVerifier))
            .addPathPatterns("/v1/**")
            .excludePathPatterns(
                "/v1/health",
                "/v1/public/**",
                "/v1/auth/**",
                "/v1/swagger",
                "/v1/swagger/**",
                "/v1/swagger-ui/**"
            )
    }
}

private class ApiAccessInterceptor(
    private val configuredApiKey: String,
    private val cognitoJwtVerifier: CognitoJwtVerifier
) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        val providedApiKey = request.getHeader(API_KEY_HEADER).orEmpty()
        if (configuredApiKey.isNotBlank() && providedApiKey.constantTimeEquals(configuredApiKey)) {
            return true
        }

        val bearerToken = request.bearerToken()
        if (bearerToken != null && cognitoJwtVerifier.isConfigured) {
            return try {
                val authenticatedOwner = cognitoJwtVerifier.verify(bearerToken)
                request.setAttribute(AUTHENTICATED_OWNER_ID_ATTRIBUTE, authenticatedOwner.ownerId)
                true
            } catch (error: InvalidBearerTokenException) {
                response.writeJsonError(
                    status = HttpServletResponse.SC_UNAUTHORIZED,
                    message = "Bearer token invalido."
                )
                false
            }
        }

        if (configuredApiKey.isBlank() && !cognitoJwtVerifier.isConfigured) {
            response.writeJsonError(
                status = HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                message = "CARDOCS_API_KEY ou Cognito precisam estar configurados para endpoints protegidos."
            )
            return false
        }

        response.writeJsonError(
            status = HttpServletResponse.SC_UNAUTHORIZED,
            message = "Credencial invalida."
        )
        return false
    }

    private fun String.constantTimeEquals(other: String): Boolean =
        MessageDigest.isEqual(toByteArray(Charsets.UTF_8), other.toByteArray(Charsets.UTF_8))

    private fun HttpServletResponse.writeJsonError(status: Int, message: String) {
        this.status = status
        contentType = MediaType.APPLICATION_JSON_VALUE
        characterEncoding = Charsets.UTF_8.name()
        writer.write("""{"error":"unauthorized","message":"$message"}""")
    }

    private companion object {
        const val API_KEY_HEADER = "X-CarDocs-Api-Key"
    }
}

private fun HttpServletRequest.bearerToken(): String? {
    val value = getHeader("Authorization").orEmpty()
    if (!value.startsWith("Bearer ", ignoreCase = true)) return null
    return value.drop("Bearer ".length).trim().takeIf { it.isNotBlank() }
}

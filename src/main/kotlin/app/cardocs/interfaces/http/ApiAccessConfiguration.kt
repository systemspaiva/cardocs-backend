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
    @param:Value("\${cardocs.security.api-key:}") private val apiKey: String
) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(ApiKeyInterceptor(apiKey))
            .addPathPatterns("/v1/**")
            .excludePathPatterns("/v1/health", "/v1/public/**")
    }
}

private class ApiKeyInterceptor(
    private val configuredApiKey: String
) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (configuredApiKey.isBlank()) {
            response.writeJsonError(
                status = HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                message = "CARDOCS_API_KEY precisa estar configurada para endpoints protegidos."
            )
            return false
        }

        val providedApiKey = request.getHeader(API_KEY_HEADER).orEmpty()
        if (!providedApiKey.constantTimeEquals(configuredApiKey)) {
            response.writeJsonError(
                status = HttpServletResponse.SC_UNAUTHORIZED,
                message = "API key invalida."
            )
            return false
        }

        return true
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

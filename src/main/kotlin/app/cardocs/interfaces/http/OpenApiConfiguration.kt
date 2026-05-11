package app.cardocs.interfaces.http

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.info.License
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfiguration {
    @Bean
    fun cardocsOpenApi(): OpenAPI =
        OpenAPI()
            .info(
                Info()
                    .title("CarDocs Backend API")
                    .version("v1")
                    .description("HTTP API used by native CarDocs mobile clients.")
                    .license(License().name("Private"))
            )
            .components(
                Components()
                    .addSecuritySchemes(
                        "cognitoBearer",
                        SecurityScheme()
                            .type(SecurityScheme.Type.HTTP)
                            .scheme("bearer")
                            .bearerFormat("JWT")
                            .description("Cognito access token returned by /v1/auth/sign-in or /v1/auth/refresh.")
                    )
                    .addSecuritySchemes(
                        "serverApiKey",
                        SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .`in`(SecurityScheme.In.HEADER)
                            .name("X-CarDocs-Api-Key")
                            .description("Server-side API key. Native mobile apps must not embed this key.")
                    )
            )
}

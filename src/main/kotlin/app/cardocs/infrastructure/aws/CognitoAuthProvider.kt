package app.cardocs.infrastructure.aws

import app.cardocs.application.ProviderUnavailableException
import app.cardocs.application.ValidationException
import app.cardocs.application.port.AuthProvider
import app.cardocs.domain.model.AuthSession
import app.cardocs.domain.model.ConfirmSignUpRequest
import app.cardocs.domain.model.RefreshSessionRequest
import app.cardocs.domain.model.ResendSignUpCodeRequest
import app.cardocs.domain.model.SignInRequest
import app.cardocs.domain.model.SignUpRequest
import app.cardocs.domain.model.SignUpResult
import app.cardocs.domain.model.deterministicUuid
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminInitiateAuthRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.AliasExistsException
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType
import software.amazon.awssdk.services.cognitoidentityprovider.model.AuthFlowType
import software.amazon.awssdk.services.cognitoidentityprovider.model.CodeMismatchException
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException
import software.amazon.awssdk.services.cognitoidentityprovider.model.ConfirmSignUpRequest as CognitoConfirmSignUpRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.ExpiredCodeException
import software.amazon.awssdk.services.cognitoidentityprovider.model.GetUserRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.GlobalSignOutRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.NotAuthorizedException
import software.amazon.awssdk.services.cognitoidentityprovider.model.ResendConfirmationCodeRequest as CognitoResendConfirmationCodeRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.SignUpRequest as CognitoSignUpRequest
import software.amazon.awssdk.services.cognitoidentityprovider.model.UsernameExistsException
import java.time.Clock
import java.time.Instant

@Component
class CognitoAuthProvider(
    private val cognito: CognitoIdentityProviderClient,
    @param:Value("\${cardocs.security.cognito.user-pool-id:}") private val userPoolId: String,
    @param:Value("\${cardocs.security.cognito.app-client-id:}") private val appClientId: String
) : AuthProvider {
    private val clock: Clock = Clock.systemUTC()

    override fun signUp(request: SignUpRequest): SignUpResult {
        requireConfigured()

        val response = try {
            cognito.signUp(
                CognitoSignUpRequest.builder()
                    .clientId(appClientId)
                    .username(request.email)
                    .password(request.password)
                    .userAttributes(
                        AttributeType.builder().name("email").value(request.email).build(),
                        AttributeType.builder().name("name").value(request.name).build()
                    )
                    .build()
            )
        } catch (error: UsernameExistsException) {
            throw ValidationException("Ja existe uma conta com esse e-mail.")
        } catch (error: AliasExistsException) {
            throw ValidationException("Ja existe uma conta com esse e-mail.")
        } catch (error: CognitoIdentityProviderException) {
            throw ValidationException(error.awsErrorDetails()?.errorMessage() ?: "Nao foi possivel criar a conta.")
        }

        val delivery = response.codeDeliveryDetails()
        return SignUpResult(
            email = request.email,
            deliveryMedium = delivery?.deliveryMediumAsString(),
            destination = delivery?.destination()
        )
    }

    override fun confirmSignUp(request: ConfirmSignUpRequest) {
        requireConfigured()

        try {
            cognito.confirmSignUp(
                CognitoConfirmSignUpRequest.builder()
                    .clientId(appClientId)
                    .username(request.email)
                    .confirmationCode(request.code)
                    .build()
            )
        } catch (error: CodeMismatchException) {
            throw ValidationException("Codigo de confirmacao invalido.")
        } catch (error: ExpiredCodeException) {
            throw ValidationException("Codigo de confirmacao expirado.")
        } catch (error: CognitoIdentityProviderException) {
            throw ValidationException(error.awsErrorDetails()?.errorMessage() ?: "Nao foi possivel confirmar a conta.")
        }
    }

    override fun resendSignUpCode(request: ResendSignUpCodeRequest): SignUpResult {
        requireConfigured()

        val response = try {
            cognito.resendConfirmationCode(
                CognitoResendConfirmationCodeRequest.builder()
                    .clientId(appClientId)
                    .username(request.email)
                    .build()
            )
        } catch (error: CognitoIdentityProviderException) {
            throw ValidationException(error.awsErrorDetails()?.errorMessage() ?: "Nao foi possivel reenviar o codigo.")
        }

        val delivery = response.codeDeliveryDetails()
        return SignUpResult(
            email = request.email,
            deliveryMedium = delivery?.deliveryMediumAsString(),
            destination = delivery?.destination()
        )
    }

    override fun signIn(request: SignInRequest): AuthSession {
        requireConfigured()

        val result = try {
            cognito.adminInitiateAuth(
                AdminInitiateAuthRequest.builder()
                    .userPoolId(userPoolId)
                    .clientId(appClientId)
                    .authFlow(AuthFlowType.ADMIN_USER_PASSWORD_AUTH)
                    .authParameters(
                        mapOf(
                            "USERNAME" to request.email,
                            "PASSWORD" to request.password
                        )
                    )
                    .build()
            ).authenticationResult()
        } catch (error: NotAuthorizedException) {
            throw ValidationException("E-mail ou senha invalidos.")
        } catch (error: CognitoIdentityProviderException) {
            throw ValidationException(error.awsErrorDetails()?.errorMessage() ?: "Nao foi possivel entrar.")
        }

        val accessToken = result.accessToken()
            ?: throw ProviderUnavailableException("Cognito nao retornou access token.")
        return buildSession(
            accessToken = accessToken,
            idToken = result.idToken() ?: "",
            refreshToken = result.refreshToken(),
            expiresInSeconds = result.expiresIn().toLong(),
            fallbackEmail = request.email
        )
    }

    override fun refreshSession(request: RefreshSessionRequest): AuthSession {
        requireConfigured()

        val result = try {
            cognito.adminInitiateAuth(
                AdminInitiateAuthRequest.builder()
                    .userPoolId(userPoolId)
                    .clientId(appClientId)
                    .authFlow(AuthFlowType.REFRESH_TOKEN_AUTH)
                    .authParameters(mapOf("REFRESH_TOKEN" to request.refreshToken))
                    .build()
            ).authenticationResult()
        } catch (error: NotAuthorizedException) {
            throw ValidationException("Sessao expirada. Entre novamente.")
        } catch (error: CognitoIdentityProviderException) {
            throw ValidationException(error.awsErrorDetails()?.errorMessage() ?: "Nao foi possivel renovar a sessao.")
        }

        val accessToken = result.accessToken()
            ?: throw ProviderUnavailableException("Cognito nao retornou access token.")
        return buildSession(
            accessToken = accessToken,
            idToken = result.idToken() ?: "",
            refreshToken = result.refreshToken() ?: request.refreshToken,
            expiresInSeconds = result.expiresIn().toLong(),
            fallbackEmail = null
        )
    }

    override fun signOut(accessToken: String) {
        if (accessToken.isBlank()) return
        runCatching {
            cognito.globalSignOut(GlobalSignOutRequest.builder().accessToken(accessToken).build())
        }
    }

    private fun requireConfigured() {
        if (userPoolId.isBlank() || appClientId.isBlank()) {
            throw ProviderUnavailableException("Cognito precisa estar configurado para autenticacao.")
        }
    }

    private fun buildSession(
        accessToken: String,
        idToken: String,
        refreshToken: String?,
        expiresInSeconds: Long,
        fallbackEmail: String?
    ): AuthSession {
        val user = cognito.getUser(GetUserRequest.builder().accessToken(accessToken).build())
        val attributes = user.userAttributes().associate { it.name() to it.value() }
        val subject = attributes["sub"] ?: user.username()
        val email = attributes["email"] ?: fallbackEmail ?: user.username()
        val displayName = attributes["name"] ?: email.substringBefore("@").ifBlank { "Motorista" }

        return AuthSession(
            id = deterministicUuid("cognito-session", subject),
            email = email,
            displayName = displayName,
            accessToken = accessToken,
            idToken = idToken,
            refreshToken = refreshToken,
            expiresAt = Instant.now(clock).plusSeconds(expiresInSeconds)
        )
    }
}

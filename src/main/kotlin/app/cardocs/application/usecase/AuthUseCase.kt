package app.cardocs.application.usecase

import app.cardocs.application.ValidationException
import app.cardocs.application.port.AuthProvider
import app.cardocs.domain.model.AuthSession
import app.cardocs.domain.model.ConfirmSignUpRequest
import app.cardocs.domain.model.RefreshSessionRequest
import app.cardocs.domain.model.ResendSignUpCodeRequest
import app.cardocs.domain.model.SignInRequest
import app.cardocs.domain.model.SignUpRequest
import app.cardocs.domain.model.SignUpResult
import org.springframework.stereotype.Service

@Service
class AuthUseCase(
    private val authProvider: AuthProvider
) {
    fun signUp(request: SignUpRequest): SignUpResult {
        val normalized = request.normalized()
        normalized.requireValidSignUp()
        return authProvider.signUp(normalized)
    }

    fun confirmSignUp(request: ConfirmSignUpRequest) {
        val normalized = request.normalized()
        normalized.requireValidConfirmation()
        authProvider.confirmSignUp(normalized)
    }

    fun resendSignUpCode(request: ResendSignUpCodeRequest): SignUpResult {
        val normalized = request.normalized()
        normalized.requireValidResend()
        return authProvider.resendSignUpCode(normalized)
    }

    fun signIn(request: SignInRequest): AuthSession {
        val normalized = request.normalized()
        normalized.requireValidSignIn()
        return authProvider.signIn(normalized)
    }

    fun refreshSession(request: RefreshSessionRequest): AuthSession {
        val normalized = request.normalized()
        normalized.requireValidRefresh()
        return authProvider.refreshSession(normalized)
    }

    fun signOut(accessToken: String) {
        authProvider.signOut(accessToken)
    }

    private fun SignUpRequest.normalized(): SignUpRequest =
        copy(
            name = name.trim(),
            email = email.normalizedEmail()
        )

    private fun SignInRequest.normalized(): SignInRequest =
        copy(email = email.normalizedEmail())

    private fun ConfirmSignUpRequest.normalized(): ConfirmSignUpRequest =
        copy(
            email = email.normalizedEmail(),
            code = code.trim()
        )

    private fun ResendSignUpCodeRequest.normalized(): ResendSignUpCodeRequest =
        copy(email = email.normalizedEmail())

    private fun RefreshSessionRequest.normalized(): RefreshSessionRequest =
        copy(refreshToken = refreshToken.trim())

    private fun SignUpRequest.requireValidSignUp() {
        if (name.length < 2 || !email.isValidEmail() || password.length < 6) {
            throw ValidationException("Nome, e-mail e senha validos sao obrigatorios.")
        }
    }

    private fun SignInRequest.requireValidSignIn() {
        if (!email.isValidEmail() || password.length < 6) {
            throw ValidationException("E-mail ou senha invalidos.")
        }
    }

    private fun ConfirmSignUpRequest.requireValidConfirmation() {
        if (!email.isValidEmail() || code.isBlank()) {
            throw ValidationException("E-mail e codigo de confirmacao sao obrigatorios.")
        }
    }

    private fun ResendSignUpCodeRequest.requireValidResend() {
        if (!email.isValidEmail()) {
            throw ValidationException("E-mail valido e obrigatorio.")
        }
    }

    private fun RefreshSessionRequest.requireValidRefresh() {
        if (refreshToken.isBlank()) {
            throw ValidationException("Refresh token e obrigatorio.")
        }
    }

    private fun String.normalizedEmail(): String =
        trim().lowercase()

    private fun String.isValidEmail(): Boolean =
        length >= 6 && contains("@") && contains(".")
}

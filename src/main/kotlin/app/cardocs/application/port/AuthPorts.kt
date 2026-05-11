package app.cardocs.application.port

import app.cardocs.domain.model.AuthSession
import app.cardocs.domain.model.ConfirmSignUpRequest
import app.cardocs.domain.model.RefreshSessionRequest
import app.cardocs.domain.model.ResendSignUpCodeRequest
import app.cardocs.domain.model.SignInRequest
import app.cardocs.domain.model.SignUpRequest
import app.cardocs.domain.model.SignUpResult

interface AuthProvider {
    fun signUp(request: SignUpRequest): SignUpResult
    fun confirmSignUp(request: ConfirmSignUpRequest)
    fun resendSignUpCode(request: ResendSignUpCodeRequest): SignUpResult
    fun signIn(request: SignInRequest): AuthSession
    fun refreshSession(request: RefreshSessionRequest): AuthSession
    fun signOut(accessToken: String)
}

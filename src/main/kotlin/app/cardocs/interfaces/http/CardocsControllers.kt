package app.cardocs.interfaces.http

import app.cardocs.application.usecase.DashboardUseCase
import app.cardocs.application.usecase.InvoiceUseCase
import app.cardocs.application.usecase.AuthUseCase
import app.cardocs.application.usecase.ResaleDossierUseCase
import app.cardocs.application.usecase.VehicleUseCase
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1")
class HealthController {
    @GetMapping("/health")
    fun health(): Map<String, String> =
        mapOf("status" to "UP")
}

@RestController
@RequestMapping("/v1/auth")
class AuthController(
    private val authUseCase: AuthUseCase
) {
    @PostMapping("/sign-up")
    @ResponseStatus(HttpStatus.CREATED)
    fun signUp(@Valid @RequestBody request: SignUpRequestDto): SignUpResultDto =
        authUseCase.signUp(request.toDomain()).toDto()

    @PostMapping("/confirm-sign-up")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun confirmSignUp(@Valid @RequestBody request: ConfirmSignUpRequestDto) {
        authUseCase.confirmSignUp(request.toDomain())
    }

    @PostMapping("/resend-sign-up-code")
    fun resendSignUpCode(@Valid @RequestBody request: ResendSignUpCodeRequestDto): SignUpResultDto =
        authUseCase.resendSignUpCode(request.toDomain()).toDto()

    @PostMapping("/sign-in")
    fun signIn(@Valid @RequestBody request: SignInRequestDto): AuthSessionDto =
        authUseCase.signIn(request.toDomain()).toDto()

    @PostMapping("/refresh")
    fun refresh(@Valid @RequestBody request: RefreshSessionRequestDto): AuthSessionDto =
        authUseCase.refreshSession(request.toDomain()).toDto()

    @PostMapping("/sign-out")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun signOut(request: HttpServletRequest) {
        authUseCase.signOut(request.bearerToken().orEmpty())
    }
}

@RestController
@RequestMapping("/v1/dashboard")
class DashboardController(
    private val dashboardUseCase: DashboardUseCase
) {
    @GetMapping
    fun dashboard(request: HttpServletRequest): DashboardDto =
        dashboardUseCase.loadDashboard(request.requireOwnerId()).toDto()
}

@RestController
@RequestMapping("/v1/vehicles")
class VehicleController(
    private val vehicleUseCase: VehicleUseCase
) {
    @PostMapping("/plate-lookup")
    fun detectByPlate(@Valid @RequestBody request: PlateLookupRequestDto): VehicleCandidateDto =
        vehicleUseCase.detectByPlate(request.toDomain()).toDto()

    @PostMapping("/image")
    fun image(@Valid @RequestBody request: VehicleImageLookupRequestDto): ResponseEntity<VehicleImageDto> =
        vehicleUseCase.findImage(request.toDomain())
            ?.toDto()
            ?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.notFound().build()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun register(
        servletRequest: HttpServletRequest,
        @Valid @RequestBody body: VehicleRegistrationRequestDto
    ): VehicleProfileDto =
        vehicleUseCase.register(servletRequest.requireOwnerId(), body.toDomain()).toDto()
}

@RestController
@RequestMapping("/v1/invoices")
class InvoiceController(
    private val invoiceUseCase: InvoiceUseCase
) {
    @PostMapping("/analyze")
    fun analyze(@Valid @RequestBody request: InvoiceDocumentInputDto): InvoiceScanDraftDto =
        invoiceUseCase.analyze(request.toDomain()).toDto()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun save(
        servletRequest: HttpServletRequest,
        @Valid @RequestBody body: SaveInvoiceRequestDto
    ): AutomationResultDto =
        invoiceUseCase.save(servletRequest.requireOwnerId(), body.vehicleID, body.draft.toDomain()).toDto()
}

@RestController
@RequestMapping("/v1")
class ResaleDossierController(
    private val resaleDossierUseCase: ResaleDossierUseCase
) {
    @PostMapping("/resale-dossiers")
    fun generate(
        servletRequest: HttpServletRequest,
        @Valid @RequestBody body: ResaleDossierRequestDto
    ): ResaleDossierDto =
        resaleDossierUseCase.generate(servletRequest.requireOwnerId(), body.toDomain()).toDto()

    @GetMapping("/public/reports/{slug}")
    fun publicReport(@PathVariable slug: String): ResaleDossierDto =
        resaleDossierUseCase.publicReport(slug).toDto()
}

private fun HttpServletRequest.requireOwnerId(): String =
    (getAttribute(AUTHENTICATED_OWNER_ID_ATTRIBUTE) as? String)
        ?.takeIf { it.isNotBlank() }
        ?: getHeader("X-CarDocs-Owner-Id")?.trim()?.takeIf { it.isNotBlank() }
        ?: throw app.cardocs.application.ValidationException("Owner autenticado ou header X-CarDocs-Owner-Id e obrigatorio.")

private fun HttpServletRequest.bearerToken(): String? {
    val value = getHeader("Authorization").orEmpty()
    if (!value.startsWith("Bearer ", ignoreCase = true)) return null
    return value.drop("Bearer ".length).trim().takeIf { it.isNotBlank() }
}

const val AUTHENTICATED_OWNER_ID_ATTRIBUTE = "cardocs.authenticatedOwnerId"

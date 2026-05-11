package app.cardocs.interfaces.http

import app.cardocs.application.usecase.DashboardUseCase
import app.cardocs.application.usecase.InvoiceUseCase
import app.cardocs.application.usecase.ResaleDossierUseCase
import app.cardocs.application.usecase.VehicleUseCase
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
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
@RequestMapping("/v1/dashboard")
class DashboardController(
    private val dashboardUseCase: DashboardUseCase
) {
    @GetMapping
    fun dashboard(@RequestHeader("X-CarDocs-Owner-Id") ownerId: String): DashboardDto =
        dashboardUseCase.loadDashboard(ownerId.requireOwnerId()).toDto()
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
        @RequestHeader("X-CarDocs-Owner-Id") ownerId: String,
        @Valid @RequestBody request: VehicleRegistrationRequestDto
    ): VehicleProfileDto =
        vehicleUseCase.register(ownerId.requireOwnerId(), request.toDomain()).toDto()
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
        @RequestHeader("X-CarDocs-Owner-Id") ownerId: String,
        @Valid @RequestBody request: SaveInvoiceRequestDto
    ): AutomationResultDto =
        invoiceUseCase.save(ownerId.requireOwnerId(), request.vehicleID, request.draft.toDomain()).toDto()
}

@RestController
@RequestMapping("/v1")
class ResaleDossierController(
    private val resaleDossierUseCase: ResaleDossierUseCase
) {
    @PostMapping("/resale-dossiers")
    fun generate(
        @RequestHeader("X-CarDocs-Owner-Id") ownerId: String,
        @Valid @RequestBody request: ResaleDossierRequestDto
    ): ResaleDossierDto =
        resaleDossierUseCase.generate(ownerId.requireOwnerId(), request.toDomain()).toDto()

    @GetMapping("/public/reports/{slug}")
    fun publicReport(@PathVariable slug: String): ResaleDossierDto =
        resaleDossierUseCase.publicReport(slug).toDto()
}

private fun String.requireOwnerId(): String =
    trim().takeIf { it.isNotBlank() }
        ?: throw app.cardocs.application.ValidationException("Header X-CarDocs-Owner-Id e obrigatorio.")

package app.cardocs.interfaces.http

import app.cardocs.application.ValidationException
import app.cardocs.domain.model.AutomationResult
import app.cardocs.domain.model.InvoiceDocumentInput
import app.cardocs.domain.model.InvoiceExtractedField
import app.cardocs.domain.model.InvoiceHealthImpact
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.InvestmentDelta
import app.cardocs.domain.model.InvestmentSummary
import app.cardocs.domain.model.MaintenanceRecord
import app.cardocs.domain.model.PartHealth
import app.cardocs.domain.model.PlateLookupRequest
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.ResaleDossierRequest
import app.cardocs.domain.model.ResaleHighlight
import app.cardocs.domain.model.ResaleReportSection
import app.cardocs.domain.model.VehicleCandidate
import app.cardocs.domain.model.VehicleDashboard
import app.cardocs.domain.model.VehicleGarage
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleImageLookupRequest
import app.cardocs.domain.model.VehicleKind
import app.cardocs.domain.model.VehicleProfile
import app.cardocs.domain.model.VehicleRegistrationRequest
import app.cardocs.domain.model.VaultDocument
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.math.BigDecimal
import java.util.UUID

data class DashboardDto(
    val id: UUID,
    val garages: List<VehicleGarageDto>,
    @get:JsonProperty("selectedGarageID")
    val selectedGarageID: UUID,
    val detectedVehicle: VehicleCandidateDto
)

data class VehicleGarageDto(
    val id: UUID,
    val vehicle: VehicleProfileDto,
    val investment: InvestmentSummaryDto,
    val timeline: List<MaintenanceRecordDto>,
    val healthItems: List<PartHealthDto>,
    val vaultDocuments: List<VaultDocumentDto>,
    val resaleDossier: ResaleDossierDto
)

data class VehicleProfileDto(
    val id: UUID,
    val kind: String,
    val plate: String,
    val maskedPlate: String,
    val brand: String,
    val model: String,
    val year: String,
    val color: String,
    val mileage: Int,
    val nextServiceTitle: String,
    val nextServiceDistance: String,
    val statusTags: List<String>,
    val image: VehicleImageDto?
)

data class VehicleImageDto(
    val url: String,
    val thumbnailUrl: String?,
    val mime: String?,
    val width: Int?,
    val height: Int?,
    val accentColor: String?,
    val source: String
)

data class InvestmentSummaryDto(
    val total: BigDecimal,
    val maintenance: BigDecimal,
    val documentsAndTaxes: BigDecimal
)

data class MaintenanceRecordDto(
    val id: UUID,
    val iconName: String,
    val title: String,
    val subtitle: String,
    val date: String,
    val amount: BigDecimal,
    @get:JsonProperty("isAIValidated")
    val isAIValidated: Boolean
)

data class PartHealthDto(
    val id: UUID,
    val iconName: String,
    val name: String,
    val message: String,
    val percentage: Int,
    val replacedAt: String,
    val limit: String,
    val tone: String
)

data class VaultDocumentDto(
    val id: UUID,
    val title: String,
    val date: String,
    val amount: BigDecimal,
    val status: String
)

data class VehicleCandidateDto(
    val id: UUID,
    val kind: String,
    val plate: String,
    val brand: String,
    val model: String,
    val year: String,
    val color: String,
    val image: VehicleImageDto?
)

data class ResaleDossierDto(
    val title: String,
    val summary: String,
    val score: Int,
    val estimatedValueIncrease: BigDecimal,
    @get:JsonProperty("publicReportURL")
    val publicReportURL: String,
    val highlights: List<ResaleHighlightDto>,
    val checks: List<String>,
    val reportSections: List<ResaleReportSectionDto>
)

data class ResaleHighlightDto(
    val id: UUID,
    val iconName: String,
    val title: String,
    val value: String
)

data class ResaleReportSectionDto(
    val id: UUID,
    val iconName: String,
    val title: String,
    val status: String,
    val detail: String
)

data class AutomationResultDto(
    val title: String,
    val message: String,
    val investmentDelta: InvestmentDeltaDto,
    val record: MaintenanceRecordDto,
    val document: VaultDocumentDto
)

data class InvestmentDeltaDto(
    val total: BigDecimal,
    val maintenance: BigDecimal,
    val documentsAndTaxes: BigDecimal
)

data class InvoiceDocumentInputDto(
    @field:NotBlank
    val source: String,
    @field:NotBlank
    val displayName: String
)

data class InvoiceScanDraftDto(
    val id: UUID,
    val source: String,
    val supplierName: String,
    val serviceTitle: String,
    val category: String,
    val date: String,
    val amount: BigDecimal,
    val mileage: Int,
    val confidence: Int,
    val extractedFields: List<InvoiceExtractedFieldDto>,
    val healthImpacts: List<InvoiceHealthImpactDto>
)

data class InvoiceExtractedFieldDto(
    val id: UUID,
    val label: String,
    val value: String,
    val confidence: Int
)

data class InvoiceHealthImpactDto(
    val id: UUID,
    val iconName: String,
    val title: String,
    val detail: String
)

data class PlateLookupRequestDto(
    @field:NotBlank
    val plate: String
)

data class VehicleImageLookupRequestDto(
    @field:NotBlank
    val brand: String,
    @field:NotBlank
    val model: String,
    @field:NotBlank
    val year: String
)

data class VehicleRegistrationRequestDto(
    @field:Valid
    @field:NotNull
    val candidate: VehicleCandidateDto,
    val initialMileage: Int = 0
)

data class SaveInvoiceRequestDto(
    @param:JsonProperty("vehicleID")
    @get:JsonProperty("vehicleID")
    @field:NotNull
    val vehicleID: UUID,
    @field:Valid
    @field:NotNull
    val draft: InvoiceScanDraftDto
)

data class ResaleDossierRequestDto(
    @param:JsonProperty("vehicleID")
    @get:JsonProperty("vehicleID")
    @field:NotNull
    val vehicleID: UUID
)

data class ErrorResponseDto(
    val error: String,
    val message: String
)

fun VehicleDashboard.toDto(): DashboardDto =
    DashboardDto(
        id = id,
        garages = garages.map { it.toDto() },
        selectedGarageID = selectedGarageId,
        detectedVehicle = detectedVehicle.toDto()
    )

fun VehicleGarage.toDto(): VehicleGarageDto =
    VehicleGarageDto(
        id = id,
        vehicle = vehicle.toDto(),
        investment = investment.toDto(),
        timeline = timeline.map { it.toDto() },
        healthItems = healthItems.map { it.toDto() },
        vaultDocuments = vaultDocuments.map { it.toDto() },
        resaleDossier = resaleDossier.toDto()
    )

fun VehicleProfile.toDto(): VehicleProfileDto =
    VehicleProfileDto(
        id = id,
        kind = kind.toApiValue(),
        plate = plate,
        maskedPlate = maskedPlate,
        brand = brand,
        model = model,
        year = year,
        color = color,
        mileage = mileage,
        nextServiceTitle = nextServiceTitle,
        nextServiceDistance = nextServiceDistance,
        statusTags = statusTags,
        image = image?.toDto()
    )

fun VehicleImage.toDto(): VehicleImageDto =
    VehicleImageDto(
        url = url,
        thumbnailUrl = thumbnailUrl,
        mime = mime,
        width = width,
        height = height,
        accentColor = accentColor,
        source = source
    )

fun InvestmentSummary.toDto(): InvestmentSummaryDto =
    InvestmentSummaryDto(total, maintenance, documentsAndTaxes)

fun MaintenanceRecord.toDto(): MaintenanceRecordDto =
    MaintenanceRecordDto(
        id = id,
        iconName = iconName,
        title = title,
        subtitle = subtitle,
        date = date,
        amount = amount,
        isAIValidated = isAiValidated
    )

fun PartHealth.toDto(): PartHealthDto =
    PartHealthDto(
        id = id,
        iconName = iconName,
        name = name,
        message = message,
        percentage = percentage,
        replacedAt = replacedAt,
        limit = limit,
        tone = tone.name.lowercase()
    )

fun VaultDocument.toDto(): VaultDocumentDto =
    VaultDocumentDto(id, title, date, amount, status)

fun VehicleCandidate.toDto(): VehicleCandidateDto =
    VehicleCandidateDto(
        id = id,
        kind = kind.toApiValue(),
        plate = plate,
        brand = brand,
        model = model,
        year = year,
        color = color,
        image = image?.toDto()
    )

fun ResaleDossier.toDto(): ResaleDossierDto =
    ResaleDossierDto(
        title = title,
        summary = summary,
        score = score,
        estimatedValueIncrease = estimatedValueIncrease,
        publicReportURL = publicReportUrl,
        highlights = highlights.map { it.toDto() },
        checks = checks,
        reportSections = reportSections.map { it.toDto() }
    )

fun ResaleHighlight.toDto(): ResaleHighlightDto =
    ResaleHighlightDto(id, iconName, title, value)

fun ResaleReportSection.toDto(): ResaleReportSectionDto =
    ResaleReportSectionDto(id, iconName, title, status, detail)

fun AutomationResult.toDto(): AutomationResultDto =
    AutomationResultDto(
        title = title,
        message = message,
        investmentDelta = investmentDelta.toDto(),
        record = record.toDto(),
        document = document.toDto()
    )

fun InvestmentDelta.toDto(): InvestmentDeltaDto =
    InvestmentDeltaDto(total, maintenance, documentsAndTaxes)

fun InvoiceDocumentInputDto.toDomain(): InvoiceDocumentInput =
    InvoiceDocumentInput(
        source = source.toInvoiceSource(),
        displayName = displayName.trim()
    )

fun InvoiceScanDraft.toDto(): InvoiceScanDraftDto =
    InvoiceScanDraftDto(
        id = id,
        source = source.toApiValue(),
        supplierName = supplierName,
        serviceTitle = serviceTitle,
        category = category,
        date = date,
        amount = amount,
        mileage = mileage,
        confidence = confidence,
        extractedFields = extractedFields.map { it.toDto() },
        healthImpacts = healthImpacts.map { it.toDto() }
    )

fun InvoiceExtractedField.toDto(): InvoiceExtractedFieldDto =
    InvoiceExtractedFieldDto(id, label, value, confidence)

fun InvoiceHealthImpact.toDto(): InvoiceHealthImpactDto =
    InvoiceHealthImpactDto(id, iconName, title, detail)

fun InvoiceScanDraftDto.toDomain(): InvoiceScanDraft =
    InvoiceScanDraft(
        id = id,
        source = source.toInvoiceSource(),
        supplierName = supplierName,
        serviceTitle = serviceTitle,
        category = category,
        date = date,
        amount = amount,
        mileage = mileage,
        confidence = confidence,
        extractedFields = extractedFields.map { it.toDomain() },
        healthImpacts = healthImpacts.map { it.toDomain() }
    )

fun InvoiceExtractedFieldDto.toDomain(): InvoiceExtractedField =
    InvoiceExtractedField(id, label, value, confidence)

fun InvoiceHealthImpactDto.toDomain(): InvoiceHealthImpact =
    InvoiceHealthImpact(id, iconName, title, detail)

fun PlateLookupRequestDto.toDomain(): PlateLookupRequest =
    PlateLookupRequest(plate)

fun VehicleImageLookupRequestDto.toDomain(): VehicleImageLookupRequest =
    VehicleImageLookupRequest(
        brand = brand.trim(),
        model = model.trim(),
        year = year.trim()
    )

fun VehicleRegistrationRequestDto.toDomain(): VehicleRegistrationRequest =
    VehicleRegistrationRequest(
        candidate = candidate.toDomain(),
        initialMileage = initialMileage
    )

fun VehicleCandidateDto.toDomain(): VehicleCandidate =
    VehicleCandidate(
        id = id,
        kind = kind.toVehicleKind(),
        plate = plate,
        brand = brand,
        model = model,
        year = year,
        color = color,
        image = image?.toDomain()
    )

fun VehicleImageDto.toDomain(): VehicleImage =
    VehicleImage(
        url = url,
        thumbnailUrl = thumbnailUrl,
        mime = mime,
        width = width,
        height = height,
        accentColor = accentColor,
        source = source
    )

fun ResaleDossierRequestDto.toDomain(): ResaleDossierRequest =
    ResaleDossierRequest(vehicleID)

private fun VehicleKind.toApiValue(): String =
    when (this) {
        VehicleKind.CAR -> "car"
        VehicleKind.MOTORCYCLE -> "motorcycle"
    }

private fun String.toVehicleKind(): VehicleKind =
    when (trim().lowercase()) {
        "car", "cars", "auto", "automovel" -> VehicleKind.CAR
        "motorcycle", "moto", "motorbike" -> VehicleKind.MOTORCYCLE
        else -> throw ValidationException("Tipo de veiculo invalido.")
    }

private fun InvoiceDocumentInput.Source.toApiValue(): String =
    when (this) {
        InvoiceDocumentInput.Source.CAMERA_SCAN -> "cameraScan"
        InvoiceDocumentInput.Source.FILE_IMPORT -> "fileImport"
        InvoiceDocumentInput.Source.PHOTO_LIBRARY -> "photoLibrary"
        InvoiceDocumentInput.Source.MOCK -> "mock"
    }

private fun String.toInvoiceSource(): InvoiceDocumentInput.Source =
    when (trim()) {
        "cameraScan", "CAMERA_SCAN" -> InvoiceDocumentInput.Source.CAMERA_SCAN
        "fileImport", "FILE_IMPORT" -> InvoiceDocumentInput.Source.FILE_IMPORT
        "photoLibrary", "PHOTO_LIBRARY" -> InvoiceDocumentInput.Source.PHOTO_LIBRARY
        "mock", "MOCK" -> throw ValidationException("Origem mock nao e aceita pela API real.")
        else -> throw ValidationException("Origem do documento invalida.")
    }

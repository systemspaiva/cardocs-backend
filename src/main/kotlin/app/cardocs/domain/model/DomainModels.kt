package app.cardocs.domain.model

import java.math.BigDecimal
import java.util.UUID

data class VehicleDashboard(
    val id: UUID,
    val garages: List<VehicleGarage>,
    val selectedGarageId: UUID,
    val detectedVehicle: VehicleCandidate
)

data class VehicleGarage(
    val id: UUID,
    val vehicle: VehicleProfile,
    val investment: InvestmentSummary,
    val timeline: List<MaintenanceRecord>,
    val healthItems: List<PartHealth>,
    val vaultDocuments: List<VaultDocument>,
    val resaleDossier: ResaleDossier
)

enum class VehicleKind {
    CAR,
    MOTORCYCLE
}

data class VehicleProfile(
    val id: UUID,
    val kind: VehicleKind,
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
    val image: VehicleImage?
)

data class VehicleImage(
    val url: String,
    val thumbnailUrl: String?,
    val mime: String?,
    val width: Int?,
    val height: Int?,
    val accentColor: String?,
    val source: String
)

data class VehicleImageLookupRequest(
    val brand: String,
    val model: String,
    val year: String
)

data class VehicleImageLookupResult(
    val request: VehicleImageLookupRequest,
    val images: List<VehicleImage>,
    val provider: String,
    val providerStatus: String?,
    val providerError: String?
) {
    val primaryImage: VehicleImage?
        get() = images.firstOrNull()
}

data class InvestmentSummary(
    val total: BigDecimal,
    val maintenance: BigDecimal,
    val documentsAndTaxes: BigDecimal
) {
    fun applying(delta: InvestmentDelta): InvestmentSummary =
        copy(
            total = total + delta.total,
            maintenance = maintenance + delta.maintenance,
            documentsAndTaxes = documentsAndTaxes + delta.documentsAndTaxes
        )

    companion object {
        val ZERO = InvestmentSummary(
            total = BigDecimal.ZERO,
            maintenance = BigDecimal.ZERO,
            documentsAndTaxes = BigDecimal.ZERO
        )
    }
}

data class MaintenanceRecord(
    val id: UUID,
    val iconName: String,
    val title: String,
    val subtitle: String,
    val date: String,
    val amount: BigDecimal,
    val isAiValidated: Boolean
)

data class PartHealth(
    val id: UUID,
    val iconName: String,
    val name: String,
    val message: String,
    val percentage: Int,
    val replacedAt: String,
    val limit: String,
    val tone: Tone
) {
    enum class Tone {
        HEALTHY,
        WARNING,
        NEUTRAL
    }
}

data class VaultDocument(
    val id: UUID,
    val title: String,
    val date: String,
    val amount: BigDecimal,
    val status: String
)

data class VehicleCandidate(
    val id: UUID,
    val kind: VehicleKind,
    val plate: String,
    val brand: String,
    val model: String,
    val year: String,
    val color: String,
    val image: VehicleImage?
) {
    fun toProfile(initialMileage: Int): VehicleProfile =
        VehicleProfile(
            id = id,
            kind = kind,
            plate = plate,
            maskedPlate = plate.maskLastCharacter(),
            brand = brand,
            model = model,
            year = year,
            color = color,
            mileage = initialMileage.coerceAtLeast(0),
            nextServiceTitle = "Primeira organizacao",
            nextServiceDistance = "Pronto para importar historico",
            statusTags = listOf("Placa Verificada"),
            image = image
        )
}

data class ResaleDossier(
    val title: String,
    val summary: String,
    val score: Int,
    val estimatedValueIncrease: BigDecimal,
    val publicReportUrl: String,
    val highlights: List<ResaleHighlight>,
    val checks: List<String>,
    val reportSections: List<ResaleReportSection>
)

data class ResaleHighlight(
    val id: UUID,
    val iconName: String,
    val title: String,
    val value: String
)

data class ResaleReportSection(
    val id: UUID,
    val iconName: String,
    val title: String,
    val status: String,
    val detail: String
)

data class AutomationResult(
    val title: String,
    val message: String,
    val investmentDelta: InvestmentDelta,
    val record: MaintenanceRecord,
    val document: VaultDocument
)

data class InvestmentDelta(
    val total: BigDecimal,
    val maintenance: BigDecimal,
    val documentsAndTaxes: BigDecimal
)

data class InvoiceDocumentInput(
    val source: Source,
    val displayName: String
) {
    enum class Source {
        CAMERA_SCAN,
        FILE_IMPORT,
        PHOTO_LIBRARY,
        MOCK
    }
}

data class InvoiceScanDraft(
    val id: UUID,
    val source: InvoiceDocumentInput.Source,
    val supplierName: String,
    val serviceTitle: String,
    val category: String,
    val date: String,
    val amount: BigDecimal,
    val mileage: Int,
    val confidence: Int,
    val extractedFields: List<InvoiceExtractedField>,
    val healthImpacts: List<InvoiceHealthImpact>
)

data class InvoiceExtractedField(
    val id: UUID,
    val label: String,
    val value: String,
    val confidence: Int
)

data class InvoiceHealthImpact(
    val id: UUID,
    val iconName: String,
    val title: String,
    val detail: String
)

data class PlateLookupRequest(
    val plate: String
)

data class VehicleRegistrationRequest(
    val candidate: VehicleCandidate,
    val initialMileage: Int
)

data class ResaleDossierRequest(
    val vehicleId: UUID
)

fun String.normalizedPlate(): String =
    filter { it.isLetterOrDigit() }.uppercase()

fun String.isValidBrazilianPlate(): Boolean {
    val value = normalizedPlate()
    if (value.length != 7) return false
    if (!value[0].isLetter() || !value[1].isLetter() || !value[2].isLetter()) return false
    if (!value[3].isDigit() || !value[5].isDigit() || !value[6].isDigit()) return false
    return value[4].isLetter() || value[4].isDigit()
}

fun String.maskLastCharacter(): String =
    if (isBlank()) "*" else dropLast(1) + "*"

fun deterministicUuid(namespace: String, value: String): UUID =
    UUID.nameUUIDFromBytes("$namespace:$value".toByteArray(Charsets.UTF_8))

fun VehicleProfile.toCandidate(): VehicleCandidate =
    VehicleCandidate(
        id = id,
        kind = kind,
        plate = plate,
        brand = brand,
        model = model,
        year = year,
        color = color,
        image = image
    )

package app.cardocs.infrastructure.aws

import app.cardocs.application.port.GaragePersistencePort
import app.cardocs.application.port.GarageReadModelPort
import app.cardocs.domain.model.AutomationResult
import app.cardocs.domain.model.InvoiceExtractedField
import app.cardocs.domain.model.InvoiceHealthImpact
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.InvestmentSummary
import app.cardocs.domain.model.MaintenanceRecord
import app.cardocs.domain.model.PartHealth
import app.cardocs.domain.model.PartHealthFactory
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.ResaleDossierFactory
import app.cardocs.domain.model.ResaleHighlight
import app.cardocs.domain.model.ResaleReportSection
import app.cardocs.domain.model.VehicleCandidate
import app.cardocs.domain.model.VehicleDashboard
import app.cardocs.domain.model.VehicleGarage
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleKind
import app.cardocs.domain.model.VehicleProfile
import app.cardocs.domain.model.VaultDocument
import app.cardocs.domain.model.deterministicUuid
import app.cardocs.domain.model.normalizedPlate
import app.cardocs.domain.model.toCandidate
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Repository
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.Put
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest
import software.amazon.awssdk.services.dynamodb.model.QueryRequest
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Repository
class DynamoDbGarageRepository(
    private val dynamoDb: DynamoDbClient,
    @param:Value("\${aws.dynamodb.table-name}") private val tableName: String
) : GaragePersistencePort, GarageReadModelPort {
    override fun loadDashboard(ownerId: String): VehicleDashboard {
        val vehicles = queryOwner(ownerId, VEHICLE_PREFIX)
            .filter { it.hasType("VEHICLE") }
            .mapNotNull { it.toVehicleProfile() }
            .sortedBy { it.id.toString() }
        val garages = vehicles.map { garageFor(ownerId, it) }
        val selectedVehicle = vehicles.firstOrNull()

        return VehicleDashboard(
            id = DASHBOARD_ID,
            garages = garages,
            selectedGarageId = selectedVehicle?.id ?: EMPTY_GARAGE_ID,
            detectedVehicle = selectedVehicle?.toCandidate() ?: EMPTY_CANDIDATE
        )
    }

    override fun findVehicle(ownerId: String, vehicleId: UUID): VehicleProfile? =
        getItem(ownerPk(ownerId), vehicleSk(vehicleId)).toVehicleProfile()

    override fun findGarage(ownerId: String, vehicleId: UUID): VehicleGarage? =
        findVehicle(ownerId, vehicleId)?.let { garageFor(ownerId, it) }

    override fun saveVehicle(ownerId: String, vehicle: VehicleProfile): VehicleProfile {
        val normalizedPlate = vehicle.plate.normalizedPlate()
        val vehicleId = deterministicUuid("vehicle", "$ownerId:$normalizedPlate")
        val normalizedVehicle = vehicle.copy(
            id = vehicleId,
            plate = normalizedPlate,
            maskedPlate = normalizedPlate.dropLast(1) + "*"
        )
        putItem(
            normalizedVehicle.toItem(
                ownerId = ownerId,
                normalizedPlate = normalizedPlate
            )
        )
        return normalizedVehicle
    }

    override fun saveInvoiceDraft(ownerId: String, draft: InvoiceScanDraft): InvoiceScanDraft {
        putItem(draft.toItem(ownerId))
        return draft
    }

    override fun saveAutomationResult(ownerId: String, vehicleId: UUID, result: AutomationResult): AutomationResult {
        transactPutItems(
            result.record.toItem(ownerId, vehicleId, result.investmentDelta.bucket()),
            result.document.toItem(ownerId, vehicleId)
        )
        return result
    }

    override fun upsertResaleDossier(ownerId: String, vehicleId: UUID, dossier: ResaleDossier): ResaleDossier {
        val slug = dossier.publicReportUrl.substringAfterLast("/")
        transactPutItems(
            dossier.toItem(ownerId, vehicleId, slug),
            dossier.toPublicReportItem(ownerId, vehicleId, slug)
        )
        return dossier
    }

    override fun findPublicDossier(slug: String): ResaleDossier? =
        getItem(PUBLIC_REPORTS_PK, publicReportSk(slug.normalizedPlate())).toResaleDossier()

    override fun maintenanceRecords(vehicleId: UUID): List<MaintenanceRecord> =
        emptyList()

    override fun vaultDocuments(vehicleId: UUID): List<VaultDocument> =
        emptyList()

    override fun healthItems(vehicleId: UUID): List<PartHealth> =
        emptyList()

    private fun garageFor(ownerId: String, vehicle: VehicleProfile): VehicleGarage {
        val timeline = queryOwner(ownerId, maintenancePrefix(vehicle.id))
            .mapNotNull { it.toMaintenanceRecord() }
            .sortedByDescending { it.id.toString() }
        val documents = queryOwner(ownerId, vaultDocumentPrefix(vehicle.id))
            .mapNotNull { it.toVaultDocument() }
            .sortedByDescending { it.id.toString() }
        val health = queryOwner(ownerId, partHealthPrefix(vehicle.id))
            .mapNotNull { it.toPartHealth() }
            .ifEmpty { PartHealthFactory.pending(vehicle) }
        val investment = timeline.fold(InvestmentSummary.ZERO) { acc, record ->
            if (record.iconName == "doc.text") {
                acc.copy(
                    total = acc.total + record.amount,
                    documentsAndTaxes = acc.documentsAndTaxes + record.amount
                )
            } else {
                acc.copy(
                    total = acc.total + record.amount,
                    maintenance = acc.maintenance + record.amount
                )
            }
        }
        val dossier = getItem(ownerPk(ownerId), dossierSk(vehicle.id)).toResaleDossier()
            ?: ResaleDossierFactory.generate(vehicle, timeline, documents)

        return VehicleGarage(
            id = vehicle.id,
            vehicle = vehicle,
            investment = investment,
            timeline = timeline,
            healthItems = health,
            vaultDocuments = documents,
            resaleDossier = dossier
        )
    }

    private fun queryOwner(ownerId: String, skPrefix: String): List<Map<String, AttributeValue>> {
        val items = mutableListOf<Map<String, AttributeValue>>()
        var exclusiveStartKey: Map<String, AttributeValue>? = null

        do {
            val startKey = exclusiveStartKey
            val request = QueryRequest.builder()
                .tableName(tableName)
                .keyConditionExpression("pk = :pk AND begins_with(sk, :sk)")
                .expressionAttributeValues(
                    mapOf(
                        ":pk" to ownerPk(ownerId).s(),
                        ":sk" to skPrefix.s()
                    )
                )
                .apply {
                    if (!startKey.isNullOrEmpty()) {
                        exclusiveStartKey(startKey)
                    }
                }
                .build()

            val response = dynamoDb.query(request)
            items += response.items()
            exclusiveStartKey = response.lastEvaluatedKey().takeIf { it.isNotEmpty() }
        } while (exclusiveStartKey != null)

        return items
    }

    private fun getItem(pk: String, sk: String): Map<String, AttributeValue> =
        dynamoDb.getItem(
            GetItemRequest.builder()
                .tableName(tableName)
                .key(mapOf("pk" to pk.s(), "sk" to sk.s()))
                .build()
        ).item() ?: emptyMap()

    private fun putItem(item: Map<String, AttributeValue>) {
        dynamoDb.putItem(
            PutItemRequest.builder()
                .tableName(tableName)
                .item(item)
                .build()
        )
    }

    private fun transactPutItems(vararg items: Map<String, AttributeValue>) {
        dynamoDb.transactWriteItems(
            TransactWriteItemsRequest.builder()
                .transactItems(
                    items.map { item ->
                        TransactWriteItem.builder()
                            .put(
                                Put.builder()
                                    .tableName(tableName)
                                    .item(item)
                                    .build()
                            )
                            .build()
                    }
                )
                .build()
        )
    }

    private fun VehicleProfile.toItem(ownerId: String, normalizedPlate: String): Map<String, AttributeValue> =
        requiredItem(ownerPk(ownerId), vehicleSk(id), "VEHICLE") + mapOf(
            "ownerId" to ownerId.s(),
            "id" to id.toString().s(),
            "kind" to kind.name.s(),
            "plate" to plate.s(),
            "normalizedPlate" to normalizedPlate.s(),
            "maskedPlate" to maskedPlate.s(),
            "brand" to brand.s(),
            "model" to model.s(),
            "year" to year.s(),
            "color" to color.s(),
            "mileage" to mileage.n(),
            "nextServiceTitle" to nextServiceTitle.s(),
            "nextServiceDistance" to nextServiceDistance.s(),
            "statusTags" to statusTags.ss(),
            "image" to image?.toAttributeValue()
        ).withoutNulls()

    private fun InvoiceScanDraft.toItem(ownerId: String): Map<String, AttributeValue> =
        requiredItem(ownerPk(ownerId), invoiceDraftSk(id), "INVOICE_DRAFT") + mapOf(
            "id" to id.toString().s(),
            "source" to source.name.s(),
            "supplierName" to supplierName.s(),
            "serviceTitle" to serviceTitle.s(),
            "category" to category.s(),
            "date" to date.s(),
            "amount" to amount.n(),
            "mileage" to mileage.n(),
            "confidence" to confidence.n(),
            "extractedFields" to extractedFields.map { it.toAttributeValue() }.l(),
            "healthImpacts" to healthImpacts.map { it.toAttributeValue() }.l()
        )

    private fun MaintenanceRecord.toItem(ownerId: String, vehicleId: UUID, bucket: String): Map<String, AttributeValue> =
        requiredItem(ownerPk(ownerId), maintenanceSk(vehicleId, id), "MAINTENANCE_RECORD") + mapOf(
            "id" to id.toString().s(),
            "investmentBucket" to bucket.s(),
            "iconName" to iconName.s(),
            "title" to title.s(),
            "subtitle" to subtitle.s(),
            "date" to date.s(),
            "amount" to amount.n(),
            "isAiValidated" to isAiValidated.bool()
        )

    private fun VaultDocument.toItem(ownerId: String, vehicleId: UUID): Map<String, AttributeValue> =
        requiredItem(ownerPk(ownerId), vaultDocumentSk(vehicleId, id), "VAULT_DOCUMENT") + mapOf(
            "id" to id.toString().s(),
            "title" to title.s(),
            "date" to date.s(),
            "amount" to amount.n(),
            "status" to status.s()
        )

    private fun ResaleDossier.toItem(ownerId: String, vehicleId: UUID, slug: String): Map<String, AttributeValue> =
        requiredItem(ownerPk(ownerId), dossierSk(vehicleId), "RESALE_DOSSIER") + dossierAttributes(ownerId, vehicleId, slug)

    private fun ResaleDossier.toPublicReportItem(ownerId: String, vehicleId: UUID, slug: String): Map<String, AttributeValue> =
        requiredItem(PUBLIC_REPORTS_PK, publicReportSk(slug), "PUBLIC_REPORT") + dossierAttributes(ownerId, vehicleId, slug)

    private fun ResaleDossier.dossierAttributes(ownerId: String, vehicleId: UUID, slug: String): Map<String, AttributeValue> =
        mapOf(
            "ownerId" to ownerId.s(),
            "vehicleId" to vehicleId.toString().s(),
            "slug" to slug.s(),
            "title" to title.s(),
            "summary" to summary.s(),
            "score" to score.n(),
            "estimatedValueIncrease" to estimatedValueIncrease.n(),
            "publicReportUrl" to publicReportUrl.s(),
            "highlights" to highlights.map { it.toAttributeValue() }.l(),
            "checks" to checks.ss(),
            "reportSections" to reportSections.map { it.toAttributeValue() }.l()
        )

    private fun requiredItem(pk: String, sk: String, type: String): Map<String, AttributeValue> =
        mapOf(
            "pk" to pk.s(),
            "sk" to sk.s(),
            "type" to type.s(),
            "updatedAt" to Instant.now().toString().s()
        )

    private fun Map<String, AttributeValue>.toVehicleProfile(): VehicleProfile? {
        if (isEmpty()) return null
        if (!hasType("VEHICLE")) return null
        return VehicleProfile(
            id = uuid("id") ?: return null,
            kind = VehicleKind.valueOf(string("kind") ?: VehicleKind.CAR.name),
            plate = string("plate").orEmpty(),
            maskedPlate = string("maskedPlate").orEmpty(),
            brand = string("brand").orEmpty(),
            model = string("model").orEmpty(),
            year = string("year").orEmpty(),
            color = string("color").orEmpty(),
            mileage = int("mileage"),
            nextServiceTitle = string("nextServiceTitle").orEmpty(),
            nextServiceDistance = string("nextServiceDistance").orEmpty(),
            statusTags = stringSet("statusTags"),
            image = this["image"]?.m()?.toVehicleImage()
        )
    }

    private fun Map<String, AttributeValue>.toMaintenanceRecord(): MaintenanceRecord? {
        if (isEmpty()) return null
        return MaintenanceRecord(
            id = uuid("id") ?: return null,
            iconName = string("iconName").orEmpty(),
            title = string("title").orEmpty(),
            subtitle = string("subtitle").orEmpty(),
            date = string("date").orEmpty(),
            amount = decimal("amount"),
            isAiValidated = bool("isAiValidated")
        )
    }

    private fun Map<String, AttributeValue>.toVaultDocument(): VaultDocument? {
        if (isEmpty()) return null
        return VaultDocument(
            id = uuid("id") ?: return null,
            title = string("title").orEmpty(),
            date = string("date").orEmpty(),
            amount = decimal("amount"),
            status = string("status").orEmpty()
        )
    }

    private fun Map<String, AttributeValue>.toPartHealth(): PartHealth? {
        if (isEmpty()) return null
        return PartHealth(
            id = uuid("id") ?: return null,
            iconName = string("iconName").orEmpty(),
            name = string("name").orEmpty(),
            message = string("message").orEmpty(),
            percentage = int("percentage"),
            replacedAt = string("replacedAt").orEmpty(),
            limit = string("limit").orEmpty(),
            tone = PartHealth.Tone.valueOf(string("tone") ?: PartHealth.Tone.NEUTRAL.name)
        )
    }

    private fun Map<String, AttributeValue>.toResaleDossier(): ResaleDossier? {
        if (isEmpty()) return null
        return ResaleDossier(
            title = string("title").orEmpty(),
            summary = string("summary").orEmpty(),
            score = int("score"),
            estimatedValueIncrease = decimal("estimatedValueIncrease"),
            publicReportUrl = string("publicReportUrl").orEmpty(),
            highlights = list("highlights").mapNotNull { it.m().toResaleHighlight() },
            checks = stringSet("checks"),
            reportSections = list("reportSections").mapNotNull { it.m().toResaleReportSection() }
        )
    }

    private fun Map<String, AttributeValue>.toVehicleImage(): VehicleImage? {
        val url = string("url") ?: return null
        return VehicleImage(
            url = url,
            thumbnailUrl = string("thumbnailUrl"),
            mime = string("mime"),
            width = nullableInt("width"),
            height = nullableInt("height"),
            accentColor = string("accentColor"),
            source = string("source") ?: "carsxe"
        )
    }

    private fun ResaleHighlight.toAttributeValue(): AttributeValue =
        mapOf(
            "id" to id.toString().s(),
            "iconName" to iconName.s(),
            "title" to title.s(),
            "value" to value.s()
        ).m()

    private fun ResaleReportSection.toAttributeValue(): AttributeValue =
        mapOf(
            "id" to id.toString().s(),
            "iconName" to iconName.s(),
            "title" to title.s(),
            "status" to status.s(),
            "detail" to detail.s()
        ).m()

    private fun InvoiceExtractedField.toAttributeValue(): AttributeValue =
        mapOf(
            "id" to id.toString().s(),
            "label" to label.s(),
            "value" to value.s(),
            "confidence" to confidence.n()
        ).m()

    private fun InvoiceHealthImpact.toAttributeValue(): AttributeValue =
        mapOf(
            "id" to id.toString().s(),
            "iconName" to iconName.s(),
            "title" to title.s(),
            "detail" to detail.s()
        ).m()

    private fun VehicleImage.toAttributeValue(): AttributeValue =
        mapOf(
            "url" to url.s(),
            "thumbnailUrl" to thumbnailUrl?.s(),
            "mime" to mime?.s(),
            "width" to width?.n(),
            "height" to height?.n(),
            "accentColor" to accentColor?.s(),
            "source" to source.s()
        ).withoutNulls().m()

    private fun Map<String, AttributeValue>.toResaleHighlight(): ResaleHighlight? =
        ResaleHighlight(
            id = uuid("id") ?: return null,
            iconName = string("iconName").orEmpty(),
            title = string("title").orEmpty(),
            value = string("value").orEmpty()
        )

    private fun Map<String, AttributeValue>.toResaleReportSection(): ResaleReportSection? =
        ResaleReportSection(
            id = uuid("id") ?: return null,
            iconName = string("iconName").orEmpty(),
            title = string("title").orEmpty(),
            status = string("status").orEmpty(),
            detail = string("detail").orEmpty()
        )

    private fun Map<String, AttributeValue>.string(field: String): String? =
        this[field]?.s()

    private fun Map<String, AttributeValue>.hasType(type: String): Boolean =
        string("type") == type

    private fun Map<String, AttributeValue>.stringSet(field: String): List<String> =
        this[field]?.ss() ?: emptyList()

    private fun Map<String, AttributeValue>.int(field: String): Int =
        this[field]?.n()?.toIntOrNull() ?: 0

    private fun Map<String, AttributeValue>.nullableInt(field: String): Int? =
        this[field]?.n()?.toIntOrNull()

    private fun Map<String, AttributeValue>.decimal(field: String): BigDecimal =
        this[field]?.n()?.toBigDecimalOrNull() ?: BigDecimal.ZERO

    private fun Map<String, AttributeValue>.bool(field: String): Boolean =
        this[field]?.bool() ?: false

    private fun Map<String, AttributeValue>.uuid(field: String): UUID? =
        string(field)?.let(UUID::fromString)

    private fun Map<String, AttributeValue>.list(field: String): List<AttributeValue> =
        this[field]?.l() ?: emptyList()

    private fun app.cardocs.domain.model.InvestmentDelta.bucket(): String =
        if (documentsAndTaxes > BigDecimal.ZERO) "DOCUMENTS_AND_TAXES" else "MAINTENANCE"

    private fun String.s(): AttributeValue =
        AttributeValue.builder().s(this).build()

    private fun Int.n(): AttributeValue =
        AttributeValue.builder().n(toString()).build()

    private fun BigDecimal.n(): AttributeValue =
        AttributeValue.builder().n(toPlainString()).build()

    private fun Boolean.bool(): AttributeValue =
        AttributeValue.builder().bool(this).build()

    private fun List<String>.ss(): AttributeValue =
        if (isEmpty()) AttributeValue.builder().l(emptyList()).build() else AttributeValue.builder().ss(this).build()

    private fun List<AttributeValue>.l(): AttributeValue =
        AttributeValue.builder().l(this).build()

    private fun Map<String, AttributeValue>.m(): AttributeValue =
        AttributeValue.builder().m(this).build()

    private fun Map<String, AttributeValue?>.withoutNulls(): Map<String, AttributeValue> =
        mapNotNull { (key, value) -> value?.let { key to it } }.toMap()

    private fun ownerPk(ownerId: String): String = "OWNER#$ownerId"
    private fun vehicleSk(vehicleId: UUID): String = "$VEHICLE_PREFIX${vehicleId}"
    private fun invoiceDraftSk(draftId: UUID): String = "DRAFT#$draftId"
    private fun maintenancePrefix(vehicleId: UUID): String = "VEHICLE#$vehicleId#MAINT#"
    private fun maintenanceSk(vehicleId: UUID, recordId: UUID): String = "${maintenancePrefix(vehicleId)}$recordId"
    private fun vaultDocumentPrefix(vehicleId: UUID): String = "VEHICLE#$vehicleId#DOC#"
    private fun vaultDocumentSk(vehicleId: UUID, documentId: UUID): String = "${vaultDocumentPrefix(vehicleId)}$documentId"
    private fun partHealthPrefix(vehicleId: UUID): String = "VEHICLE#$vehicleId#PART#"
    private fun dossierSk(vehicleId: UUID): String = "VEHICLE#$vehicleId#DOSSIER#current"
    private fun publicReportSk(slug: String): String = "REPORT#$slug"

    private companion object {
        const val VEHICLE_PREFIX = "VEHICLE#"
        const val PUBLIC_REPORTS_PK = "PUBLIC_REPORTS"
        val DASHBOARD_ID: UUID = UUID.nameUUIDFromBytes("cardocs-dashboard".toByteArray(Charsets.UTF_8))
        val EMPTY_GARAGE_ID: UUID = deterministicUuid("garage", "empty")
        val EMPTY_CANDIDATE = VehicleCandidate(
            id = deterministicUuid("vehicle-candidate", "ABC1D23"),
            kind = VehicleKind.CAR,
            plate = "ABC1D23",
            brand = "Veiculo",
            model = "A confirmar",
            year = "Nao informado",
            color = "Nao informado",
            image = null
        )
    }
}

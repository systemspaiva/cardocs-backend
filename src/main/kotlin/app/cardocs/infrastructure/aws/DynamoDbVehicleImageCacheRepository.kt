package app.cardocs.infrastructure.aws

import app.cardocs.application.port.VehicleImageCachePort
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleImageLookupRequest
import app.cardocs.domain.model.VehicleImageLookupResult
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Repository
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest
import java.time.Instant
import java.util.Locale

@Repository
class DynamoDbVehicleImageCacheRepository(
    private val dynamoDb: DynamoDbClient,
    @param:Value("\${aws.dynamodb.table-name}") private val tableName: String
) : VehicleImageCachePort {
    override fun find(request: VehicleImageLookupRequest): VehicleImageLookupResult? {
        val item = dynamoDb.getItem(
            GetItemRequest.builder()
                .tableName(tableName)
                .key(mapOf("pk" to CACHE_PK.s(), "sk" to cacheSk(request).s()))
                .consistentRead(true)
                .build()
        ).item() ?: return null

        if (item.isEmpty()) return null
        if (item.string("providerStatus") == IN_PROGRESS_STATUS && item.long("lockExpiresAt") <= Instant.now().epochSecond) {
            return null
        }

        return VehicleImageLookupResult(
            request = VehicleImageLookupRequest(
                brand = item.string("brand") ?: request.brand,
                model = item.string("model") ?: request.model,
                year = item.string("year") ?: request.year
            ),
            images = item.list("images").mapNotNull { it.m().toVehicleImage() },
            provider = item.string("provider") ?: "carsxe",
            providerStatus = item.string("providerStatus"),
            providerError = item.string("providerError")
        )
    }

    override fun reserve(request: VehicleImageLookupRequest): Boolean {
        val now = Instant.now()
        val expiresAt = now.plusSeconds(LOCK_TTL_SECONDS)

        return try {
            dynamoDb.putItem(
                PutItemRequest.builder()
                    .tableName(tableName)
                    .item(
                        mapOf(
                            "pk" to CACHE_PK.s(),
                            "sk" to cacheSk(request).s(),
                            "type" to "VEHICLE_IMAGE_CACHE_LOCK".s(),
                            "lookupKey" to request.cacheKey().s(),
                            "brand" to request.brand.trim().s(),
                            "model" to request.model.trim().s(),
                            "year" to request.year.trim().s(),
                            "provider" to "carsxe".s(),
                            "providerStatus" to IN_PROGRESS_STATUS.s(),
                            "images" to emptyList<AttributeValue>().l(),
                            "lockExpiresAt" to expiresAt.epochSecond.n(),
                            "updatedAt" to now.toString().s()
                        )
                    )
                    .conditionExpression("attribute_not_exists(pk) OR lockExpiresAt < :now")
                    .expressionAttributeValues(mapOf(":now" to now.epochSecond.n()))
                    .build()
            )
            true
        } catch (_: ConditionalCheckFailedException) {
            false
        }
    }

    override fun save(result: VehicleImageLookupResult): VehicleImageLookupResult {
        val now = Instant.now().toString()
        dynamoDb.putItem(
            PutItemRequest.builder()
                .tableName(tableName)
                .item(
                    mapOf(
                        "pk" to CACHE_PK.s(),
                        "sk" to cacheSk(result.request).s(),
                        "type" to "VEHICLE_IMAGE_CACHE".s(),
                        "lookupKey" to result.request.cacheKey().s(),
                        "brand" to result.request.brand.trim().s(),
                        "model" to result.request.model.trim().s(),
                        "year" to result.request.year.trim().s(),
                        "provider" to result.provider.s(),
                        "providerStatus" to result.providerStatus?.s(),
                        "providerError" to result.providerError.safeExternalError()?.s(),
                        "images" to result.images.map { it.toAttributeValue() }.l(),
                        "updatedAt" to now.s()
                    ).withoutNulls()
                )
                .build()
        )
        return result
    }

    override fun release(request: VehicleImageLookupRequest) {
        try {
            dynamoDb.deleteItem(
                DeleteItemRequest.builder()
                    .tableName(tableName)
                    .key(mapOf("pk" to CACHE_PK.s(), "sk" to cacheSk(request).s()))
                    .conditionExpression("providerStatus = :status")
                    .expressionAttributeValues(mapOf(":status" to IN_PROGRESS_STATUS.s()))
                    .build()
            )
        } catch (_: ConditionalCheckFailedException) {
            // The cache entry was already replaced or removed.
        }
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

    private fun VehicleImageLookupRequest.cacheKey(): String =
        listOf(brand, model, year).joinToString("|") { it.normalizedLookupPart() }

    private fun cacheSk(request: VehicleImageLookupRequest): String =
        "LOOKUP#${request.cacheKey()}"

    private fun String.normalizedLookupPart(): String =
        trim()
            .lowercase(Locale.ROOT)
            .replace(WHITESPACE_REGEX, " ")

    private fun String?.safeExternalError(): String? =
        takeIf { !it.isNullOrBlank() }?.let { "external_provider_error" }

    private fun Map<String, AttributeValue>.string(field: String): String? =
        this[field]?.s()

    private fun Map<String, AttributeValue>.nullableInt(field: String): Int? =
        this[field]?.n()?.toIntOrNull()

    private fun Map<String, AttributeValue>.long(field: String): Long =
        this[field]?.n()?.toLongOrNull() ?: 0L

    private fun Map<String, AttributeValue>.list(field: String): List<AttributeValue> =
        this[field]?.l() ?: emptyList()

    private fun String.s(): AttributeValue =
        AttributeValue.builder().s(this).build()

    private fun Int.n(): AttributeValue =
        AttributeValue.builder().n(toString()).build()

    private fun Long.n(): AttributeValue =
        AttributeValue.builder().n(toString()).build()

    private fun List<AttributeValue>.l(): AttributeValue =
        AttributeValue.builder().l(this).build()

    private fun Map<String, AttributeValue>.m(): AttributeValue =
        AttributeValue.builder().m(this).build()

    private fun Map<String, AttributeValue?>.withoutNulls(): Map<String, AttributeValue> =
        mapNotNull { (key, value) -> value?.let { key to it } }.toMap()

    private companion object {
        const val CACHE_PK = "VEHICLE_IMAGE_CACHE"
        const val IN_PROGRESS_STATUS = "in_progress"
        const val LOCK_TTL_SECONDS = 30L
        val WHITESPACE_REGEX = Regex("\\s+")
    }
}

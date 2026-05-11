package app.cardocs.infrastructure.provider

import app.cardocs.application.port.VehicleImageCachePort
import app.cardocs.application.port.VehicleImageProvider
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleImageLookupRequest
import app.cardocs.domain.model.VehicleImageLookupResult
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.util.UriComponentsBuilder

@Component
class CachedVehicleImageProvider(
    private val cache: VehicleImageCachePort,
    private val carsXeClient: CarsXeVehicleImageClient
) : VehicleImageProvider {
    override fun findImage(request: VehicleImageLookupRequest): VehicleImage? {
        val cached = cache.find(request)
        if (cached != null) {
            return cached.primaryImage
        }

        if (!cache.reserve(request)) {
            return cache.find(request)?.primaryImage
        }

        val fresh = carsXeClient.findImages(request)
        if (fresh == null) {
            cache.release(request)
            return null
        }

        cache.save(fresh)
        return fresh.primaryImage
    }
}

@Component
class CarsXeVehicleImageClient(
    @param:Value("\${carsxe.api-key:}") private val apiKey: String,
    @param:Value("\${carsxe.base-url:https://api.carsxe.com}") private val baseUrl: String,
    restClientBuilder: RestClient.Builder
) {
    private val restClient = restClientBuilder.build()

    fun findImages(request: VehicleImageLookupRequest): VehicleImageLookupResult? {
        if (apiKey.isBlank()) {
            logger.info("CarsXE image lookup skipped because CARSXE_API_KEY is not configured.")
            return null
        }

        val uri = UriComponentsBuilder.fromUriString(baseUrl)
            .path("/images")
            .queryParam("key", apiKey)
            .queryParam("make", request.brand.trim())
            .queryParam("model", request.model.trim())
            .queryParam("year", request.year.trim())
            .queryParam("format", "json")
            .build()
            .toUri()

        return try {
            val response = restClient.get()
                .uri(uri)
                .retrieve()
                .body(CarsXeImagesResponse::class.java)

            response?.toDomain(request)
        } catch (error: RestClientException) {
            logger.warn(
                "CarsXE image lookup failed for {} {} {}: {}",
                request.brand,
                request.model,
                request.year,
                error.javaClass.simpleName
            )
            null
        }
    }

    private fun CarsXeImagesResponse.toDomain(request: VehicleImageLookupRequest): VehicleImageLookupResult =
        VehicleImageLookupResult(
            request = request,
            images = images.orEmpty()
                .filter { !it.link.isNullOrBlank() }
                .map { it.toDomain() },
            provider = "carsxe",
            providerStatus = success?.let { if (it) "success" else "error" },
            providerError = error?.takeIf { it.isNotBlank() }
        )

    private fun CarsXeImage.toDomain(): VehicleImage =
        VehicleImage(
            url = link!!.trim(),
            thumbnailUrl = thumbnailLink?.takeIf { it.isNotBlank() },
            mime = mime?.takeIf { it.isNotBlank() },
            width = width,
            height = height,
            accentColor = accentColor?.takeIf { it.isNotBlank() },
            source = "carsxe"
        )

    private data class CarsXeImagesResponse(
        val success: Boolean? = null,
        val error: String? = null,
        val images: List<CarsXeImage>? = emptyList()
    )

    private data class CarsXeImage(
        val mime: String? = null,
        val link: String? = null,
        val contextLink: String? = null,
        val height: Int? = null,
        val width: Int? = null,
        val byteSize: Long? = null,
        val thumbnailLink: String? = null,
        val thumbnailHeight: Int? = null,
        val thumbnailWidth: Int? = null,
        val hostPageDomainFriendlyName: String? = null,
        val accentColor: String? = null,
        val datePublished: String? = null
    )

    private companion object {
        private val logger = LoggerFactory.getLogger(CarsXeVehicleImageClient::class.java)
    }
}

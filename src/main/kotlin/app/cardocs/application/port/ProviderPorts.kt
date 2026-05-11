package app.cardocs.application.port

import app.cardocs.domain.model.InvoiceDocumentInput
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.VehicleCandidate
import app.cardocs.domain.model.VehicleGarage
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleImageLookupRequest
import app.cardocs.domain.model.VehicleImageLookupResult
import app.cardocs.domain.model.VehicleProfile

interface PlateLookupProvider {
    fun lookup(normalizedPlate: String): VehicleCandidate
}

interface DocumentAnalysisProvider {
    fun analyze(input: InvoiceDocumentInput): InvoiceScanDraft
}

interface ResaleDossierProvider {
    fun generate(vehicle: VehicleProfile, garage: VehicleGarage): ResaleDossier
}

interface DocumentStorageProvider {
    fun storageMode(): String
}

interface VehicleImageProvider {
    fun findImage(request: VehicleImageLookupRequest): VehicleImage?
}

interface VehicleImageCachePort {
    fun find(request: VehicleImageLookupRequest): VehicleImageLookupResult?
    fun reserve(request: VehicleImageLookupRequest): Boolean
    fun save(result: VehicleImageLookupResult): VehicleImageLookupResult
    fun release(request: VehicleImageLookupRequest)
}

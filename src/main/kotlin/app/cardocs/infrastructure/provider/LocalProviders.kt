package app.cardocs.infrastructure.provider

import app.cardocs.application.ValidationException
import app.cardocs.application.port.DocumentAnalysisProvider
import app.cardocs.application.port.DocumentStorageProvider
import app.cardocs.application.port.PlateLookupProvider
import app.cardocs.application.port.ResaleDossierProvider
import app.cardocs.domain.model.InvoiceDocumentInput
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.ResaleDossierFactory
import app.cardocs.domain.model.VehicleGarage
import app.cardocs.domain.model.VehicleProfile
import org.springframework.stereotype.Component

@Component
class LocalPlateLookupProvider : PlateLookupProvider {
    override fun lookup(normalizedPlate: String) =
        throw ValidationException("Provider real de consulta por placa ainda nao esta configurado.")
}

@Component
class LocalDocumentAnalysisProvider : DocumentAnalysisProvider {
    override fun analyze(input: InvoiceDocumentInput): InvoiceScanDraft =
        throw ValidationException("Provider real de OCR/IA ainda nao esta configurado.")
}

@Component
class LocalResaleDossierProvider : ResaleDossierProvider {
    override fun generate(vehicle: VehicleProfile, garage: VehicleGarage): ResaleDossier =
        ResaleDossierFactory.generate(
            vehicle = vehicle,
            timeline = garage.timeline,
            documents = garage.vaultDocuments
        )
}

@Component
class LocalDocumentStorageProvider : DocumentStorageProvider {
    override fun storageMode(): String = "local-noop"
}

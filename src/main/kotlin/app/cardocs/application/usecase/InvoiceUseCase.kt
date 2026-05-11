package app.cardocs.application.usecase

import app.cardocs.application.NotFoundException
import app.cardocs.application.ValidationException
import app.cardocs.application.port.DocumentAnalysisProvider
import app.cardocs.application.port.GaragePersistencePort
import app.cardocs.domain.model.AutomationResult
import app.cardocs.domain.model.InvoiceDocumentInput
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.InvestmentDelta
import app.cardocs.domain.model.MaintenanceRecord
import app.cardocs.domain.model.VaultDocument
import app.cardocs.domain.model.deterministicUuid
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.util.UUID

@Service
class InvoiceUseCase(
    private val documentAnalysisProvider: DocumentAnalysisProvider,
    private val persistence: GaragePersistencePort
) {
    fun analyze(input: InvoiceDocumentInput): InvoiceScanDraft {
        return documentAnalysisProvider.analyze(input)
    }

    fun save(ownerId: String, vehicleId: UUID, draft: InvoiceScanDraft): AutomationResult {
        draft.requireRealAnalysis()
        val vehicle = persistence.findVehicle(ownerId, vehicleId)
            ?: throw NotFoundException("Veiculo nao encontrado para salvar documento.")

        val bucket = draft.category.investmentBucket()
        val delta = InvestmentDelta(
            total = draft.amount.safeMoney(),
            maintenance = if (bucket == InvestmentBucket.MAINTENANCE) draft.amount.safeMoney() else BigDecimal.ZERO,
            documentsAndTaxes = if (bucket == InvestmentBucket.DOCUMENTS_AND_TAXES) draft.amount.safeMoney() else BigDecimal.ZERO
        )

        val result = AutomationResult(
            title = "Documento salvo",
            message = "${draft.serviceTitle} foi organizado no historico e no cofre.",
            investmentDelta = delta,
            record = MaintenanceRecord(
                id = deterministicUuid("maintenance-record", "${vehicle.id}:${draft.id}"),
                iconName = if (bucket == InvestmentBucket.MAINTENANCE) "wrench.adjustable" else "doc.text",
                title = draft.serviceTitle,
                subtitle = "Documento importado pelo CarDocs",
                date = draft.date,
                amount = draft.amount.safeMoney(),
                isAiValidated = draft.confidence > 0
            ),
            document = VaultDocument(
                id = deterministicUuid("vault-document", "${vehicle.id}:${draft.id}"),
                title = "Doc - ${draft.serviceTitle}",
                date = draft.date,
                amount = draft.amount.safeMoney(),
                status = if (draft.confidence > 0) "Lido pela IA" else "Aguardando revisao"
            )
        )

        return persistence.saveAutomationResult(ownerId, vehicle.id, result)
    }

    private fun BigDecimal.safeMoney(): BigDecimal =
        maxOf(this, BigDecimal.ZERO)

    private fun InvoiceScanDraft.requireRealAnalysis() {
        if (confidence <= 0 || supplierName.isBlank() || serviceTitle.isBlank() || category.isBlank() || date.isBlank()) {
            throw ValidationException("Documento precisa vir de uma analise real antes de ser salvo.")
        }
        if (serviceTitle.trim().equals("Documento para revisar", ignoreCase = true)) {
            throw ValidationException("Documento placeholder nao pode ser salvo.")
        }
    }

    private fun String.investmentBucket(): InvestmentBucket {
        val value = lowercase()
        return if (
            value.contains("ipva") ||
            value.contains("imposto") ||
            value.contains("documento") ||
            value.contains("taxa")
        ) {
            InvestmentBucket.DOCUMENTS_AND_TAXES
        } else {
            InvestmentBucket.MAINTENANCE
        }
    }

    private enum class InvestmentBucket {
        MAINTENANCE,
        DOCUMENTS_AND_TAXES
    }
}

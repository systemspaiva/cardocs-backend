package app.cardocs.application.usecase

import app.cardocs.application.NotFoundException
import app.cardocs.application.port.GaragePersistencePort
import app.cardocs.application.port.ResaleDossierProvider
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.ResaleDossierRequest
import org.springframework.stereotype.Service

@Service
class ResaleDossierUseCase(
    private val persistence: GaragePersistencePort,
    private val resaleDossierProvider: ResaleDossierProvider
) {
    fun generate(ownerId: String, request: ResaleDossierRequest): ResaleDossier {
        val garage = persistence.findGarage(ownerId, request.vehicleId)
            ?: throw NotFoundException("Veiculo nao encontrado.")
        val dossier = resaleDossierProvider.generate(garage.vehicle, garage)
        return persistence.upsertResaleDossier(ownerId, garage.vehicle.id, dossier)
    }

    fun publicReport(slug: String): ResaleDossier =
        persistence.findPublicDossier(slug)
            ?: throw NotFoundException("Relatorio publico nao encontrado.")
}

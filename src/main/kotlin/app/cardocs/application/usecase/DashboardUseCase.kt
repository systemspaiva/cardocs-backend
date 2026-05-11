package app.cardocs.application.usecase

import app.cardocs.application.port.GaragePersistencePort
import app.cardocs.domain.model.VehicleDashboard
import org.springframework.stereotype.Service

@Service
class DashboardUseCase(
    private val persistence: GaragePersistencePort
) {
    fun loadDashboard(ownerId: String): VehicleDashboard =
        persistence.loadDashboard(ownerId)
}

package app.cardocs.application.usecase

import app.cardocs.application.ValidationException
import app.cardocs.application.port.GaragePersistencePort
import app.cardocs.application.port.PlateLookupProvider
import app.cardocs.application.port.VehicleImageProvider
import app.cardocs.domain.model.PlateLookupRequest
import app.cardocs.domain.model.VehicleCandidate
import app.cardocs.domain.model.VehicleImage
import app.cardocs.domain.model.VehicleImageLookupRequest
import app.cardocs.domain.model.VehicleProfile
import app.cardocs.domain.model.VehicleRegistrationRequest
import app.cardocs.domain.model.deterministicUuid
import app.cardocs.domain.model.isValidBrazilianPlate
import app.cardocs.domain.model.normalizedPlate
import org.springframework.stereotype.Service

@Service
class VehicleUseCase(
    private val plateLookupProvider: PlateLookupProvider,
    private val vehicleImageProvider: VehicleImageProvider,
    private val persistence: GaragePersistencePort
) {
    fun detectByPlate(request: PlateLookupRequest): VehicleCandidate {
        val plate = request.plate.normalizedPlate()
        if (!plate.isValidBrazilianPlate()) {
            throw ValidationException("Informe uma placa brasileira valida.")
        }

        return plateLookupProvider.lookup(plate)
    }

    fun register(ownerId: String, request: VehicleRegistrationRequest): VehicleProfile {
        val plate = request.candidate.plate.normalizedPlate()
        if (!plate.isValidBrazilianPlate()) {
            throw ValidationException("Informe uma placa brasileira valida.")
        }
        request.candidate.requireRealVehicleData()

        val candidate = request.candidate.copy(
            id = deterministicUuid("vehicle", "$ownerId:$plate"),
            plate = plate
        )
        val vehicle = candidate.copy(
            image = vehicleImageProvider.findImage(
                VehicleImageLookupRequest(
                    brand = candidate.brand,
                    model = candidate.model,
                    year = candidate.year
                )
            )
        ).toProfile(initialMileage = request.initialMileage)
        return persistence.saveVehicle(ownerId, vehicle)
    }

    fun findImage(request: VehicleImageLookupRequest): VehicleImage? {
        if (request.brand.isBlank() || request.model.isBlank() || request.year.isBlank()) {
            throw ValidationException("Marca, modelo e ano sao obrigatorios para buscar foto.")
        }
        request.requireRealVehicleData()

        return vehicleImageProvider.findImage(request)
    }

    private fun VehicleCandidate.requireRealVehicleData() {
        VehicleImageLookupRequest(
            brand = brand,
            model = model,
            year = year
        ).requireRealVehicleData()
    }

    private fun VehicleImageLookupRequest.requireRealVehicleData() {
        if (brand.isPlaceholderVehicleField() || model.isPlaceholderVehicleField() || year.isPlaceholderVehicleField()) {
            throw ValidationException("Marca, modelo e ano reais sao obrigatorios para cadastrar ou buscar foto do veiculo.")
        }
    }

    private fun String.isPlaceholderVehicleField(): Boolean {
        val normalized = trim().lowercase()
        return normalized.isBlank() ||
            normalized == "veiculo" ||
            normalized == "veículo" ||
            normalized == "a confirmar" ||
            normalized == "nao informado" ||
            normalized == "não informado"
    }
}

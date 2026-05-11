package app.cardocs.application.port

import app.cardocs.domain.model.AutomationResult
import app.cardocs.domain.model.InvoiceScanDraft
import app.cardocs.domain.model.MaintenanceRecord
import app.cardocs.domain.model.PartHealth
import app.cardocs.domain.model.ResaleDossier
import app.cardocs.domain.model.VehicleDashboard
import app.cardocs.domain.model.VehicleGarage
import app.cardocs.domain.model.VehicleProfile
import app.cardocs.domain.model.VaultDocument
import java.util.UUID

interface GaragePersistencePort {
    fun loadDashboard(ownerId: String): VehicleDashboard
    fun findVehicle(ownerId: String, vehicleId: UUID): VehicleProfile?
    fun findGarage(ownerId: String, vehicleId: UUID): VehicleGarage?
    fun saveVehicle(ownerId: String, vehicle: VehicleProfile): VehicleProfile
    fun saveInvoiceDraft(ownerId: String, draft: InvoiceScanDraft): InvoiceScanDraft
    fun saveAutomationResult(ownerId: String, vehicleId: UUID, result: AutomationResult): AutomationResult
    fun upsertResaleDossier(ownerId: String, vehicleId: UUID, dossier: ResaleDossier): ResaleDossier
    fun findPublicDossier(slug: String): ResaleDossier?
}

interface GarageReadModelPort {
    fun maintenanceRecords(vehicleId: UUID): List<MaintenanceRecord>
    fun vaultDocuments(vehicleId: UUID): List<VaultDocument>
    fun healthItems(vehicleId: UUID): List<PartHealth>
}

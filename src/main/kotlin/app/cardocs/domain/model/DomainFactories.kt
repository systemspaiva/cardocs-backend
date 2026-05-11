package app.cardocs.domain.model

import java.math.BigDecimal
import java.math.RoundingMode

object PartHealthFactory {
    fun pending(vehicle: VehicleProfile): List<PartHealth> =
        listOf(
            item(vehicle, "oil", "drop", "Oleo e Filtros", "Aguardando primeira nota"),
            item(vehicle, "tires", "circle.dotted", "Pneus", "Sem historico importado"),
            item(vehicle, "brakes", "record.circle", "Freios", "Aguardando revisao"),
            item(vehicle, "battery", "bolt.heart", "Bateria", "Sem registro ainda")
        )

    private fun item(
        vehicle: VehicleProfile,
        key: String,
        iconName: String,
        name: String,
        message: String
    ): PartHealth =
        PartHealth(
            id = deterministicUuid("part-health", "${vehicle.id}:$key"),
            iconName = iconName,
            name = name,
            message = message,
            percentage = 0,
            replacedAt = "Nao informado",
            limit = "Nao informado",
            tone = PartHealth.Tone.NEUTRAL
        )
}

object ResaleDossierFactory {
    fun generate(vehicle: VehicleProfile, timeline: List<MaintenanceRecord>, documents: List<VaultDocument>): ResaleDossier {
        val hasHistory = timeline.isNotEmpty() || documents.isNotEmpty()
        val slug = vehicle.plate.normalizedPlate()
        val documentCount = documents.size
        val maintenanceTotal = timeline.fold(BigDecimal.ZERO) { acc, record -> acc + record.amount }
        val estimatedIncrease = if (hasHistory) {
            maintenanceTotal.multiply(BigDecimal("0.20")).setScale(2, RoundingMode.HALF_UP)
        } else {
            BigDecimal.ZERO
        }
        val score = if (hasHistory) {
            (50 + timeline.size * 8 + documentCount * 10).coerceIn(50, 96)
        } else {
            42
        }

        return ResaleDossier(
            title = if (hasHistory) "Dossie CarDocs" else "Dossie em preparo",
            summary = if (hasHistory) {
                "Historico consolidado com manutencoes, documentos e sinais de procedencia."
            } else {
                "Importe notas e documentos para transformar este veiculo em um historico pronto para venda."
            },
            score = score,
            estimatedValueIncrease = estimatedIncrease,
            publicReportUrl = "https://cardocs.app/r/$slug",
            highlights = listOf(
                ResaleHighlight(
                    id = deterministicUuid("resale-highlight", "$slug:origin"),
                    iconName = "checkmark.seal.fill",
                    title = "Procedencia",
                    value = if ("Placa Verificada" in vehicle.statusTags) "Placa ok" else "A validar"
                ),
                ResaleHighlight(
                    id = deterministicUuid("resale-highlight", "$slug:documents"),
                    iconName = "doc.text.fill",
                    title = "Documentos",
                    value = "$documentCount anexos"
                ),
                ResaleHighlight(
                    id = deterministicUuid("resale-highlight", "$slug:value"),
                    iconName = "chart.line.uptrend.xyaxis",
                    title = "Valorizacao",
                    value = if (hasHistory) "+${estimatedIncrease.toPlainString()}" else "Pendente"
                )
            ),
            checks = if (hasHistory) {
                listOf(
                    "Placa cadastrada",
                    "Manutencoes registradas",
                    "Documentos centralizados"
                )
            } else {
                listOf(
                    "Placa cadastrada",
                    "Aguardando notas fiscais",
                    "Aguardando documentos"
                )
            },
            reportSections = listOf(
                ResaleReportSection(
                    id = deterministicUuid("resale-section", "$slug:maintenance"),
                    iconName = "wrench.adjustable",
                    title = "Historico de manutencao",
                    status = if (timeline.isNotEmpty()) "Completo" else "Pendente",
                    detail = if (timeline.isNotEmpty()) {
                        "${timeline.size} registros organizados no historico."
                    } else {
                        "Leia notas para preencher revisoes, oleo, pneus, freios e bateria."
                    }
                ),
                ResaleReportSection(
                    id = deterministicUuid("resale-section", "$slug:documents"),
                    iconName = "doc.text.fill",
                    title = "Documentos e impostos",
                    status = if (documents.isNotEmpty()) "Organizado" else "Pendente",
                    detail = if (documents.isNotEmpty()) {
                        "$documentCount documentos no cofre digital."
                    } else {
                        "Adicione comprovantes para fortalecer o relatorio publico."
                    }
                ),
                ResaleReportSection(
                    id = deterministicUuid("resale-section", "$slug:trust"),
                    iconName = "shield.lefthalf.filled",
                    title = "Confianca para comprador",
                    status = if (hasHistory) "Pronto" else "Em preparo",
                    detail = if (hasHistory) {
                        "Relatorio publico gerado a partir dos dados salvos no CarDocs."
                    } else {
                        "O link sera mais forte quando houver documentos validados."
                    }
                )
            )
        )
    }
}


package com.cardocs.api.exports;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "pdf_export_requests")
public class PdfExportRequest extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PdfExportType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExportStatus status;

    @Column(name = "storage_key")
    private String storageKey;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "completed_at")
    private Instant completedAt;
}

package com.cardocs.api.maintenance;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
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
@Table(name = "maintenance_records")
public class MaintenanceRecord extends BaseEntity {

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MaintenanceType type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;

    private Integer mileage;
    private BigDecimal amount;
    private String currency;

    @Column(name = "vendor_name")
    private String vendorName;

    @Column(name = "document_id")
    private UUID documentId;
}

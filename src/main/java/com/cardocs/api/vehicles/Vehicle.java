package com.cardocs.api.vehicles;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
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
@Table(name = "vehicles")
public class Vehicle extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "organization_id")
    private UUID organizationId;

    @Column(nullable = false)
    private String plate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VehicleType type;

    private String brand;
    private String model;
    private String version;
    private Integer year;

    @Column(name = "manufacture_year")
    private Integer manufactureYear;

    private String color;

    @Enumerated(EnumType.STRING)
    @Column(name = "fuel_type")
    private FuelType fuelType;

    @Column(name = "chassis_last_digits")
    private String chassisLastDigits;

    @Column(name = "renavam_masked")
    private String renavamMasked;

    @Column(name = "current_mileage")
    private Integer currentMileage;
}

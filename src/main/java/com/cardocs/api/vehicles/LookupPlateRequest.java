package com.cardocs.api.vehicles;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LookupPlateRequest(@NotBlank @Size(max = 12) String plate) {
}

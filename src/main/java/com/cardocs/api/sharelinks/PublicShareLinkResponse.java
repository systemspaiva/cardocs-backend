package com.cardocs.api.sharelinks;

import com.cardocs.api.vehicles.PublicVehicleResponse;
import java.util.List;

public record PublicShareLinkResponse(
    String publicTitle,
    List<String> allowedSections,
    PublicVehicleResponse vehicle
) {
}

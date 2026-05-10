package com.cardocs.api.sharelinks;

import com.cardocs.api.audit.AuditAction;
import com.cardocs.api.audit.AuditLogService;
import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.common.ResourceNotFoundException;
import com.cardocs.api.config.AppProperties;
import com.cardocs.api.consents.ConsentService;
import com.cardocs.api.consents.ConsentType;
import com.cardocs.api.users.User;
import com.cardocs.api.users.UserRepository;
import com.cardocs.api.users.UserStatus;
import com.cardocs.api.vehicles.PublicVehicleResponse;
import com.cardocs.api.vehicles.Vehicle;
import com.cardocs.api.vehicles.VehicleService;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ShareLinkService {

    private final ShareLinkRepository repository;
    private final VehicleService vehicleService;
    private final ConsentService consentService;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;
    private final AppProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public ShareLinkResponse create(User user, UUID vehicleId, CreateShareLinkRequest request) {
        if (!properties.getFeatures().isPublicShareLink()) {
            throw new BadRequestException("Dossiê público está desativado por feature flag");
        }
        Vehicle vehicle = vehicleService.getOwnedVehicle(user, vehicleId);
        if (!consentService.hasGranted(user, ConsentType.SHARE_RESALE_DOSSIER)) {
            throw new BadRequestException("Consentimento SHARE_RESALE_DOSSIER é obrigatório para compartilhar dossiê");
        }
        ShareLink link = ShareLink.builder()
            .vehicleId(vehicle.getId())
            .userId(user.getId())
            .token(generateToken())
            .status(ShareLinkStatus.ACTIVE)
            .expiresAt(request.expiresAt())
            .allowedSections(request.allowedSections() == null || request.allowedSections().isEmpty() ? List.of("vehicle", "maintenance", "documents") : request.allowedSections())
            .publicTitle(request.publicTitle().trim())
            .build();
        repository.save(link);
        auditLogService.record(user.getId(), user.getOrganizationId(), "ShareLink", link.getId(), AuditAction.SHARE_LINK_CREATED);
        return ShareLinkResponse.from(link);
    }

    @Transactional(readOnly = true)
    public List<ShareLinkResponse> list(User user, UUID vehicleId) {
        vehicleService.getOwnedVehicle(user, vehicleId);
        return repository.findByVehicleIdAndUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(vehicleId, user.getId())
            .stream()
            .map(ShareLinkResponse::from)
            .toList();
    }

    @Transactional
    public void revoke(User user, UUID vehicleId, UUID shareLinkId) {
        ShareLink link = repository.findByIdAndVehicleIdAndUserIdAndDeletedAtIsNull(shareLinkId, vehicleId, user.getId())
            .orElseThrow(() -> new ResourceNotFoundException("Link de compartilhamento não encontrado"));
        link.setStatus(ShareLinkStatus.REVOKED);
        link.setRevokedAt(Instant.now());
        auditLogService.record(user.getId(), user.getOrganizationId(), "ShareLink", link.getId(), AuditAction.SHARE_LINK_REVOKED);
    }

    @Transactional
    public PublicShareLinkResponse publicView(String token) {
        if (!properties.getFeatures().isPublicShareLink()) {
            throw new ResourceNotFoundException("Link público não encontrado");
        }
        ShareLink link = repository.findByTokenAndDeletedAtIsNull(token)
            .orElseThrow(() -> new ResourceNotFoundException("Link público não encontrado"));
        if (link.getStatus() != ShareLinkStatus.ACTIVE) {
            throw new ResourceNotFoundException("Link público não está ativo");
        }
        if (link.getExpiresAt() != null && link.getExpiresAt().isBefore(Instant.now())) {
            link.setStatus(ShareLinkStatus.EXPIRED);
            throw new ResourceNotFoundException("Link público expirado");
        }
        userRepository.findById(link.getUserId())
            .filter(owner -> !owner.isDeleted())
            .filter(owner -> owner.getStatus() == UserStatus.ACTIVE)
            .orElseThrow(() -> {
                link.setStatus(ShareLinkStatus.REVOKED);
                link.setRevokedAt(Instant.now());
                return new ResourceNotFoundException("Link público não encontrado");
            });
        Vehicle vehicle = vehicleService.getPublicVehicle(link.getVehicleId());
        link.setLastAccessedAt(Instant.now());
        auditLogService.record(link.getUserId(), null, "ShareLink", link.getId(), AuditAction.SHARE_LINK_ACCESSED);
        return new PublicShareLinkResponse(link.getPublicTitle(), link.getAllowedSections(), PublicVehicleResponse.from(vehicle));
    }

    @Transactional
    public void adminRevoke(UUID shareLinkId) {
        ShareLink link = repository.findById(shareLinkId)
            .filter(candidate -> !candidate.isDeleted())
            .orElseThrow(() -> new ResourceNotFoundException("Link de compartilhamento não encontrado"));
        link.setStatus(ShareLinkStatus.REVOKED);
        link.setRevokedAt(Instant.now());
    }

    private String generateToken() {
        byte[] random = new byte[32];
        secureRandom.nextBytes(random);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    }
}

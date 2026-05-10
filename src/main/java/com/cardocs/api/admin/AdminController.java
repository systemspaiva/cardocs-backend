package com.cardocs.api.admin;

import com.cardocs.api.audit.AuditLogResponse;
import com.cardocs.api.documents.VehicleDocumentResponse;
import com.cardocs.api.security.CurrentUserService;
import com.cardocs.api.users.UserResponse;
import com.cardocs.api.vehicles.VehicleResponse;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/admin")
public class AdminController {

    private final AdminService adminService;
    private final CurrentUserService currentUserService;

    @GetMapping("/users")
    Page<UserResponse> users(Pageable pageable) {
        return adminService.users(currentUserService.getCurrentUser(), pageable);
    }

    @GetMapping("/users/{userId}")
    UserResponse user(@PathVariable UUID userId) {
        return adminService.user(currentUserService.getCurrentUser(), userId);
    }

    @GetMapping("/users/{userId}/vehicles")
    List<VehicleResponse> userVehicles(@PathVariable UUID userId) {
        return adminService.userVehicles(currentUserService.getCurrentUser(), userId);
    }

    @GetMapping("/audit-logs")
    Page<AuditLogResponse> auditLogs(Pageable pageable) {
        return adminService.auditLogs(currentUserService.getCurrentUser(), pageable);
    }

    @GetMapping("/ocr-jobs")
    Page<VehicleDocumentResponse> ocrJobs(Pageable pageable) {
        return adminService.ocrJobs(currentUserService.getCurrentUser(), pageable);
    }

    @PostMapping("/ocr-jobs/{jobId}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void retryOcr(@PathVariable UUID jobId) {
        adminService.retryOcr(currentUserService.getCurrentUser(), jobId);
    }

    @PostMapping("/share-links/{shareLinkId}/revoke")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeShareLink(@PathVariable UUID shareLinkId) {
        adminService.revokeShareLink(currentUserService.getCurrentUser(), shareLinkId);
    }
}

package com.cardocs.api.users;

import com.cardocs.api.exports.DataExportResponse;
import com.cardocs.api.exports.ExportService;
import com.cardocs.api.security.CurrentUserService;
import com.cardocs.api.storage.PresignedUrlResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/privacy")
public class PrivacyController {

    private final ExportService exportService;
    private final UserAccountService userAccountService;
    private final CurrentUserService currentUserService;

    @GetMapping("/export/{exportId}")
    DataExportResponse getExport(@PathVariable UUID exportId) {
        return exportService.getDataExport(currentUserService.getCurrentUser(), exportId);
    }

    @GetMapping("/export/{exportId}/download-url")
    PresignedUrlResponse exportDownloadUrl(@PathVariable UUID exportId) {
        return exportService.dataExportDownloadUrl(currentUserService.getCurrentUser(), exportId);
    }

    @GetMapping("/export")
    Page<DataExportResponse> listExports(Pageable pageable) {
        return exportService.listDataExports(currentUserService.getCurrentUser(), pageable);
    }

    @PostMapping("/export")
    @ResponseStatus(HttpStatus.CREATED)
    DataExportResponse requestExport() {
        return exportService.requestDataExport(currentUserService.getCurrentUser());
    }

    @DeleteMapping("/account")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteAccount() {
        userAccountService.deleteCurrentAccount(currentUserService.getCurrentUser());
    }
}

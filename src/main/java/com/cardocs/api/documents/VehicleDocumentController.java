package com.cardocs.api.documents;

import com.cardocs.api.security.CurrentUserService;
import com.cardocs.api.storage.PresignedUrlResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/vehicles/{vehicleId}/documents")
public class VehicleDocumentController {

    private final VehicleDocumentService documentService;
    private final CurrentUserService currentUserService;

    @PostMapping("/upload-url")
    @ResponseStatus(HttpStatus.CREATED)
    DocumentUploadUrlResponse uploadUrl(@PathVariable UUID vehicleId, @Valid @RequestBody CreateUploadUrlRequest request) {
        return documentService.createUploadUrl(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    VehicleDocumentResponse create(@PathVariable UUID vehicleId, @Valid @RequestBody CreateVehicleDocumentRequest request) {
        return documentService.create(currentUserService.getCurrentUser(), vehicleId, request);
    }

    @GetMapping
    List<VehicleDocumentResponse> list(@PathVariable UUID vehicleId) {
        return documentService.list(currentUserService.getCurrentUser(), vehicleId);
    }

    @GetMapping("/{documentId}")
    VehicleDocumentResponse get(@PathVariable UUID vehicleId, @PathVariable UUID documentId) {
        return documentService.get(currentUserService.getCurrentUser(), vehicleId, documentId);
    }

    @GetMapping("/{documentId}/download-url")
    PresignedUrlResponse downloadUrl(@PathVariable UUID vehicleId, @PathVariable UUID documentId) {
        return documentService.downloadUrl(currentUserService.getCurrentUser(), vehicleId, documentId);
    }

    @DeleteMapping("/{documentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID vehicleId, @PathVariable UUID documentId) {
        documentService.delete(currentUserService.getCurrentUser(), vehicleId, documentId);
    }

    @PostMapping("/{documentId}/ocr")
    VehicleDocumentResponse ocr(@PathVariable UUID vehicleId, @PathVariable UUID documentId) {
        return documentService.enqueueOcr(currentUserService.getCurrentUser(), vehicleId, documentId);
    }

    @PutMapping("/{documentId}/review")
    VehicleDocumentResponse review(@PathVariable UUID vehicleId, @PathVariable UUID documentId, @Valid @RequestBody ReviewDocumentRequest request) {
        return documentService.review(currentUserService.getCurrentUser(), vehicleId, documentId, request);
    }
}

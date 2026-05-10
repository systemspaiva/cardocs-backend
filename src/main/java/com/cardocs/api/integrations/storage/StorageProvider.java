package com.cardocs.api.integrations.storage;

import com.cardocs.api.storage.PresignedUrlResponse;
import java.util.UUID;

public interface StorageProvider {
    PresignedUrlResponse createUploadUrl(UUID userId, UUID vehicleId, UUID documentId, String fileName, String contentType, long fileSize);

    PresignedUrlResponse createDownloadUrl(String storageKey);
}

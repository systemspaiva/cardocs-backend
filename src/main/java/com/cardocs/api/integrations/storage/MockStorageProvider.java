package com.cardocs.api.integrations.storage;

import com.cardocs.api.storage.PresignedUrlResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "storage", havingValue = "mock", matchIfMissing = true)
public class MockStorageProvider implements StorageProvider {

    @Override
    public PresignedUrlResponse createUploadUrl(UUID userId, UUID vehicleId, UUID documentId, String fileName, String contentType, long fileSize) {
        String safeFileName = URLEncoder.encode(fileName.replaceAll("[/\\\\]", "-"), StandardCharsets.UTF_8);
        String storageKey = "mock/users/%s/vehicles/%s/documents/%s/%s".formatted(userId, vehicleId, documentId, safeFileName);
        return new PresignedUrlResponse("http://localhost:8080/mock-storage/upload/" + storageKey, storageKey, Instant.now().plusSeconds(900));
    }

    @Override
    public PresignedUrlResponse createDownloadUrl(String storageKey) {
        return new PresignedUrlResponse("http://localhost:8080/mock-storage/download/" + storageKey, storageKey, Instant.now().plusSeconds(900));
    }
}

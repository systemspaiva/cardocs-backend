package com.cardocs.api.integrations.storage;

import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.config.AppProperties;
import com.cardocs.api.storage.PresignedUrlResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "cardocs.providers", name = "storage", havingValue = "s3", matchIfMissing = true)
public class S3StorageProvider implements StorageProvider {

    private static final Duration URL_TTL = Duration.ofMinutes(15);

    private final AppProperties properties;
    private final S3Presigner s3Presigner;

    @Override
    public PresignedUrlResponse createUploadUrl(
        UUID userId,
        UUID vehicleId,
        UUID documentId,
        String fileName,
        String contentType,
        long fileSize
    ) {
        validateStorageConfig();
        validateContent(contentType, fileSize);
        String storageKey = buildStorageKey(userId, vehicleId, documentId, fileName);
        PutObjectRequest objectRequest = PutObjectRequest.builder()
            .bucket(properties.getAws().getS3Bucket())
            .key(storageKey)
            .contentType(contentType)
            .contentLength(fileSize)
            .build();
        var presignRequest = PutObjectPresignRequest.builder()
            .signatureDuration(URL_TTL)
            .putObjectRequest(objectRequest)
            .build();
        return new PresignedUrlResponse(s3Presigner.presignPutObject(presignRequest).url().toString(), storageKey, Instant.now().plus(URL_TTL));
    }

    @Override
    public PresignedUrlResponse createDownloadUrl(String storageKey) {
        validateStorageConfig();
        GetObjectRequest objectRequest = GetObjectRequest.builder()
            .bucket(properties.getAws().getS3Bucket())
            .key(storageKey)
            .build();
        var presignRequest = GetObjectPresignRequest.builder()
            .signatureDuration(URL_TTL)
            .getObjectRequest(objectRequest)
            .build();
        return new PresignedUrlResponse(s3Presigner.presignGetObject(presignRequest).url().toString(), storageKey, Instant.now().plus(URL_TTL));
    }

    private void validateContent(String contentType, long fileSize) {
        if (!properties.getStorage().getAllowedContentTypes().contains(contentType)) {
            throw new BadRequestException("Content-Type não permitido");
        }
        if (fileSize <= 0 || fileSize > properties.getStorage().getMaxDocumentSizeBytes()) {
            throw new BadRequestException("Tamanho de arquivo inválido");
        }
    }

    private void validateStorageConfig() {
        if (properties.getAws().getS3Bucket() == null || properties.getAws().getS3Bucket().isBlank()) {
            throw new BadRequestException("AWS_S3_BUCKET não configurado");
        }
    }

    private String buildStorageKey(UUID userId, UUID vehicleId, UUID documentId, String fileName) {
        String safeFileName = URLEncoder.encode(fileName.replaceAll("[/\\\\]", "-"), StandardCharsets.UTF_8);
        return "users/%s/vehicles/%s/documents/%s/%s".formatted(userId, vehicleId, documentId, safeFileName);
    }
}

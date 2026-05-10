package com.cardocs.api.documents;

import com.cardocs.api.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.Map;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "vehicle_documents")
public class VehicleDocument extends BaseEntity {

    @Column(name = "vehicle_id", nullable = false)
    private UUID vehicleId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentType type;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "storage_key", nullable = false)
    private String storageKey;

    @Column(name = "storage_bucket")
    private String storageBucket;

    @Enumerated(EnumType.STRING)
    @Column(name = "ocr_status", nullable = false)
    private OcrStatus ocrStatus;

    @Column(name = "ocr_raw_text", columnDefinition = "text")
    private String ocrRawText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ocr_structured_data", columnDefinition = "jsonb")
    private Map<String, Object> ocrStructuredData;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reviewed_data", columnDefinition = "jsonb")
    private Map<String, Object> reviewedData;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false)
    private ReviewStatus reviewStatus;
}

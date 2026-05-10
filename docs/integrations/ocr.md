# OCR Integration

Documents use `OcrProvider` for OCR. The default provider is `MockOcrProvider`.

## Flow

1. User creates document metadata or requests an upload URL.
2. User triggers OCR with `POST /vehicles/{vehicleId}/documents/{documentId}/ocr`.
3. API marks the document as `PENDING` and sends an `OcrJobPayload` to `ocr-processing-queue`.
4. A worker can call `OcrJobService.process`.
5. The provider returns raw text and structured data.
6. The document moves to `REVIEW_REQUIRED` or `COMPLETED`.
7. User reviews extracted data through `PUT /vehicles/{vehicleId}/documents/{documentId}/review`.

## Future AWS Textract

`AwsTextractOcrProvider` is a placeholder contract. Enable it only after AWS credentials are managed outside the codebase and document-processing consent is confirmed.

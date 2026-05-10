# Storage Integration

Storage is abstracted through `StorageProvider`. Local/MVP defaults to `MockStorageProvider`; production can enable `S3StorageProvider`.

## S3 Key Format

```text
users/{userId}/vehicles/{vehicleId}/documents/{documentId}/{filename}
```

## Rules

- Buckets must not be public.
- The API returns temporary presigned URLs only.
- Credentials are never hardcoded.
- Production should use IAM Role based credentials.
- Local development may use LocalStack with dummy credentials.

Required env vars:

```env
AWS_REGION=sa-east-1
AWS_S3_BUCKET=
STORAGE_PROVIDER=mock
```

Set `STORAGE_PROVIDER=s3` only in an environment with IAM Role or approved non-hardcoded credentials.

# AWS Notes

CarDocs prepares AWS S3 and SQS integrations, but the MVP does not require real AWS credentials to compile.

## Required Services

- S3 for documents, PDFs, and data exports.
- SQS for OCR, PDF export, and data export queues.
- CloudWatch for application logs in deployed environments.
- Secrets Manager or Parameter Store for production secrets.

## Environment

```env
AWS_REGION=sa-east-1
AWS_S3_BUCKET=
AWS_SQS_OCR_QUEUE_URL=
AWS_SQS_PDF_EXPORT_QUEUE_URL=
AWS_SQS_DATA_EXPORT_QUEUE_URL=
```

Local defaults use `QUEUE_PROVIDER=mock` and `STORAGE_PROVIDER=mock`, so local development does not call AWS. Set `QUEUE_PROVIDER=sqs` and `STORAGE_PROVIDER=s3` only in environments where AWS access is approved and configured through the runtime environment. If an SQS queue URL is blank while `QUEUE_PROVIDER=sqs`, the API fails the request explicitly instead of accepting a job that cannot be delivered.

## LocalStack

`docker-compose.yml` includes LocalStack for local S3/SQS parity. Use dummy AWS credentials locally. Do not use real AWS secrets in `.env`, source code, docs, or commits.

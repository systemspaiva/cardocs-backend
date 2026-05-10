# CarDocs Backend Architecture

CarDocs Backend is a Java 21 Spring Boot 3 API organized by business capability under `com.cardocs.api`. The MVP keeps external systems behind provider interfaces so official integrations can be enabled later without changing application services.

## Local Run

1. Start dependencies:

```bash
docker compose up -d postgres localstack
```

2. Export local environment values from `.env.example`, especially database and JWT settings.

3. Run the API:

```bash
gradle bootRun
```

The API uses Flyway migrations from `src/main/resources/db/migration`.

## Modules

- `auth`, `security`, `users`: registration, login, JWT, profile, account deletion.
- `vehicles`: vehicle CRUD, ownership validation, timeline.
- `documents`: metadata, presigned S3 URLs, OCR status, manual review.
- `maintenance`, `reminders`, `sharelinks`, `exports`: vehicle lifecycle features.
- `consents`, `audit`: LGPD consent and sensitive action audit trail.
- `integrations`: provider interfaces and MVP implementations for S3, SQS, OCR, notifications, and vehicle registry lookup.

## Security Model

All private routes require JWT authentication. Controllers resolve the authenticated user through `CurrentUserService`, and services validate ownership before reading or mutating resources. Admin routes under `/admin/**` require `ADMIN` or `SUPPORT`.

## Provider Strategy

External services are selected through environment-backed properties:

- `VEHICLE_REGISTRY_PROVIDER=mock`
- `OCR_PROVIDER=mock`
- `STORAGE_PROVIDER=mock`
- `QUEUE_PROVIDER=mock`
- `NOTIFICATION_PROVIDER=mock`

Real integrations must be added as new provider implementations and activated by configuration after contract, credentials, and legal requirements are ready.

## Feature Flags

- `FEATURE_VEHICLE_REGISTRY_INTEGRATION` gates `POST /vehicles/lookup-by-plate`.
- `FEATURE_OCR_INTEGRATION` gates OCR queueing.
- `FEATURE_PUBLIC_SHARE_LINK` gates public dossier creation and public reads.
- `FEATURE_NOTIFICATIONS` is reserved for real notification delivery; the mock provider only logs intent.

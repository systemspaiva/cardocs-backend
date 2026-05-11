# CarDocs Backend

Spring Boot Kotlin backend for the CarDocs iOS app, using AWS as the project platform.

## Scope

This backend replaces the current mocked iOS repository with real HTTP endpoints, DynamoDB persistence, Docker packaging, Terraform for AWS resources, and CarsXE vehicle image lookup.

No SQL database is used. There is no Postgres, JDBC persistence, Flyway migration, Firebase, or Firestore.

## AWS Runtime

The backend uses the AWS SDK default credentials chain. In ECS/Fargate it should run with the task role created by Terraform. For local development, use a normal AWS profile or environment credentials:

```bash
export AWS_REGION=us-east-1
export CARDOCS_DYNAMODB_TABLE=cardocs-develop
export CARDOCS_COGNITO_REGION=us-east-1
export CARDOCS_COGNITO_USER_POOL_ID=<develop-user-pool-id>
export CARDOCS_COGNITO_APP_CLIENT_ID=<develop-app-client-id>
```

Do not commit AWS keys, service credentials, or CarsXE keys.

Protected API endpoints fail closed unless `CARDOCS_API_KEY` or Cognito are configured. Server-side clients can send `X-CarDocs-Api-Key` plus `X-CarDocs-Owner-Id`; the iOS app signs in through `/v1/auth/*`, sends `Authorization: Bearer <accessToken>`, and the backend uses the Cognito `sub` claim as the owner id. `/v1/health`, `/v1/auth/*`, and public report URLs stay public.

DynamoDB single-table layout:

```text
PK = OWNER#{ownerId}
SK = VEHICLE#{vehicleId}
SK = VEHICLE#{vehicleId}#MAINT#{recordId}
SK = VEHICLE#{vehicleId}#DOC#{documentId}
SK = VEHICLE#{vehicleId}#PART#{partId}
SK = VEHICLE#{vehicleId}#DOSSIER#current
SK = DRAFT#{draftId}

PK = PUBLIC_REPORTS
SK = REPORT#{slug}

PK = VEHICLE_IMAGE_CACHE
SK = LOOKUP#{normalizedBrand}|{normalizedModel}|{normalizedYear}
```

## CarsXE Images

Vehicle image lookup uses the CarsXE Vehicle Images API. Configure the key only through environment or AWS Secrets Manager:

```bash
export CARSXE_API_KEY=your-carsxe-key
```

The backend sends `make`, `model`, and `year` to CarsXE. Every parsed CarsXE response is persisted in DynamoDB under `VEHICLE_IMAGE_CACHE`; future lookups check this cache before calling CarsXE again. Cold misses create a short DynamoDB reservation before the external request so concurrent identical lookups do not duplicate CarsXE calls. Vehicle registration stores the selected cached or fresh image on the vehicle profile.

## Local Run

```bash
cd backend
./gradlew bootRun
```

or with Docker:

```bash
cd backend
docker build -t cardocs-backend .
docker run --rm -p 8080:8080 \
  -e AWS_REGION="$AWS_REGION" \
  -e CARDOCS_DYNAMODB_TABLE="$CARDOCS_DYNAMODB_TABLE" \
  -e CARSXE_API_KEY="$CARSXE_API_KEY" \
  cardocs-backend
```

API health:

```bash
curl http://localhost:8080/v1/health
```

Owner-scoped endpoints require:

```http
X-CarDocs-Api-Key: <configured-cardocs-api-key>
X-CarDocs-Owner-Id: <stable-user-or-device-id>
```

Mobile clients should use Cognito-backed auth instead:

```http
POST /v1/auth/sign-up
POST /v1/auth/confirm-sign-up
POST /v1/auth/resend-sign-up-code
POST /v1/auth/sign-in
POST /v1/auth/refresh
POST /v1/auth/sign-out
Authorization: Bearer <cognito-access-token>
```

`POST /v1/vehicles/image` and other non-public endpoints also require `X-CarDocs-Api-Key` so public traffic cannot burn CarsXE quota.

## API

```http
GET /v1/health
POST /v1/auth/sign-up
POST /v1/auth/confirm-sign-up
POST /v1/auth/resend-sign-up-code
POST /v1/auth/sign-in
POST /v1/auth/refresh
POST /v1/auth/sign-out
GET /v1/dashboard
POST /v1/vehicles/plate-lookup
POST /v1/vehicles/image
POST /v1/vehicles
POST /v1/invoices/analyze
POST /v1/invoices
POST /v1/resale-dossiers
GET /v1/public/reports/{slug}
```

Vehicle image lookup:

```bash
curl -X POST http://localhost:8080/v1/vehicles/image \
  -H 'content-type: application/json' \
  -H 'X-CarDocs-Api-Key: <configured-cardocs-api-key>' \
  -d '{"brand":"Toyota","model":"Tacoma","year":"2018"}'
```

Vehicle registration:

```bash
curl -X POST http://localhost:8080/v1/vehicles \
  -H 'content-type: application/json' \
  -H 'X-CarDocs-Api-Key: <configured-cardocs-api-key>' \
  -H 'X-CarDocs-Owner-Id: local-device' \
  -d '{
    "candidate": {
      "id": "00000000-0000-0000-0000-000000000001",
      "kind": "car",
      "plate": "ABC1D23",
      "brand": "Toyota",
      "model": "Tacoma",
      "year": "2018",
      "color": "Blue"
    },
    "initialMileage": 24500
  }'
```

Saving an invoice requires `vehicleID` so records do not fall back to the wrong vehicle in multi-vehicle garages.
Local placeholder providers for plate lookup and OCR/IA return validation errors until real providers are wired; they do not create data that can be persisted in DynamoDB.

## Architecture

- `domain`: business models and deterministic factories.
- `application`: use cases and ports.
- `infrastructure/aws`: AWS SDK configuration, DynamoDB persistence, and CarsXE response cache.
- `infrastructure/provider`: cached CarsXE image provider and local adapters.
- `interfaces/http`: controllers, DTOs, JSON mapping, and error handling.

## Terraform

Terraform lives in `backend/terraform` and defines AWS resources:

- ECR repository
- DynamoDB single-table persistence
- S3 bucket reserved for uploads
- ECS/Fargate service
- API Gateway HTTP API with VPC Link
- ALB and target group behind API Gateway
- CloudWatch log group
- IAM roles/policies
- optional Secrets Manager injection for `CARSXE_API_KEY`
- required Secrets Manager injection for `CARDOCS_API_KEY` on protected endpoints
- Cognito User Pool and app client for native mobile authentication

The public HTTPS entrypoint is `terraform output api_base_url`. The ALB only accepts traffic from the API Gateway VPC Link security group.

Validation:

```bash
cd backend/terraform
terraform init
terraform fmt -check
terraform validate
```

No production deployment should happen without the Git Flow approval required by the repository instructions.

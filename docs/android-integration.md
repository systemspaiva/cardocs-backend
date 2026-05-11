# CarDocs Android API Integration

Base URL for develop:

```text
https://9xxh8yz8ce.execute-api.us-east-1.amazonaws.com
```

Swagger:

```text
GET /v1/swagger
GET /v1/swagger/api-docs
GET /v1/swagger/api-docs.yaml
```

Android must use Cognito-backed auth through the backend. Do not ship `X-CarDocs-Api-Key` in the app.

## Auth Flow

Sign up:

```http
POST /v1/auth/sign-up
Content-Type: application/json
```

```json
{
  "name": "Gabriel Paiva",
  "email": "gabriel@example.com",
  "password": "minimum6"
}
```

Confirm sign up:

```http
POST /v1/auth/confirm-sign-up
Content-Type: application/json
```

```json
{
  "email": "gabriel@example.com",
  "code": "123456"
}
```

Resend confirmation code:

```http
POST /v1/auth/resend-sign-up-code
Content-Type: application/json
```

```json
{
  "email": "gabriel@example.com"
}
```

Sign in:

```http
POST /v1/auth/sign-in
Content-Type: application/json
```

```json
{
  "email": "gabriel@example.com",
  "password": "minimum6"
}
```

Successful auth returns:

```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "email": "gabriel@example.com",
  "displayName": "Gabriel Paiva",
  "accessToken": "<jwt>",
  "idToken": "<jwt>",
  "refreshToken": "<refresh-token>",
  "expiresAt": "2026-05-11T12:00:00Z"
}
```

Store the refresh token securely on device. Send the access token on protected endpoints:

```http
Authorization: Bearer <accessToken>
```

Refresh:

```http
POST /v1/auth/refresh
Content-Type: application/json
```

```json
{
  "refreshToken": "<refresh-token>"
}
```

Sign out:

```http
POST /v1/auth/sign-out
Authorization: Bearer <accessToken>
```

## Endpoints

Public:

```http
GET /v1/health
GET /v1/public/reports/{slug}
```

Protected with `Authorization: Bearer <accessToken>`:

```http
GET /v1/dashboard
POST /v1/vehicles/plate-lookup
POST /v1/vehicles/image
POST /v1/vehicles
POST /v1/invoices/analyze
POST /v1/invoices
POST /v1/resale-dossiers
```

Dashboard:

```http
GET /v1/dashboard
Authorization: Bearer <accessToken>
```

Vehicle image lookup:

```http
POST /v1/vehicles/image
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "brand": "Toyota",
  "model": "Corolla",
  "year": "2020"
}
```

Vehicle registration:

```http
POST /v1/vehicles
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "candidate": {
    "id": "00000000-0000-0000-0000-000000000001",
    "kind": "car",
    "plate": "ABC1D23",
    "brand": "Toyota",
    "model": "Corolla",
    "year": "2020",
    "color": "Prata",
    "image": null
  },
  "initialMileage": 24500
}
```

Save invoice:

```http
POST /v1/invoices
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "vehicleID": "00000000-0000-0000-0000-000000000001",
  "draft": {
    "id": "00000000-0000-0000-0000-000000000002",
    "source": "s3://bucket/key.pdf",
    "supplierName": "Oficina Central",
    "serviceTitle": "Troca de óleo",
    "category": "maintenance",
    "date": "2026-05-11",
    "amount": 350.0,
    "mileage": 24500,
    "confidence": 95,
    "extractedFields": [],
    "healthImpacts": []
  }
}
```

Generate resale dossier:

```http
POST /v1/resale-dossiers
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "vehicleID": "00000000-0000-0000-0000-000000000001"
}
```

## Current Provider Status

`POST /v1/vehicles/plate-lookup` validates the plate format, but the real plate provider is not wired yet and returns a validation error.

`POST /v1/invoices/analyze` is reserved for real OCR/AI integration and currently returns a validation error until the provider is configured.

Vehicle image lookup is backend-side only. The app sends brand, model, and year; the backend calls the configured image provider and caches the response.

## Error Format

Errors return JSON:

```json
{
  "error": "validation_error",
  "message": "Descrição do erro."
}
```

Common statuses:

```text
400 validation_error
401 unauthorized
404 not_found
503 provider_unavailable
```

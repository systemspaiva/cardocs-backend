# LGPD

The backend includes the base structures needed for LGPD-oriented flows.

## Consent

Consent records live in `consent_records` and are exposed through:

- `GET /consents`
- `POST /consents`
- `PUT /consents/{consentId}/revoke`

`SHARE_RESALE_DOSSIER` consent is required before creating public share links.
`DOCUMENT_STORAGE` consent is required before registering document metadata or generating upload URLs.
`OCR_PROCESSING` consent is required before queueing OCR.

## Data Export

Users can request asynchronous data export:

- `POST /privacy/export`
- `GET /privacy/export`
- `GET /privacy/export/{exportId}`
- `GET /privacy/export/{exportId}/download-url`

The MVP creates a `DataExportRequest` and sends a logical message to `data-export-queue`. The included worker service is mock-oriented and writes the future storage key; production export must replace that worker with one that collects the user's records, writes JSON or ZIP to storage, and marks the request as completed only after storage succeeds.

## Account Deletion

`DELETE /privacy/account` revokes public share links, soft-deletes user-owned MVP records, revokes consent records, anonymizes basic user PII, marks the user as deleted, and records an audit event. Services should keep filtering by authenticated owner and `deleted_at is null`.

## Audit

Sensitive actions are persisted in `audit_logs`, including consent changes, account deletion, document operations, OCR processing, public share link access, and admin actions.

# Firebase migration audit

## Objective checklist

- Backend Node.js/Express deployable directly on Cloud Run without Firebase Hosting rewrites: local artifact ready.
- Firebase Functions removed from backend runtime and deploy config: local artifact ready.
- Firestore as operational database: local artifact ready.
- iOS app configured with Firebase SDK: local artifact ready.
- iOS app entrypoint wired to remote Firebase repositories; old mock repositories removed from target and filesystem.
- Email/password auth: code ready; remote Firebase Auth provider enabled.
- Apple auth: code and entitlement ready; remote Firebase Auth provider enabled.
- Google auth: code ready; remote OAuth/client config not present.
- No service account or local secret committed: guarded by `.gitignore`, `.dockerignore`, `.gcloudignore`, `check:no-sensitive-files`, and current workspace scan.
- No direct Mercado Livre calls: local artifact ready.
- No fake data persisted to Firestore: provider-dependent flows fail closed unless real data is supplied; invoice analysis and invoice save both fail closed until a real OCR/IA provider is configured; manual vehicle registration was removed, and vehicle registration now revalidates the plate through the backend provider before saving.
- Public report slugs include a vehicle-specific suffix, avoiding global overwrite by plate alone.
- Deploy script requires `CARDOCS_ALLOW_DEPLOY=1`, `CARDOCS_DEPLOY_TARGET=develop`, and an explicit `FIREBASE_PROJECT_ID`.

## Prompt-to-artifact completion audit

| Requirement | Artifact/evidence | Current status |
| --- | --- | --- |
| Recreate backend in a stack that can be reached without Firebase Hosting | `firebase.json` has no `hosting` block; `package.json` exposes only `deploy:run`; `Dockerfile` builds the Node app; `src/index.ts` listens on `process.env.PORT`; the iOS `CARDOCS_API_BASE_URL` points directly to `https://cardocs-backend-5qq5b33fha-rj.a.run.app`. | Local artifact ready; Cloud Run service responds to `/v1/health`. |
| Do not use Firebase Functions | `firebase.json` has no `functions` block; `package.json` has no `firebase-functions`; `check:firebase-local` reports `FIREBASE_FUNCTIONS_REMOVED=ok` and `NODE_NO_FIREBASE_FUNCTIONS_DEPENDENCY=ok`. | Ready. |
| Use Firestore as database | `src/infrastructure/firebaseGarageRepository.ts` stores under `users/{uid}/vehicles` and `publicReports`; `firestore.rules` denies client direct read/write; Admin SDK is used server-side. | Ready locally; rules still require deploy. |
| Use Firebase project config for iOS | `cardocs/GoogleService-Info.plist` is included in the iOS target; `cardocsApp.swift` calls `FirebaseApp.configure()`. | Ready for Firebase core; Google OAuth fields missing remotely. |
| Use Firebase auth in iOS app | `ContentView.swift` wires `RemoteAuthRepository` and `RemoteVehicleRepository`; `MockAuthRepository.swift` and `MockVehicleRepository.swift` were removed. | Ready locally. |
| Support email/password login | `RemoteAuthRepository.swift` uses Firebase Auth email sign-in/sign-up; remote readiness reports `AUTH_EMAIL_PASSWORD=enabled`. | Ready. |
| Support Apple ID login | `RemoteAuthRepository.swift` uses `OAuthProvider.appleCredential`; `cardocs.entitlements` enables Sign in with Apple; remote readiness reports `AUTH_APPLE_COM=enabled`. | Ready for native Apple login; Apple code flow private-key config not set, not needed for native-only sign-in. |
| Support Google login | `RemoteAuthRepository.swift` uses GoogleSignIn and `GoogleAuthProvider`; readiness reports `AUTH_GOOGLE_COM=missing`, `CLIENT_ID=missing`, and `REVERSED_CLIENT_ID=missing`. | Blocked by missing Google OAuth client ID/secret. |
| Use backend service account safely | Scripts accept `GOOGLE_APPLICATION_CREDENTIALS` path; secret file patterns are ignored by `.gitignore`, `.dockerignore`, and `.gcloudignore`; `check:no-sensitive-files` scans both repos for service account/private key artifacts; scripts print presence/status only. | Ready locally; credentials not committed. |
| No Mercado Livre direct calls | `check:firebase-local` scans active backend source and reports `BACKEND_NO_LEGACY_PROVIDER_REFERENCES=ok`. | Ready. |
| No fake data saved in DB | Provider-dependent flows fail closed, including invoice save; vehicle registration accepts only plate and mileage, then revalidates the plate through the backend provider before saving; `check:firebase-local` reports `API_PROVIDER_CALLS_FAIL_CLOSED=ok` and `API_VEHICLE_REGISTRATION_REVALIDATES_PLATE=ok`. | Ready locally. |
| Final deploy readiness | `check:firebase-deploy-readiness` checks Service Usage and Cloud Run service existence. | Requires service-account credentials for the script; the active `gcloud` account can describe the current Cloud Run URL. |

## Local gates

Run from the backend repo:

```bash
npm run verify:local
```

Expected result: TypeScript build passes, every `check:firebase-local` item is `ok`, `/v1/health` responds from the local Node server, and an invalid dashboard token returns `401`.

Run from the iOS repo:

```bash
sh scripts/check-firebase-ios-config.sh
```

Current result is expected to fail until Google OAuth is configured remotely:

```text
CLIENT_ID=missing
REVERSED_CLIENT_ID=missing
GOOGLE_URL_SCHEME=skipped_missing_REVERSED_CLIENT_ID
```

## Remote gate

Run from the backend repo with a local service account path outside the repository:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-readiness
```

Final completion gate:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run verify:migration
```

The migration is complete only when this final gate exits successfully.

Current blocking result after applying the safe remote Auth changes:

```text
REMOTE_IOS_CLIENT_ID=missing
REMOTE_IOS_REVERSED_CLIENT_ID=missing
AUTH_EMAIL_PASSWORD=enabled
AUTH_GOOGLE_COM=missing
AUTH_APPLE_COM=enabled
```

Cloud Run direct health check:

```bash
curl -fsS https://cardocs-backend-5qq5b33fha-rj.a.run.app/v1/health
```

Expected result:

```json
{"status":"UP","runtime":"node"}
```

## External work required

The objective is not complete until the remote gate passes.

Required remote actions:

1. Configure Firebase Auth Google provider with valid OAuth client data.
2. Confirm Cloud Run API / required permissions for project `cardocs-app`.
3. Deploy the Node backend to Cloud Run service `cardocs-backend` in `southamerica-east1`, only after the Git Flow approval gate:

```bash
export FIREBASE_PROJECT_ID="cardocs-app"
export CARDOCS_ALLOW_DEPLOY=1
export CARDOCS_DEPLOY_TARGET=develop
npm run deploy:run
```

4. Refresh the iOS Firebase config:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run refresh:ios-config -- --apply
```

5. In the iOS repo, apply and validate the Google callback scheme:

```bash
sh scripts/apply-google-url-scheme.sh
sh scripts/check-firebase-ios-config.sh
```

6. Re-run:

```bash
npm run verify:local
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-deploy-readiness
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-readiness
```

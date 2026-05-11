# CarDocs Node Backend

Backend Node.js/Express para o app iOS CarDocs, publicado pela URL do Firebase Hosting via rewrite para Cloud Run. Não usa Firebase Functions.

## Stack Atual

- Firebase Hosting como entrada HTTPS (`cardocs-app.web.app`).
- Cloud Run rodando o processo Node.js/Express `cardocs-backend`.
- Firebase Auth para autenticação do app iOS.
- Firestore como banco de dados operacional.

O backend legado Spring/Kotlin foi removido deste projeto para evitar dois caminhos concorrentes de runtime e deploy.

## Credenciais

Não copie, versione ou cole conteúdo de service account no projeto.

Para rodar localmente com Admin SDK, aponte `GOOGLE_APPLICATION_CREDENTIALS` para o JSON local fornecido fora do repositório:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json"
```

Em Cloud Run, o Admin SDK usa as credenciais gerenciadas do ambiente Google Cloud/Firebase.

## Estrutura

```text
firebase.json
.firebaserc
Dockerfile
src/
  application/
  domain/
  infrastructure/
  interfaces/http/
scripts/
public/
```

Rotas principais:

```http
GET  /v1/health
GET  /v1/dashboard
POST /v1/vehicles/plate-lookup
POST /v1/vehicles/image
POST /v1/vehicles
POST /v1/invoices/analyze
POST /v1/invoices
POST /v1/resale-dossiers
GET  /v1/public/reports/{slug}
GET  /r/{slug}
```

Todas as rotas privadas exigem:

```http
Authorization: Bearer <Firebase ID token>
```

`plate-lookup`, `vehicles/image`, `invoices/analyze` e `invoices` não chamam provedores externos ainda. Eles falham fechados ou retornam `404`, evitando persistir dados fictícios no Firestore.

## Firestore

Dados de garagem ficam isolados por UID do Firebase Auth:

```text
users/{uid}/vehicles/{vehicleId}
users/{uid}/vehicles/{vehicleId}/timeline/{recordId}
users/{uid}/vehicles/{vehicleId}/vaultDocuments/{documentId}
users/{uid}/vehicles/{vehicleId}/dossiers/current
publicReports/{plateSlug}
```

## Desenvolvimento Local

```bash
npm install
npm run build
npm run verify:local
```

`verify:local` tambem falha se houver service account JSON, private key, `.p8`, `.p12` ou provisioning profile dentro dos repos.

Servidor local:

```bash
PORT=8080 npm run serve
```

Auditoria remota de prontidao do Firebase/Auth, sem imprimir valores sensiveis:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-readiness
```

Auditoria remota de prontidao do deploy Cloud Run/Hosting:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-deploy-readiness
```

Essa checagem valida se o `GoogleService-Info.plist` do app iOS e a configuracao remota do Firebase ja possuem OAuth Google, Apple e Email/senha habilitados.

Estado esperado para considerar Auth pronto:

```text
IOS_CLIENT_ID=present
IOS_REVERSED_CLIENT_ID=present
REMOTE_IOS_CLIENT_ID=present
REMOTE_IOS_REVERSED_CLIENT_ID=present
AUTH_EMAIL_PASSWORD=enabled
AUTH_GOOGLE_COM=enabled
AUTH_APPLE_COM=enabled
```

Gate final da migracao:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run verify:migration
```

Esse comando roda build, auditoria local, servidor Node local, readiness remoto de deploy e readiness remoto de Auth. A migracao so deve ser considerada concluida quando ele passar.

## Firebase Hosting + Cloud Run

O `firebase.json` aponta `/v1/**` e `/r/**` para o Cloud Run service `cardocs-backend` em `southamerica-east1`. Assim, o app continua chamando `https://cardocs-app.web.app` e o backend roda como Node.js, sem Firebase Functions.

Quando o deploy for autorizado, o fluxo esperado exige confirmação explícita por variável de ambiente:

```bash
export FIREBASE_PROJECT_ID="cardocs-app"
export CARDOCS_ALLOW_DEPLOY=1
npm run deploy:run
npm run deploy:hosting
```

Deploy deve seguir o Git Flow definido no projeto. Não faça merge na `main` nem deploy para produção sem autorização explícita.

## Configuracao Firebase Auth no app iOS

Habilite no Firebase Console os provedores Email/senha, Apple e Google antes de validar login real.

O arquivo `cardocs/GoogleService-Info.plist` do app iOS precisa conter os campos OAuth do cliente iOS (`CLIENT_ID` e `REVERSED_CLIENT_ID`) gerados pelo Firebase. O valor de `REVERSED_CLIENT_ID` tambem precisa estar cadastrado como URL Scheme no target iOS; sem isso, o callback do Google Sign-In nao retorna para o app.

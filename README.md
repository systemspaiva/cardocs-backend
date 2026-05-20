# Tá Revisado Node Backend

Backend Node.js/Express para o app iOS Tá Revisado, publicado diretamente no Cloud Run. Não usa Firebase Functions nem Firebase Hosting como entrada do backend.

## Stack Atual

- Cloud Run como única entrada HTTPS pública do backend (`https://cardocs-backend-5qq5b33fha-rj.a.run.app`).
- `cardocs-ia` como backend interno privado para execução de IA.
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
firestore.rules
firestore.indexes.json
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

`plate-lookup` consulta a API Placas pelo backend quando `APIPLACAS_TOKEN` está configurado. O cadastro em `POST /v1/vehicles` recebe apenas `plate` e `initialMileage`, revalida a placa no backend antes de persistir e ignora dados de veículo vindos do cliente, evitando salvar dados digitados manualmente ou fictícios no Firestore.

`vehicles/image` consulta a CarsXE pelo backend quando `CARSXE_API_KEY` está configurada e retorna a melhor imagem real disponível para marca, modelo e ano. Quando a CarsXE não encontra imagens, a rota retorna `404` sem persistir dados fictícios no Firestore.

O app iOS prepara imagem/PDF e envia o documento para `/v1/invoices/analyze`. O backend valida Firebase Auth e assinatura, então delega a leitura para o serviço privado `cardocs-ia`, sem embutir chave de IA no bundle.

`invoices/analyze` continua disponível como rota pública de compatibilidade para o app iOS. A execução de IA, prompts, schemas de extração e classificação de `vehicleService`, `partOrProduct` ou `unknown` ficam no `cardocs-ia`.

`POST /v1/invoices` recebe `vehicleID` e o `draft` estruturado pela análise do backend. O backend valida o schema do draft, gera o `AutomationResult` no servidor e só então persiste o histórico/cofre no Firestore.

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

Consulta real por placa:

```bash
export APIPLACAS_TOKEN="<token configurado fora do repositorio>"
export APIPLACAS_BASE_URL="https://wdapi2.com.br"
```

Não versione nem imprima o token da API Placas. Em deploy, configure esse valor como secret/variável protegida do ambiente.

Consulta real de imagem do veículo:

```bash
export CARSXE_API_KEY="<chave configurada fora do repositorio>"
export CARSXE_BASE_URL="https://api.carsxe.com"
```

Não versione nem imprima a chave da CarsXE. Em deploy, configure esse valor como secret/variável protegida do ambiente.

Integração com o backend privado de IA:

```bash
export CARDOCS_IA_BASE_URL="https://cardocs-ia-....a.run.app"
export CARDOCS_IA_TIMEOUT_MS="30000"
```

O `cardocs-backend` não carrega provedor de IA localmente. Em Cloud Run, a chamada ao `cardocs-ia` usa identidade de serviço/IAM por ID token. Não configure chave DeepSeek neste backend; ela pertence exclusivamente ao ambiente do `cardocs-ia`.

Os scripts de deploy bloqueiam execução fora do alvo `develop` e fora da branch `develop`. Enquanto o repositório local estiver em `main`, eles não publicam.

Auditoria remota de prontidao do Firebase/Auth, sem imprimir valores sensiveis:

```bash
GOOGLE_APPLICATION_CREDENTIALS="/caminho/local/para/service-account.json" npm run check:firebase-readiness
```

Auditoria remota de prontidao do deploy Cloud Run:

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

## Cloud Run

O app iOS chama diretamente o Cloud Run service `cardocs-backend` em `southamerica-east1` pela URL configurada em `CARDOCS_API_BASE_URL`. O `firebase.json` fica restrito a regras e índices do Firestore; ele não possui bloco `hosting`, rewrites, canal de preview ou deploy de Hosting para o backend.

URL atual do backend:

```text
https://cardocs-backend-5qq5b33fha-rj.a.run.app
```

Quando o deploy for autorizado, o fluxo esperado exige confirmação explícita por variável de ambiente:

```bash
export FIREBASE_PROJECT_ID="cardocs-app"
export CARDOCS_ALLOW_DEPLOY=1
export CARDOCS_DEPLOY_TARGET=develop
export CARDOCS_IA_BASE_URL="https://cardocs-ia-....a.run.app"
npm run deploy:run
```

Deploy deve seguir o Git Flow definido no projeto. Não faça merge na `main` nem deploy para produção sem autorização explícita.

## Configuracao Firebase Auth no app iOS

Habilite no Firebase Console os provedores Email/senha, Apple e Google antes de validar login real.

O arquivo `cardocs/GoogleService-Info.plist` do app iOS precisa conter os campos OAuth do cliente iOS (`CLIENT_ID` e `REVERSED_CLIENT_ID`) gerados pelo Firebase. O valor de `REVERSED_CLIENT_ID` tambem precisa estar cadastrado como URL Scheme no target iOS; sem isso, o callback do Google Sign-In nao retorna para o app.

# CarDocs Backend Design

## Objetivo

Construir o backend na pasta `backend` para atender o app iOS CarDocs, substituindo o `MockVehicleRepository` por uma API real em Spring Boot com Kotlin. A entrega usa AWS como plataforma do projeto, DynamoDB como persistencia sem SQL, Docker, Gradle e Terraform, preservando Clean Architecture, SOLID e isolamento entre funcionalidades.

## Escopo Aprovado

- API REST versionada em `/v1`.
- Endpoints de dados escopados por `X-CarDocs-Owner-Id` para nao misturar garagens no mesmo banco.
- Spring Boot com Kotlin e Gradle.
- AWS SDK for Kotlin/JVM via AWS SDK Java v2.
- DynamoDB single-table como persistencia.
- Cache persistente das respostas da CarsXE em DynamoDB antes de qualquer nova chamada externa.
- Endpoints nao-publicos protegidos por `X-CarDocs-Api-Key`, falhando fechado sem `CARDOCS_API_KEY`.
- S3 reservado para uploads futuros.
- ECS/Fargate, ECR, ALB, CloudWatch e IAM no Terraform.
- CarsXE para foto do veiculo usando marca, modelo e ano.
- Secrets apenas via env/role/Secrets Manager, sem credenciais no repo.
- Persistencia real apenas para dados criados pelo app.
- Providers locais de placa e OCR/IA nao geram placeholders persistiveis; retornam erro ate existir provider real.
- Tabela inicial vazia, sem seed ficticio.
- Sem SQL, Postgres, Flyway, Firebase ou Firestore.
- Sem unit tests, conforme instrucao do projeto.
- Sem worktree.

## Contrato do App iOS

O backend deve cobrir as necessidades atuais de `VehicleRepository`:

- `loadDashboard`: carregar garagem, investimento, timeline, saude, cofre e dossie.
- `analyzeInvoice`: analisar documento de nota/comprovante e retornar draft revisavel.
- `saveInvoice`: persistir a nota confirmada e atualizar historico/cofre/investimento.
- `detectVehicleByPlate`: normalizar e validar placa brasileira, retornando candidato.
- `registerVehicle`: cadastrar carro ou moto na garagem com quilometragem inicial e foto CarsXE quando configurada.
- `generateResaleDossier`: gerar relatorio de revenda baseado nos dados reais ja salvos.

## Endpoints

- `GET /v1/health`
- `GET /v1/dashboard`
- `POST /v1/vehicles/plate-lookup`
- `POST /v1/vehicles/image`
- `POST /v1/vehicles`
- `POST /v1/invoices/analyze`
- `POST /v1/invoices`
- `POST /v1/resale-dossiers`
- `GET /v1/public/reports/{slug}`

## Persistencia

Layout DynamoDB single-table:

- `PK=OWNER#{ownerId}`, `SK=VEHICLE#{vehicleId}`
- `PK=OWNER#{ownerId}`, `SK=VEHICLE#{vehicleId}#MAINT#{recordId}`
- `PK=OWNER#{ownerId}`, `SK=VEHICLE#{vehicleId}#DOC#{documentId}`
- `PK=OWNER#{ownerId}`, `SK=VEHICLE#{vehicleId}#PART#{partId}`
- `PK=OWNER#{ownerId}`, `SK=VEHICLE#{vehicleId}#DOSSIER#current`
- `PK=OWNER#{ownerId}`, `SK=DRAFT#{draftId}`
- `PK=PUBLIC_REPORTS`, `SK=REPORT#{slug}`
- `PK=VEHICLE_IMAGE_CACHE`, `SK=LOOKUP#{normalizedBrand}|{normalizedModel}|{normalizedYear}`

O dashboard e montado a partir desses dados. Quando nao houver veiculos, retorna garagem vazia com ids sentinela nao persistidos para manter compatibilidade com o modelo Swift atual, que ainda usa campos nao opcionais.
Consultas DynamoDB paginam todos os resultados e gravacoes multi-item usam transacao para nao deixar historico/cofre ou dossie publico em estado parcial.

## Providers Externos

Nesta entrega nao havera chamada real para OCR, API de placa, IA ou Mercado Livre. A chamada real autorizada agora e a CarsXE Images API:

- `VehicleImageProvider`: chama CarsXE `/images` com `key`, `make`, `model`, `year` e retorna a primeira imagem.
- `VehicleImageCachePort`: consulta DynamoDB antes da chamada externa, reserva misses frios por curto periodo para evitar chamadas duplicadas concorrentes e persiste respostas CarsXE para reutilizacao por marca, modelo e ano.
- `DocumentAnalysisProvider`: retorna erro ate provider real de OCR/IA ser configurado, evitando persistir placeholder.
- `PlateLookupProvider`: retorna erro ate provider real de consulta por placa ser configurado, evitando persistir placeholder.
- `ResaleDossierProvider`: consolida relatorio a partir do historico persistido.
- `DocumentStorageProvider`: reservado para storage futuro em S3.

## Infra

Docker sobe apenas a API. Terraform fica em `backend/terraform` com recursos AWS parametrizados para futura publicacao em develop/prod, sem valores sensiveis hardcoded. O ALB nao abre ingress por padrao (`allowed_cidr_blocks=[]`) e secrets entram por Secrets Manager.

## Validacao

Como testes unitarios nao foram solicitados, a validacao desta entrega sera:

- `./gradlew compileKotlin`
- `./gradlew bootJar`
- `terraform fmt -check`
- `terraform validate`
- validacao estrutural do `docker-compose.yml`

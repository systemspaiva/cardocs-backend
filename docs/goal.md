Você é um arquiteto de software sênior especialista em Java, Spring Boot, AWS, arquitetura limpa, sistemas SaaS e LGPD.

Preciso que você implemente a base do Backend do MVP chamado CarDocs.

Contexto do produto:
CarDocs é um SaaS para controle de carros e motos com foco em centralizar dados do veículo, histórico de manutenções, documentos, notas fiscais, lembretes e dossiê de revenda compartilhável.

O backend deve ser construído com:

* Java 21
* Spring Boot 3
* Spring Web
* Spring Security
* Spring Data JPA
* PostgreSQL
* Flyway ou Liquibase para migrations
* AWS S3 para storage de documentos, imagens e PDFs
* AWS SQS para filas assíncronas
* AWS CloudWatch para logs
* AWS Secrets Manager ou Parameter Store para secrets
* Arquitetura modular, limpa e escalável

Não use NestJS, Prisma ou TypeScript no backend. A implementação precisa ser em Spring Boot.

Objetivo:
Criar uma base funcional, limpa e pronta para evolução, com integrações externas desacopladas por interfaces, providers mockados e feature flags para ativar integrações reais depois.

Não implemente integrações oficiais complexas agora. Crie abstrações, mocks, contratos, services, documentação e pontos claros onde cada integração será conectada futuramente.

Funcionalidades obrigatórias do Backend:

1. Autenticação e usuários

Implementar base para:

* Cadastro de usuário
* Login
* JWT
* Refresh token, se fizer sentido para a arquitetura
* Perfil do usuário autenticado
* Exclusão de conta
* Exportação dos dados do usuário
* Roles: USER, ADMIN, SUPPORT

Criar entidades e estrutura para:

* User
* ConsentRecord
* AuditLog

Regras:

* Senha nunca deve ser armazenada em texto puro
* Todas as rotas privadas devem exigir autenticação
* Um usuário nunca pode acessar dados de outro usuário
* Admin deve ter permissões separadas

2. Organizações

Criar entidade Organization preparada para futuro B2B.

No MVP, pode existir uma organização default ou vínculo opcional com usuário.

Entidade:

* Organization

Campos sugeridos:

* id
* name
* document
* createdAt
* updatedAt
* deletedAt

3. Gestão de veículos

Implementar:

* Criar veículo
* Listar veículos do usuário
* Buscar detalhe do veículo
* Atualizar veículo
* Remover veículo com soft delete
* Cadastro principal por placa
* Fallback manual para dados que não forem encontrados

Entidade:

Vehicle

Campos sugeridos:

* id
* userId
* organizationId
* plate
* type
* brand
* model
* version
* year
* manufactureYear
* color
* fuelType
* chassisLastDigits
* renavamMasked
* currentMileage
* createdAt
* updatedAt
* deletedAt

Endpoints:

* POST /vehicles
* GET /vehicles
* GET /vehicles/{vehicleId}
* PUT /vehicles/{vehicleId}
* DELETE /vehicles/{vehicleId}
* POST /vehicles/lookup-by-plate

4. Consulta de veículo por placa

Criar uma interface:

VehicleRegistryProvider

Criar pelo menos uma implementação mock:

MockVehicleRegistryProvider

Preparar estrutura futura para:

* SerproVehicleRegistryProvider
* WsDenatranVehicleRegistryProvider

Regras:

* Não acoplar consulta por placa diretamente no VehicleService
* Usar feature flag ou configuração por env para selecionar provider
* O provider real deve ficar desativado por padrão
* Documentar que integrações oficiais dependem de autorização/contrato
* Criar DTO claro para resposta da consulta por placa

5. Documentos do veículo

Implementar upload e gestão de documentos.

Funcionalidades:

* Criar metadado de documento
* Gerar URL pré-assinada para upload no S3
* Gerar URL pré-assinada para download
* Listar documentos de um veículo
* Buscar documento
* Remover documento com soft delete
* Vincular documento ao veículo
* Preparar vínculo com manutenção
* Salvar status e resultado de OCR
* Permitir revisão manual dos dados extraídos

Entidade:

VehicleDocument

Campos sugeridos:

* id
* vehicleId
* userId
* type
* fileName
* contentType
* fileSize
* storageKey
* storageBucket
* ocrStatus
* ocrRawText
* ocrStructuredData
* reviewedData
* reviewStatus
* createdAt
* updatedAt
* deletedAt

Tipos de documento:

* CRLV
* NOTA_FISCAL
* RECIBO
* ORDEM_DE_SERVICO
* COMPROVANTE
* MANUAL
* SEGURO
* OUTRO

Endpoints:

* POST /vehicles/{vehicleId}/documents/upload-url
* POST /vehicles/{vehicleId}/documents
* GET /vehicles/{vehicleId}/documents
* GET /vehicles/{vehicleId}/documents/{documentId}
* GET /vehicles/{vehicleId}/documents/{documentId}/download-url
* DELETE /vehicles/{vehicleId}/documents/{documentId}
* POST /vehicles/{vehicleId}/documents/{documentId}/ocr
* PUT /vehicles/{vehicleId}/documents/{documentId}/review

6. Storage AWS S3

Criar interface:

StorageProvider

Criar implementação:

S3StorageProvider

Funcionalidades:

* Gerar presigned upload URL
* Gerar presigned download URL
* Validar content type
* Validar tamanho máximo permitido
* Construir storage key de forma segura

Estrutura sugerida no S3:

users/{userId}/vehicles/{vehicleId}/documents/{documentId}/{filename}

Regras:

* Nunca expor bucket público diretamente
* Usar URLs temporárias
* Configurar via env
* Não hardcodar credenciais
* Preparar uso com IAM Role em produção

7. OCR de documentos

Criar interface:

OcrProvider

Criar implementação inicial:

MockOcrProvider

Preparar implementação futura:

AwsTextractOcrProvider

Fluxo desejado:

1. Usuário registra/upload documento
2. Backend salva metadados
3. Backend envia mensagem para fila SQS de OCR
4. Worker consome mensagem
5. Worker executa OCR pelo provider configurado
6. Backend salva texto bruto e dados estruturados
7. Documento fica disponível para revisão manual

Status de OCR:

* PENDING
* PROCESSING
* COMPLETED
* FAILED
* REVIEW_REQUIRED

Criar fila lógica:

ocr-processing-queue

Payload:

{
"documentId": "uuid",
"vehicleId": "uuid",
"userId": "uuid"
}

8. Manutenções

Implementar CRUD de manutenções do veículo.

Entidade:

MaintenanceRecord

Campos sugeridos:

* id
* vehicleId
* userId
* type
* title
* description
* serviceDate
* mileage
* amount
* currency
* vendorName
* documentId
* createdAt
* updatedAt
* deletedAt

Tipos:

* OIL_CHANGE
* BRAKES
* TIRES
* BATTERY
* REVISION
* BODYWORK
* DOCUMENTATION
* OTHER

Endpoints:

* POST /vehicles/{vehicleId}/maintenance
* GET /vehicles/{vehicleId}/maintenance
* GET /vehicles/{vehicleId}/maintenance/{maintenanceId}
* PUT /vehicles/{vehicleId}/maintenance/{maintenanceId}
* DELETE /vehicles/{vehicleId}/maintenance/{maintenanceId}

9. Timeline do veículo

Criar endpoint para timeline consolidada.

Endpoint:

* GET /vehicles/{vehicleId}/timeline

A timeline deve agregar eventos de:

* Criação do veículo
* Upload de documentos
* Manutenções
* Lembretes criados
* Lembretes concluídos
* Dossiê de revenda criado
* OCR processado

Pode ser calculada via service consolidado no MVP, sem necessariamente criar tabela física.

Criar DTO:

VehicleTimelineEventResponse

Campos sugeridos:

* id
* type
* title
* description
* eventDate
* sourceType
* sourceId
* metadata

10. Lembretes

Implementar lembretes por data e quilometragem.

Entidade:

Reminder

Campos sugeridos:

* id
* vehicleId
* userId
* type
* title
* description
* dueDate
* dueMileage
* currentMileageSnapshot
* status
* notificationEnabled
* createdAt
* updatedAt
* completedAt
* deletedAt

Status:

* PENDING
* DONE
* OVERDUE
* CANCELED

Endpoints:

* POST /vehicles/{vehicleId}/reminders
* GET /vehicles/{vehicleId}/reminders
* PUT /vehicles/{vehicleId}/reminders/{reminderId}
* POST /vehicles/{vehicleId}/reminders/{reminderId}/complete
* DELETE /vehicles/{vehicleId}/reminders/{reminderId}

Criar job agendado com Spring Scheduler para:

* Verificar lembretes vencidos
* Marcar como OVERDUE
* Enviar notificação via NotificationProvider
* Registrar AuditLog quando necessário

11. Notificações

Criar interface:

NotificationProvider

Criar implementação inicial:

MockNotificationProvider

Preparar estrutura futura para:

* EmailNotificationProvider
* FirebaseCloudMessagingProvider
* PushNotificationProvider

Eventos notificáveis:

* Lembrete próximo do vencimento
* Lembrete vencido
* Documento vencendo
* OCR finalizado
* Dossiê de revenda criado
* Exportação de dados finalizada

Não implemente push real agora. Apenas abstraia corretamente.

12. Dossiê de revenda compartilhável

Implementar criação de link público controlado para exibir histórico do veículo.

Entidade:

ShareLink

Campos sugeridos:

* id
* vehicleId
* userId
* token
* status
* expiresAt
* allowedSections
* publicTitle
* createdAt
* revokedAt
* lastAccessedAt

Status:

* ACTIVE
* REVOKED
* EXPIRED

Endpoints:

* POST /vehicles/{vehicleId}/share-links
* GET /vehicles/{vehicleId}/share-links
* DELETE /vehicles/{vehicleId}/share-links/{shareLinkId}
* GET /public/share-links/{token}

Regras:

* O link público não pode expor dados sensíveis do usuário
* O usuário precisa ter consentimento explícito para compartilhar
* Criar AuditLog ao gerar, acessar e revogar link
* Token deve ser seguro, não sequencial e difícil de adivinhar
* Permitir expiração

13. Exportação em PDF

Criar provider:

PdfExportProvider

Implementação inicial pode ser simples/mockada:

MockPdfExportProvider ou HtmlToPdfExportProvider

Criar estrutura para exportação assíncrona.

Entidade recomendada:

PdfExportRequest

Campos sugeridos:

* id
* userId
* vehicleId
* type
* status
* storageKey
* errorMessage
* createdAt
* completedAt

Endpoints:

* POST /vehicles/{vehicleId}/exports/pdf
* GET /exports/{exportId}
* GET /exports/{exportId}/download-url

Fila lógica:

pdf-export-queue

Payload:

{
"exportId": "uuid",
"vehicleId": "uuid",
"userId": "uuid",
"type": "FULL_HISTORY"
}

14. LGPD, consentimento e privacidade

Implementar estrutura para:

* Registrar consentimento
* Revogar consentimento
* Exportar dados do usuário
* Excluir conta
* Soft delete
* Auditoria de ações sensíveis

Entidade:

ConsentRecord

Campos sugeridos:

* id
* userId
* type
* granted
* grantedAt
* revokedAt
* metadata
* createdAt
* updatedAt

Tipos de consentimento:

* SHARE_RESALE_DOSSIER
* OCR_PROCESSING
* DOCUMENT_STORAGE
* NOTIFICATION_OPT_IN
* TERMS_ACCEPTANCE
* PRIVACY_POLICY_ACCEPTANCE

Endpoints:

* GET /consents
* POST /consents
* PUT /consents/{consentId}/revoke
* GET /privacy/export
* POST /privacy/export
* DELETE /privacy/account

15. Exportação de dados LGPD

Criar estrutura para exportar dados do usuário.

Entidade recomendada:

DataExportRequest

Campos sugeridos:

* id
* userId
* status
* storageKey
* errorMessage
* createdAt
* completedAt

Fila lógica:

data-export-queue

Responsabilidades:

* Coletar dados do usuário
* Gerar JSON ou ZIP
* Salvar no S3
* Gerar link temporário
* Registrar auditoria

16. Auditoria

Criar entidade:

AuditLog

Campos sugeridos:

* id
* userId
* organizationId
* entityType
* entityId
* action
* metadata
* ipAddress
* userAgent
* createdAt

Eventos auditáveis:

* USER_CREATED
* USER_DELETED
* VEHICLE_CREATED
* VEHICLE_UPDATED
* DOCUMENT_UPLOADED
* DOCUMENT_DELETED
* OCR_PROCESSED
* MAINTENANCE_CREATED
* REMINDER_CREATED
* SHARE_LINK_CREATED
* SHARE_LINK_ACCESSED
* SHARE_LINK_REVOKED
* DATA_EXPORTED
* CONSENT_GRANTED
* CONSENT_REVOKED
* ADMIN_ACTION

Criar AuditLogService reutilizável.

17. Admin básico

Implementar área administrativa mínima.

Endpoints:

* GET /admin/users
* GET /admin/users/{userId}
* GET /admin/users/{userId}/vehicles
* GET /admin/audit-logs
* GET /admin/ocr-jobs
* POST /admin/ocr-jobs/{jobId}/retry
* POST /admin/share-links/{shareLinkId}/revoke

Regras:

* Apenas ADMIN ou SUPPORT pode acessar
* Toda ação administrativa deve gerar AuditLog
* Admin não deve baixar documentos sensíveis diretamente por padrão
* Reprocessamento de OCR deve passar pela fila novamente

18. Filas e workers

Criar abstração para filas:

QueueProvider

Implementação:

SqsQueueProvider

Filas necessárias:

* ocr-processing-queue
* pdf-export-queue
* data-export-queue

Criar consumers/listeners para:

* OCR
* Geração de PDF
* Exportação de dados

Se for complexo para o primeiro commit, deixar consumers estruturados e documentados, mas pelo menos o fluxo de envio para fila precisa estar preparado.

19. Estrutura de pacotes sugerida

Organize o projeto assim:

src/main/java/com/cardocs/api

* config
* security
* users
* auth
* organizations
* vehicles
* documents
* maintenance
* reminders
* sharelinks
* exports
* ocr
* notifications
* storage
* audit
* consents
* admin
* integrations

  * vehicleregistry
  * ocr
  * notification
  * storage
  * queue
* common

  * exceptions
  * validation
  * pagination
  * mapper
  * domain

20. Banco e migrations

Criar migrations para as tabelas principais:

* users
* organizations
* vehicles
* vehicle_documents
* maintenance_records
* reminders
* share_links
* consent_records
* audit_logs
* pdf_export_requests
* data_export_requests

Usar UUID como identificador principal.

Todos os registros principais devem ter:

* created_at
* updated_at
* deleted_at quando fizer sentido

Adicionar índices importantes:

* users.email
* vehicles.user_id
* vehicles.plate
* vehicle_documents.vehicle_id
* maintenance_records.vehicle_id
* reminders.vehicle_id
* share_links.token
* audit_logs.user_id
* audit_logs.created_at

21. Segurança

Implementar:

* Spring Security
* JWT
* Password hashing com BCrypt
* Validação de ownership em todos os recursos
* Roles
* CORS configurável por env
* Tratamento padronizado de erro
* Proteção contra acesso cruzado entre usuários
* Sanitização básica de inputs
* Paginação em listas
* Logs sem dados sensíveis

22. Tratamento de erros

Criar padrão de erro único para a API.

Exemplo:

{
"timestamp": "2026-01-01T10:00:00Z",
"status": 400,
"error": "VALIDATION_ERROR",
"message": "Campo obrigatório inválido",
"path": "/vehicles",
"details": []
}

Criar GlobalExceptionHandler.

23. DTOs e validação

Não exponha entidades JPA diretamente na API.

Criar:

* Request DTOs
* Response DTOs
* Mappers
* Validações com Bean Validation

Exemplos:

* CreateVehicleRequest
* VehicleResponse
* CreateMaintenanceRequest
* MaintenanceResponse
* CreateReminderRequest
* ReminderResponse
* CreateShareLinkRequest
* ShareLinkResponse

24. Configurações de ambiente

Criar application.yml com perfis:

* local
* hml
* prod

Criar .env.example com:

APP_ENV=local
APP_BASE_URL=http://localhost:8080

DATABASE_URL=jdbc:postgresql://localhost:5432/cardocs
DATABASE_USERNAME=cardocs
DATABASE_PASSWORD=cardocs

JWT_SECRET=
JWT_ACCESS_TOKEN_EXPIRATION=
JWT_REFRESH_TOKEN_EXPIRATION=

AWS_REGION=sa-east-1
AWS_S3_BUCKET=
AWS_SQS_OCR_QUEUE_URL=
AWS_SQS_PDF_EXPORT_QUEUE_URL=
AWS_SQS_DATA_EXPORT_QUEUE_URL=

OCR_PROVIDER=mock
VEHICLE_REGISTRY_PROVIDER=mock
STORAGE_PROVIDER=s3
NOTIFICATION_PROVIDER=mock
QUEUE_PROVIDER=sqs

FEATURE_VEHICLE_REGISTRY_INTEGRATION=false
FEATURE_OCR_INTEGRATION=true
FEATURE_NOTIFICATIONS=false
FEATURE_PUBLIC_SHARE_LINK=true

25. Documentação

Criar documentação em:

docs/architecture.md
docs/integrations/vehicle-registry.md
docs/integrations/ocr.md
docs/integrations/storage.md
docs/integrations/notifications.md
docs/aws.md
docs/lgpd.md

A documentação precisa explicar:

* Como rodar localmente
* Como configurar banco
* Como configurar S3
* Como configurar SQS
* Como trocar providers mock por providers reais
* Quais env vars são necessárias
* Onde plugar SERPRO/WSDenatran futuramente
* Onde plugar AWS Textract
* Como funciona consentimento LGPD
* Como funciona dossiê público

26. Docker local

Criar docker-compose para ambiente local com:

* PostgreSQL
* LocalStack, se fizer sentido
* Redis apenas se necessário, mas preferência para SQS/LocalStack por alinhamento com AWS

Não usar credenciais reais.

27. Testes mínimos

Criar testes básicos para:

* AuthService
* VehicleService
* Ownership validation
* ShareLinkService
* ReminderService
* VehicleRegistryProvider mock
* OcrProvider mock

Não precisa cobrir tudo, mas garanta testes nos fluxos centrais e regras críticas.

28. Fora do escopo

Não implementar:

* Marketplace
* Chat entre usuários
* Funcionalidades financeiras complexas
* Telemetria veicular
* Integração com seguradora
* Paywall
* Integrações oficiais reais com órgãos públicos
* Frontend
* App mobile
* Cadastro manual pesado como fluxo principal

29. Critérios de qualidade

A entrega precisa:

* Compilar
* Ter arquitetura limpa
* Ter separação clara por domínio
* Não expor entidades diretamente
* Não hardcodar credenciais
* Usar migrations
* Usar logs estruturados
* Ter README claro
* Ter providers mockados funcionando
* Ter pontos de integração futura claros
* Ter validação de input
* Ter tratamento de erro padronizado
* Ter segurança por usuário
* Ser preparada para AWS
* Ser preparada para homologação e produção

30. Entregáveis esperados

Ao finalizar, me entregue:

* Resumo das decisões de arquitetura
* Estrutura de pastas criada
* Entidades criadas
* Endpoints criados
* Migrations criadas
* Providers criados
* Variáveis de ambiente necessárias
* Como rodar localmente
* Pontos exatos onde conectar integrações futuras
* Próximos passos recomendados

Importante:
Antes de sair implementando tudo de forma gigante e acoplada, organize a base por módulos e faça uma implementação incremental, mas já deixando o projeto com fundação profissional e escalável.

Priorize uma base sólida para o MVP, não um protótipo descartável.

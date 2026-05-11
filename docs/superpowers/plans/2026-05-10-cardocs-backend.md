# CarDocs Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Spring Boot Kotlin backend in `backend` that satisfies the current iOS app repository contract using AWS for project persistence and deploy.

**Architecture:** Clean Architecture with domain models, application use cases, infrastructure adapters, and HTTP DTO/controllers. DynamoDB is the persistence platform, CarsXE is the vehicle image provider, and external OCR/IA/Mercado Livre integrations remain behind ports.

**Tech Stack:** Kotlin, Spring Boot, Gradle, AWS SDK Java v2, DynamoDB, S3, ECS/Fargate, Docker, Terraform.

---

## Constraints

- Do not create a worktree.
- Do not add unit tests unless explicitly requested.
- Do not call Mercado Livre APIs.
- Do not store credentials or API keys.
- Do not seed fake rows into AWS.
- Do not persist placeholder provider data.
- Protect non-public API endpoints with `CARDOCS_API_KEY`.
- Keep this limited to develop/local readiness unless production is explicitly requested.

## File Structure

- `backend/settings.gradle.kts`: Gradle project name.
- `backend/build.gradle.kts`: Kotlin/Spring/AWS dependencies and build plugins.
- `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/gradle-wrapper.properties`: Gradle wrapper.
- `backend/src/main/kotlin/app/cardocs/CardocsBackendApplication.kt`: Spring Boot entrypoint.
- `backend/src/main/kotlin/app/cardocs/domain/model/*`: domain models.
- `backend/src/main/kotlin/app/cardocs/application/port/*`: provider and persistence ports.
- `backend/src/main/kotlin/app/cardocs/application/usecase/*`: use cases for dashboard, vehicles, invoices, and resale dossiers.
- `backend/src/main/kotlin/app/cardocs/infrastructure/aws/*`: AWS SDK configuration and DynamoDB repository.
- `backend/src/main/kotlin/app/cardocs/infrastructure/provider/*`: cached CarsXE and local provider adapters.
- `backend/src/main/kotlin/app/cardocs/interfaces/http/*`: REST controllers and DTO mappers.
- `backend/src/main/resources/application.yml`: AWS and CarsXE env config.
- `backend/Dockerfile`: runnable backend image.
- `backend/docker-compose.yml`: local API container.
- `backend/terraform/*`: AWS deploy skeleton with no secrets.
- `backend/README.md`: local runbook and API contract.

## Tasks

### Task 1: Scaffold Backend Project

- [x] Create Gradle Kotlin/Spring project under `backend`.
- [x] Add Spring Web, Validation, AWS SDK DynamoDB, Jackson Kotlin, Actuator.
- [x] Add `application.yml` with env-driven AWS and CarsXE config.
- [x] Add Dockerfile and Docker Compose.

### Task 2: Define Domain and Ports

- [x] Add immutable domain models matching the app: dashboard, garage, vehicle, investment, maintenance, health, vault document, invoice draft, automation result, resale dossier, and vehicle image.
- [x] Add use case ports for persistence and providers.
- [x] Add validation helpers for Brazilian plate normalization.

### Task 3: Build AWS Persistence

- [x] Implement DynamoDB repository for vehicles, maintenance records, vault documents, part health items, invoice drafts, resale dossiers, and public reports.
- [x] Implement DynamoDB cache for CarsXE responses by brand, model, and year before external calls.
- [x] Add short DynamoDB reservation for CarsXE cold misses to avoid duplicate concurrent external calls.
- [x] Add paginated DynamoDB queries and transactional writes for multi-item saves.
- [x] Ensure empty DynamoDB returns an empty dashboard without inserting fake data.
- [x] Store CarsXE image metadata on vehicle registration when configured.

### Task 4: Build Use Cases

- [x] Implement dashboard loading.
- [x] Implement vehicle plate lookup and registration.
- [x] Implement CarsXE vehicle image lookup by brand, model, and year.
- [x] Implement invoice analysis and confirmed invoice save.
- [x] Implement resale dossier generation and public report lookup.
- [x] Keep OCR/IA/Mercado Livre providers isolated and without external calls.

### Task 5: Expose REST API

- [x] Add DTOs matching the Swift model fields and lowerCamelCase JSON.
- [x] Add controllers for `/v1/health`, `/v1/dashboard`, `/v1/vehicles`, `/v1/invoices`, `/v1/resale-dossiers`, and `/v1/public/reports/{slug}`.
- [x] Add `/v1/vehicles/image` for direct CarsXE lookup.
- [x] Add API key guard for non-public endpoints.
- [x] Add error handling for validation, not found, and unexpected failures.

### Task 6: Add Infra and Docs

- [x] Add Terraform skeleton for ECR, DynamoDB, S3, ECS/Fargate, ALB, IAM, CloudWatch, variables, and outputs without secrets.
- [x] Add `CARDOCS_API_KEY` Secrets Manager wiring and fail-closed ALB ingress defaults.
- [x] Add README with local commands, API examples, architecture notes, and constraints.

### Task 7: Verify

- [x] Run `./gradlew compileKotlin`.
- [x] Run `./gradlew bootJar`.
- [x] Validate `docker-compose.yml` YAML structure with Ruby parser.
- [x] Run `terraform fmt -check`.
- [x] Run `terraform validate` if provider resolution works without secrets.
- [x] Audit every explicit requirement against files and command output before final response.

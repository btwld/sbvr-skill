# Phase 1: Architecture Overview

## Objective

Produce a comprehensive `00-overview.md` that maps the entire system — tech stack, layers, modules, integrations, and cross-cutting concerns. This document becomes the foundation for module docs and SBVR generation.

## Exploration Sequence

### Step 1: Project Structure Discovery

Explore the root directory and identify:
- Package/dependency files: `package.json`, `composer.json`, `*.csproj`, `Cargo.toml`, `go.mod`, `requirements.txt`, `Gemfile`, `pom.xml`, `build.gradle`
- Configuration files: `.env*`, `config/`, `appsettings.json`, `application.yml`
- Docker/deployment: `Dockerfile`, `docker-compose.yml`, `k8s/`, CI/CD configs
- README, CHANGELOG, existing docs

### Step 2: Entry Points & Bootstrap

Read the application entry points to understand the boot sequence:
- Node.js: `main.ts`, `index.ts`, `app.ts`, `server.ts`
- Python: `manage.py`, `app.py`, `main.py`, `wsgi.py`
- .NET: `Program.cs`, `Startup.cs`
- Java: `*Application.java`, `Main.java`
- Go: `main.go`, `cmd/`
- Ruby: `config.ru`, `application.rb`

Document what each bootstrap step configures: middleware, routes, DI container, database connections, etc.

### Step 3: Layered Architecture

Identify and map the layers:

```
┌─────────────────────────────────────┐
│         Controllers / Handlers       │  ← HTTP interface
├─────────────────────────────────────┤
│      Middleware / Guards / Pipes      │  ← Cross-cutting
├─────────────────────────────────────┤
│         Services / Use Cases         │  ← Business logic
├─────────────────────────────────────┤
│       Repositories / Data Access     │  ← Persistence
├─────────────────────────────────────┤
│         Models / Entities            │  ← Domain objects
├─────────────────────────────────────┤
│           Database / APIs            │  ← External
└─────────────────────────────────────┘
```

For each layer, document:
- Directory location
- Base classes or patterns used
- Naming conventions
- Key abstractions

### Step 4: External Integrations

Map all external dependencies:
- Databases (PostgreSQL, MySQL, MongoDB, Redis, etc.)
- Message queues (RabbitMQ, Kafka, SQS)
- Third-party APIs (payment, auth, email, etc.)
- Cloud services (S3, SES, SNS, CDN)
- Authentication providers (OAuth, SAML, LDAP)

### Step 5: Authentication & Authorization

Document:
- Token flow (JWT, session, API key)
- Role/permission system
- Middleware/guards implementation
- 2FA/MFA if present
- How roles map to endpoint access

### Step 6: Module/Domain Map

This is the most critical output for subsequent phases. Identify every distinct business domain:

For each module, capture:
- Module name and directory path
- Key entities it owns
- Number of endpoints/routes
- Dependencies on other modules
- Priority for documentation (core modules first)

### Step 7: Cross-Cutting Concerns

Document patterns that span modules:
- Logging and audit trails
- Error handling (global handlers, error formats)
- File upload/storage
- Email/notification systems
- Caching strategy
- Rate limiting
- Soft delete patterns
- Pagination patterns

## Output Template

Write the document with this structure:

```markdown
# {APP_NAME} Architecture Overview

## System Architecture

### High-Level Diagram
(ASCII box diagram showing clients, API, databases, external services, protocols)

### Technology Stack
| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| Runtime | ... | ... | ... |
| Framework | ... | ... | ... |
| Database | ... | ... | ... |
| ORM | ... | ... | ... |

## API Architecture

### Layered Architecture
(ASCII diagram + description of each layer)

### Base Patterns
(Document base classes, generic CRUD, request/response objects, pagination, soft-delete — with code snippets)

### Application Bootstrap
(Step-by-step boot sequence)

### Authentication & Authorization
(Token flow, role system, middleware/guards)

### Dependency Injection Registry
| Interface | Implementation | Scope | Notes |
|-----------|---------------|-------|-------|

## Frontend Architecture (if applicable)

### Framework & Structure
### Routing & Navigation
### State Management
### Role-Based Access

## Module Map

| # | Module | Priority | Directory | Key Entities | Endpoints | Dependencies | Notes |
|---|--------|----------|-----------|-------------|-----------|-------------|-------|
| 1 | ... | High | ... | ... | ... | ... | ... |

## Cross-Cutting Concerns

### Logging & Auditing
### Error Handling
### File Upload / Storage
### Email / Notifications
### Caching
### Rate Limiting

## Environment & Configuration
(How config is loaded, env vars, hardcoded values)
```

## Quality Checks

Before marking Phase 1 complete:
- [ ] Every directory in the project is accounted for
- [ ] All external integrations are mapped
- [ ] Module Map has enough detail for Phase 2 to work independently
- [ ] Code snippets included for all base patterns
- [ ] File paths cited for all claims
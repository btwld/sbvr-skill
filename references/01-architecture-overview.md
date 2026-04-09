# Phase 1: Architecture Overview

## Objective

Produce a comprehensive `00-overview.md` that maps the entire system — tech stack, layers, modules, integrations, and cross-cutting concerns. This document becomes the foundation for module docs and SBVR generation.

## Exploration Sequence

### Step 0: Read Existing Documentation

Before exploring code, check for existing documentation:
- README, CHANGELOG, CONTRIBUTING guides
- Existing architecture docs, ADRs (Architecture Decision Records)
- API documentation (Swagger/OpenAPI specs, Postman collections)
- Deployment or infrastructure docs

Reading existing docs first provides context that saves significant exploration time and avoids re-discovering documented decisions.

### Step 1: Project Structure Discovery

Explore the root directory and identify:
- Package/dependency files: `package.json`, `composer.json`, `*.csproj`, `Cargo.toml`, `go.mod`, `requirements.txt`, `Gemfile`, `pom.xml`, `build.gradle`
- Configuration files: `.env*`, `config/`, `appsettings.json`, `application.yml`
- Docker/deployment: `Dockerfile`, `docker-compose.yml`, `k8s/`, CI/CD configs

**Skip auto-generated files** (ORM migrations, codegen output, protobuf stubs, compiled assets) during analysis. Reference migration files only to verify DB schema constraints; do not document them as modules or primary source files.

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

**Database-first codebases** (EF EDMX, Hibernate reverse-engineering, SQLAlchemy reflection): Also explore stored procedures, database views, and database functions — these often contain critical business logic not visible in application code. Note auto-generated entity models and trace the generation source (EDMX, migrations, schema). The database schema IS the source of truth for entities in these architectures.

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

This is the most critical output for subsequent phases. Identify every distinct business domain.

**Definition of "module":** A module is a cohesive group of source files that owns one or more related entities and implements a distinct area of business logic. Modules typically map to: directory-based domains (e.g., `modules/users/`), framework constructs (Django apps, NestJS modules, Spring packages, .NET projects), or — when no directory structure exists — entity clusters (all files operating on the same core entity). When in doubt, group by the primary entity the code operates on.

**Multi-project architectures** (e.g., .NET solutions with separate Repository/Service/Model projects): A single module may span multiple directories or projects. List all related directories comma-separated in the Module Map, or use the primary service directory and note the split in the Notes column.

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

## External System Dependencies

| System | Purpose | Protocol | Auth | Notes |
|--------|---------|----------|------|-------|
| ... | ... | ... | ... | ... |

(Document ALL external systems: third-party APIs, pre-compiled binaries from other repos, external auth providers, cloud services. These are critical to understanding the system boundary.)

## Cross-Cutting Concerns

### Logging & Auditing
### Error Handling
### File Upload / Storage
### Email / Notifications
### Caching
### Rate Limiting

## Environment & Configuration
(How config is loaded, env vars, hardcoded values)

## Phase 1 Security Observations
(During exploration, you will inevitably discover hardcoded secrets, missing auth on endpoints, empty catch blocks, etc. Note them here briefly — Phase 3 will cover them in depth.)
- Hardcoded credentials found: yes/no (locations)
- Endpoints without auth guards: list
- Other notable concerns
```

## Quality Checks

Before marking Phase 1 complete:
- [ ] Every directory in the project is accounted for
- [ ] All external integrations and dependencies are mapped (including pre-compiled binaries, external APIs)
- [ ] Module Map has enough detail for Phase 2 to work independently
- [ ] Code snippets included for all base patterns
- [ ] File paths cited for all claims
- [ ] Stored procedures and database views noted (if applicable)
- [ ] Auto-generated code identified and distinguished from hand-written code
# Phase 2: Module Documentation

## Objective

For each module in the Module Map from Phase 1, produce a comprehensive document covering endpoints, entities, DTOs, business rules, frontend screens, and issues. These documents feed directly into Phase 3 (Audit) and Phase 4 (SBVR Generation).

## Process

1. Read `00-overview.md` for full architecture context and base patterns
2. For each module, read ALL related source files
3. Write `{NN}-{module-name}.md` using the template below
4. After all modules are documented, run **2-3 review passes**

## Multi-Agent Execution

For codebases with 4+ modules, spawn parallel agents to document modules concurrently.

**Setup per agent:**
1. Agent reads `00-overview.md` for full system context and base patterns
2. Agent is assigned 1-3 related modules (group by domain proximity)
3. Agent reads ALL source files for its assigned modules
4. Agent writes module docs independently

**Agent coordination rules:**
- Each agent writes only its assigned module files
- Cross-module references should note the dependency but not document the other module's internals
- After all agents complete, a single coordinator reviews for consistency across module docs
- For large codebases (15+ modules), batch agents in groups of 5-8 to avoid context/rate limits

## Source Files to Analyze Per Module

- Controllers / route handlers
- Service interfaces and implementations
- Entity / model definitions (including migrations/schema)
- DTOs / request-response types
- Middleware, guards, interceptors specific to this module
- Frontend screens/components (if applicable)
- Test files
- Configuration related to this module
- Validation decorators/schemas

## Module Document Template

```markdown
---
module: {MODULE_NAME}
depends_on: [{list of module dependencies}]
---

## 1. Overview
(1-3 paragraphs: what it does, role in the system, key relationships)

### Related Entities
| Entity | Relationship | Description |
|--------|-------------|-------------|

## 2. API Endpoints

| # | Method | Route | Params | Returns | Auth/Roles | Notes |
|---|--------|-------|--------|---------|-----------|-------|

For each endpoint, document:
- Full route with HTTP method
- Request parameters (query, body, route params) with types
- Response type and shape
- Required roles/permissions
- Special behavior, side effects, or business logic triggered

## 3. Entities / Data Model

### {EntityName}

| # | Column/Field | Type | Nullable | Default | Notes |
|---|-------------|------|----------|---------|-------|

### Relations
| Relation | Type | Target Entity | FK/Join | Cascade | Notes |
|----------|------|--------------|---------|---------|-------|

### Audit Fields
- [ ] createdBy / createdAt
- [ ] updatedBy / updatedAt
- [ ] soft delete mechanism

## 4. DTOs / Request-Response Types

> If the codebase has no formal DTO layer (common in Go, Ruby on Rails, Express.js), document the **implicit request/response shapes** as inferred from controller parameter parsing, validation schemas, or serializers. Label this section "Request/Response Shapes" and note that no explicit DTO classes exist.

### Create DTO
| # | Field | Type | Required | Validation | Notes |
|---|-------|------|----------|------------|-------|

### Update DTO
| # | Field | Type | Required | Validation | Notes |
|---|-------|------|----------|------------|-------|

### Response DTO
| # | Field | Type | Notes |
|---|-------|------|-------|

(List ALL DTO variants: Basic, Mobile, Search, Paginated, etc.)

## 5. Business Rules

| # | Rule Description | Source (file:line) | Category | Test Case |
|---|-----------------|-------------------|----------|-----------|

Categories:
- **validation** — input checks, format enforcement
- **authorization** — who can do what
- **computation** — derived values, calculations
- **workflow** — state transitions, sequencing
- **constraint** — cardinality limits, uniqueness
- **default-value** — auto-populated fields

For each rule, document:
- What it enforces
- Where it's implemented (file:line)
- What happens on violation (error code, message, side effect)
- A concrete test scenario: "When X, expect Y"

This section is the primary input for SBVR generation (Phase 4). Be exhaustive — every conditional, validation, computation, and side effect in service logic is a candidate business rule.

## 6. State Machines / Workflows

If the module has status transitions or multi-step workflows:

### {Entity} Status Transitions
| From | To | Condition | Trigger | Side Effects |
|------|-----|-----------|---------|-------------|

### Workflow Steps
1. Step description → next step
2. ...

## 7. Frontend / Admin Screens (if applicable)

### {Screen Name} ({route})
- Type: list | detail | form | wizard
- Roles: which roles can access

#### Search/Filter Fields (if list)
| # | Field | Type | Default | Notes |
|---|-------|------|---------|-------|

#### Form Fields (if detail/form)
| # | Field | Input Type | Required | Validation | Notes |
|---|-------|-----------|----------|------------|-------|

#### Actions
| # | Action | Trigger | Confirmation | Roles | Notes |
|---|--------|---------|-------------|-------|-------|

## 8. Issues Found

### Security Concerns
| # | Severity | Issue | Location (file:line) | Impact | Remediation |
|---|----------|-------|---------------------|--------|-------------|

### Technical Debt
| # | Issue | Location | Impact | Remediation |
|---|-------|----------|--------|-------------|

### Code Quality
| # | Issue | Location | Better Approach |
|---|-------|----------|----------------|

## 9. Notes
- Edge cases, gotchas
- Complex logic requiring attention
- External service dependencies
- Data considerations
```

## Business Rule Extraction Guide

This is the most important part for SBVR. When reading service logic, look for every conditional, validation, computation, and side effect. For the formal mapping between code patterns and SBVR rule types, see `references/sbvr-notation-guide.md` (Rule Type Decision Framework). During Phase 2, focus on **finding** and **categorizing** rules; formal SBVR classification happens in Phase 4.

### What IS a Business Rule

| Code Pattern | Category | Example |
|-------------|----------|---------|
| Required field checks, format validations | validation | Email required, phone format |
| Uniqueness constraints, enum/allowed values | constraint | Unique email, status must be one of X/Y/Z |
| Role checks, ownership guards | authorization | Only admin can delete |
| Status-based restrictions, state transitions | workflow | Can only ship after payment |
| Calculated fields, aggregations | computation | Order total = sum of line items |
| Notifications, audit logging, cascading updates | side-effect | Email sent on order creation |
| Auto-populated fields | default-value | CreatedAt set to now |

### What is NOT a Business Rule

Do NOT capture as business rules:
- Environment-specific configuration (`if (isDev) { enableDebug() }`)
- Logging/monitoring logic (Serilog config, Application Insights setup)
- Framework boilerplate (DI wiring, middleware registration order, route config)
- Performance optimizations (caching, connection pooling, lazy loading config)
- Dev/test utilities (seed data, test helpers)
- Error handling that simply wraps and re-throws

### Common Patterns Requiring Special Attention

**Magic number status codes:** When status is stored as integers with no enum definition (e.g., `OrderStatus = 0` means confirmed, `1` means updated), document the mapping as a state machine and propose named values. These are business rules even though the code treats them as raw integers.

**Temp/draft entity patterns:** Some systems store draft or in-progress records in separate tables (e.g., `OrdersTemp` → `Orders` after payment). Document whether the draft-to-final transition is a business rule. The temp table is usually an implementation detail — model the lifecycle of the main entity, not the temp table as a separate concept.

**Auto-generated entity models:** When entity models are generated from database schema (EF EDMX, Hibernate reverse-engineering), the real business logic lives in services, not models. Focus extraction effort on service methods and controllers rather than generated model files.

## Review Passes (2-3 Rounds Required)

A single review pass is insufficient. Run 2-3 passes to achieve thorough coverage. Each pass typically catches 20-30% additional content, especially business rules hidden in conditional logic, error handlers, and middleware.

Review passes can use **parallel agents** — one per module or group of modules.

### Round 1: Completeness Check

1. Re-read every source file for each module **independently** (do NOT refer to existing module doc first)
2. List everything you find, then compare against the doc
3. Focus on:
   - Are ALL endpoints documented?
   - Are ALL entity columns documented?
   - Are ALL DTO fields documented?
   - Are ALL business rules captured?
   - Are ALL relations documented?
4. Add missing items to the module doc
5. Append `## Review Pass 1 Notes` summarizing what was added

### Round 2: Accuracy and Depth

1. For each documented business rule, re-read the source code that implements it
2. Verify file:line references are correct and still accurate
3. Focus on:
   - Incorrect descriptions or misunderstood logic
   - Missed edge cases and error handling paths
   - Business rules hidden in middleware, interceptors, or event handlers
   - Computation logic in service methods that imply derivation rules
   - Side effects (notifications, audit logs, cascading updates)
4. Append `## Review Pass 2 Notes` summarizing corrections and additions

### Round 3: Cross-Module Consistency (if needed)

1. Read all module docs together as a set
2. Check:
   - Are shared entities described consistently across modules?
   - Are cross-module business rules captured in both relevant modules?
   - Do dependency relationships match between modules?
   - Are there conflicting descriptions of the same entity or endpoint?
3. Append `## Review Pass 3 Notes` summarizing cross-module findings
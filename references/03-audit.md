# Phase 3: Security & Technical Audit

## Objective

Two audit documents that verify the codebase against the documented business rules and identify security/technical risks. A critical secondary goal is **implicit business rule discovery** — finding rules enforced in code but not captured in module docs. These discovered rules feed directly into Phase 4 (SBVR Generation).

## Inputs

- `00-overview.md` (Phase 1)
- All `{NN}-{module-name}.md` (Phase 2)
- Source code

---

## Audit 1: Security Audit

Write to `{DOCS_DIR}/00-security-audit.md`.

### Business Rule Enforcement Checks

These checks verify that business rules documented in module docs are actually enforced in code. They are unique to this skill and take priority over generic security checks.

#### A. Business Rule Enforcement Gaps

For each business rule documented in module docs (section 5: Business Rules):
1. Find the code that implements it
2. Verify it's actually enforced (not just documented)
3. Check for bypass paths — can a user circumvent the rule through:
   - Direct API calls that skip the UI
   - Manipulated request payloads
   - Race conditions between checks and actions
   - Missing middleware/guards on certain routes

**Output format:**
```markdown
| Module | Rule # | Rule Description | Code Location | Enforced? | Bypass Risk | Notes |
|--------|--------|-----------------|--------------|-----------|-------------|-------|
| Users | R3 | 2FA required for admin | auth.middleware:L42 | Yes | Low | All routes guarded |
| Songs | R7 | Only owner can edit | song.guard:L15 | Partial | High | PUT /songs missing guard |
```

#### B. Validation Rule Integrity

For each validation/constraint rule in module docs:
1. Find the database constraint or validation that enforces it
2. Check if it's enforced at the right layer (DB constraint vs application logic vs both)
3. Identify rules that rely solely on application logic with no DB backup

**Output format:**
```markdown
| Module | Rule # | Rule Description | DB Constraint | App Validation | Risk Level | Notes |
|--------|--------|-----------------|--------------|----------------|------------|-------|
| Songs | R1 | Unique ISRC | UNIQUE index | DTO validation | Low | Both layers |
| Albums | R4 | Album has 1+ songs | None | Missing | High | No enforcement |
```

#### C. Status Transition Security

For each state machine/workflow in module docs (section 6):
1. Verify the state machine is enforced in code
2. Check for direct status manipulation via API (e.g., PUT with arbitrary status value)
3. Verify forward-only rules can't be circumvented

### Implicit Business Rule Discovery

During the audit, you will discover business rules that are enforced in code but were NOT captured in the module docs. These are critical inputs for Phase 4 (SBVR Generation).

For each discovered rule:
- Document it in the audit findings
- Tag it as `[NEW RULE]`
- Note the source file:line
- Classify it: validation, authorization, workflow, computation, constraint, default-value
- Note which module it belongs to

**Output format:**
```markdown
### Newly Discovered Business Rules

| # | [NEW RULE] Description | Source (file:line) | Module | Category | Notes |
|---|----------------------|-------------------|--------|----------|-------|
| 1 | Soft-deleted users cannot log in | auth.service:L89 | Users | authorization | Implicit check, not documented |
```

### Standard Security Checks

In addition to business rule checks, audit the standard OWASP categories:

#### D. Authentication & Authorization
- Missing auth guards/middleware on endpoints
- Role escalation paths
- Token handling (expiry, refresh, revocation, storage)
- Password handling (hashing, salt, complexity)
- 2FA bypass vectors
- Session management (fixation, hijacking, concurrent sessions)
- Account lockout / brute-force protection

#### E. Injection
- SQL/NoSQL injection: raw queries, string interpolation
- Command injection: shell exec, child_process
- XSS: reflected, stored, DOM-based
- Template injection

#### F. Data Protection
- Hardcoded secrets (API keys, credentials, tokens)
- Sensitive data in logs (passwords, PII)
- Data exposure in API responses (over-fetching)
- File upload validation (type, size, path traversal)

#### G. Configuration
- CORS configuration
- HTTP security headers
- Rate limiting
- Error information leakage
- Debug features in production

#### H. Business Logic
- IDOR (accessing other users' resources)
- Mass assignment (setting admin/role/price fields)
- Race conditions
- Privilege escalation

### Output Structure

```markdown
# Security Audit: {APP_NAME}

## Executive Summary
| Severity | Count | Key Examples |
|----------|-------|-------------|
| Critical | N | ... |
| High | N | ... |
| Medium | N | ... |
| Low | N | ... |

## Business Rule Enforcement Audit
### Rule Enforcement Gaps
(Table of all rules and their enforcement status)

### Validation Rule Integrity
(Table of all validation rules and their constraint coverage)

### Status Transition Security
(Table of all state machines and their enforcement)

### Newly Discovered Business Rules
(Table of [NEW RULE] items found during the audit)

## Vulnerability Findings

### Critical Vulnerabilities
For each:
- **Severity**: Critical
- **Location**: file:line
- **Description**: what the issue is
- **Module**: which module this affects
- **Impact**: what could happen
- **Evidence**: code snippet
- **Remediation**: specific fix with code example

### High / Medium / Low Severity Issues
(Same format)

## Remediation Priority Matrix
| # | Issue | Severity | Module | Effort | Priority |
|---|-------|----------|--------|--------|----------|
```

---

## Audit 2: Technical Audit

Write to `{DOCS_DIR}/00-technical-audit.md`.

### Documentation Alignment Checks

#### A. Entity-Documentation Alignment

Compare every entity from code against what's documented in module docs:
- Are all code entities documented in the module docs?
- Do field lists match between module docs and actual entity definitions?
- Are there code entities with no corresponding module doc?

```markdown
| Code Entity | Module Doc | Field Match | Missing in Doc | Missing in Code |
|-------------|-----------|-------------|----------------|-----------------|
| User.entity | 01-users | 18/20 | last_login, avatar_url | — |
```

#### B. Relationship Implementation

Compare every relationship documented in module docs against actual database relations:
- Are all documented relationships implemented as FK/joins?
- Are cardinality constraints enforced at the DB level?
- Are there code relationships not captured in the module docs?

#### C. Business Rule Implementation Quality

For each documented business rule, assess implementation quality:

```markdown
| Module | Rule # | Rule | Implementation | Quality | Issues |
|--------|--------|------|---------------|---------|--------|
| Songs | R5 | Admin enters ISRC | Controller validation | Good | Proper DTO validation |
| Songs | R6 | Auto metadata enrichment | Service event handler | Poor | No retry on API failure |
```

### Standard Technical Checks

#### D. Architecture & Design
- Separation of concerns
- Dependency direction
- Module coupling
- Circular dependencies
- God classes/services
- Dead code

#### E. Data Layer
- ORM usage (N+1, eager/lazy loading)
- Migration health
- Index coverage
- Transaction management
- Connection pooling

#### F. API Design
- RESTful conventions
- Pagination consistency
- Error response format
- Request validation completeness

#### G. Performance
- N+1 queries
- Missing indexes
- Blocking operations
- Caching strategy
- Payload sizes

#### H. Error Handling & Resilience
- Global error handling
- Retry policies for external calls
- Circuit breakers
- Graceful degradation
- Timeout configuration

#### I. Testing
- Test coverage by module
- Test types present (unit, integration, e2e)
- Business rule test coverage

### Output Structure

```markdown
# Technical Audit: {APP_NAME}

## Executive Summary
(Health assessment, strengths, critical areas)

## Documentation Alignment

### Entity-Documentation Alignment
(Comparison table)

### Relationship Implementation
(Comparison table)

### Business Rule Implementation Quality
(Assessment table with quality grades)

### Gaps Summary
- Rules documented but not enforced in code
- Code logic not captured in module docs
- Recommendations for alignment

## Architecture Assessment
### Strengths
### Concerns
### Recommendations

## Data Layer Assessment
(Findings with file:line, snippets, impact, remediation)

## Performance Assessment
(Same format)

## Technical Debt Inventory
| # | Category | Issue | Location | Severity | Effort | Impact | Recommendation |
|---|----------|-------|----------|----------|--------|--------|---------------|

## Improvement Roadmap
### Quick Wins (< 1 day)
### Short Term (1-5 days)
### Medium Term (1-4 weeks)
### Long Term (> 1 month)
```

---

## Audit Outputs for SBVR Generation

At the end of both audits, compile a summary of all findings that affect Phase 4 (SBVR Generation):

```markdown
## Findings for SBVR Generation

### 1. Newly Discovered Business Rules
(All [NEW RULE] items from both audits — these must be added to the SBVR)

### 2. Documented Rules Not Enforced
(Rules in module docs with no code enforcement — may need reassessment before including in SBVR)

### 3. Implicit Database Constraints
(Constraints discovered in DB schema/migrations not captured as business rules)

### 4. Edge Cases Implying Additional Rules
(Error handling, validation logic, and boundary conditions that suggest additional rules)
```

This section is consumed by Phase 4 Agent 1 (Context Analyst) as a primary input alongside the module docs.

---

## Optional: Post-SBVR Audit Refresh

After Phase 4 (SBVR Generation) completes, an optional refresh pass can cross-reference the SBVR specification against code enforcement. This adds SBVR rule IDs (B1, D1, ST1, etc.) to the audit tables and identifies:
- SBVR rules defined but not enforced in code
- Code enforcement with no corresponding SBVR rule
- SBVR rules that contradict code behavior

This creates a feedback loop: the audit improves the SBVR, and the SBVR sharpens the audit.

# SBVR Architect Skill

A Claude Code skill for reverse-engineering **SBVR (Semantics of Business Vocabulary and Business Rules)** specifications from source code. Designed for modernizing legacy systems by extracting formal business rules, documenting architecture, and auditing code quality.

## What It Does

Analyzes any codebase — APIs, web apps, full-stack projects — and produces a complete set of documentation:

| Phase | Output | Description |
|-------|--------|-------------|
| 1. Architecture Overview | `00-overview.md` | System structure, tech stack, layers, module map |
| 2. Module Documentation | `{NN}-{module}.md` per module | Entities, endpoints, DTOs, business rules per module |
| 3. Security & Technical Audit | `00-security-audit.md`, `00-technical-audit.md` | Vulnerabilities, technical debt, implicit rule discovery |
| 4. SBVR Generation | `sbvr-specification.md` | Formal SBVR 1.5 vocabulary, fact types, and business rules |

## Installation

```bash
claude skill add sbvr-architect
```

Or install directly from the repository:

```bash
claude skill add /path/to/sbvr-skill
```

## Usage

Once installed, invoke the skill in Claude Code when you want to analyze a codebase for business rules and architecture documentation.

**Trigger phrases:**
- "analyze this codebase"
- "extract business rules"
- "generate SBVR"
- "document the architecture and business rules"
- "create business vocabulary from code"

**Before starting:**
1. Identify the project root (`{PROJECT_ROOT}`)
2. Create a docs directory (`{DOCS_DIR}`, typically `{PROJECT_ROOT}/docs/architecture`)
3. Determine scope: API only, frontend only, or full-stack

## Phase Workflow

```
Phase 1              Phase 2                   Phase 3              Phase 4
Architecture   →   Module Documentation   →   Audits        →   SBVR Generation
Overview           (parallel agents)           (security +        (5-agent pipeline)
(1 agent)          (2-3 review passes)         technical)
```

Each phase builds on all previous phases. The **SBVR specification is the final deliverable**, incorporating everything discovered in phases 1-3.

### Phase 1: Architecture Overview

Single-pass exploration producing `00-overview.md` — the foundation document. Maps tech stack, layered architecture, external integrations, auth/authz, and a module map that drives Phase 2.

### Phase 2: Module Documentation

For each module in the module map, produces a comprehensive document covering endpoints, entities, DTOs, business rules, frontend screens, and issues. Uses **parallel agents** for large codebases and **2-3 review passes** to catch the 20-30% of content missed in the first pass.

### Phase 3: Security & Technical Audit

Two audit documents covering OWASP security checks, architecture quality, technical debt, and — critically — **implicit business rule discovery**. Rules found during the audit that weren't captured in module docs are tagged and fed into SBVR generation.

### Phase 4: SBVR Generation

The core deliverable. Uses a **5-agent sequential pipeline** with review checkpoints:

1. **Context Analyst** — extracts ground facts, concepts, relationships, and candidate rules
2. **Vocabulary Developer** — formalizes concepts with genus + differentia definitions
3. **Fact Type Engineer** — specifies relationships with bidirectional cardinality
4. **Rule Formulator** — writes rules with correct modality and complete role navigation
5. **Validation Specialist** — tests the model for contradictions, completeness, and clarity

## Project Structure

```
SKILL.md                              # Main skill definition and phase orchestration
README.md                             # This file
references/
  01-architecture-overview.md         # Phase 1: detailed exploration and output guidance
  02-module-documentation.md          # Phase 2: per-module template, multi-agent, review passes
  03-audit.md                         # Phase 3: security + technical audit with rule discovery
  04-sbvr-generation.md               # Phase 4: 5-agent SBVR pipeline
  sbvr-notation-guide.md              # SBVR 1.5 notation, decision framework, anti-patterns
```

## Supported Codebase Types

| Type | Focus Areas |
|------|-------------|
| REST API (Node/Python/Java/.NET) | Controllers, services, entities, DB schema |
| Frontend SPA (React/Vue/Angular) | Components, state, API calls, form validations |
| Full-stack monolith | Both layers plus shared types/contracts |
| Microservices | Service boundaries, inter-service communication, shared events |

## Key Principles

- **Traceability**: Every SBVR rule traces to source code. Every code pattern traces to an SBVR concept.
- **Completeness over speed**: Read every source file. Missed rules compound into gaps.
- **Audit before formalize**: Audits discover implicit rules that feed into SBVR generation.
- **Business language only**: SBVR rules describe what the business requires, not how the database stores it.
- **Define before use**: Never reference an SBVR term before defining it.

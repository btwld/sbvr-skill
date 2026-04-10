---
name: sbvr-architect
description: "Analyze source code (APIs, web apps, or full-stack projects) and generate comprehensive SBVR (Semantics of Business Vocabulary and Business Rules) documentation along with architecture docs, module documentation, and security/technical audits. Use this skill whenever the user wants to: reverse-engineer business rules from code, create SBVR specifications from a codebase, document system architecture with business vocabulary, audit business logic consistency, extract entities and relationships from source code, generate formal business rule documentation from an existing application, or perform architecture analysis that feeds into SBVR generation. Also triggers for: 'analyze this codebase', 'extract business rules', 'generate SBVR', 'document the architecture and business rules', 'create business vocabulary from code', or any request combining code analysis with formal business rule specification. This skill handles both API backends and frontend applications, individually or together."
---

# SBVR Architect

Generate SBVR-compliant business vocabulary, fact types, and business rules by analyzing source code — APIs, web apps, or both.

## What This Skill Produces

The skill runs in **4 phases**, each producing markdown documents in a `{DOCS_DIR}/` directory:

| Phase | Output File(s) | What It Does |
|-------|----------------|--------------|
| 1. Architecture Overview | `00-overview.md` | System architecture, tech stack, layers, module map |
| 2. Module Documentation | `{NN}-{module}.md` per module | Entities, endpoints, DTOs, business rules per module |
| 3. Security & Technical Audit | `00-security-audit.md`, `00-technical-audit.md` | Security gaps, technical debt, implicit business rule discovery |
| 4. SBVR Generation | `sbvr-specification.md` | Formal SBVR vocabulary, fact types, and rules |

## Before You Start

1. Identify the project root: `{PROJECT_ROOT}` — where the source code lives
2. Identify or create the docs directory: `{DOCS_DIR}` — typically `{PROJECT_ROOT}/docs/architecture`
3. Determine scope: API only, frontend only, or full-stack

## Phase Execution

Each phase builds on all previous phases. Read the corresponding reference file before executing each phase.

### Starting from a Later Phase

If prior phase outputs already exist in `{DOCS_DIR}/`, you can start from any phase:
- **Starting Phase 2**: Requires `00-overview.md` with a Module Map
- **Starting Phase 3**: Requires `00-overview.md` + all module docs
- **Starting Phase 4**: Requires `00-overview.md` + all module docs + both audit docs
- **Phase 4 only (minimal)**: If only existing documentation (not from this skill) is available, run Agent 1 (Context Analyst) directly against source code + existing docs, then continue the pipeline

Before skipping phases, verify existing docs have sufficient detail — especially a Module Map (for Phase 2) and Business Rules sections with file:line references (for Phase 4).

### Phase 1: Architecture Overview

**Read:** `references/01-architecture-overview.md`

Steps:
1. Explore project structure — package files, entry points, config
2. Identify tech stack, frameworks, languages, dependencies
3. Map the layered architecture (controllers → services → repositories → models)
4. Identify external integrations (databases, APIs, queues, caches)
5. Map authentication/authorization mechanisms
6. List all modules/domains and their relationships
7. Write `{DOCS_DIR}/00-overview.md`

The overview document is the foundation — every subsequent phase references it. Be exhaustive. Include code snippets and file paths.

### Phase 2: Module Documentation

**Read:** `references/02-module-documentation.md`

For EACH module identified in Phase 1's Module Map:
1. Read all source files for the module (controllers, services, entities, DTOs, tests, frontend)
2. Document every endpoint, entity column, DTO field, and business rule
3. Flag security concerns and technical debt
4. Write concrete test cases for every business rule
5. Write `{DOCS_DIR}/{NN}-{module-name}.md`

#### Multi-Agent Execution (Recommended for 4+ Modules)

Use the **Agent tool** to spawn parallel agents — one per module or group of 2-3 related modules. Each agent's prompt must include: (1) the path to `00-overview.md`, (2) the module template from `references/02-module-documentation.md`, (3) the assigned module name(s) and directory path(s), (4) the output file path. Agents run concurrently — launch all agents in a single message for maximum parallelism. For large codebases (15+ modules), batch agents in groups of 5-8 to avoid rate limits.

#### Review Passes (2-3 Rounds)

After all module docs are written, run 2-3 review passes:

**Round 1 — Completeness:** Re-read source code independently (without looking at the doc first), then compare against the doc. Add missing endpoints, entities, fields, business rules.

**Round 2 — Accuracy:** For each documented business rule, re-read the implementing source code. Verify file:line references. Focus on edge cases, error handling paths, and implicit rules in middleware.

**Round 3 — Cross-Module Consistency (if needed):** Read all module docs together. Check shared entities are described consistently. Check cross-module rules are captured in both modules.

Each round typically catches 20-30% additional content. Parallel agents can be used for review passes too.

### Phase 3: Security & Technical Audit

**Read:** `references/03-audit.md`

Two audit documents focused on code quality, security, and business rule inventory:

**Security Audit** (`00-security-audit.md`):
- Business rule enforcement gaps — are documented rules actually enforced in code?
- Validation rule integrity — DB constraints vs application-only enforcement
- Status transition security — can state machines be bypassed?
- Standard OWASP security checks (auth, injection, data protection, config, business logic)
- **Implicit business rule discovery** — rules enforced in code but not in module docs, tagged `[NEW RULE]`

**Technical Audit** (`00-technical-audit.md`):
- Entity-documentation alignment — do code entities match module docs?
- Business rule implementation quality assessment
- Architecture, data layer, API design, performance assessment
- Technical debt inventory with improvement roadmap

These audits surface additional business rules, constraints, and edge cases that feed into Phase 4 (SBVR generation). Pay special attention to `[NEW RULE]` items — they are critical inputs for SBVR.

### Phase 4: SBVR Generation

**Read:** `references/04-sbvr-generation.md` and `references/sbvr-notation-guide.md`

This is the **core deliverable**. It uses ALL prior outputs: architecture overview, module docs, and audit findings.

#### Multi-Agent Pipeline (5 Sequential Agents)

SBVR generation follows a 5-agent pipeline. Each agent builds on the previous agent's output. After each agent completes, review its output for completeness and correctness before spawning the next agent. For automated runs, perform this review programmatically (check for empty sections, undefined terms, missing cardinalities). For interactive runs, present a summary to the user and ask for approval before proceeding.

**Agent 1: Context Analyst** — Reads all module docs + audit findings. Produces ground facts inventory, candidate concepts (nouns), candidate relationships (verbs), candidate rules (typed), and ambiguities for resolution.

**Agent 2: Vocabulary Developer** — Formalizes each concept: genus + differentia definition, reference schemes, field lists, dependency ordering, specialization hierarchies. Applies the Business Stakeholder Test.

**Agent 3: Fact Type Engineer** — Specifies all relationships: preferred and alternative verb wordings, bidirectional cardinality, mandatory vs optional participation, role names, domain grouping.

**Agent 4: Rule Formulator** — Writes every business rule: classifies (D/B/DR/ST), applies correct modality, complete role navigation, enforcement levels, systematic numbering. Checks all anti-patterns.

**Agent 5: Validation Specialist** — Tests the complete model: ground facts test, contradiction check, undefined terms, completeness vs module docs, Business Stakeholder Test, traceability test. Fixes are applied before writing the final spec.

Output: `{DOCS_DIR}/sbvr-specification.md`

The SBVR output must comply with **SBVR 1.5 standard notation**. See the notation guide for formatting rules, decision frameworks, and anti-patterns.

For small codebases (<3 modules), agents 1-4 can be collapsed into a single pass. Agent 5 (Validation) should always run separately.

### Optional Phase 5: Post-SBVR Audit Refresh

> **Trigger:** Only run this phase when the user explicitly requests it, or when the SBVR specification is complete and the user wants a final validation pass.

After the SBVR specification is complete, an optional audit refresh can cross-reference SBVR rules against code enforcement. This adds SBVR rule IDs to the Phase 3 audit tables and identifies:
- SBVR rules defined but not enforced in code
- Code enforcement with no corresponding SBVR rule
- SBVR rules that contradict code behavior

### Optional Phase 6: Stakeholder Validation Questionnaire

> **Trigger:** Run after Phase 4 (or Phase 5) when the user wants to validate findings with business stakeholders.

Generate a structured questionnaire from the SBVR specification and audit findings, designed to surface gaps between code behavior and actual business intent.

**Output:** `{DOCS_DIR}/00-validation-questionnaire.md`

**Structure — group questions by audience:**

1. **Product / Business Stakeholders**
   - Confirm or correct inferred business terminology
   - Validate business rule interpretations (especially rules with weak code evidence)
   - Identify outdated or legacy logic that no longer reflects current policy
   - Clarify workflow exceptions and edge cases

2. **Developer / Architect**
   - Confirm integration intent and external system dependencies
   - Validate state machine completeness (missing transitions?)
   - Identify undocumented business rules not visible in code
   - Resolve terminology inconsistencies found across modules

3. **QA**
   - Validate test scenarios derived from business rules
   - Identify untested edge cases and boundary conditions
   - Confirm expected behavior for error/exception paths

4. **Operations / Support**
   - Confirm operational workflows match documented state machines
   - Identify manual processes that complement automated workflows
   - Validate escalation paths and exception handling

For each question, reference the specific SBVR rule ID, module documentation section, or audit finding that prompted it. Prioritize questions about inferred rules, terminology inconsistencies, and suspected legacy logic.

## Model Considerations

- **Opus/Sonnet**: Can run the full pipeline as described. Use Opus for Phase 4 (SBVR Generation) if available — modality decisions and formal notation benefit from stronger reasoning.
- **Haiku**: Suitable for Phase 1 and Phase 2 (documentation). For Phase 4, collapse agents 1-4 into a single pass regardless of codebase size, and still run Agent 5 (Validation) separately.
- **Subagents**: When spawning parallel agents for Phase 2, the subagents can use a faster/cheaper model since module documentation is more straightforward than SBVR formalization.

## Key Principles

**Traceability**: Every SBVR rule should trace back to source code (file:line). Every code pattern should trace forward to an SBVR concept.

**Completeness over speed**: Read every source file. A missed entity or business rule compounds into gaps across the SBVR, audit, and module docs.

**Audit before formalize**: Run security and technical audits before SBVR generation. Audits discover implicit business rules that code implements but nobody documented.

**Business language only**: SBVR rules describe what the business requires, not how the database stores it. No database types (varchar, UUID, FK) in business rules. Field lists in vocabulary entries may use implementation types for traceability.

**Define before use**: In the SBVR vocabulary, never reference a term before defining it. Order concepts from most basic to most complex.

**Uniqueness constraints are mandatory**: Every fact type must specify cardinality in both directions. This is the most commonly skipped step and the most damaging when missing.

**Modal precision**: Definitional rules use "necessary" or "impossible". Behavioral rules use "obligatory", "prohibited", or "permitted". Never mix them.

## Error Recovery

If a phase or agent fails mid-execution:
- **Truncated output**: Re-run the agent with a narrower scope (fewer modules, or split the module into sub-sections). Check that the output file was written — partial files are better than no files.
- **Context limit hit**: For Phase 2, reduce modules per agent to 1. For Phase 4, ensure intermediate drafts are written to files (not kept in context) so subsequent agents can read them fresh.
- **Inconsistent outputs**: Run an additional review pass targeting the specific inconsistency. Don't restart from scratch — build on what exists.
- **User wants to stop mid-pipeline**: All phase outputs are standalone markdown files. The user can resume later by starting from the next phase.

## Output Format

All outputs are markdown files. The SBVR specification follows the document structure defined in `references/sbvr-notation-guide.md`:

1. Document Overview
2. Part 1: Business Vocabulary
3. Part 2: Fact Types (Relationships)
4. Part 3: Business Rules
5. Part 4: Status Transitions and Workflow Rules
6. Part 5: Integration and Process Workflows
7. Part 6: Implementation Notes
8. Part 7: Compliance Checklist
9. Appendices (as needed)

## Adapting to Different Codebases

| Codebase Type | Focus Areas |
|---------------|-------------|
| REST API (Node/Python/Java/.NET) | Controllers → Services → Entities → DB schema |
| Frontend SPA (React/Vue/Angular) | Components → State → API calls → Form validations |
| Full-stack monolith | Both layers, plus shared types/contracts |
| Microservices | Service boundaries, inter-service communication, shared events |

For monorepos or multi-service setups, treat each service as a separate module in Phase 2 and unify the SBVR vocabulary across services in Phase 4. Shared libraries become their own module docs. Produce a single unified SBVR specification across all services, noting the owning service for each concept in the vocabulary.

For frontend-only codebases (React/Vue/Angular with no backend), invert the Phase 2 template emphasis: Section 7 (Frontend Screens) becomes primary content, Section 5 (Business Rules) focuses on client-side validation and state management rules, and Section 2 (API Endpoints) documents the external APIs the frontend consumes rather than exposes.

For codebases with no clear module boundaries (single-folder apps, monolithic scripts):
- In Phase 1, create logical modules based on **entity clusters** or **feature areas** rather than directory structure
- Group endpoints by the primary entity they operate on (e.g., all `/users/*` routes = Users module)
- If the codebase has fewer than 3 logical modules, skip multi-agent execution in Phase 2 and the 5-agent pipeline in Phase 4 (collapse to single-pass)

For codebases with no tests: Phase 2 test case sections become **proposed test cases** rather than documented ones. Note this gap in Phase 3 audit.

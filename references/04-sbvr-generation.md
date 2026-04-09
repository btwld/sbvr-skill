# Phase 4: SBVR Generation

## Objective

Produce a complete SBVR 1.5 specification by analyzing all prior documentation and source code. This is the **core deliverable** of the skill — a formal business vocabulary, fact types, and rules that capture the system's business semantics.

## Inputs

- `00-overview.md` (Phase 1)
- All `{NN}-{module-name}.md` (Phase 2)
- `00-security-audit.md` and `00-technical-audit.md` (Phase 3)
- Source code (for verification)

The primary source of business rules is the module docs (section 5: Business Rules). The audit docs provide additional rules discovered during security and technical analysis (tagged `[NEW RULE]`).

---

## Multi-Agent Pipeline (5 Sequential Agents)

SBVR generation follows a 5-agent pipeline. Each agent builds on the previous agent's output. **Review each agent's output before proceeding to the next.**

### Scaling Guidance

- **Large codebases (4+ modules):** Run the full 5-agent pipeline as described below.
- **Small codebases (<3 modules):** Agents 1-4 can be collapsed into a single pass by one agent. Agent 5 (Validation) should always run separately for independent verification.

### Intermediate Output Storage

Each agent writes its output to `{DOCS_DIR}/sbvr-draft/` as a working file. The next agent reads the previous agent's file as input. After Agent 5 completes, the final specification is compiled to `{DOCS_DIR}/sbvr-specification.md` and the draft directory can be deleted.

| Agent | Output File |
|-------|------------|
| Agent 1 | `sbvr-draft/01-context-analysis.md` |
| Agent 2 | `sbvr-draft/02-vocabulary.md` |
| Agent 3 | `sbvr-draft/03-fact-types.md` |
| Agent 4 | `sbvr-draft/04-rules.md` |
| Agent 5 | `sbvr-draft/05-validation-report.md` |

---

### Agent 1: Context Analyst

**Goal:** Extract all raw material from documentation into structured lists that feed subsequent agents.

**Process:**
1. Read every module doc section 5 (Business Rules) — these are the primary input
2. Read audit findings for implicit rules tagged `[NEW RULE]`
3. Read entity definitions from module docs for vocabulary candidates
4. Read state machines/workflows from module docs for transition rules
5. Read the architecture overview for cross-cutting concerns that imply rules

**Output Format:**

```markdown
## Context Analysis

### Semantic Community
[Business domain name and scope]

### Ground Facts (what the system actually does)
1. [Concrete statement about system behavior, with source reference]
2. ...
(Target: 15-30 ground facts depending on system complexity)

### Candidate Concepts (Nouns)
| # | Concept | Source Module | Description | Specializes |
|---|---------|-------------|-------------|-------------|

### Candidate Relationships (Verbs)
| # | Concept A | Verb | Concept B | Source | Cardinality Hint |
|---|----------|------|----------|--------|-----------------|

### Candidate Rules
| # | Rule Text | Source (module:rule#) | Proposed Type (D/B/DR/ST) | Notes |
|---|----------|---------------------|--------------------------|-------|

### Ambiguities and Questions
1. [Unclear item needing resolution before proceeding]
2. ...
```

**Checkpoint:** Review the Context Analyst output. Resolve all ambiguities. Confirm concept and rule lists are complete before proceeding.

---

### Agent 2: Vocabulary Developer

**Goal:** Formalize every concept from Agent 1 into SBVR-compliant definitions.

**Process:**
1. Order concepts from most basic to most complex — no forward references allowed
2. For each concept, write:
   - **Definition** using genus + differentia (what broader category + what distinguishes it)
   - **Reference Scheme** for identified concepts
   - **General Concept** for specialized concepts (with inheritance note)
   - **Complete Field List** with data types (for traceability to code)
3. Identify specialization hierarchies
4. Apply the **Business Stakeholder Test** to every definition

**Decision Framework for Definitions:**
- Subtype → use parent as genus, specialization as differentia
- Role → "a [base type] that [plays role in context]"
- Process/Event → "an [activity/event] that [what it accomplishes]"
- Document/Record → "a [record type] that [what it documents]"

**Anti-patterns to catch:**
- Circular definitions (term uses itself directly or through synonyms)
- Implementation leakage ("a database row", "a UUID field")
- Over-specification (technical constraints belong in rules, not definitions)
- Missing reference schemes for identified concepts
- Forward references (using a term before defining it)

**Output Format:**

```markdown
## Business Vocabulary

### Core Concepts
(Most basic concepts defined first)

### {concept name}
- Definition: a {genus} that {differentia}
- Reference Scheme: {identifier} identifies {concept}
- Complete Field List:
  - field (type, constraints)

### Dependent Concepts
(Concepts that reference core concepts)

### Specialized Concepts
(Subtypes with General Concept links)
```

**Checkpoint:** Review vocabulary. Verify ordering (no forward references), completeness, and definition quality. Every concept should pass the Business Stakeholder Test.

---

### Agent 3: Fact Type Engineer

**Goal:** Specify all relationships with precise cardinality in both directions.

**Process:**
1. For each candidate relationship from Agent 1, write the full fact type block
2. Determine cardinality from entity relations, business rules, and code constraints:
   - Required FK (NOT NULL) → "exactly one"
   - Optional FK (NULLABLE) → "at most one"
   - M:N join table → determine each side's minimum
   - 1:1 → determine mandatory vs optional on each side
3. Write both preferred and alternative verb concept wordings
4. Add role names when they aid navigation clarity
5. Group by domain area

**Anti-patterns to catch:**
- Missing cardinality: every fact type MUST have necessity in both directions (or a note explaining why one direction is unconstrained)
- Vague verbs: "is related to" — use specific verbs describing the relationship nature
- Missing alternative wording: always provide the inverse reading
- Fact types that should be objectified (relationship has properties — see notation guide)

**Output Format:**

```markdown
## Fact Types

### {Domain Area} Relationships

**Fact Type: {concept A} {verb} {concept B}**
- Preferred: {A} {verb} {B}
- Alternative: {B} is {past participle} by {A}
- Necessity: each {A} {verb} {cardinality} {B}
- Necessity: each {B} is {past participle} by {cardinality} {A}

### Value Attributes
| Fact Type | Necessity |
|-----------|-----------|
| ... | ... |
```

**Checkpoint:** Review fact types. Verify all cardinalities are specified. Verify all vocabulary terms used in fact types are defined in Agent 2's output.

---

### Agent 4: Rule Formulator

**Goal:** Write every business rule in correct SBVR notation with proper modality and complete role navigation.

**Process:**
1. Take all candidate rules from Agent 1
2. Classify each rule using the decision framework:

| If the rule describes... | Type | Modality |
|--------------------------|------|----------|
| Structural truth about the domain | Definitional (D) | necessary / impossible |
| Enforceable policy or obligation | Behavioral (B) | obligatory / prohibited / permitted |
| Computed value | Derivation (DR) | = formula |
| State transition governance | Status Transition (ST) | permitted only if |

3. Write each rule with:
   - Correct modal keyword
   - Complete role navigation (no ambiguous "the user" — specify WHICH user via fact type paths)
   - Explicit quantification ("each", "exactly one", "at least one", etc.)
   - Enforcement context for behavioral rules
4. Number rules systematically: D1-DN, B1-BN, DR1-DRN, ST1-STN
5. Group rules by domain area, then by type within each area

**Modality Precision Rules:**
- NEVER use "obligatory" for structural truths → use "necessary"
- NEVER use "necessary" for policies → use "obligatory"
- "impossible" = structural impossibility (cannot exist by definition)
- "prohibited" = policy prohibition (system prevents it, but it's conceptually possible)

**Anti-patterns to catch:**
- "System as Actor": write "It is obligatory that notification is sent" NOT "The system sends notification"
- Missing role navigation: "It is obligatory that the user is notified" → WHICH user? Navigate: "the user who created the order"
- Mixing modalities in one rule
- Hard-coded thresholds: use policy reference pattern instead
- Procedural language: rewrite as declarative constraints
- Imprecise temporal language: use specific durations

**Enumeration handling:**
- Use definitional rules: "It is impossible that order status is other than Pending, Confirmed, Shipped, Delivered, Cancelled"

**Output Format:**

```markdown
## Business Rules

### {Domain Area}

#### Definitional Rules
**D{N}:** It is necessary that {statement}
*Note: {justification}*

#### Derivation Rules
**DR{N}:** {derived value} = {formula}
*Note: {what this computes}*

#### Behavioral Rules

**Obligations:**
**B{N}:** It is obligatory that {statement}
*Note: {enforcement context}*

**Prohibitions:**
**B{N}:** It is prohibited that {statement}
*Note: {what this prevents}*

**Permissions:**
**B{N}:** It is permitted that {statement} only if {condition}
*Note: {when this applies}*

#### Status Transition Rules
**ST{N}:** It is permitted that {entity} status changes from "{A}" to "{B}" only if {condition}
```

**Checkpoint:** Review all rules. Verify modality correctness, complete quantification, no undefined terms, no anti-patterns.

---

### Agent 5: Validation Specialist

**Goal:** Test the complete SBVR model for correctness, completeness, and clarity. This agent provides independent verification.

**Validation Tests:**

#### 1. Ground Facts Test
Take each ground fact from Agent 1. Can it be expressed using the vocabulary, fact types, and rules? If not, something is missing — identify the gap.

#### 2. Contradiction Test
Do any two rules conflict? Examples:
- Rule D3 says "each order has exactly one status" but Rule ST5 implies two simultaneous statuses
- Rule B2 says "prohibited" but Rule B7 says "permitted" for the same action without distinguishing conditions

#### 3. Undefined Terms Test
Scan every rule for noun concepts and verb concepts. Are they all defined in the vocabulary and fact types sections? Flag any terms used but not defined.

#### 4. Completeness Test
Cross-reference against ALL module doc business rules tables (section 5 of each module doc). Is every documented business rule captured in the SBVR? Flag gaps with module:rule# references.

Also check: are all `[NEW RULE]` items from the audit docs captured?

#### 5. Business Stakeholder Test
Read each rule aloud. Would a business domain expert understand it without technical context? Flag rules that fail.

#### 6. Traceability Test
- Does every SBVR rule trace back to source code (file:line)?
- Does every significant code pattern trace forward to an SBVR concept?
- Are there code behaviors with no corresponding SBVR rule?

#### 7. SBVR 1.5 Compliance Check
- Every concept has genus + differentia definition
- Every fact type has bidirectional cardinality
- Every rule has correct modality
- Every rule has explicit quantification
- No anti-patterns present (system as actor, procedural language, etc.)

**Output Format:**

```markdown
## Validation Report

### Test Results
| Test | Status | Issues Found |
|------|--------|-------------|
| Ground Facts | PASS/FAIL | N issues |
| Contradictions | PASS/FAIL | N issues |
| Undefined Terms | PASS/FAIL | N issues |
| Completeness | PASS/FAIL | N issues |
| Business Stakeholder | PASS/FAIL | N issues |
| Traceability | PASS/FAIL | N issues |
| SBVR 1.5 Compliance | PASS/FAIL | N issues |

### Issues Detail
(For each issue: what's wrong, where, recommended fix)

### Recommended Fixes
(Specific changes to vocabulary, fact types, or rules)
```

**Apply all fixes before writing the final specification.**

---

## Writing the Final Specification

After all 5 agents complete and all validation issues are resolved, compile the final `{DOCS_DIR}/sbvr-specification.md` following the 7-part structure defined in `references/sbvr-notation-guide.md`:

1. Document Overview
2. Part 1: Business Vocabulary
3. Part 2: Fact Types (Relationships)
4. Part 3: Business Rules (Definitional, Derivation, Behavioral)
5. Part 4: Status Transitions and Workflow Rules
6. Part 5: Integration/Process Workflows
7. Part 6: Implementation Notes + Part 7: Compliance Checklist

## Quality Checklist

Before marking Phase 4 complete:

- [ ] Every concept defined before first use (dependency ordering)
- [ ] Every fact type has cardinality in both directions
- [ ] Every rule uses correct modality (no mixing definitional/behavioral)
- [ ] Every rule has explicit quantification
- [ ] Every behavioral rule has enforcement context
- [ ] No database implementation terms in rules (varchar, UUID, FK)
- [ ] No "system as actor" phrasing in any rule
- [ ] Every module doc business rule is captured in the SBVR
- [ ] All `[NEW RULE]` items from audit docs are included
- [ ] Validation specialist approved the complete model
- [ ] Business Stakeholder Test passes for all rules
- [ ] Rule numbering is sequential with no gaps per category

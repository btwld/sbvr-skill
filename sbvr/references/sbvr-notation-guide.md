# SBVR 1.5 Notation Guide

Comprehensive reference for writing SBVR-compliant specifications. Covers notation, vocabulary structure, rule types, decision frameworks, anti-patterns, and advanced modeling patterns.

**Standards alignment:** SBVR 1.5 with project-specific conventions for quantification, reference schemes, and policies.

---

## The Business Stakeholder Test

After writing any SBVR element (definition, fact type, or rule), apply this test:

> Could a business domain expert who has never seen the code read this and say "Yes, that's how our business works" or "No, that's wrong"?

If understanding the element requires knowledge of the database schema, API design, or programming language — rewrite it in business terms. This is the single most reliable quality check for SBVR output.

---

## What SBVR Is (and Is Not)

SBVR captures **business semantics only**. It is technology-agnostic and declarative.

### Exclude from SBVR

| Category | Examples to Exclude |
|----------|-------------------|
| Database design | field types, VARCHAR, UUID, foreign keys, indexes, table names |
| File specifications | 44.1kHz, 320kbps, MP3, WAV, JSON, file size limits |
| API details | endpoints, rate limits, HTTP methods, request/response schemas |
| Architecture | microservices, queues, caching, storage systems |
| Date/time formats | ISO 8601, Unix timestamps, timezone encodings |
| UI elements | buttons, dropdowns, modals, screens, navigation |

---

## Document Structure

The final SBVR specification follows this structure:

```
# SBVR Documentation - {System Name}
## Version {X.Y.Z} - {Organization} Implementation
*Fully compliant with SBVR 1.5 standard notation*

## Document Overview
## Part 1: Business Vocabulary
## Part 2: Fact Types (Relationships)
## Part 3: Business Rules
## Part 4: Status Transitions and Workflow Rules
## Part 5: Integration and Process Workflows
## Part 6: Implementation Notes
## Part 7: Compliance Checklist
## Appendices
```

### Formatting Conventions

- H2 (`##`) for major parts (Vocabulary, Fact Types, Rules)
- H3 (`###`) for domain sections (User Concepts, Song Relationships)
- H4 (`####`) for subsections (User Types, Obligations)
- `---` horizontal rules to separate subsections
- **Bold** for term names, fact type names, and rule prefixes
- Bullet lists for fields (Definition, Reference Scheme, Necessity)

---

## Part 1: Business Vocabulary

### Naming Conventions

- **Use singular form** — "customer" not "customers"
- **Avoid abbreviations** — "identifier" not "ID" (abbreviations can be noted as synonyms)
- **Pick one term for synonyms** — choose "customer" or "client", not both
- **Use business language** — "customer identifier" not "customer_id"

### When to Define a Term

Define a term if ANY apply:
- Appears in 2+ fact types or rules
- Has a unique identifier (reference scheme)
- Is a specialized concept (inherits from a parent)
- Multiple interpretations exist without a definition
- Represents a quantifiable state or status

Do NOT define:
- Modifiers/adjectives (handle in fact types: "active user" → user has account status)
- Obvious measures (30 days, $500 — use directly in rules)
- Implementation artifacts (database fields, API endpoints)

### Concept Definition Format

Every noun concept must include:

```markdown
### **{concept name}**

Definition: a {genus} that {differentia}
Reference Scheme: {identifier field} identifies {concept name}
```

**Genus** = the broader category (parent type).
**Differentia** = what distinguishes this concept from others in the same genus.

**Examples:**
- `system administrator` — Definition: a **user** who manages system configuration and has full access
- `purchase authorization` — Definition: an **approval** that permits acquisition of a source recording

### Specialized Concepts

When a concept is a subtype of another:

```markdown
### **{specialized concept}**

Definition: a {parent concept} that {differentia}
General Concept: {parent concept}
Note: Inherits {parent concept} reference scheme
```

Specialized concepts inherit their parent's reference scheme — do not repeat it.

### Vocabulary Captions Reference

#### Primary Captions

| Caption | Purpose | Required |
|---------|---------|----------|
| `Definition:` | Genus + differentia — the essential meaning | Yes |
| `General Concept:` | Parent concept for specialization hierarchies | When specializing |
| `Reference Scheme:` | How instances are identified | For identified concepts |
| `Note:` | Annotations, clarifications, explanations | Optional |
| `Example:` | Illustrative instances | Optional |

#### Secondary Captions

| Caption | Purpose | When to Use |
|---------|---------|-------------|
| `Source:` | Citation of external documentation | When from external standard |
| `Synonym:` | Alternative designation for the same concept | When multiple terms exist |
| `Dictionary Basis:` | Labels a definition adapted from a dictionary | When borrowing from dictionaries |
| `See:` | Points to preferred representation | When primary is deprecated |
| `Synonymous Form:` | Alternate wording for verb concepts | For verb concept entries only |
| `Description:` | Extended explanation | When more context helps |
| `Descriptive Example:` | Detailed sample material | When examples need detail |

### Enumeration Handling

Express enumerations through **definitional rules**, not captions:

```markdown
**role**
- Definition: a designation that determines user permissions
- Reference Scheme: role name identifies role
- Definitional Rules:
  - It is impossible that a role is other than admin, editor, or viewer
```

Each permissible value can optionally have its own term definition if it has unique behavior:

```markdown
**admin**
- Definition: a role that grants full system access
- General Concept: role
```

### Complete Field Lists

Every concept includes its full field list with types. Field lists bridge business vocabulary to technical implementation — use implementation-aware types here for traceability.

```markdown
### Complete Field List:
- field_name (type, constraints)
- field_name (foreign key)
- field_name (enum: Value1, Value2, Value3)
```

Data types for field lists:
- `varchar N` — variable-length string
- `text` — unlimited text, optionally with `max N`
- `integer` — whole numbers
- `decimal N,M` — fixed-point
- `bigint` — large integers
- `boolean` — true/false
- `date` — date
- `datetime` — date + time
- `json` — structured JSON data
- `enum: A, B, C` — enumerated values
- `UUID` — system-generated unique identifier
- `foreign key` — reference to another entity

> **Important:** Field lists are for implementers. In **Business Rules** (Part 3), never use database types. Rules must use business language:
> - WRONG: "It is necessary that each user has a varchar(255) email"
> - RIGHT: "It is necessary that each user has exactly one email address"

### Ordering Rule

Define concepts in dependency order. Never reference a term that hasn't been defined yet:

1. **Core System Concepts** — the system itself, top-level containers
2. **User and Authentication** — user, roles, auth mechanisms
3. **Primary Domain Objects** — the main business entities
4. **Reference/Lookup Data** — categories, types, enums
5. **Workflow/Process Concepts** — approvals, transitions, notifications
6. **Integration Concepts** — APIs, sync records, external services

---

## Part 2: Fact Types

### Fact Type Format

```markdown
### Fact Type: {concept A} {verb} {concept B}

Preferred verb concept wording: {A} {verb} {B}
Alternative verb concept wording: {B} is {past participle} by {A}
Necessity: each {A} {verb} {cardinality} {B}
Necessity: each {B} is {past participle} by {cardinality} {A}
```

Always provide both preferred and alternative (inverse) wordings.

### Cardinality Expressions

| Expression | Meaning | When to Use |
|-----------|---------|-------------|
| exactly one | mandatory, single | Required FK, 1:1 mandatory |
| at most one | optional, single | Optional FK, 1:1 optional |
| at least one | mandatory, multiple | Must have 1+, M:N minimum |
| one or more | same as at least one | Collection that can't be empty |
| zero or more | optional, multiple | M:N fully optional side |
| at least N | N or more | Minimum threshold |
| at most N | up to N | Maximum threshold |
| at least N and at most M | range | Range constraint |

### Bidirectional Quantification

Express quantification in **every intended direction**. Both directions should have necessity statements so constraints are explicit:

```markdown
**Fact Type: customer owns account**
- Preferred: customer owns account
- Alternative: account is owned by customer
- Necessity: each customer owns zero or more accounts
- Necessity: each account is owned by exactly one customer
```

When the reverse direction has no business constraint, you may omit it but add a note:

```markdown
**Fact Type: employee has salary amount**
- Necessity: each employee has exactly one salary amount
- Note: Reverse direction unconstrained (multiple employees may share same salary)
```

### Value Attributes

SBVR models all attributes as **binary fact types** using the "has" pattern. Use tables for compactness:

| Fact Type | Necessity |
|-----------|-----------|
| user has email address | each user has exactly one email address; each email address belongs to at most one user |
| user has first name | each user has exactly one first name |
| song has release date | each song has at most one release date |

### Unary Fact Types

For boolean properties where the concept either has or lacks a characteristic:

```markdown
**Fact Type: customer is active**
- Necessity: each customer is active or is not active
```

Common examples: `user is verified`, `order is cancelled`, `account is locked`. These replace boolean fields in entity models. Do NOT model as binary fact types with a boolean value — use the unary pattern.

### Grouping

Group fact types by domain area:
- 2.1 User Management Relationships
- 2.2 Primary Domain Relationships
- 2.3 Reference Data Relationships
- 2.4 Workflow Relationships
- 2.5 Integration Relationships

---

## Part 3: Business Rules

### Rule Categories

SBVR defines two fundamental rule categories based on modality.

#### 3.1 Definitional Rules (Alethic Modality)

Structural truths about the domain. They define what IS and ISN'T possible — cannot be violated.

**Keywords:** `necessary`, `impossible`

```markdown
**Rule D{N}:** It is necessary that {statement}
*Note: {justification}*

**Rule D{N}:** It is impossible that {statement}
*Note: {justification}*
```

**Choosing between "necessary" and "impossible":**
- **"necessary"** — states what MUST exist (positive framing): "It is necessary that each customer has exactly one primary email"
- **"impossible"** — states what CANNOT exist (negative framing): "It is impossible that a person has more than one birth date"

Choose whichever reads most naturally. Both are definitional.

#### 3.2 Derivation Rules (Definitional Pattern)

Computed values. A special type of definitional rule that specifies HOW something is calculated.

```markdown
**Rule DR{N}:** {derived value} = {formula}
*Note: {what this computes}*
```

**Keywords:** `=`, `sum of`, `count of`, `average of`, `[term] of each [related term]`

**When to use:** Only when the calculation isn't obvious and needs documentation.
- Need derivation: "order total = sum of line item prices - discount amount"
- Don't need: "full name = first name + last name" (obvious)

#### 3.3 Behavioral Rules (Deontic Modality)

Enforceable policies. Can be violated, but the system should prevent or detect violations.

**Obligations** — `It is obligatory that`:
```markdown
**Rule B{N}:** It is obligatory that {statement}
*Note: {enforcement context}*
```

**Prohibitions** — `It is prohibited that`:
```markdown
**Rule B{N}:** It is prohibited that {statement}
*Note: {what this prevents}*
```

**Permissions** — `It is permitted that ... only if`:
```markdown
**Rule B{N}:** It is permitted that {statement} only if {condition}
*Note: {when this applies}*
```

**Project convention:** Prefer "It is prohibited that ..." over "It is obligatory that not ..." for readability. Use "It is permitted that ... only if ..." for conditional allowances.

**Grouping behavioral rules by area:**
- User Management Rules
- Domain Object Rules
- Workflow Rules
- Data Quality Rules
- Notification Rules
- Integration Rules

#### Rule Numbering Convention

| Prefix | Rule Type |
|--------|-----------|
| **D** | Definitional Rules |
| **DR** | Derivation Rules |
| **B** | Behavioral Rules |
| **ST** | Status Transition / Temporal Rules |

Keep numbering sequential within each category with no gaps.

---

## Rule Type Decision Framework

When you encounter a business rule and need to classify it:

### Step 1: Is it a computed value?

**YES** → **Derivation Rule (DR)**. Use `= formula` syntax.
- "order total = sum of line item prices"

**NO** → Continue to Step 2.

### Step 2: Can it ever be false or violated?

**NO** → **Definitional Rule (D)**. It defines the structure of the business universe.
- Use "It is necessary that" (positive) or "It is impossible that" (negative)
- "Each order has exactly one customer" → structural truth, cannot be otherwise

**YES** → Continue to Step 3.

### Step 3: Is it about a state transition?

**YES** → **Status Transition Rule (ST)**. Governs when entities change status.
- "It is permitted that order status changes from Pending to Confirmed only if payment is received"

**NO** → Continue to Step 4.

### Step 4: What behavior is required?

It's a **Behavioral Rule (B)**. Choose the sub-type:
- **Should happen** → `It is obligatory that` (obligation)
- **Must not happen** → `It is prohibited that` (prohibition)
- **May happen under conditions** → `It is permitted that ... only if` (permission)

### Decision Examples

| Scenario | Calculation? | Can violate? | Type | Result |
|----------|-------------|-------------|------|--------|
| "Every employee needs an employee ID" | No | No | D | "It is necessary that each employee has exactly one employee identifier" |
| "Order total is sum of line items" | Yes | — | DR | "total price of order = sum of (price of each line item in order)" |
| "Employees should submit timesheets weekly" | No | Yes | B | "It is obligatory that each employee submits timesheet weekly" |
| "Managers can override credit limits" | No | N/A (allowance) | B | "It is permitted that a manager overrides a credit limit only if the override is justified in writing" |

---

## Part 4: Status Transitions

For entities with state machines:

```markdown
**Rule ST{N}:** {Entity} status transition from "{State A}" to "{State B}"
Condition: It is permitted only if {condition}

**Rule ST{N}:** Direct status transition constraints
It is prohibited that {entity} status changes directly from "{A}" to "{C}"
```

---

## Part 5: Integration and Process Workflows

For multi-step business processes that involve coordination across multiple concepts or external systems. Use workflows when a process has **sequential steps with decision points** — not for simple state transitions (use Part 4) or single-action rules (use Part 3).

**When to use a workflow:**
- Process spans 3+ steps with branching logic
- Multiple systems or actors are involved
- There are retry/failure paths
- The ordering of steps matters

**When NOT to use a workflow:**
- Simple A→B state transition → use Status Transition rules (Part 4)
- Single conditional action → use Behavioral rules (Part 3)

```markdown
### {Process Name}

**Trigger:** {event that initiates the process}
**Actors:** {concepts involved}
**Outcome:** {what successful completion produces}

### Step 1: {Step Name}
{Description of what happens}
**Decision:** {condition} → Step 2a / Step 2b

### Step 2a: {Step Name}
{Description}

### Step 2b: {Alternative Path}
{Description}

### Error Handling
{What happens on failure at each step}
```

Include data flow between steps and reference the SBVR rules (B/ST numbers) that govern each step.

---

## Common Anti-Patterns

### 1. "System as Actor"

SBVR describes what is required, not what the system does. The system is always the implied executor.

- WRONG: "It is obligatory that the system sends a notification when an order is placed"
- RIGHT: "It is obligatory that a notification is sent to the customer when an order is placed"

Focus on WHAT must happen, not WHO/WHAT does it.

### 2. Mixing Modalities

Each rule uses exactly one modality. Never combine definitional and behavioral in one rule.

- WRONG: "It is necessary and obligatory that each user has an email"
- RIGHT: Pick one. Structural truth → "necessary". Policy → "obligatory".

### 3. Missing Quantification

Every rule needs explicit quantifiers.

- WRONG: "Users must have email addresses"
- RIGHT: "It is obligatory that each user has at least one email address"

### 4. Implementation Leakage

No database or API terms in rules.

- WRONG: "It is necessary that user_id is a non-null UUID foreign key to the users table"
- RIGHT: "It is necessary that each order is placed by exactly one customer"

### 5. Circular Definitions

A term's definition must not use the term itself.

- WRONG: "An external service is an external service that provides data enrichment"
- RIGHT: "An external service is a third-party provider that supplies data enrichment"

### 6. Procedural Language

SBVR is declarative. No step-by-step workflows in rules.

- WRONG: "When a customer places an order, the system: 1. Validates inventory 2. Calculates total 3. Sends email"
- RIGHT:
  - "It is obligatory that each order is validated for inventory availability"
  - "It is necessary that order total = sum of (price of each line item in order)"
  - "It is obligatory that a confirmation is sent when an order is placed"

### 7. Hard-Coded Thresholds

Reference policies instead of embedding configurable values.

- WRONG: "It is prohibited that a password has fewer than 8 characters"
- RIGHT: "It is obligatory that each password meets the organization password policy"

### 8. Undefined Collectives

Don't use vague group terms without defining them.

- WRONG: "It is obligatory that each reference data entity has a unique identifier"
- RIGHT: Either enumerate ("each department code is unique", "each category name is unique") or define the collective properly.

### 9. Imprecise Temporal Language

Use specific durations, not vague time expressions.

- WRONG: "It is obligatory that notifications are sent soon"
- RIGHT: "It is obligatory that notification is sent within 24 hours"

### 10. Inconsistent Singular/Plural

SBVR uses singular form consistently. LLMs often drift between forms within the same spec.

- WRONG: "It is necessary that each customer has exactly one email" then later "customers must have addresses"
- RIGHT: Always "each customer", "each order", "each employee" — singular throughout

### 11. Trivial Permissions

A permission without "only if" is vacuous — it says nothing constraining.

- WRONG: "It is permitted that a user creates an account" (everyone can always — why state it?)
- RIGHT: "It is permitted that a user creates an account only if the user has a valid email address"

Only write permission rules when there IS a meaningful condition.

### 12. Over-Nested Quantification

Complex nested rules become unreadable. Split into separate rules.

- WRONG: "It is obligatory that for each order that contains a line item that references a product that is discontinued, the order is flagged for review by a manager who supervises the department that owns the product"
- RIGHT: Split into: (1) rule about discontinued products requiring order flags, (2) rule about which manager reviews flagged orders

### 13. Over-Modeling Implementation Artifacts

DTOs, forms, view models, and request/response types are implementation artifacts, not business concepts. Do not create vocabulary entries for them.

- WRONG: Defining "order data transfer object", "order form", "order response" as separate SBVR concepts
- RIGHT: Define "order" as a single concept. DTOs are how the system represents the order internally — irrelevant to business semantics.

### 14. Numeric Status Codes as Vocabulary

Code often stores status as integers (`status = 0`, `status = 1`). Translate these to meaningful business names.

- WRONG: "It is necessary that order status is 0 when the order is confirmed"
- RIGHT: Define named status values ("confirmed", "in progress", "cancelled") and write rules using those names: "It is necessary that each new order has order status 'confirmed' after payment is received"

When discovering integer status codes, document the mapping (0=confirmed, 1=updated, etc.) and use the named values in all SBVR rules.

### 15. Conflating Audit Records with Current State

Many systems have both a current-state table and a history/audit table (e.g., `Order` and `OrdersHistory`). Do not model history tables as separate business concepts.

- WRONG: Defining "order history record" as an independent concept with its own fact types and rules
- RIGHT: Model "order" as the primary concept. If the audit trail is business-significant, add a single fact type: "order has order change record" and a behavioral rule: "It is obligatory that each order modification creates an order change record"

### 16. Synonym Drift

LLMs lose track of canonical terms across long documents, using "customer" in one rule and "client" in another, or "order total" vs "total order amount."

- WRONG: "It is necessary that each **customer** has an email" ... later ... "It is obligatory that each **client** receives a confirmation"
- RIGHT: Pick one canonical term in the vocabulary ("customer") and use it consistently in every rule. After completing all rules, scan for term variants — every noun in a rule must exactly match a defined vocabulary term.

### 17. Mirroring Code Structure in Rules

LLMs tend to write one SBVR rule per code function/method. But a single business rule may span multiple methods, and a single method may implement multiple rules.

- WRONG: One rule for `validateEmail()`, one for `checkEmailUnique()`, one for `normalizeEmail()` — when the business rule is simply "each customer must have a unique, valid email address"
- RIGHT: Write rules per business constraint, not per code function. Combine related validations into a single rule when they serve the same business purpose.

---

## Policy Reference Pattern

When a rule involves a configurable threshold, reference a policy noun concept rather than embedding the value.

Define the policy as a term:

```markdown
**organization password policy**
- Definition: a policy that specifies password requirements for system access
- Note: Current requirements: minimum 8 characters, at least one uppercase letter, at least one number

**session timeout policy**
- Definition: a policy that specifies when inactive sessions terminate
- Note: Current setting: 30 minutes of inactivity
```

Then reference it in rules:

```markdown
**B5:** It is obligatory that each password meets the organization password policy
**B6:** It is obligatory that each session terminates according to the session timeout policy
```

This keeps rules stable while values change — update the Note, not the rule.

---

## Advanced Modeling Patterns

### Explicit "For Each" Quantification

Most rules work with natural language: "Each customer has exactly one customer ID" (clear).

Use explicit "for each" only when ambiguous:

- WRONG: "Withdrawal amount cannot exceed account balance" (which withdrawal? which account?)
- RIGHT: "It is prohibited that the amount of a withdrawal that affects an account exceeds the balance of that account"

**Pattern:** `It is [modal] that for each [item] X of [container] Y, [rule about X and Y]`

**Examples:**
- It is obligatory that for each line item i of order o, the quantity of i is greater than zero
- It is necessary that for each employee e of department d, the salary of e is within the salary range of d

**Caution:** Avoid "It is prohibited that for each X...". This prohibits only the case where ALL instances satisfy the condition. Use generic singular or rephrase as "It is obligatory that for each X..., not...".

Prefer wording that reuses existing fact types ("withdrawal that affects an account") over variable names.

### Temporal Rules

For time-dependent business rules, use these keywords:

**Ordering:** precedes, follows, occurs before, occurs after
**Duration:** within [timespan], within [N] [time units] of [event]

**Examples:**
- **ST1:** It is obligatory that each order is shipped within 2 business days after order confirmation
- **ST2:** It is prohibited that shipment occurs before payment is received
- **ST3:** It is necessary that employee termination date follows employee hire date
- **ST4:** It is obligatory that password reset occurs within 24 hours of request

Define temporal terms as noun concepts in the vocabulary ("business day", "session", "timeout period"). Use OMG Date-Time Vocabulary (DTV) for standardized temporal concepts. Do NOT prescribe concrete date/time formats (ISO 8601, Unix timestamps) — those are implementation.

### Objectification

When a relationship itself needs properties or participates in other relationships, objectify it — create a noun concept from a verb concept.

**Ask:** "Does the relationship itself have properties (timestamps, costs, counts) or participate in other relationships?"
- **Yes** → Create a noun concept
- **No** → Keep as a simple fact type

**Pattern:**

```markdown
**[relationship-as-noun]**
- Definition: the relationship arising from [subject] [verb] [object]
- Objectified From: [original fact type]
```

**Example — Employment:**

Before (simple):
```markdown
**Fact Type: employee works in department**
- Necessity: each employee works in exactly one department
```

After (when you need start dates and salary):
```markdown
**employment**
- Definition: the relationship arising from an employee working in a department
- Objectified From: employee works in department

**Fact Type: employment started on date**
**Fact Type: employment has salary amount**
```

**Example — Order Fulfillment:**
```markdown
**fulfillment**
- Definition: the relationship arising from a warehouse fulfilling an order
- Objectified From: warehouse fulfills order

**Fact Type: fulfillment occurred on date**
**Fact Type: fulfillment has cost**
**Fact Type: fulfillment was performed by employee**
```

---

## Complete Example: Employee Management System

### Terms (Vocabulary)

**employee**
- Definition: a person who works for the organization under a contract
- Reference Scheme: employee identifier identifies employee

**manager**
- Definition: an employee who supervises other employees
- General Concept: employee
- Note: Inherits employee identifier reference scheme

**department**
- Definition: an organizational unit that groups related business functions
- Reference Scheme: department code identifies department

### Fact Types

**Fact Type: employee works in department**
- Preferred: employee works in department
- Alternative: department employs employee
- Necessity: each employee works in exactly one department
- Necessity: each department employs zero or more employees

**Fact Type: employee reports to manager**
- Preferred: employee reports to manager
- Alternative: manager supervises employee
- Necessity: each employee reports to at most one manager
- Necessity: each manager supervises zero or more employees
- Note: manager is a role played by employee

### Rules

**Definitional Rules (Alethic):**

**D1:** It is necessary that each employee has exactly one employee identifier
**D2:** It is necessary that each department has exactly one department code
**D3:** It is impossible that an employee reports to themself

**Derivation Rules:**

**DR1:** department headcount = count of employees who work in the department
**DR2:** average tenure = average of (current date - hire date of each employee in department)

**Behavioral Rules (Deontic):**

*Obligations:*
**B1:** It is obligatory that each new employee completes training within 30 days
**B2:** It is obligatory that each manager conducts performance reviews annually

*Prohibitions:*
**B3:** It is prohibited that an employee approves their own timesheet
**B4:** It is prohibited that a manager approves their own expense report

*Permissions:*
**B5:** It is permitted that a manager supervises employees from a different department only if the manager has cross-department authorization
**B6:** It is permitted that an employee changes departments only if they have been in their current department for at least 6 months

---

## Part 6: Implementation Notes

- MVP scope clarifications
- Security requirements summary
- System constraints
- Data standards

---

## Part 7: Compliance Checklist

### Vocabulary Compliance
- [ ] Each term has proper definition (genus + differentia)
- [ ] Each identified term has reference scheme
- [ ] Each term includes complete field list with data types
- [ ] Specialized concepts reference their parent (General Concept)
- [ ] Specialized concepts note inheritance of reference scheme — do not repeat it
- [ ] No circular definitions
- [ ] No technical identifiers in reference schemes (UUID, foreign key)
- [ ] Only official SBVR captions used
- [ ] Enumerations expressed as definitional rules, not captions

### Fact Type Compliance
- [ ] Each fact type has preferred and alternative verb concept wordings
- [ ] Both directions considered; real constraints explicitly stated
- [ ] Navigation paths are complete
- [ ] Necessity statements marked as rules about the fact type

### Rule Compliance
- [ ] Each rule expresses exactly one constraint
- [ ] Rules categorized as definitional or behavioral
- [ ] Derivation rules recognized as definitional patterns
- [ ] Definitional rules use only "necessary" or "impossible"
- [ ] Behavioral rules use only "obligatory", "prohibited", or "permitted"
- [ ] All rules are testable and verifiable
- [ ] All rules traceable to source code
- [ ] Rule numbering sequential with no gaps

### Anti-Pattern Check
- [ ] No "the system" as actor (use passive voice)
- [ ] No procedural language ("system does X then Y")
- [ ] No hard-coded thresholds (use policy references)
- [ ] No technical terminology in rules (database, API, UI)
- [ ] No undefined collectives
- [ ] No imprecise temporal language ("soon", "when possible")
- [ ] No DTOs/forms/view models defined as vocabulary concepts
- [ ] No numeric status codes in rules (use named values)
- [ ] No history/audit tables as separate business concepts
- [ ] No synonym drift (every noun matches a defined vocabulary term)
- [ ] Rules organized per business constraint, not per code function

### Scope Validation
- [ ] Document scope clear (what's IN vs OUT)
- [ ] No rules reference features outside defined scope
- [ ] External dependencies explicitly listed

### From Rules to Tests
For each rule, create:
- **Positive example:** A scenario where the rule is satisfied
- **Negative example:** A scenario where it is violated (behavioral) or represents invalid state (definitional)

---

## Appendices

Include as needed:
- **Glossary of Alternative Terms** — synonyms, legacy terms
- **External API Specifications** — third-party integrations
- **Data Format Standards** — date/time, timezone handling
- **Version History** — changes between SBVR versions
- **Objectification Patterns** — full catalog of objectified fact types
- **Term Index** — alphabetical lookup of all defined terms

---

## References

- **OMG SBVR 1.5 Specification** — https://www.omg.org/spec/SBVR/1.5/
- **SBVR Speaks Series** (Business Rules Community) — articles on vocabulary, notations, concepts
- **Deontic Logic** (Stanford Encyclopedia) — foundation for obligation, permission, prohibition
- **OMG Date-Time Vocabulary (DTV)** — standardized temporal concepts

---
name: deps
description: Use when the user asks to audit or update project dependencies, check for outdated or vulnerable packages, review license compatibility, or improve dependency hygiene across Node, Python, Go, Rust, or Ruby projects.
---

# Deps

Audit project dependencies and, when requested, update them safely. Prefer the repository's existing package manager, scripts, and validation commands before adding new tools or changing lockfiles.

## When to use

- Audit outdated, vulnerable, deprecated, or stale dependencies.
- Review dependency license risk before a release or vendor decision.
- Update dependencies with verification instead of blind version bumps.
- Work across one or more ecosystems in the same repository.

## Modes

- `audit`: inventory outdated, vulnerable, deprecated, and license-risk items without changing manifests or lockfiles.
- `update`: apply approved dependency updates and verify them with the project's existing safety checks.
- `vuln`: focus on security advisories first, then widen the audit only if needed.
- `license`: inspect license compatibility, missing license metadata, and license changes between versions.

If the user's intent is ambiguous, default to `audit`.

## Workflow

### 1. Establish scope

- Determine whether the user means the whole repo or a specific package/workspace.
- Detect manifests recursively, not just at repo root. Use the detection commands in [references/ecosystem-commands.md](references/ecosystem-commands.md).
- Treat each workspace or ecosystem separately in monorepos.
- If no supported manifest exists, stop and report that clearly.

### 2. Prefer existing tooling

- Use the package manager already chosen by the repo (`pnpm`, `yarn`, `npm`, `poetry`, `cargo`, etc.).
- Reuse repo scripts and config before installing extra scanners.
- Identify the repo's real validation gate from scripts, Makefiles, CI config, or task runners instead of assuming `test` alone is sufficient.
- If an audit tool is missing, report that clearly and continue with available evidence unless the user wants it installed.

### 3. Collect signals

- Capture outdated package information.
- Capture vulnerability results.
- Capture license metadata if the user asked for it or if licensing is a release blocker.
- Note direct vs transitive issues when the tool exposes that distinction.
- If the package manager requires a lockfile for audit and the snapshot lacks one, either report the audit as incomplete or generate the lockfile in an isolated copy rather than mutating the target tree during an audit-only run.
- Do not run mutating cleanup commands in `audit` or `license` mode.

Read [references/ecosystem-commands.md](references/ecosystem-commands.md) for ecosystem-specific commands and [references/license-guidance.md](references/license-guidance.md) for the license matrix and review rules.

### 4. Classify findings

| Severity | Typical cases | Default action |
| --- | --- | --- |
| Critical | Exploitable vulnerability, actively abused advisory, clearly incompatible strong copyleft license | Prioritize immediately and call out release risk |
| High | Confirmed security advisory, missing/unknown license, major upgrade needed for security support | Address in current session if possible |
| Medium | Minor-version lag, deprecated package, weak copyleft requiring review, stale transitive dependency | Plan targeted remediation |
| Low | Patch updates, informational advisories, tooling drift | Batch opportunistically |

### 5. Plan updates

- Prefer the smallest safe version that resolves the issue.
- If the issue is transitive and the ecosystem supports it, prefer targeted `overrides` / `resolutions` style remediation before forcing broad major upgrades.
- Batch low-risk patch updates only when the repo's tests are strong enough to catch regressions.
- Update minor versions one dependency at a time unless the packages are intentionally coupled.
- Update major versions one at a time after reading the changelog, migration guide, or release notes.
- Do not upgrade unrelated packages as collateral damage when the user asked for a targeted fix.

### 6. Execute updates

- Record the starting versions and changed files.
- Update a single dependency, or one intentionally batched low-risk patch set.
- Run the repo's real safety checks: tests first, then project-specific build/lint commands when they are part of the release gate.
- Avoid blunt auto-remediation commands such as `npm audit fix --force` unless the user explicitly approved a broad, potentially breaking upgrade.
- If validation fails, restore the pre-update state for that dependency or batch and document why.
- Commit only if the user asked for commits or the repo workflow explicitly requires them.

### 7. Report results

- Summarize scope, ecosystems found, tools run, missing tools, findings by severity, updates applied, failed attempts, and residual risk.
- Write `.agents/deps/YYYY-MM-DD-deps-<mode>.md` only when the user wants an artifact or the repo already stores dependency reports there. Otherwise summarize in the response.

## Common mistakes

- Scanning only the repo root and missing workspace manifests.
- Using mutating commands such as `go mod tidy` during an audit-only run.
- Forcing `npm` commands inside a `pnpm` or `yarn` repository.
- Using repo-root commands only in a monorepo and missing workspace-specific findings.
- Installing new audit tools without telling the user.
- Reaching for `npm audit fix --force` instead of planning targeted updates.
- Batching risky minor or major upgrades together.
- Treating missing license metadata as harmless.
- Ignoring lockfile changes when evaluating what an update actually did.

## References

- [references/ecosystem-commands.md](references/ecosystem-commands.md)
- [references/license-guidance.md](references/license-guidance.md)

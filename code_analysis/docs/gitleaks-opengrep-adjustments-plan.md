# Gitleaks And OpenGrep Adjustments Plan

This plan turns the current tuning strategy into an implementation sequence for
the `code-analysis` CLI.

The goal is simple:

- keep `gitleaks` as the main secret scanner
- make its tuning external and flag-driven
- make `opengrep` useful by narrowing it to curated code-policy rules
- validate the new behavior against the current `service-finance` run

This plan is intentionally narrow. It does not add new analyzers, trend
storage, or project-specific dashboards.

## Current Evidence

From the current normalized `service-finance` run:

- `gitleaks`
  - `generic-api-key`: 91
  - `gcp-api-key`: 59
  - top files include `package.json`, `README.md`, `ios/Podfile.lock`, and
    repeated Firebase config files
- `opengrep`
  - `jsx-not-internationalized`: 158
  - `package-dependencies-check`: 60
  - `react-props-spreading`: 38
  - `react-props-in-state`: 23
  - multiple secret-detection families that overlap with `gitleaks`

Interpretation:

- `gitleaks` is noisy because it lacks scoped configuration inputs.
- `opengrep` is noisy because it is doing too many jobs at once.
- The fixes should target configuration and scope, not parsing.

## Recommended Design

Use a hybrid model.

### Gitleaks

Make Gitleaks fully flag-driven from the CLI. Do not require the analyzed
repository to contain `.gitleaks.toml`, `.gitleaksignore`, or a baseline file.

Recommended CLI surface:

```bash
./code-analysis analyze <target> --out <results-dir> \
  [--gitleaks-config <path>] \
  [--gitleaks-ignore <path>] \
  [--gitleaks-baseline <path>]
```

Meaning:

- `--gitleaks-config`: pass a TOML rules/allowlist file to `gitleaks detect`
- `--gitleaks-ignore`: pass a fingerprint ignore file
- `--gitleaks-baseline`: pass a baseline report

Why this is the right boundary:

- it keeps scanner policy outside the analyzed repository
- it allows one central tuning profile to be reused across projects
- it avoids baking project-specific exceptions into source repos

### OpenGrep

Do not make OpenGrep fully flag-driven by default. Its rules are part of the
product behavior of `code-analysis`, so the curated default ruleset should live
with this repository.

Recommended CLI surface:

```bash
./code-analysis analyze <target> --out <results-dir> \
  [--opengrep-config <path>]... \
  [--opengrep-include <pattern>]... \
  [--opengrep-exclude <pattern>]...
```

Meaning:

- `--opengrep-config`: optional extra or replacement rule files/directories
- `--opengrep-include`: explicit include patterns for a scan
- `--opengrep-exclude`: explicit exclude patterns for a scan

Default behavior when no OpenGrep flags are supplied:

- use a curated repo-local ruleset owned by `code-analysis`
- stop scanning the whole downloaded rules cache

Why this is the right boundary:

- OpenGrep should produce opinionated, stable signals from `code-analysis`
- local curated rules are versioned with the reporting behavior
- users can still override or extend via flags when needed

## Approach Options

### Option A: Repo-local config for both tools

Pros:

- simple runner behavior
- minimal CLI growth

Cons:

- violates the desired Gitleaks usage model
- mixes scanner policy into analyzed repositories

### Option B: CLI flags for both tools

Pros:

- maximum flexibility
- zero repo-local defaults required

Cons:

- weak default experience
- OpenGrep rule quality becomes inconsistent across runs
- harder to keep reporting stable

### Option C: Hybrid model

Pros:

- matches the tools’ real responsibilities
- keeps Gitleaks portable and external
- keeps OpenGrep curated and deterministic by default

Cons:

- slightly larger design surface

Recommendation:

- choose Option C

## Concrete Implementation Plan

### Phase 1: Extend the CLI surface

Add new analyze-only arguments to `engine/src/cli.ts` and the analyze options
type:

- `--gitleaks-config <path>`
- `--gitleaks-ignore <path>`
- `--gitleaks-baseline <path>`
- `--opengrep-config <path>` repeatable
- `--opengrep-include <pattern>` repeatable
- `--opengrep-exclude <pattern>` repeatable

Rules:

- all new flags are optional
- all paths resolve from the current working directory of the CLI invocation
- unknown flags still fail fast with exit code `1`
- `summarize` remains unchanged

### Phase 2: Thread settings into the runner

Add one small settings object to `AnalyzeOptions` and `StepContext`:

```ts
interface GitleaksOptions {
  configPath?: string;
  ignorePath?: string;
  baselinePath?: string;
}

interface OpenGrepOptions {
  configs?: string[];
  includes?: string[];
  excludes?: string[];
}
```

Keep the new configuration data private to the runner. Do not surface it in
`manifest.json`.

### Phase 3: Gitleaks execution changes

Update `runGitleaks` so it builds the command from the optional CLI flags:

- always keep:
  - `detect`
  - `--source`
  - `--report-format sarif`
  - `--report-path`
- conditionally add:
  - `--config <path>`
  - `--gitleaks-ignore-path <path>` if supported by the installed CLI
  - `--baseline-path <path>`

Validation behavior:

- if a configured path does not exist, fail fast before launching `gitleaks`
- if no flags are provided, keep today’s default behavior

### Phase 4: OpenGrep default ruleset

Add a curated repo-local rules directory, for example:

```text
config/opengrep/
  core/
  optional/
```

Recommended initial default keep set in `core/`:

- `moment-deprecated`
- `react-props-in-state`
- `calling-set-state-on-current-state`
- `useless-ternary`
- `detect-non-literal-regexp`

Recommended initial optional set in `optional/`:

- `jsx-not-internationalized`

Recommended first dropped families:

- `generic-api-key`
- `detected-google-api-key`
- `detected-google-cloud-api-key`
- `detected-google-oauth-url`
- `package-dependencies-check`
- `react-props-spreading`
- `javascript-alert`
- `lazy-load-module`
- `no-stringify-keys`

Reasoning:

- the dropped families are either duplicated elsewhere or too noisy for a
  default maintainability scan
- the kept families point to real code-quality questions in the app source

### Phase 5: OpenGrep execution changes

Update `runOpenGrep` so rule selection works in this order:

1. explicit `--opengrep-config` values from the CLI
2. curated repo-local default rule directories
3. cached fallback rules only if no curated rules exist

Also pass:

- one `--include` per `--opengrep-include`
- one `--exclude` per `--opengrep-exclude`

Important simplification:

- do not add a custom `.semgrepignore` path feature in v1
- rely on standard `.semgrepignore` in the target repo plus explicit CLI
  `--exclude` patterns

This keeps the interface smaller and matches documented Semgrep-compatible
surfaces.

### Phase 6: Seed the first exclusion patterns

For `service-finance`, the first scan exclusions should target known noise, not
hide app code.

Recommended initial excludes:

```text
.expo/**
ios/Pods/**
build/**
dist/**
coverage/**
firebase/**/google-services.json
firebase/**/GoogleService-Info.plist
src/environments/**/google-services.json
**/google-services.json
**/GoogleService-Info.plist
```

Use these as CLI inputs during validation first. Only promote them into a
documented project recipe once they prove useful.

## Validation Plan

### Unit And Integration Tests

Add tests for:

- CLI argument parsing for all new flags
- invalid Gitleaks path inputs failing before execution
- Gitleaks command construction including:
  - config only
  - config + ignore
  - config + baseline
- OpenGrep command construction including:
  - default curated configs
  - explicit config override
  - include patterns
  - exclude patterns
- fallback behavior when curated rules do not exist

Use stub executables to assert the exact arguments passed to:

- `gitleaks`
- `opengrep`

### End-To-End Validation

Run the following sequence against `service-finance`:

1. current baseline run with no new flags
2. Gitleaks-tuned run with external config inputs
3. OpenGrep-tuned run with curated defaults and explicit excludes
4. fully tuned run with both together

For each run, compare:

- top finding families
- top files
- total counts
- whether the remaining findings are concentrated in application code instead
  of config/docs/lockfiles

### Acceptance Criteria

The changes are good enough when:

- `gitleaks` no longer reports `package.json`, `README.md`, or `Podfile.lock`
  as dominant noise sources
- `gitleaks` still reports suspicious app-code and config findings that are not
  explicitly allowlisted
- `opengrep` no longer reports secret-detection families by default
- `opengrep` no longer reports `package.json` as the top file by default
- most default OpenGrep findings come from `.ts` and `.tsx` application files
- the existing report normalization layer continues to parse both tools without
  schema changes

## What Not To Do

Do not:

- add a project-wide plugin system
- add per-tool config files for every analyzer in this pass
- expose scanner tuning details in `manifest.json`
- treat raw finding counts as KPIs before the tuned reruns are validated

## Sources

These changes should stay aligned with the documented tool surfaces:

- Gitleaks: https://github.com/gitleaks/gitleaks
- OpenGrep: https://github.com/opengrep/opengrep
- Semgrep ignore behavior: https://semgrep.dev/docs/ignoring-files-folders-code
- Semgrep CLI reference: https://semgrep.dev/docs/cli-reference


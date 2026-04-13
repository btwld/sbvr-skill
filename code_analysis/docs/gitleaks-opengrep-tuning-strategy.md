# Gitleaks And OpenGrep Tuning Strategy

This guide explains how to turn `gitleaks` and `opengrep` into useful signals
instead of noisy issue generators.

The recommendations are based on the current `service-finance` run at:

- `results/service-finance-final-20260409-230635`

They are also grounded in the official configuration surfaces of Gitleaks and
Semgrep-compatible scanners such as OpenGrep.

## Current Diagnosis

### Gitleaks

Current top findings:

- `generic-api-key`: 91
- `gcp-api-key`: 59
- `jwt`: 2
- `slack-webhook-url`: 1

Current top files:

- `package.json`
- `android/app/google-services.json`
- `src/services/demoApi/mock/mockData.ts`
- `ios/Podfile.lock`
- `README.md`
- `keys.js`
- multiple `google-services.json` environment copies

Interpretation:

- The scanner is working.
- The current output is too noisy to use directly as a decision-making metric.
- The noise is concentrated in a small number of file classes, which is good:
  it means this is primarily a configuration problem.

### OpenGrep

Current top rule families:

- `jsx-not-internationalized`: 158
- `package-dependencies-check`: 60
- `react-props-spreading`: 38
- `react-props-in-state`: 23
- `detected-google-oauth-url`: 20
- `detected-google-api-key`: 17
- `detected-google-cloud-api-key`: 9
- `generic-api-key`: 9
- `moment-deprecated`: 8

Interpretation:

- The scanner is doing too many jobs at once.
- It is mixing policy, secrets, dependency policy, and code smell findings in
  one stream.
- The biggest OpenGrep categories overlap with tools that are already better at
  those jobs:
  - `gitleaks` for secrets
  - `trivy` for dependency security
- That overlap makes OpenGrep less useful than it should be.

## Recommendation Summary

Use each tool for one primary job.

- `gitleaks`: repository secret detection with targeted allowlists and baseline
- `opengrep`: code policy and maintainability rules on application source

Do not use OpenGrep as a second secret scanner until the curated rule set is
small and clearly intentional.

Do not use raw Gitleaks counts as a KPI until allowlists and a baseline are in
place.

## Gitleaks Strategy

### What To Keep

Keep Gitleaks as the main secret-detection tool.

It is the right place for:

- API keys
- tokens
- webhook URLs
- embedded secrets in source, configs, and history

### What To Change

Add three layers of control:

1. `.gitleaks.toml`
2. `.gitleaksignore`
3. `--baseline-path`

Use them for different purposes:

- `.gitleaks.toml`: rules and structured allowlists
- `.gitleaksignore`: specific accepted fingerprints
- baseline report: old debt you do not want to keep re-triaging

### Repo-Level Configuration Model

Create a repo-local `.gitleaks.toml` that extends the default rules.

Recommended shape:

```toml
title = "service-finance gitleaks config"

[extend]
useDefault = true

[[allowlists]]
description = "Ignore known public mobile app config identifiers"
targetRules = ["generic-api-key", "gcp-api-key"]
paths = [
  '''(^|/)(google-services\.json|GoogleService-Info\.plist)$''',
  '''(^|/)firebase/''',
  '''(^|/)src/environments/.*/google-services\.json$'''
]

[[allowlists]]
description = "Ignore lockfiles and docs"
targetRules = ["generic-api-key"]
paths = [
  '''(^|/)Podfile\.lock$''',
  '''(^|/)README\.md$'''
]
```

This is the right first move because it removes file-class noise while leaving
the actual secret rules intact.

### What To Baseline

Create a baseline from the current accepted false-positive set after the first
config pass.

Use a baseline for:

- old findings that are already understood
- findings in historical commits you are not cleaning immediately

Do not use the baseline to hide new leaks in active source files.

### What To Ignore With Fingerprints

Use `.gitleaksignore` only for findings that are:

- specific
- stable
- intentionally accepted

Good candidates:

- one known mock secret in `mockData.ts`
- one historical README example
- one accepted fingerprint in `keys.js` if it is confirmed non-sensitive

Bad candidates:

- entire rule families
- whole directories
- all Firebase files without checking whether the values are public identifiers
  or real secrets

### Service-Finance Specific Recommendation

Do this in order:

1. Review all `google-services.json` and `GoogleService-Info.plist` findings.
2. Classify each value:
   - public identifier with platform restrictions
   - real secret
3. Add path-based allowlists only for the confirmed public-identifier files.
4. Add fingerprint ignores only for the few remaining accepted cases.
5. Create a baseline after the config is stable.

### Gitleaks Outcome To Target

For this repository, the useful end state is:

- keep `slack-webhook-url`
- keep suspicious `jwt` matches until reviewed
- keep anything in app code or `keys.js` that is not explicitly allowlisted
- aggressively reduce noise from lockfiles, docs, mock data, and public mobile
  config copies

## OpenGrep Strategy

### What To Keep

Use OpenGrep as a curated policy and maintainability scanner.

Good jobs for OpenGrep here:

- localization policy such as `jsx-not-internationalized`
- deprecated API usage such as `moment-deprecated`
- selected React correctness rules
- targeted maintainability rules

### What To Stop Using It For

Do not rely on OpenGrep for:

- generic secret detection
- Google API key detection
- dependency-manifest policy noise from `package.json`

Those are already covered better by:

- `gitleaks`
- `trivy`

### Curated Rule Strategy

Move from "scan everything in semgrep-rules" to "scan a curated local ruleset".

Recommended first kept families:

- `jsx-not-internationalized`
- `moment-deprecated`
- `react-props-in-state`
- `calling-set-state-on-current-state`
- `useless-ternary`
- `detect-non-literal-regexp`

Recommended first dropped families:

- `detected-google-api-key`
- `detected-google-cloud-api-key`
- `detected-google-oauth-url`
- `generic-api-key`
- `package-dependencies-check`

Rationale:

- the dropped families duplicate other tools
- the kept families are application-code policy signals

### Path Control Strategy

Add a repo-local `.semgrepignore` to remove non-code and config noise from
OpenGrep scans.

Recommended starting patterns:

```gitignore
.expo/
firebase/**/google-services.json
firebase/**/GoogleService-Info.plist
src/environments/**/google-services.json
google-services.json
GoogleService-Info.plist
ios/Pods/
android/app/build/
dist/
build/
coverage/
```

This keeps OpenGrep focused on app code instead of generated or environment
configuration files.

### Rule-Level Path Scoping

For rules you keep, scope them by path when needed.

Examples:

- keep `jsx-not-internationalized` only for `src/**/*.{tsx,jsx}`
- exclude storybook, examples, or generated views
- keep `moment-deprecated` only on application code if you do not care about
  scripts or migration stubs

This should be done in rule YAML using `paths.include` or `paths.exclude`, not
with broad post-processing.

### Inline Suppression Policy

Use `nosemgrep` only for one-off, intentional exceptions.

Good use:

- a specific component that must spread props for framework compatibility

Bad use:

- suppressing a whole noisy rule family in many files

If a rule needs repeated suppression, the rule set is wrong and should be tuned.

### Service-Finance Specific Recommendation

Do this in order:

1. Remove secret families from OpenGrep.
2. Remove `package-dependencies-check` from OpenGrep.
3. Add `.semgrepignore` for Firebase and environment config copies.
4. Keep `jsx-not-internationalized` only if the team truly wants localization
   enforcement right now.
5. If yes, treat it as a dedicated policy report, not as a security signal.
6. Keep `moment-deprecated` because it is a small, clear modernization signal.
7. Review whether `react-props-spreading` is a real team policy or just noise.
   My default recommendation is to drop it initially.

### OpenGrep Outcome To Target

For this repository, the useful end state is:

- mostly application-code findings
- mostly policy rules the team agrees with
- minimal overlap with `gitleaks` and `trivy`

## Runner Changes I Recommend

The code analysis runner currently:

- runs `gitleaks detect` with no repo-local config
- runs `opengrep scan` against all top-level rule directories in the cached
  `semgrep-rules` checkout

That is too broad for stable signal quality.

Recommended runner changes:

1. `gitleaks`
   - if `.gitleaks.toml` exists in target, pass `--config`
   - if a configured baseline exists, pass `--baseline-path`
   - if `.gitleaksignore` exists, pass `--gitleaks-ignore-path`

2. `opengrep`
   - prefer repo-local curated rule directories over the full cached rules repo
   - honor `.semgrepignore`
   - optionally support explicit include/exclude path patterns from repo config

Do not add a large config system. A small repo-local config is enough.

## Recommended Rollout

### Phase 1

Make the tools narrower without changing the reporting schema.

- add `.gitleaks.toml`
- add `.semgrepignore`
- curate the OpenGrep ruleset

### Phase 2

Rerun `service-finance` and compare:

- Gitleaks findings by rule
- OpenGrep findings by rule family
- top files for both tools

### Phase 3

Only after the signals look stable:

- encode the repo-local config support in the runner
- surface a `dataQuality` section in `summary.json`

## Success Criteria

### Gitleaks

Success means:

- clear reduction in `generic-api-key` noise
- no loss of true positive coverage in app code
- historical accepted debt separated by baseline or fingerprint ignore

### OpenGrep

Success means:

- findings are mostly on application source files
- secret noise is gone
- the remaining rule families are understandable and actionable
- the report reads like policy review, not scanner spam

## Sources

Primary sources used for this strategy:

- Gitleaks README: configuration precedence, rule/global allowlists, baseline,
  `.gitleaksignore`, and `gitleaks:allow`
  - https://github.com/gitleaks/gitleaks
- Opengrep repository: Opengrep is a fork of Semgrep
  - https://github.com/opengrep/opengrep
- Semgrep docs: `.semgrepignore`, `--include`/`--exclude`, `nosemgrep`, and
  rule `paths` support
  - https://semgrep.dev/docs/ignoring-files-folders-code
  - https://semgrep.dev/docs/writing-rules/rule-syntax

# How To Generate And Consolidate Analysis Reports

This guide shows where reports are generated, which metrics matter, and how to
organize the raw outputs into a cleaner reporting layer.

## Use One Canonical Run Per Target

Generate one named run directory per project target.

```bash
./code-analysis analyze /Users/leofarias/Concepta/service-finance \
  --out results/service-finance-$(date +%Y%m%d-%H%M%S) \
  --json
```

The repo-local command is the supported entrypoint. Use `./analyze.sh` only for
compatibility.

Each run writes:

- `manifest.json`
- `steps/scc/report.json`
- `steps/lizard/report.csv`
- `steps/jscpd/report.json`
- `steps/gitleaks/report.sarif`
- `steps/trivy/findings.json`
- `steps/trivy/sbom.cyclonedx.json`
- `steps/dependency-cruiser/report.json`
- `steps/knip/report.json`
- `steps/eslint/report.json`
- `steps/opengrep/report.sarif`
- `steps/git-metrics/revisions.csv`
- `steps/git-metrics/churn.csv`
- `steps/git-metrics/coupling.csv`
- `steps/git-metrics/ownership.csv`
- `steps/git-metrics/effort.csv`
- `steps/git-metrics/age.csv`

The current canonical example in this repo is:

- `results/service-finance-final-20260409-230635`

## Treat Raw Artifacts As Inputs, Not As The Report

The raw outputs are good evidence, but they are a poor reporting interface:

- SARIF is verbose and tool-specific.
- CSV column names vary by analyzer.
- Some tools report counts, some report file-level findings, and some report
  pairs or graphs.
- A dashboard built directly on the raw artifacts will accumulate tool-specific
  logic everywhere.

Use this rule:

- Raw artifacts stay as immutable evidence.
- A single consolidation step produces the report-ready summary.

## Extract These Metrics From Each Step

Use the following mapping when you build a summary.

| Step | Raw artifact | Metrics worth extracting | Report section |
|---|---|---|---|
| `scc` | `steps/scc/report.json` | total files, total lines, code lines, comment lines, language mix | `size` |
| `lizard` | `steps/lizard/report.csv` | functions over `CCN >= 10`, functions over `CCN >= 20`, max CCN hotspots, long-function hotspots | `complexity` |
| `jscpd` | `steps/jscpd/report.json` | duplicate percentage, duplicated lines, top clone pairs, top duplicate files | `duplication` |
| `gitleaks` | `steps/gitleaks/report.sarif` | findings by rule, findings by file, confirmed-vs-noisy clusters after allowlists | `secrets` |
| `trivy` | `steps/trivy/findings.json` | vulnerabilities by severity, direct vulnerable packages, major transitive clusters | `dependency-security` |
| `dependency-cruiser` | `steps/dependency-cruiser/report.json` | modules cruised, dependencies cruised, cycle count, unresolved import count | `architecture` |
| `knip` | `steps/knip/report.json` | unused dependencies, unused devDependencies, unresolved imports, unlisted packages, unused-file counts | `dead-code` |
| `eslint` | `steps/eslint/report.json` | errors, warnings, top rules, files with the most messages | `maintainability` |
| `opengrep` | `steps/opengrep/report.sarif` | findings by rule family, top files, policy categories such as i18n or deprecated APIs | `policy` |
| `git-metrics` | `steps/git-metrics/*.csv` | top revised files, low-ownership hotspots, aging files, coupling pairs worth review | `change-risk` |

For `git-metrics`, do not use `churn.csv` as a headline metric until its
implementation is corrected. At the moment it mirrors revision counts too
closely to trust as real churn.

## Normalize Into One Summary Shape

Add one script that reads `manifest.json` plus the step artifacts and writes a
single normalized summary file.

Recommended output files:

- `summary.json`: machine-readable metrics for dashboards and queries
- `findings.json`: flattened issue list with stable IDs and drilldown metadata
- `visual-report.json`: chart/table-ready view model for frontend dashboards
- `report.md`: human-readable narrative for review and sharing

Recommended command shape:

```bash
./code-analysis summarize results/service-finance-final-20260409-230635
```

The implementation now lives in:

- `engine/src/summarize.ts`

Generated JSON Schemas for these outputs live in:

- `schemas/run-summary.schema.json`
- `schemas/normalized-findings.schema.json`
- `schemas/visual-report.schema.json`

This keeps the complexity in one deep module instead of scattering `jq`, `csv`,
and SARIF parsing logic across ad hoc scripts.

## Use This Summary Schema

The summary does not need every raw field. It needs stable fields that map well
to a report.

```json
{
  "run": {
    "target": "/Users/leofarias/Concepta/service-finance",
    "resultsDir": "results/service-finance-final-20260409-230635",
    "overallStatus": "findings",
    "generatedAt": "2026-04-09T23:06:35-04:00"
  },
  "size": {},
  "complexity": {},
  "duplication": {},
  "changeRisk": {},
  "dependencySecurity": {},
  "architecture": {},
  "deadCode": {},
  "maintainability": {},
  "policy": {},
  "secrets": {},
  "hotspots": []
}
```

The important design choice is the section names. They should be report
concepts, not tool names.

Good report sections:

- `size`
- `complexity`
- `duplication`
- `changeRisk`
- `dependencySecurity`
- `architecture`
- `deadCode`
- `maintainability`
- `policy`
- `secrets`

Avoid report sections like:

- `lizard`
- `jscpd`
- `sarif`
- `csv`

Those names leak implementation detail into the report layer.

## Build Hotspots From Multiple Signals

A report becomes more useful when it combines signals instead of listing each
tool in isolation.

Recommended hotspot inputs:

- high complexity from `lizard`
- high duplication from `jscpd`
- high revision count from `git-metrics/revisions.csv`
- low ownership from `git-metrics/ownership.csv`
- many messages from `eslint`
- many policy findings from `opengrep`

Recommended hotspot output per file:

```json
{
  "file": "src/scenes/SignOn/scenes/Login/index.tsx",
  "signals": ["complexity", "duplication", "high-revisions", "low-ownership"],
  "score": 4,
  "notes": [
    "CCN hotspot",
    "high duplicate lines",
    "frequently changed file",
    "ownership is fragmented"
  ]
}
```

This is better than asking a reader to mentally join five different artifacts.

## Keep The Human Report Short

Use `report.md` as a stable review artifact. A good structure is:

1. Run summary
2. Top risks
3. Hotspots
4. Security summary
5. Maintainability summary
6. Appendix with raw artifact links

That keeps the report readable while preserving links back to the evidence.

## What To Query Directly

Direct queries are still useful for inspection and debugging.

Use direct queries for:

- checking one analyzer output
- investigating one file
- validating whether the normalization logic is correct

Do not use direct queries as the reporting model. They are too brittle.

## Recommended Next Step

Yes, add a consolidation script.

The right move is not more report files. The right move is one script that:

1. reads `manifest.json`
2. parses the known artifact formats
3. maps them into the normalized summary shape
4. writes `summary.json` and `report.md`

That gives you one clean interface for dashboards, weekly review docs, and
future automation.

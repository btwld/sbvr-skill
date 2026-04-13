# Code Analysis POC

The POC now runs through a TypeScript CLI that owns step orchestration, status
classification, artifact staging, and the final manifest contract.

## Usage

Primary interface:

```bash
./code-analysis analyze /path/to/project --out /path/to/results
./code-analysis summarize /path/to/results
```

Optional flags:

```bash
./code-analysis analyze /path/to/project --out /path/to/results --steps git-metrics,gitleaks --json
./code-analysis summarize /path/to/results --out /path/to/report-output --json
```

Legacy wrapper:

```bash
./analyze.sh /path/to/project
./analyze.sh /path/to/project /path/to/results
./analyze.sh /path/to/project /path/to/results --steps git-metrics --json
```

Developer path:

```bash
bun run engine/src/cli.ts analyze /path/to/project --out /path/to/results
```

`analyze.sh` is deprecated and only forwards to the TypeScript CLI. `./code-analysis`
is the supported repo-local command surface.

## Result Contract

Every run writes:

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

The manifest records one status per step:

- `passed`
- `findings`
- `failed`
- `skipped`
- `unsupported`

`--json` prints the same manifest payload to stdout.

## Summary Contract

`summarize` reads a completed run directory and writes:

- `summary.json`
- `findings.json`
- `visual-report.json`
- `report.md`

`summary.json` is the normalized machine-readable API across all analyzers.
`findings.json` is the flattened issue stream across SARIF and JSON sources,
with stable IDs and drilldown metadata for UI consumers.
`visual-report.json` is the chart/table-ready view model for dashboards and
visual reports.
`report.md` is the short human-readable review artifact generated from the
normalized outputs.

Generated JSON Schemas for the summary outputs live under `schemas/` and are
derived from the TypeScript types in `engine/src/types.ts`:

```bash
cd engine && bun run schemas
```

To build one consolidated local bundle for report/UI work, generate `data/`:

```bash
cd engine
bun run schemas
bun run data:bundle -- ../results/service-finance-final-20260409-230635 ../data service-finance
```

That bundle includes:

- copied canonical run outputs under `data/runs/service-finance/`
- copied schemas under `data/schemas/`
- `data/index.json` with the file inventory and useful dataset priorities
- `data/data-dictionary.json` with field-level meanings for the bundled JSON files

To build the multi-agent review bundle for the canonical `service-finance` run:

```bash
cd engine
bun run schemas
bun run agent-reviews:build -- ../data/agent-reviews/service-finance ../data/runs/service-finance ../schemas service-finance
```

That bundle expects domain-agent outputs under:

- `data/agent-reviews/service-finance/agents/01-auth-shell/analysis.json`
- `data/agent-reviews/service-finance/agents/02-application-intake/analysis.json`
- `data/agent-reviews/service-finance/agents/03-loan-pipeline/analysis.json`
- `data/agent-reviews/service-finance/agents/04-payment-security/analysis.json`
- `data/agent-reviews/service-finance/agents/05-shared-ui/analysis.json`
- `data/agent-reviews/service-finance/agents/06-services-integrations/analysis.json`
- `data/agent-reviews/service-finance/agents/07-consolidation/analysis.json`

and then writes:

- `data/agent-reviews/service-finance/consolidated/coverage-map.json`
- `data/agent-reviews/service-finance/consolidated/flow-catalog.json`
- `data/agent-reviews/service-finance/consolidated/hotspot-catalog.json`
- `data/agent-reviews/service-finance/consolidated/finding-catalog.json`
- `data/agent-reviews/service-finance/consolidated/overview.json`
- `data/agent-reviews/service-finance/index.json`
- `data/agent-reviews/service-finance/data-dictionary.json`

## Notes

- `git-metrics` only supports repository-root targets in this version. Nested
  package targets are marked `unsupported`.
- External analyzers remain independent. A failing step does not stop the rest
  of the run.
- JS analyzers resolve in this order: target-local binary, target package
  manager, generic fallback.

## Reporting

See [docs/how-to-generate-and-consolidate-reports.md](docs/how-to-generate-and-consolidate-reports.md)
for the recommended workflow to generate runs, extract the important metrics,
and consolidate raw artifacts into a report-ready summary.

For scanner-noise reduction and repo-level tuning strategy, see
[docs/gitleaks-opengrep-tuning-strategy.md](docs/gitleaks-opengrep-tuning-strategy.md).

For the concrete execution plan to add CLI flags and curated OpenGrep defaults,
see
[docs/gitleaks-opengrep-adjustments-plan.md](docs/gitleaks-opengrep-adjustments-plan.md).

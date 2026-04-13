# AGENTS.md

## Purpose

This repository is a code-analysis POC with three layers:

1. Run a fixed set of analyzers against a target repo.
2. Normalize the raw tool outputs into one reporting contract.
3. Package the normalized run plus domain-agent reviews into report-ready bundles.

This repo is for exploring behavior and implementation. It is meant for debugging, analyzing outputs, comparing approaches, and trying different ideas. Nothing here should be treated as frozen product behavior.

If you are trying to find what lives where, start here instead of reading the whole repo top to bottom.

## Status

This repository is exploratory.

- Tool selection, thresholds, normalization rules, bundle structure, and review workflow are still expected to change.
- `results/` is local raw output.
- `data/` is a local derived bundle.
- Neither `results/` nor `data/` should be committed.
- `AGENTS.md` is for understanding the repo and running it against external projects, not for browsing committed example datasets.

## Main flow

1. `./code-analysis analyze <target> --out <results-dir>`
   Writes a raw run under `results/<run>/` with `manifest.json` plus per-step artifacts in `steps/`.
2. `./code-analysis summarize <results-dir> [--out <dir>]`
   Produces `summary.json`, `findings.json`, `visual-report.json`, and `report.md`.
3. `cd engine && bun run schemas`
   Regenerates JSON Schemas from `engine/src/types.ts` into `schemas/`.
4. `cd engine && bun run data:bundle -- <results-dir> <out-dir> <dataset-id>`
   Builds a local bundled dataset under `data/`.
5. `cd engine && bun run agent-reviews:build -- <bundle-dir> <canonical-data-dir> <schema-dir> <dataset-id>`
   Rebuilds the local multi-agent review bundle under `data/agent-reviews/<dataset>/`.

## Run On A Project

From the repo root:

```bash
./code-analysis analyze /absolute/path/to/project --out results/<project>-$(date +%Y%m%d-%H%M%S)
./code-analysis summarize results/<run>
cd engine && bun run schemas
cd engine && bun run data:bundle -- ../results/<run> ../data <dataset-id>
cd engine && bun run agent-reviews:build -- ../data/agent-reviews/<dataset-id> ../data/runs/<dataset-id> ../schemas <dataset-id>
```

Notes:

- Replace `<run>` with the directory created in `results/`.
- Replace `<dataset-id>` with a stable slug for the target repo.
- `results/` and `data/` are local working directories. Generate them as needed and keep them out of git.

## Source of truth

- `engine/src/types.ts`
  Canonical TypeScript contracts for the current implementation of run manifests, normalized findings, visual reports, and agent-review artifacts.
- `engine/src/run-analysis.ts`
  Analyzer orchestration and artifact staging.
- `engine/src/summarize.ts`
  Normalization logic from raw artifacts into the repo's reporting model.
- `engine/src/agent-reviews.ts`
  Consolidation logic for domain-agent analyses into coverage, flow, hotspot, finding, and overview catalogs.

These are the source of truth for the current code, not a promise that the contracts are final. If behavior changes in one of those areas, update the related tests and regenerate derived artifacts when needed.

## Repo map

### Top level

- `README.md`
  Human-facing usage and contract overview.
- `code-analysis`
  Supported repo-local CLI entrypoint. Thin wrapper that runs `engine/src/cli.ts` with Bun.
- `analyze.sh`
  Deprecated compatibility wrapper. Still works, but only forwards to the TypeScript CLI.
- `test_analyze.sh`, `test_cli_wrapper.sh`
  Shell-level smoke coverage for the wrappers.
- `docs/`
  Design notes and reporting/tuning strategy docs.
- `.agents/skills/`
  Reusable local skills library. Useful reference material, but not part of the runtime analysis pipeline.
- `.claude/`
  Local Claude/editor configuration. Not product logic.

### `engine/`

- `package.json`
  Bun scripts for analyze, schemas, data bundle, agent-review bundle, and tests.
- `src/cli.ts`
  CLI argument parsing and dispatch for `analyze` and `summarize`.
- `src/run-analysis.ts`
  Runs these steps: `scc`, `lizard`, `jscpd`, `gitleaks`, `trivy`, `dependency-cruiser`, `knip`, `eslint`, `opengrep`, `git-metrics`.
- `src/summarize.ts`
  Reads a completed run and builds the normalized evidence layer plus markdown report.
- `src/generate-schemas.ts`
  Generates JSON Schemas from `types.ts`.
- `src/build-data-bundle.ts`
  Copies one canonical run into `data/` and builds `index.json`, `data-dictionary.json`, and bundled schemas.
- `src/agent-reviews.ts`
  Merges per-domain `analysis.json` files into consolidated review artifacts.
- `src/build-agent-review-bundle.ts`
  CLI wrapper for refreshing `data/agent-reviews/<dataset>/`.
- `src/git-metrics.ts`
  Parses git history into revisions, churn, coupling, ownership, effort, and age CSVs.
- `src/js-tools.ts`
  Resolves whether JS analyzers should run from a local binary, the target package manager, or a generic fallback.
- `src/*.test.ts`
  Bun tests for CLI behavior, JS tool resolution, git metrics, and agent-review bundling.

### `schemas/`

Committed generated schemas for the normalized contracts:

- `run-manifest.schema.json`
- `run-summary.schema.json`
- `normalized-findings.schema.json`
- `visual-report.schema.json`
- `agent-analysis.schema.json`
- `consolidated-analysis.schema.json`

Do not hand-edit these unless you are intentionally changing generated output and cannot regenerate them.

### `results/`

Ignored local run outputs. These are disposable execution artifacts, not source files.

- `results/<run>/manifest.json`
  Step status and artifact inventory.
- `results/<run>/steps/...`
  Raw analyzer evidence.
- `results/<run>/summary.json`, `findings.json`, `visual-report.json`, `report.md`
  Post-summary outputs for that run.

### `data/`

Ignored local derived bundle for downstream reporting and UI exploration.

- `data/index.json`
  Inventory plus recommended read order for the bundled run.
- `data/data-dictionary.json`
  Field-level meaning for the bundled JSON contracts.
- `data/schemas/`
  Schema copies packaged with the local dataset.
- `data/runs/<dataset>/`
  Canonical saved run for a locally generated dataset.
- `data/agent-reviews/<dataset>/`
  Local multi-agent review bundle for the same dataset.

## Local skills inventory

These live under `.agents/skills/` and are reference assets, not runtime scanner code:

- `dependency-cruiser/`
- `deps/`
- `jscpd/`
- `knip/`
- `lizard/`
- `pattern-detection/`
- `security-review/`

Use them as guidance or reusable prompts. Changes here do not change the analyzer engine unless the engine explicitly reads them, which it currently does not.

## What to edit vs. what to regenerate

Edit by hand:

- `engine/src/*.ts`
- `README.md`
- `docs/*.md`
- `.agents/skills/**`

Usually regenerate instead of hand-editing:

- `schemas/*.json`
- `data/index.json`
- `data/data-dictionary.json`
- `data/schemas/*.json`
- `data/runs/**`
- `data/agent-reviews/**`

Treat `results/` and `data/` as ephemeral local output.

Because this repo is meant for experimentation, expect regeneration churn in `schemas/` and local output bundles as the implementation changes.

## Fast orientation checklist

If you need to understand the repo quickly:

1. Read `README.md`.
2. Read `engine/src/cli.ts`.
3. Read `engine/src/run-analysis.ts`.
4. Read `engine/src/summarize.ts`.
5. Read `engine/src/types.ts`.
6. Produce a local run under `results/` and inspect the generated outputs only after that.

#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import type {
  NormalizedFindingList,
  RunManifest,
  RunSummary,
  VisualReport,
} from "./types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const DEFAULT_RESULTS_DIR = join(
  REPO_ROOT,
  "results",
  "service-finance-final-20260409-230635",
);
const DEFAULT_OUT_DIR = join(REPO_ROOT, "data");
const DEFAULT_DATASET_ID = "service-finance";
const SCHEMA_FILES = [
  "run-manifest.schema.json",
  "run-summary.schema.json",
  "normalized-findings.schema.json",
  "visual-report.schema.json",
] as const;

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun run src/build-data-bundle.ts [results-dir] [out-dir] [dataset-id]",
      "",
      `Defaults:`,
      `  results-dir: ${DEFAULT_RESULTS_DIR}`,
      `  out-dir: ${DEFAULT_OUT_DIR}`,
      `  dataset-id: ${DEFAULT_DATASET_ID}`,
    ].join("\n"),
  );
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function ensureFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Required file is missing: ${path}`);
  }
}

function parseArgs(): {
  resultsDir: string;
  outDir: string;
  datasetId: string;
} {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
  }

  return {
    resultsDir: resolve(args[0] ?? DEFAULT_RESULTS_DIR),
    outDir: resolve(args[1] ?? DEFAULT_OUT_DIR),
    datasetId: args[2] ?? DEFAULT_DATASET_ID,
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildIndex(params: {
  datasetId: string;
  sourceResultsDir: string;
  outDir: string;
  manifest: RunManifest;
  summary: RunSummary;
  findings: NormalizedFindingList;
  visualReport: VisualReport;
}): Record<string, unknown> {
  const runDir = `runs/${params.datasetId}`;
  const criticalHighVulnerabilities =
    params.summary.dependencySecurity.countsBySeverity.critical +
    params.summary.dependencySecurity.countsBySeverity.high;

  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    bundle: {
      id: params.datasetId,
      sourceResultsDir: params.sourceResultsDir,
      outDir: params.outDir,
      canonicalRunDir: runDir,
      target: params.manifest.target,
      overallStatus: params.manifest.overallStatus,
    },
    files: [
      {
        id: "manifest",
        path: `${runDir}/manifest.json`,
        schemaPath: "schemas/run-manifest.schema.json",
        kind: "run-control",
        purpose: "Original execution status, timing, and raw artifact inventory.",
      },
      {
        id: "summary",
        path: `${runDir}/summary.json`,
        schemaPath: "schemas/run-summary.schema.json",
        kind: "evidence",
        purpose: "Canonical normalized evidence layer across all analyzers.",
      },
      {
        id: "findings",
        path: `${runDir}/findings.json`,
        schemaPath: "schemas/normalized-findings.schema.json",
        kind: "evidence",
        purpose: "Flat issue stream for filtering, grouping, and drilldown.",
      },
      {
        id: "visual-report",
        path: `${runDir}/visual-report.json`,
        schemaPath: "schemas/visual-report.schema.json",
        kind: "view-model",
        purpose: "Chart and table ready data for executive and engineering dashboards.",
      },
      {
        id: "report",
        path: `${runDir}/report.md`,
        kind: "human-report",
        purpose: "Human-readable narrative derived from summary and findings.",
      },
      {
        id: "raw-artifacts",
        path: `${runDir}/steps/`,
        kind: "evidence",
        purpose: "Underlying analyzer outputs used to build the normalized layers.",
      },
    ],
    counts: {
      findings: params.findings.length,
      hotspots: params.summary.hotspots.length,
      criticalHighVulnerabilities,
      complexityHotspots: params.summary.complexity.hotspots.length,
      duplicationPairs: params.summary.duplication.topPairs.length,
    },
    importantData: [
      {
        id: "hotspots",
        path: `${runDir}/summary.json#/hotspots`,
        priority: "highest",
        why: "Best multi-signal ranking of risky files for engineering review.",
      },
      {
        id: "normalized-findings",
        path: `${runDir}/findings.json`,
        priority: "highest",
        why: "Best issue-level feed for filtering by file, source, category, and severity.",
      },
      {
        id: "executive-top-risks",
        path: `${runDir}/visual-report.json#/executive/topRisks`,
        priority: "high",
        why: "Best source-code-only risk table for dashboards and summaries.",
      },
      {
        id: "dependency-security",
        path: `${runDir}/summary.json#/dependencySecurity`,
        priority: "high",
        why: "Best consolidated dependency risk dataset for security reporting.",
      },
      {
        id: "engineering-duplication",
        path: `${runDir}/visual-report.json#/engineering/duplication`,
        priority: "high",
        why: "Best duplication tables for file and pair level refactoring review.",
      },
      {
        id: "raw-steps",
        path: `${runDir}/steps`,
        priority: "reference",
        why: "Use only when a consumer needs the original analyzer evidence.",
      },
    ],
    reportBuildOrder: [
      "Use summary.json first for normalized cross-tool metrics.",
      "Use visual-report.json second for charts, cards, and tables.",
      "Use findings.json third for filtered issue lists and drilldowns.",
      "Use manifest.json and steps/ only for audit, debugging, and evidence traceability.",
    ],
    currentRunSignals: {
      topHotspot: params.summary.hotspots[0]?.file ?? null,
      topExecutiveRisk: params.visualReport.executive.topRisks.rows[0]?.key ?? null,
      topSecretRule: params.summary.secrets.topRules[0]?.ruleId ?? null,
      topPolicyFamily: params.summary.policy.topRuleFamilies[0]?.ruleFamily ?? null,
    },
  };
}

function buildDataDictionary(datasetId: string): Record<string, unknown> {
  const runDir = `runs/${datasetId}`;

  return {
    schemaVersion: "v1",
    description:
      "Field dictionary for the local report-building bundle. This explains what each bundled JSON file means and how consumers should use it.",
    model: {
      evidenceLayer: [
        `${runDir}/manifest.json`,
        `${runDir}/summary.json`,
        `${runDir}/findings.json`,
      ],
      visualLayer: [`${runDir}/visual-report.json`],
      rawEvidence: [`${runDir}/steps/`],
    },
    files: {
      manifest: {
        path: `${runDir}/manifest.json`,
        schemaPath: "schemas/run-manifest.schema.json",
        purpose:
          "Execution contract for one run. Use this to understand which steps ran, which ones failed or were skipped, and which raw artifacts exist.",
        topLevelFields: {
          target: "Absolute path of the analyzed project.",
          startedAt: "When analysis execution started.",
          finishedAt: "When analysis execution finished.",
          overallStatus:
            "Top-level run status across all selected steps: passed, findings, failed, skipped, or unsupported.",
          steps:
            "Array of per-step execution results. Each step records status, duration, optional exit code or reason, and its raw artifact paths.",
        },
      },
      summary: {
        path: `${runDir}/summary.json`,
        schemaPath: "schemas/run-summary.schema.json",
        purpose:
          "Canonical normalized evidence layer. Use this as the main machine-readable input for aggregation, scoring, and report generation.",
        topLevelFields: {
          schemaVersion: "Schema version for the normalized evidence contract.",
          run: "Normalized run metadata plus the artifact-relative step list.",
          size: "Repository size baseline from scc.",
          complexity: "Function-level complexity and size hotspots from lizard.",
          duplication: "Duplication totals, top files, and top pairs from jscpd.",
          changeRisk:
            "Revision, ownership, age, coupling, and effort signals from git-metrics.",
          dependencySecurity:
            "Severity rollup and package lists from trivy, separated into direct and transitive dependencies.",
          architecture:
            "Dependency-cruiser coverage and cycle context. Useful, but only as strong as graph coverage.",
          deadCode:
            "Knip-based unused dependencies, files, unlisted packages, and unresolved imports.",
          maintainability: "ESLint-based maintainability counts, top rules, and top files.",
          policy: "OpenGrep policy and code-standard findings aggregated by family and file.",
          secrets: "Gitleaks-derived secret-like findings aggregated by rule and file.",
          hotspots:
            "Cross-signal hotspot ranking. Best place to start technical debt review.",
        },
      },
      findings: {
        path: `${runDir}/findings.json`,
        schemaPath: "schemas/normalized-findings.schema.json",
        purpose:
          "Flat issue stream across gitleaks, trivy, knip, eslint, and opengrep. Use this for filtering, tables, and issue drilldowns.",
        itemFields: {
          id: "Deterministic stable finding ID for UI keys and deduplication.",
          stepId: "Analyzer step that produced the finding.",
          source: "High-level source family: gitleaks, trivy, knip, eslint, or opengrep.",
          category:
            "Cross-tool issue category: secret, dependency-vulnerability, unused-code, maintainability, or policy.",
          severity:
            "Normalized severity across tools: critical, high, medium, low, warning, or info.",
          ruleId: "Original rule or issue bucket from the source tool.",
          ruleFamily:
            "Normalized family key used when the source tool emits path-heavy or fine-grained rule IDs.",
          file: "Project-relative file path when a finding maps to a file.",
          line: "1-based source line when available.",
          message: "Human-readable issue message.",
          fingerprint:
            "Tool-provided fingerprint when one exists. Useful for traceability, not as the primary UI key.",
          rawRef: "Artifact-relative path of the raw source report inside the run bundle.",
          subjectType:
            "Main entity type the finding is about: file, dependency, repo, config, function, or unknown.",
          subjectKey:
            "Stable grouping key for clustering related findings in the UI.",
          packageName:
            "Dependency package name when the finding is about a package.",
          packageVersion:
            "Installed package version when the finding source exposes it.",
          dependencyKind:
            "Direct or transitive dependency classification when known.",
          bucket:
            "Source bucket for grouped tools such as knip.",
        },
      },
      visualReport: {
        path: `${runDir}/visual-report.json`,
        schemaPath: "schemas/visual-report.schema.json",
        purpose:
          "Visualization layer derived only from summary.json and findings.json. Use this for charts, cards, tables, and drilldown routing.",
        topLevelFields: {
          schemaVersion: "Schema version for the visual report contract.",
          run:
            "Run metadata plus relative links back to summary.json and findings.json.",
          facets:
            "Count breakdowns that drive filters: sources, categories, severities, rule families, and step statuses.",
          overview:
            "Top-level cards and quick run composition breakdowns for dashboards.",
          executive:
            "Executive-safe cards and top risk tables. More selective and source-code focused than the engineering views.",
          engineering:
            "Detailed tables and cards for hotspots, complexity, duplication, change risk, maintainability, dead code, policy, secrets, and architecture.",
          links:
            "Artifact references back to the raw run evidence.",
        },
      },
    },
    recommendedUse: {
      firstRead:
        `${runDir}/summary.json and ${runDir}/visual-report.json. These are the highest-value starting points for report generation.`,
      whenToUseFindings:
        `${runDir}/findings.json should drive filtered issue lists, faceted search, and drilldowns.`,
      whenToUseRawArtifacts:
        `${runDir}/steps/ should be used only when the normalized layers are insufficient or a reviewer needs the original analyzer evidence.`,
    },
  };
}

function buildReadme(datasetId: string): string {
  return `# Data Bundle

This folder consolidates the current canonical reporting data into one local place
for report building, UI work, and downstream analysis.

## Layout

- \`index.json\`: bundle index, file inventory, and useful dataset priorities
- \`data-dictionary.json\`: detailed meanings for the bundled schemas and fields
- \`schemas/\`: generated JSON Schemas for the bundled JSON contracts
- \`runs/${datasetId}/\`: canonical saved run data, including raw analyzer artifacts under \`steps/\`

## Primary Files

- \`runs/${datasetId}/manifest.json\`: run execution contract
- \`runs/${datasetId}/summary.json\`: normalized evidence layer
- \`runs/${datasetId}/findings.json\`: flat issue stream
- \`runs/${datasetId}/visual-report.json\`: view model for dashboards and charts
- \`runs/${datasetId}/report.md\`: human-readable report artifact

## Recommended Consumption Order

1. Read \`summary.json\` for normalized metrics and hotspot rankings.
2. Read \`visual-report.json\` for ready-to-render cards, tables, and charts.
3. Read \`findings.json\` for filtered issue lists and drilldowns.
4. Use \`manifest.json\` and \`steps/\` only for audit and raw evidence review.

## Regeneration

\`\`\`bash
cd engine
bun run schemas
bun run src/build-data-bundle.ts ../results/service-finance-final-20260409-230635 ../data service-finance
\`\`\`
`;
}

function main(): void {
  const { resultsDir, outDir, datasetId } = parseArgs();
  const schemaDir = join(REPO_ROOT, "schemas");
  const runOutDir = join(outDir, "runs", datasetId);
  const schemaOutDir = join(outDir, "schemas");

  ensureFile(join(resultsDir, "manifest.json"));
  ensureFile(join(resultsDir, "summary.json"));
  ensureFile(join(resultsDir, "findings.json"));
  ensureFile(join(resultsDir, "visual-report.json"));
  for (const schemaFile of SCHEMA_FILES) {
    ensureFile(join(schemaDir, schemaFile));
  }

  mkdirSync(outDir, { recursive: true });
  rmSync(runOutDir, { recursive: true, force: true });
  rmSync(schemaOutDir, { recursive: true, force: true });

  cpSync(resultsDir, runOutDir, { recursive: true });
  mkdirSync(schemaOutDir, { recursive: true });
  for (const schemaFile of SCHEMA_FILES) {
    cpSync(join(schemaDir, schemaFile), join(schemaOutDir, schemaFile));
  }

  const manifest = readJson<RunManifest>(join(runOutDir, "manifest.json"));
  const summary = readJson<RunSummary>(join(runOutDir, "summary.json"));
  const findings = readJson<NormalizedFindingList>(join(runOutDir, "findings.json"));
  const visualReport = readJson<VisualReport>(join(runOutDir, "visual-report.json"));

  writeJson(
    join(outDir, "index.json"),
    buildIndex({
      datasetId,
      sourceResultsDir: resultsDir,
      outDir,
      manifest,
      summary,
      findings,
      visualReport,
    }),
  );
  writeJson(join(outDir, "data-dictionary.json"), buildDataDictionary(datasetId));
  writeFileSync(join(outDir, "README.md"), buildReadme(datasetId));

  console.log(`Data bundle written to ${outDir}`);
  console.log(`Canonical run copied to ${runOutDir}`);
  console.log(`Schemas copied to ${schemaOutDir}`);
}

main();

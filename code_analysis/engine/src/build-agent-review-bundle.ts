#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeAgentReviewBundle,
} from "./agent-reviews";
import type { AgentAnalysis } from "./types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const DEFAULT_DATASET_ID = "service-finance";
const DEFAULT_BUNDLE_DIR = join(
  REPO_ROOT,
  "data",
  "agent-reviews",
  DEFAULT_DATASET_ID,
);
const DEFAULT_CANONICAL_DATA_DIR = join(
  REPO_ROOT,
  "data",
  "runs",
  DEFAULT_DATASET_ID,
);
const DEFAULT_SCHEMA_DIR = join(REPO_ROOT, "schemas");
const DOMAIN_AGENT_IDS = [
  "01-auth-shell",
  "02-application-intake",
  "03-loan-pipeline",
  "04-payment-security",
  "05-shared-ui",
  "06-services-integrations",
] as const;
const CONSOLIDATION_AGENT_ID = "07-consolidation";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun run src/build-agent-review-bundle.ts [bundle-dir] [canonical-data-dir] [schema-dir] [dataset-id]",
      "",
      `Defaults:`,
      `  bundle-dir: ${DEFAULT_BUNDLE_DIR}`,
      `  canonical-data-dir: ${DEFAULT_CANONICAL_DATA_DIR}`,
      `  schema-dir: ${DEFAULT_SCHEMA_DIR}`,
      `  dataset-id: ${DEFAULT_DATASET_ID}`,
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(): {
  bundleDir: string;
  canonicalDataDir: string;
  schemaDir: string;
  datasetId: string;
} {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
  }

  return {
    bundleDir: resolve(args[0] ?? DEFAULT_BUNDLE_DIR),
    canonicalDataDir: resolve(args[1] ?? DEFAULT_CANONICAL_DATA_DIR),
    schemaDir: resolve(args[2] ?? DEFAULT_SCHEMA_DIR),
    datasetId: args[3] ?? DEFAULT_DATASET_ID,
  };
}

function loadAnalysis(path: string): AgentAnalysis {
  if (!existsSync(path)) {
    throw new Error(`Missing analysis file: ${path}`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as AgentAnalysis;
}

function main(): void {
  const { bundleDir, canonicalDataDir, schemaDir, datasetId } = parseArgs();
  const analyses = DOMAIN_AGENT_IDS.map((agentId) =>
    loadAnalysis(join(bundleDir, "agents", agentId, "analysis.json")),
  );
  const consolidationAnalysis = loadAnalysis(
    join(bundleDir, "agents", CONSOLIDATION_AGENT_ID, "analysis.json"),
  );

  materializeAgentReviewBundle({
    datasetId,
    canonicalDataDir,
    outDir: bundleDir,
    schemaDir,
    analyses,
    consolidationAnalysis,
  });

  console.log(`Agent review bundle refreshed at ${bundleDir}`);
}

main();

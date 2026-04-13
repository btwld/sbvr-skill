#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createGenerator } from "ts-json-schema-generator";

const TYPES_PATH = join(import.meta.dir, "types.ts");
const SCHEMA_DIR = resolve(import.meta.dir, "..", "..", "schemas");

function writeSchema(typeName: string, outputName: string): void {
  const generator = createGenerator({
    path: TYPES_PATH,
    type: typeName,
    expose: "export",
    jsDoc: "none",
    skipTypeCheck: true,
  });

  const schema = generator.createSchema(typeName);
  const outputPath = join(SCHEMA_DIR, outputName);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`);
}

writeSchema("RunSummary", "run-summary.schema.json");
writeSchema("NormalizedFindingList", "normalized-findings.schema.json");
writeSchema("VisualReport", "visual-report.schema.json");
writeSchema("RunManifest", "run-manifest.schema.json");
writeSchema("AgentAnalysis", "agent-analysis.schema.json");
writeSchema("ConsolidatedReviewArtifact", "consolidated-analysis.schema.json");

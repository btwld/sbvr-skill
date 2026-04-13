#!/usr/bin/env bun

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { runAnalysis } from "./run-analysis";
import { summarizeRun } from "./summarize";

interface AnalyzeArgs {
  command: "analyze";
  targetDir: string;
  outDir: string;
  steps?: string[];
  json: boolean;
}

interface SummarizeArgs {
  command: "summarize";
  resultsDir: string;
  outDir?: string;
  json: boolean;
}

type ParsedArgs = AnalyzeArgs | SummarizeArgs;

function usage(): string {
  return [
    "Usage:",
    "  code-analysis analyze <target> --out <results-dir> [--steps <csv>] [--json]",
    "  code-analysis summarize <results-dir> [--out <dir>] [--json]",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, subjectDir, ...rest] = argv;

  if (!subjectDir || (command !== "analyze" && command !== "summarize")) {
    throw new Error(usage());
  }

  let outDir = "";
  let steps: string[] | undefined;
  let json = false;

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];

    if (current === "--out") {
      outDir = rest[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (current === "--steps") {
      const raw = rest[index + 1] ?? "";
      steps = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (current === "--json") {
      json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${usage()}`);
  }

  if (!outDir) {
    if (command === "analyze") {
      throw new Error(`Missing required --out argument\n\n${usage()}`);
    }

    return {
      command: "summarize",
      resultsDir: subjectDir,
      json,
    };
  }

  if (command === "summarize") {
    return {
      command: "summarize",
      resultsDir: subjectDir,
      outDir,
      json,
    };
  }

  return {
    command: "analyze",
    targetDir: subjectDir,
    outDir,
    steps,
    json,
  };
}

function printSummary(manifest: ReturnType<typeof runAnalysis>): void {
  console.log(`Target: ${manifest.target}`);
  console.log(`Overall: ${manifest.overallStatus}`);
  console.log("Steps:");
  for (const step of manifest.steps) {
    const suffix = step.reason ? ` - ${step.reason}` : "";
    console.log(`- ${step.id}: ${step.status}${suffix}`);
  }
}

function printRunSummary(output: ReturnType<typeof summarizeRun>): void {
  console.log(`Results: ${output.summary.run.resultsDir}`);
  console.log(`Overall: ${output.summary.run.overallStatus}`);
  console.log(`Summary file: ${resolve(output.outDir, "summary.json")}`);
  console.log(`Findings file: ${resolve(output.outDir, "findings.json")}`);
  console.log(`Visual report file: ${resolve(output.outDir, "visual-report.json")}`);
  console.log(`Report file: ${resolve(output.outDir, "report.md")}`);
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let parsed: ParsedArgs;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const inputDir = resolve(parsed.command === "analyze" ? parsed.targetDir : parsed.resultsDir);
  if (!existsSync(inputDir)) {
    console.error(`Target directory does not exist: ${inputDir}`);
    return 1;
  }
  if (!statSync(inputDir).isDirectory()) {
    console.error(`Target path must be a directory: ${inputDir}`);
    return 1;
  }

  try {
    if (parsed.command === "summarize") {
      const output = summarizeRun({
        resultsDir: inputDir,
        outDir: parsed.outDir,
      });

      if (parsed.json) {
        console.log(JSON.stringify(output.summary, null, 2));
      } else {
        printRunSummary(output);
      }
    } else {
      const manifest = runAnalysis({
        targetDir: inputDir,
        outDir: parsed.outDir,
        stepFilter: parsed.steps,
      });

      if (parsed.json) {
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        printSummary(manifest);
      }
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main());
}

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve } from "node:path";

import type {
  BreakdownPoint,
  DrilldownRef,
  FindingCategory,
  FindingDependencyKind,
  FindingSeverity,
  FindingSource,
  FindingSubjectType,
  MetricCard,
  NormalizedFinding,
  RunSummary,
  RunManifest,
  SummaryDependencyPackage,
  SummaryHotspot,
  SummaryLanguageMetric,
  TableBlock,
  TableColumn,
  TableRow,
  VisualReport,
} from "./types";

const TOP_N = 10;
const EXECUTIVE_LIMIT = 10;
const ENGINEERING_LIMIT = 25;
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "warning", "info"] as const;
const NOISY_SECRET_RULES = ["generic-api-key"];

interface SummarizeOptions {
  resultsDir: string;
  outDir?: string;
}

interface SummarizeArtifacts {
  summary: RunSummary;
  findings: NormalizedFinding[];
  visualReport: VisualReport;
  reportMarkdown: string;
  outDir: string;
}

interface SccRow {
  Name: string;
  Lines: number;
  Code: number;
  Comment: number;
  Blank: number;
  Count: number;
}

interface LizardRow {
  nloc: number;
  ccn: number;
  file: string;
  functionName: string;
  startLine: number;
  endLine: number;
}

interface JscpdDuplicate {
  lines: number;
  firstFile: {
    name: string;
  };
  secondFile: {
    name: string;
  };
}

interface JscpdSourceStat {
  lines: number;
  duplicatedLines: number;
  percentage: number;
}

interface CsvRecord {
  [key: string]: string;
}

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  warning: number;
  info: number;
}

type FileKind = "source" | "config" | "lockfile" | "generated" | "tooling" | "unknown";

function emptySeverityCounts(): SeverityCounts {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      currentValue = "";
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseCsvRecords(text: string): CsvRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }

  const [headers, ...records] = rows;
  return records.map((row) => {
    const record: CsvRecord = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function normalizePath(targetDir: string, filePath: string | null | undefined): string | null {
  if (!filePath) {
    return null;
  }

  if (!filePath.startsWith("/")) {
    return filePath.replace(/\\/g, "/");
  }

  const relativePath = relative(targetDir, filePath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("..")) {
    return basename(filePath);
  }
  return relativePath;
}

function fileExists(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function readArtifact(resultsDir: string, relativePath: string): string | null {
  const artifactPath = join(resultsDir, relativePath);
  return fileExists(artifactPath) ? readFileSync(artifactPath, "utf8") : null;
}

function fixedSeverityCounts(counts: Partial<Record<(typeof SEVERITY_ORDER)[number], number>>): SeverityCounts {
  const result = emptySeverityCounts();
  for (const severity of SEVERITY_ORDER) {
    result[severity] = counts[severity] ?? 0;
  }
  return result;
}

function incrementCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortCountEntries(map: Map<string, number>): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function sortBySeverity<T extends { severity: string; advisoryCount: number; package: string }>(items: T[]): T[] {
  const rank = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));
  return [...items].sort((left, right) => {
    const severityDelta = (rank.get(left.severity as (typeof SEVERITY_ORDER)[number]) ?? 999)
      - (rank.get(right.severity as (typeof SEVERITY_ORDER)[number]) ?? 999);
    return severityDelta || right.advisoryCount - left.advisoryCount || left.package.localeCompare(right.package);
  });
}

function higherSeverity(
  left: SummaryDependencyPackage["severity"],
  right: SummaryDependencyPackage["severity"],
): SummaryDependencyPackage["severity"] {
  const rank = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));
  return (rank.get(left as (typeof SEVERITY_ORDER)[number]) ?? 999)
    <= (rank.get(right as (typeof SEVERITY_ORDER)[number]) ?? 999)
    ? left
    : right;
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function parseScc(resultsDir: string): RunSummary["size"] {
  const raw = readArtifact(resultsDir, "steps/scc/report.json");
  if (!raw) {
    return {
      filesTotal: 0,
      linesTotal: 0,
      codeLines: 0,
      commentLines: 0,
      blankLines: 0,
      languages: [],
    };
  }

  const rows = readJson<SccRow[]>(join(resultsDir, "steps/scc/report.json"));
  const languages: SummaryLanguageMetric[] = rows
    .map((row) => ({
      name: row.Name,
      files: Number(row.Count ?? 0),
      lines: Number(row.Lines ?? 0),
      codeLines: Number(row.Code ?? 0),
      commentLines: Number(row.Comment ?? 0),
    }))
    .sort((left, right) => right.codeLines - left.codeLines || left.name.localeCompare(right.name));

  return {
    filesTotal: languages.reduce((sum, item) => sum + item.files, 0),
    linesTotal: languages.reduce((sum, item) => sum + item.lines, 0),
    codeLines: languages.reduce((sum, item) => sum + item.codeLines, 0),
    commentLines: languages.reduce((sum, item) => sum + item.commentLines, 0),
    blankLines: rows.reduce((sum, row) => sum + Number(row.Blank ?? 0), 0),
    languages,
  };
}

function parseLizardRows(resultsDir: string, targetDir: string): LizardRow[] {
  const raw = readArtifact(resultsDir, "steps/lizard/report.csv");
  if (!raw) {
    return [];
  }

  return parseCsv(raw)
    .filter((row) => row.length >= 11)
    .map((row) => ({
      nloc: Number(row[0] ?? 0),
      ccn: Number(row[1] ?? 0),
      file: normalizePath(targetDir, row[6]) ?? row[6] ?? "",
      functionName: row[7] || row[8] || "(anonymous)",
      startLine: Number(row[9] ?? 0),
      endLine: Number(row[10] ?? 0),
    }));
}

function buildComplexity(resultsDir: string, targetDir: string): RunSummary["complexity"] {
  const rows = parseLizardRows(resultsDir, targetDir);
  const hotspots: SummaryComplexityHotspot[] = rows
    .filter((row) => row.ccn >= 20 || row.nloc >= 150)
    .map((row) => ({
      file: row.file,
      function: row.functionName,
      ccn: row.ccn,
      nloc: row.nloc,
      startLine: row.startLine,
      endLine: row.endLine,
    }))
    .sort(
      (left, right) =>
        right.ccn - left.ccn ||
        right.nloc - left.nloc ||
        left.file.localeCompare(right.file) ||
        left.function.localeCompare(right.function),
    );

  return {
    functionsTotal: rows.length,
    thresholds: {
      ccnGte10: rows.filter((row) => row.ccn >= 10).length,
      ccnGte20: rows.filter((row) => row.ccn >= 20).length,
      nlocGte150: rows.filter((row) => row.nloc >= 150).length,
    },
    hotspots,
  };
}

function buildDuplication(resultsDir: string, targetDir: string): RunSummary["duplication"] {
  const raw = readArtifact(resultsDir, "steps/jscpd/report.json");
  if (!raw) {
    return {
      cloneGroups: 0,
      duplicatedLines: 0,
      duplicatedTokens: 0,
      percentage: 0,
      topPairs: [],
      topFiles: [],
    };
  }

  const report = readJson<{
    duplicates: JscpdDuplicate[];
    statistics: {
      total: {
        clones: number;
        duplicatedLines: number;
        duplicatedTokens: number;
        percentage: number;
      };
      formats: Record<string, { sources: Record<string, JscpdSourceStat> }>;
    };
  }>(join(resultsDir, "steps/jscpd/report.json"));

  const pairMap = new Map<string, SummaryDuplicationPair>();
  for (const duplicate of report.duplicates ?? []) {
    const leftFile = normalizePath(targetDir, duplicate.firstFile?.name) ?? duplicate.firstFile?.name ?? "";
    const rightFile = normalizePath(targetDir, duplicate.secondFile?.name) ?? duplicate.secondFile?.name ?? "";
    if (!leftFile || !rightFile || leftFile === rightFile) {
      continue;
    }
    const pair = [leftFile, rightFile].sort();
    const key = `${pair[0]}::${pair[1]}`;
    const existing = pairMap.get(key);
    if (existing) {
      existing.lines += Number(duplicate.lines ?? 0);
    } else {
      pairMap.set(key, {
        leftFile: pair[0],
        rightFile: pair[1],
        lines: Number(duplicate.lines ?? 0),
      });
    }
  }

  const topPairs: SummaryDuplicationPair[] = [...pairMap.values()]
    .sort((left, right) => right.lines - left.lines || left.leftFile.localeCompare(right.leftFile) || left.rightFile.localeCompare(right.rightFile))
    .slice(0, ENGINEERING_LIMIT);

  const fileStats = new Map<string, SummaryDuplicationFile>();
  for (const format of Object.values(report.statistics.formats ?? {})) {
    for (const [filePath, stats] of Object.entries(format.sources ?? {})) {
      const normalized = normalizePath(targetDir, filePath) ?? filePath;
      const current = fileStats.get(normalized);
      const duplicatedPercentage = Math.min(100, Number(stats.percentage ?? 0));
      const candidate: SummaryDuplicationFile = {
        file: normalized,
        duplicatedLines: Number(stats.duplicatedLines ?? 0),
        duplicatedPercentage,
      };
      if (!current || candidate.duplicatedLines > current.duplicatedLines) {
        fileStats.set(normalized, candidate);
      }
    }
  }

  const topFiles = [...fileStats.values()]
    .filter((item) => item.duplicatedLines > 0)
    .sort((left, right) => right.duplicatedLines - left.duplicatedLines || right.duplicatedPercentage - left.duplicatedPercentage || left.file.localeCompare(right.file))
    .slice(0, ENGINEERING_LIMIT);

  return {
    cloneGroups: Number(report.statistics.total?.clones ?? 0),
    duplicatedLines: Number(report.statistics.total?.duplicatedLines ?? 0),
    duplicatedTokens: Number(report.statistics.total?.duplicatedTokens ?? 0),
    percentage: Number(report.statistics.total?.percentage ?? 0),
    topPairs,
    topFiles,
  };
}

function buildChangeRisk(resultsDir: string, targetDir: string): RunSummary["changeRisk"] {
  const revisionsRecords = parseCsvRecords(readArtifact(resultsDir, "steps/git-metrics/revisions.csv") ?? "");
  const ownershipRecords = parseCsvRecords(readArtifact(resultsDir, "steps/git-metrics/ownership.csv") ?? "");
  const ageRecords = parseCsvRecords(readArtifact(resultsDir, "steps/git-metrics/age.csv") ?? "");
  const couplingRecords = parseCsvRecords(readArtifact(resultsDir, "steps/git-metrics/coupling.csv") ?? "");
  const effortRecords = parseCsvRecords(readArtifact(resultsDir, "steps/git-metrics/effort.csv") ?? "");

  const revisionsMap = new Map<string, number>();
  const topRevisions: SummaryRevisionsEntry[] = revisionsRecords
    .map((record) => ({
      file: normalizePath(targetDir, record.entity) ?? record.entity,
      revisions: Number(record["n-revs"] ?? 0),
    }))
    .sort((left, right) => right.revisions - left.revisions || left.file.localeCompare(right.file));

  for (const entry of topRevisions) {
    revisionsMap.set(entry.file, entry.revisions);
  }

  const ownershipHotspots: SummaryOwnershipHotspot[] = ownershipRecords
    .map((record) => ({
      file: normalizePath(targetDir, record.entity) ?? record.entity,
      owner: record.owner,
      ownership: Number(record.ownership ?? 0),
      revisions: revisionsMap.get(normalizePath(targetDir, record.entity) ?? record.entity) ?? 0,
    }))
    .filter((entry) => entry.revisions >= 20 && entry.ownership < 0.35)
    .sort((left, right) => right.revisions - left.revisions || left.ownership - right.ownership || left.file.localeCompare(right.file))
    .slice(0, ENGINEERING_LIMIT);

  const oldestFiles: SummaryAgeEntry[] = ageRecords
    .map((record) => ({
      file: normalizePath(targetDir, record.entity) ?? record.entity,
      ageDays: Number(record["age-days"] ?? 0),
    }))
    .sort((left, right) => right.ageDays - left.ageDays || left.file.localeCompare(right.file))
    .slice(0, ENGINEERING_LIMIT);

  const topCouplings: SummaryCouplingEntry[] = couplingRecords
    .map((record) => ({
      file: normalizePath(targetDir, record.entity) ?? record.entity,
      coupledFile: normalizePath(targetDir, record.coupled) ?? record.coupled,
      degree: Number(record.degree ?? 0),
    }))
    .filter((entry) => entry.degree > 0)
    .sort((left, right) => right.degree - left.degree || left.file.localeCompare(right.file) || left.coupledFile.localeCompare(right.coupledFile))
    .slice(0, ENGINEERING_LIMIT);

  const effortByAuthor: SummaryEffortEntry[] = effortRecords
    .map((record) => ({
      author: record.author,
      added: Number(record.added ?? 0),
      deleted: Number(record.deleted ?? 0),
    }))
    .sort((left, right) => (right.added + right.deleted) - (left.added + left.deleted) || left.author.localeCompare(right.author))
    .slice(0, ENGINEERING_LIMIT);

  return {
    topRevisions: topRevisions.slice(0, ENGINEERING_LIMIT),
    ownershipHotspots,
    oldestFiles,
    topCouplings,
    effortByAuthor,
    notes: ["git-metrics churn.csv is excluded from headline metrics in v1"],
  };
}

function readPackageDependencies(targetDir: string): Set<string> {
  const packageJsonPath = join(targetDir, "package.json");
  if (!fileExists(packageJsonPath)) {
    return new Set<string>();
  }

  const packageJson = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath);

  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
}

function normalizeSeverity(value: string | null | undefined, fallback: "warning" | "info" | "high" = "warning"): NormalizedFinding["severity"] {
  const normalized = (value ?? "").trim().toLowerCase();
  if (SEVERITY_ORDER.includes(normalized as (typeof SEVERITY_ORDER)[number])) {
    return normalized as NormalizedFinding["severity"];
  }
  if (normalized === "error") {
    return "high";
  }
  if (normalized === "note") {
    return "info";
  }
  return fallback;
}

function normalizeEslintSeverity(value: number | null | undefined): FindingSeverity {
  if (value === 2) {
    return "high";
  }
  if (value === 1) {
    return "warning";
  }
  return "info";
}

function isConfigLikeFile(file: string | null): boolean {
  if (!file) {
    return false;
  }

  const normalized = file.toLowerCase();
  return (
    normalized.endsWith("package.json") ||
    normalized.endsWith("app.json") ||
    normalized.endsWith("yarn.lock") ||
    normalized.endsWith("podfile.lock") ||
    normalized.endsWith("google-services.json") ||
    normalized.endsWith("googleservice-info.plist") ||
    normalized.endsWith(".plist") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".toml") ||
    normalized.endsWith(".json")
  );
}

function classifyFileKind(file: string | null): FileKind {
  if (!file) {
    return "unknown";
  }

  const normalized = file.replace(/\\/g, "/").toLowerCase();

  if (
    normalized.endsWith("yarn.lock") ||
    normalized.endsWith("package-lock.json") ||
    normalized.endsWith("pnpm-lock.yaml") ||
    normalized.endsWith("pnpm-lock.yml") ||
    normalized.endsWith("bun.lockb") ||
    normalized.endsWith("podfile.lock") ||
    normalized.endsWith("cargo.lock") ||
    normalized.endsWith("gemfile.lock")
  ) {
    return "lockfile";
  }

  if (
    normalized.startsWith(".expo/") ||
    normalized.includes("/generated/") ||
    normalized.includes("/build/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/coverage/") ||
    normalized.includes("/pods/") ||
    normalized.endsWith(".generated.ts") ||
    normalized.endsWith(".generated.tsx") ||
    normalized.endsWith(".gen.ts") ||
    normalized.endsWith(".gen.tsx")
  ) {
    return "generated";
  }

  if (
    normalized.endsWith("babel.config.js") ||
    normalized.endsWith("metro.config.js") ||
    normalized.endsWith("jest.config.js") ||
    normalized.endsWith("jest.config.ts") ||
    normalized.endsWith("eslint.config.js") ||
    normalized.endsWith("eslint.config.mjs") ||
    normalized.endsWith("prettier.config.js") ||
    normalized.endsWith("vite.config.ts") ||
    normalized.endsWith("webpack.config.js") ||
    normalized.endsWith("tsconfig.json")
  ) {
    return "tooling";
  }

  if (
    isConfigLikeFile(normalized) ||
    normalized.endsWith(".gradle") ||
    normalized.endsWith(".properties") ||
    normalized.endsWith(".xcconfig") ||
    normalized.endsWith(".pbxproj")
  ) {
    return "config";
  }

  if (/(\.(ts|tsx|js|jsx|mjs|cjs|java|kt|swift|m|mm|c|cc|cpp|h|hpp|cs|rb|py|go|rs|php|vue|svelte|css|scss|less))$/.test(normalized)) {
    return "source";
  }

  return "unknown";
}

function isExecutiveRiskFile(file: string): boolean {
  return classifyFileKind(file) === "source";
}

function stableRuleKey(input: {
  source: FindingSource;
  ruleId: string;
  ruleFamily: string | null;
}): string {
  if (input.source === "opengrep" && input.ruleFamily) {
    return input.ruleFamily;
  }
  return input.ruleId;
}

function inferSubjectType(draft: {
  file: string | null;
  packageName?: string;
  subjectType?: FindingSubjectType;
}): FindingSubjectType {
  if (draft.subjectType) {
    return draft.subjectType;
  }
  if (draft.packageName) {
    return "dependency";
  }
  if (!draft.file) {
    return "repo";
  }
  if (isConfigLikeFile(draft.file)) {
    return "config";
  }
  return "file";
}

function inferSubjectKey(draft: {
  subjectType: FindingSubjectType;
  file: string | null;
  ruleId: string;
  packageName?: string;
  packageVersion?: string;
  dependencyKind?: FindingDependencyKind;
  subjectKey?: string;
}): string {
  if (draft.subjectKey) {
    return draft.subjectKey;
  }

  if (draft.subjectType === "dependency") {
    const dependencyKind = draft.dependencyKind ?? "unknown";
    const packageName = draft.packageName ?? "unknown";
    const packageVersion = draft.packageVersion ?? "unknown";
    return `dependency:${dependencyKind}:${packageName}@${packageVersion}`;
  }

  if (draft.subjectType === "config") {
    return `config:${draft.file ?? draft.ruleId}`;
  }

  if (draft.subjectType === "file") {
    return `file:${draft.file ?? draft.ruleId}`;
  }

  if (draft.subjectType === "repo") {
    return `repo:${draft.ruleId}`;
  }

  return `unknown:${draft.ruleId}`;
}

function findingId(input: {
  stepId: string;
  source: FindingSource;
  category: FindingCategory;
  severity: FindingSeverity;
  ruleId: string;
  ruleFamily: string | null;
  file: string | null;
  line: number | null;
  message: string;
  fingerprint: string | null;
  rawRef: string;
  subjectType: FindingSubjectType;
  subjectKey: string;
  packageName?: string;
  packageVersion?: string;
  dependencyKind?: FindingDependencyKind;
  bucket?: string;
}): string {
  const stableRuleId = stableRuleKey({
    source: input.source,
    ruleId: input.ruleId,
    ruleFamily: input.ruleFamily,
  });

  return createHash("sha256")
    .update(
      JSON.stringify([
        input.stepId,
        input.source,
        input.category,
        input.severity,
        stableRuleId,
        input.ruleFamily,
        input.file,
        input.line,
        input.message,
        input.fingerprint,
        input.rawRef,
        input.subjectType,
        input.subjectKey,
        input.packageName ?? null,
        input.packageVersion ?? null,
        input.dependencyKind ?? null,
        input.bucket ?? null,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}

function createFinding(draft: Omit<NormalizedFinding, "id" | "subjectType" | "subjectKey"> & {
  subjectType?: FindingSubjectType;
  subjectKey?: string;
}): NormalizedFinding {
  const subjectType = inferSubjectType(draft);
  const subjectKey = inferSubjectKey({
    subjectType,
    file: draft.file,
    ruleId: draft.ruleId,
    packageName: draft.packageName,
    packageVersion: draft.packageVersion,
    dependencyKind: draft.dependencyKind,
    subjectKey: draft.subjectKey,
  });

  return {
    ...draft,
    id: findingId({
      stepId: draft.stepId,
      source: draft.source,
      category: draft.category,
      severity: draft.severity,
      ruleId: draft.ruleId,
      ruleFamily: draft.ruleFamily,
      file: draft.file,
      line: draft.line,
      message: draft.message,
      fingerprint: draft.fingerprint,
      rawRef: draft.rawRef,
      subjectType,
      subjectKey,
      packageName: draft.packageName,
      packageVersion: draft.packageVersion,
      dependencyKind: draft.dependencyKind,
      bucket: draft.bucket,
    }),
    subjectType,
    subjectKey,
  };
}

function buildDependencySecurity(
  resultsDir: string,
  targetDir: string,
): {
  section: RunSummary["dependencySecurity"];
  findings: NormalizedFinding[];
} {
  const raw = readArtifact(resultsDir, "steps/trivy/findings.json");
  const sbomArtifact = fileExists(join(resultsDir, "steps/trivy/sbom.cyclonedx.json"))
    ? "steps/trivy/sbom.cyclonedx.json"
    : null;

  if (!raw) {
    return {
      section: {
        countsBySeverity: fixedSeverityCounts({}),
        directPackages: [],
        transitivePackages: [],
        sbomArtifact,
      },
      findings: [],
    };
  }

  const report = readJson<{
    Results?: Array<{
      Vulnerabilities?: Array<{
        PkgName?: string;
        InstalledVersion?: string;
        Severity?: string;
        Fingerprint?: string;
        Title?: string;
        VulnerabilityID?: string;
      }>;
    }>;
  }>(join(resultsDir, "steps/trivy/findings.json"));

  const directDependencies = readPackageDependencies(targetDir);
  const counts = emptySeverityCounts();
  const directMap = new Map<string, SummaryDependencyPackage>();
  const transitiveMap = new Map<string, SummaryDependencyPackage>();
  const findings: NormalizedFinding[] = [];

  for (const result of report.Results ?? []) {
    for (const vulnerability of result.Vulnerabilities ?? []) {
      const pkgName = vulnerability.PkgName ?? "unknown";
      const installedVersion = vulnerability.InstalledVersion ?? "unknown";
      const severity = normalizeSeverity(vulnerability.Severity, "warning");
      counts[severity] += 1;
      const map = directDependencies.has(pkgName) ? directMap : transitiveMap;
      const key = `${pkgName}::${installedVersion}`;
      const existing = map.get(key);
      if (existing) {
        existing.advisoryCount += 1;
        existing.severity = higherSeverity(existing.severity, severity);
      } else {
        map.set(key, {
          package: pkgName,
          installedVersion,
          severity,
          advisoryCount: 1,
        });
      }

      findings.push(createFinding({
        stepId: "trivy",
        source: "trivy",
        category: "dependency-vulnerability",
        severity,
        ruleId: vulnerability.VulnerabilityID ?? "trivy-vulnerability",
        ruleFamily: null,
        file: "yarn.lock",
        line: null,
        message: vulnerability.Title ?? `${pkgName} has a ${severity} vulnerability`,
        fingerprint: vulnerability.Fingerprint ?? null,
        rawRef: "steps/trivy/findings.json",
        packageName: pkgName,
        packageVersion: installedVersion,
        dependencyKind: directDependencies.has(pkgName) ? "direct" : "transitive",
      }));
    }
  }

  return {
    section: {
      countsBySeverity: fixedSeverityCounts(counts),
      directPackages: sortBySeverity([...directMap.values()]).slice(0, TOP_N),
      transitivePackages: sortBySeverity([...transitiveMap.values()]).slice(0, TOP_N),
      sbomArtifact,
    },
    findings,
  };
}

function buildArchitecture(resultsDir: string, size: RunSummary["size"]): RunSummary["architecture"] {
  const raw = readArtifact(resultsDir, "steps/dependency-cruiser/report.json");
  if (!raw) {
    return {
      modulesCruised: 0,
      dependenciesCruised: 0,
      cycleCount: 0,
      unresolvedCount: 0,
      coverageAssessment: {
        status: "weak",
        reason: "dependency-cruiser report is unavailable",
      },
    };
  }

  const report = readJson<{
    modules?: Array<{ dependencies?: Array<{ couldNotResolve?: boolean }> }>;
    summary?: {
      totalCruised?: number;
      totalDependenciesCruised?: number;
      violations?: unknown[];
    };
  }>(join(resultsDir, "steps/dependency-cruiser/report.json"));

  const modulesCruised = Number(report.summary?.totalCruised ?? report.modules?.length ?? 0);
  const dependenciesCruised = Number(report.summary?.totalDependenciesCruised ?? 0);
  const cycleCount = Array.isArray(report.summary?.violations) ? report.summary!.violations!.length : 0;
  const unresolvedCount = (report.modules ?? []).reduce(
    (sum, module) =>
      sum +
      (module.dependencies ?? []).filter((dependency) => dependency.couldNotResolve).length,
    0,
  );

  const codeFileCount = size.languages
    .filter((language) => language.name === "TypeScript" || language.name === "JavaScript")
    .reduce((sum, language) => sum + language.files, 0);
  const coverageRatio = codeFileCount > 0 ? modulesCruised / codeFileCount : 0;

  let status: RunSummary["architecture"]["coverageAssessment"]["status"] = "weak";
  if (coverageRatio >= 0.5 && modulesCruised >= 100) {
    status = "useful";
  } else if (coverageRatio >= 0.3 && modulesCruised >= 50) {
    status = "partial";
  }

  return {
    modulesCruised,
    dependenciesCruised,
    cycleCount,
    unresolvedCount,
    coverageAssessment: {
      status,
      reason: `dependency-cruiser covered ${modulesCruised} modules across ${codeFileCount} JavaScript/TypeScript files`,
    },
  };
}

function buildDeadCode(
  resultsDir: string,
  targetDir: string,
): {
  section: RunSummary["deadCode"];
  findings: NormalizedFinding[];
} {
  const raw = readArtifact(resultsDir, "steps/knip/report.json");
  if (!raw) {
    return {
      section: {
        counts: {
          unusedFiles: 0,
          unusedDependencies: 0,
          unusedDevDependencies: 0,
          unlistedPackages: 0,
          unresolvedImports: 0,
          unusedBinaries: 0,
        },
        unusedDependencies: [],
        unusedDevDependencies: [],
        unlistedPackages: [],
        unresolvedImports: [],
      },
      findings: [],
    };
  }

  const report = readJson<{
    issues?: Array<Record<string, unknown> & { file?: string }>;
  }>(join(resultsDir, "steps/knip/report.json"));

  const unusedDependencies: Array<{ name: string; file: string }> = [];
  const unusedDevDependencies: Array<{ name: string; file: string }> = [];
  const unlistedPackages: Array<{ name: string; file: string }> = [];
  const unresolvedImports: Array<{ name: string; file: string }> = [];
  let unusedFiles = 0;
  let unusedBinaries = 0;
  const findings: NormalizedFinding[] = [];

  for (const issue of report.issues ?? []) {
    const file = normalizePath(targetDir, String(issue.file ?? "")) ?? String(issue.file ?? "");
    const buckets = Object.entries(issue).filter(
      ([key, value]) => key !== "file" && Array.isArray(value) && value.length > 0,
    ) as Array<[string, Array<Record<string, unknown>>]>;

    for (const [bucket, entries] of buckets) {
      for (const entry of entries) {
        const name = String(entry.name ?? file);
        if (bucket === "dependencies") {
          unusedDependencies.push({ name, file });
        } else if (bucket === "devDependencies") {
          unusedDevDependencies.push({ name, file });
        } else if (bucket === "unlisted") {
          unlistedPackages.push({ name, file });
        } else if (bucket === "unresolved") {
          unresolvedImports.push({ name, file });
        } else if (bucket === "files") {
          unusedFiles += 1;
        } else if (bucket === "binaries") {
          unusedBinaries += 1;
        }

        const subjectType: FindingSubjectType =
          bucket === "dependencies" || bucket === "devDependencies" || bucket === "unlisted"
            ? "dependency"
            : bucket === "files"
              ? "file"
              : "unknown";

        findings.push(createFinding({
          stepId: "knip",
          source: "knip",
          category: "unused-code",
          severity: "warning",
          ruleId: bucket,
          ruleFamily: null,
          file,
          line: typeof entry.line === "number" ? entry.line : null,
          message: `${bucket}: ${name}`,
          fingerprint: null,
          rawRef: "steps/knip/report.json",
          subjectType,
          packageName:
            bucket === "dependencies" || bucket === "devDependencies" || bucket === "unlisted"
              ? name
              : undefined,
          dependencyKind:
            bucket === "dependencies" || bucket === "devDependencies"
              ? "direct"
              : undefined,
          bucket,
        }));
      }
    }
  }

  const sortNamedEntries = (items: Array<{ name: string; file: string }>) =>
    [...items].sort((left, right) => left.name.localeCompare(right.name) || left.file.localeCompare(right.file));

  return {
    section: {
      counts: {
        unusedFiles,
        unusedDependencies: unusedDependencies.length,
        unusedDevDependencies: unusedDevDependencies.length,
        unlistedPackages: unlistedPackages.length,
        unresolvedImports: unresolvedImports.length,
        unusedBinaries,
      },
      unusedDependencies: sortNamedEntries(unusedDependencies),
      unusedDevDependencies: sortNamedEntries(unusedDevDependencies),
      unlistedPackages: sortNamedEntries(unlistedPackages),
      unresolvedImports: sortNamedEntries(unresolvedImports),
    },
    findings,
  };
}

function buildMaintainability(
  resultsDir: string,
  targetDir: string,
): {
  section: RunSummary["maintainability"];
  findings: NormalizedFinding[];
  fileMessageCounts: Map<string, number>;
} {
  const raw = readArtifact(resultsDir, "steps/eslint/report.json");
  const emptySection: RunSummary["maintainability"] = {
    errorCount: 0,
    warningCount: 0,
    topRules: [],
    topFiles: [],
  };

  if (!raw) {
    return {
      section: emptySection,
      findings: [],
      fileMessageCounts: new Map<string, number>(),
    };
  }

  const report = readJson<Array<{
    filePath: string;
    errorCount: number;
    warningCount: number;
    messages: Array<{
      ruleId: string | null;
      severity: number;
      message: string;
      line?: number;
    }>;
  }>>(join(resultsDir, "steps/eslint/report.json"));

  const ruleCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  const findings: NormalizedFinding[] = [];

  for (const entry of report) {
    const file = normalizePath(targetDir, entry.filePath) ?? entry.filePath;
    incrementCount(fileCounts, file, entry.messages.length);
    for (const message of entry.messages) {
      const ruleId = message.ruleId ?? "<no-rule>";
      incrementCount(ruleCounts, ruleId);
      findings.push(createFinding({
        stepId: "eslint",
        source: "eslint",
        category: "maintainability",
        severity: normalizeEslintSeverity(message.severity),
        ruleId,
        ruleFamily: null,
        file,
        line: typeof message.line === "number" ? message.line : null,
        message: message.message,
        fingerprint: null,
        rawRef: "steps/eslint/report.json",
      }));
    }
  }

  const topRules = sortCountEntries(ruleCounts)
    .map(({ key, count }) => ({ ruleId: key, count }))
    .slice(0, TOP_N);

  const topFiles = sortCountEntries(fileCounts)
    .map(({ key, count }) => ({ file: key, messageCount: count }))
    .slice(0, TOP_N);

  return {
    section: {
      errorCount: report.reduce((sum, entry) => sum + Number(entry.errorCount ?? 0), 0),
      warningCount: report.reduce((sum, entry) => sum + Number(entry.warningCount ?? 0), 0),
      topRules,
      topFiles,
    },
    findings,
    fileMessageCounts: fileCounts,
  };
}

function opengrepRuleFamily(ruleId: string): string {
  const segments = ruleId.split(".");
  return segments[segments.length - 1] || ruleId;
}

function buildPolicy(
  resultsDir: string,
  targetDir: string,
): {
  section: RunSummary["policy"];
  findings: NormalizedFinding[];
  fileFindingCounts: Map<string, number>;
} {
  const raw = readArtifact(resultsDir, "steps/opengrep/report.sarif");
  if (!raw) {
    return {
      section: {
        topRuleFamilies: [],
        topFiles: [],
      },
      findings: [],
      fileFindingCounts: new Map<string, number>(),
    };
  }

  const sarif = readJson<{
    runs?: Array<{
      results?: Array<{
        ruleId?: string;
        level?: string;
        message?: { text?: string };
        fingerprints?: Record<string, string>;
        locations?: Array<{
          physicalLocation?: {
            artifactLocation?: { uri?: string };
            region?: { startLine?: number };
          };
        }>;
      }>;
    }>;
  }>(join(resultsDir, "steps/opengrep/report.sarif"));

  const ruleCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  const findings: NormalizedFinding[] = [];

  for (const result of sarif.runs?.[0]?.results ?? []) {
    const ruleId = result.ruleId ?? "opengrep";
    const ruleFamily = opengrepRuleFamily(ruleId);
    const file = normalizePath(
      targetDir,
      result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? null,
    );
    incrementCount(ruleCounts, ruleFamily);
    if (file) {
      incrementCount(fileCounts, file);
    }
    findings.push(createFinding({
      stepId: "opengrep",
      source: "opengrep",
      category: "policy",
      severity: normalizeSeverity(result.level, "warning"),
      ruleId,
      ruleFamily,
      file,
      line: result.locations?.[0]?.physicalLocation?.region?.startLine ?? null,
      message: result.message?.text ?? ruleFamily,
      fingerprint: result.fingerprints?.["matchBasedId/v1"] ?? null,
      rawRef: "steps/opengrep/report.sarif",
    }));
  }

  return {
    section: {
      topRuleFamilies: sortCountEntries(ruleCounts)
        .map(({ key, count }) => ({ ruleFamily: key, count }))
        .slice(0, ENGINEERING_LIMIT),
      topFiles: sortCountEntries(fileCounts)
        .map(({ key, count }) => ({ file: key, findingCount: count }))
        .slice(0, ENGINEERING_LIMIT),
    },
    findings,
    fileFindingCounts: fileCounts,
  };
}

function buildSecrets(
  resultsDir: string,
  targetDir: string,
): {
  section: RunSummary["secrets"];
  findings: NormalizedFinding[];
} {
  const raw = readArtifact(resultsDir, "steps/gitleaks/report.sarif");
  if (!raw) {
    return {
      section: {
        topRules: [],
        topFiles: [],
        noisyRules: [],
      },
      findings: [],
    };
  }

  const sarif = readJson<{
    runs?: Array<{
      results?: Array<{
        ruleId?: string;
        message?: { text?: string };
        partialFingerprints?: Record<string, string>;
        locations?: Array<{
          physicalLocation?: {
            artifactLocation?: { uri?: string };
            region?: { startLine?: number };
          };
        }>;
      }>;
    }>;
  }>(join(resultsDir, "steps/gitleaks/report.sarif"));

  const ruleCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  const findings: NormalizedFinding[] = [];

  for (const result of sarif.runs?.[0]?.results ?? []) {
    const ruleId = result.ruleId ?? "gitleaks";
    const file = normalizePath(
      targetDir,
      result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? null,
    );
    incrementCount(ruleCounts, ruleId);
    if (file) {
      incrementCount(fileCounts, file);
    }
    findings.push(createFinding({
      stepId: "gitleaks",
      source: "gitleaks",
      category: "secret",
      severity: "high",
      ruleId,
      ruleFamily: null,
      file,
      line: result.locations?.[0]?.physicalLocation?.region?.startLine ?? null,
      message: result.message?.text ?? ruleId,
      fingerprint: result.partialFingerprints?.commitSha ?? null,
      rawRef: "steps/gitleaks/report.sarif",
    }));
  }

  const presentRules = new Set(ruleCounts.keys());
  const noisyRules = NOISY_SECRET_RULES.filter((rule) => presentRules.has(rule)).sort();

  return {
    section: {
      topRules: sortCountEntries(ruleCounts)
        .map(({ key, count }) => ({ ruleId: key, count }))
        .slice(0, ENGINEERING_LIMIT),
      topFiles: sortCountEntries(fileCounts)
        .map(({ key, count }) => ({ file: key, findingCount: count }))
        .slice(0, ENGINEERING_LIMIT),
      noisyRules,
    },
    findings,
  };
}

function buildHotspots(
  complexity: RunSummary["complexity"],
  duplication: RunSummary["duplication"],
  changeRisk: RunSummary["changeRisk"],
  maintainabilityFileCounts: Map<string, number>,
  policyFileCounts: Map<string, number>,
): SummaryHotspot[] {
  const notesByFile = new Map<string, string[]>();
  const signalsByFile = new Map<string, Set<string>>();

  const addSignal = (file: string, signal: string, note: string): void => {
    const signalSet = signalsByFile.get(file) ?? new Set<string>();
    signalSet.add(signal);
    signalsByFile.set(file, signalSet);

    const notes = notesByFile.get(file) ?? [];
    if (!notes.includes(note)) {
      notes.push(note);
      notes.sort();
    }
    notesByFile.set(file, notes);
  };

  for (const hotspot of complexity.hotspots) {
    addSignal(hotspot.file, "complexity", "CCN or function length hotspot");
  }

  for (const file of duplication.topFiles.filter((entry) => entry.duplicatedLines >= 100)) {
    addSignal(file.file, "duplication", "high duplicate lines");
  }

  for (const file of changeRisk.topRevisions.filter((entry) => entry.revisions >= 50)) {
    addSignal(file.file, "high-revisions", "frequently changed file");
  }

  for (const file of changeRisk.ownershipHotspots) {
    addSignal(file.file, "low-ownership", "ownership is fragmented");
  }

  for (const [file, count] of maintainabilityFileCounts.entries()) {
    if (count >= 10) {
      addSignal(file, "lint-heavy", "many ESLint messages");
    }
  }

  for (const [file, count] of policyFileCounts.entries()) {
    if (count >= 10) {
      addSignal(file, "policy-heavy", "many OpenGrep findings");
    }
  }

  return [...signalsByFile.entries()]
    .map(([file, signals]) => ({
      file,
      score: signals.size,
      signals: [...signals].sort(),
      notes: notesByFile.get(file) ?? [],
    }))
    .filter((entry) => entry.score >= 2)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file));
}

function sortFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const severityRank = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));
  return [...findings].sort((left, right) => {
    return (
      left.source.localeCompare(right.source) ||
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.line ?? 0) - (right.line ?? 0) ||
      ((severityRank.get(left.severity as (typeof SEVERITY_ORDER)[number]) ?? 999)
        - (severityRank.get(right.severity as (typeof SEVERITY_ORDER)[number]) ?? 999)) ||
      left.ruleId.localeCompare(right.ruleId) ||
      left.message.localeCompare(right.message)
    );
  });
}

function makeFindingDrilldown(filters: DrilldownRef["filters"]): DrilldownRef {
  return {
    type: "findings",
    filters,
  };
}

function makeFileDrilldown(file: string, artifact?: string): DrilldownRef {
  return {
    type: "file",
    file,
    artifact,
  };
}

function makeArtifactDrilldown(artifact: string): DrilldownRef {
  return {
    type: "artifact",
    artifact,
  };
}

function breakdownFromMap(
  map: Map<string, number>,
  options?: {
    limit?: number;
    severityByKey?: Map<string, FindingSeverity>;
    drilldown?: (key: string) => DrilldownRef | undefined;
  },
): BreakdownPoint[] {
  return sortCountEntries(map)
    .slice(0, options?.limit)
    .map(({ key, count }) => ({
      key,
      label: key,
      value: count,
      severity: options?.severityByKey?.get(key),
      drilldown: options?.drilldown?.(key),
    }));
}

function tableBlock(
  id: string,
  title: string,
  columns: TableColumn[],
  rows: TableRow[],
): TableBlock {
  return {
    id,
    title,
    columns,
    rows,
  };
}

function countStepStatuses(summary: RunSummary): BreakdownPoint[] {
  const counts = new Map<string, number>();
  for (const step of summary.run.steps) {
    incrementCount(counts, step.status);
  }
  return breakdownFromMap(counts);
}

function collectFindingFacets(findings: NormalizedFinding[]): VisualReport["facets"] {
  const sources = new Map<string, number>();
  const categories = new Map<string, number>();
  const severities = new Map<string, number>();
  const ruleFamilies = new Map<string, number>();
  const severityByKey = new Map<string, FindingSeverity>();

  for (const finding of findings) {
    incrementCount(sources, finding.source);
    incrementCount(categories, finding.category);
    incrementCount(severities, finding.severity);
    const family = finding.ruleFamily ?? finding.ruleId;
    incrementCount(ruleFamilies, family);
    severityByKey.set(finding.severity, finding.severity);
  }

  return {
    sources: breakdownFromMap(sources, {
      drilldown: (source) => makeFindingDrilldown({ sources: [source as FindingSource] }),
    }),
    categories: breakdownFromMap(categories, {
      drilldown: (category) => makeFindingDrilldown({ categories: [category as FindingCategory] }),
    }),
    severities: breakdownFromMap(severities, {
      severityByKey,
      drilldown: (severity) => makeFindingDrilldown({ severities: [severity as FindingSeverity] }),
    }),
    ruleFamilies: breakdownFromMap(ruleFamilies, {
      limit: ENGINEERING_LIMIT,
      drilldown: (ruleFamily) => makeFindingDrilldown({ ruleFamilies: [ruleFamily] }),
    }),
    stepStatuses: [],
  };
}

function findingsByFile(findings: NormalizedFinding[], file: string): number {
  return findings.filter((finding) => finding.file === file).length;
}

function artifactForHotspotSignals(signals: string[]): string | undefined {
  if (signals.includes("complexity")) {
    return "steps/lizard/report.csv";
  }
  if (signals.includes("duplication")) {
    return "steps/jscpd/report.json";
  }
  if (signals.includes("high-revisions")) {
    return "steps/git-metrics/revisions.csv";
  }
  if (signals.includes("low-ownership")) {
    return "steps/git-metrics/ownership.csv";
  }
  if (signals.includes("lint-heavy")) {
    return "steps/eslint/report.json";
  }
  if (signals.includes("policy-heavy")) {
    return "steps/opengrep/report.sarif";
  }
  return undefined;
}

function hotspotRows(
  hotspots: SummaryHotspot[],
  findings: NormalizedFinding[],
  limit: number,
  options?: {
    sourceOnly?: boolean;
    includeKind?: boolean;
  },
): TableRow[] {
  return hotspots
    .filter((hotspot) => !options?.sourceOnly || isExecutiveRiskFile(hotspot.file))
    .slice(0, limit)
    .map((hotspot) => {
      const findingCount = findingsByFile(findings, hotspot.file);
      const kind = classifyFileKind(hotspot.file);
      const values: TableRow["values"] = {
        file: hotspot.file,
        score: hotspot.score,
        signals: hotspot.signals.join(", "),
        findings: findingCount,
      };

      if (options?.includeKind) {
        values.kind = kind;
      }

      return {
        key: hotspot.file,
        label: hotspot.file,
        values,
        drilldown:
          findingCount > 0
            ? makeFindingDrilldown({ files: [hotspot.file] })
            : makeFileDrilldown(hotspot.file, artifactForHotspotSignals(hotspot.signals)),
      };
    });
}

function packageRows(packages: SummaryDependencyPackage[]): TableRow[] {
  return packages.map((pkg) => ({
    key: `${pkg.package}@${pkg.installedVersion}`,
    label: pkg.package,
    values: {
      package: pkg.package,
      version: pkg.installedVersion,
      severity: pkg.severity,
      advisories: pkg.advisoryCount,
    },
    drilldown: makeFindingDrilldown({
      sources: ["trivy"],
      packages: [pkg.package],
      severities: [pkg.severity as FindingSeverity],
    }),
  }));
}

function severityCards(summary: RunSummary): MetricCard[] {
  const criticalHigh =
    summary.dependencySecurity.countsBySeverity.critical +
    summary.dependencySecurity.countsBySeverity.high;

  return [
    {
      id: "total-findings",
      label: "Total findings",
      value: 0,
      tone: "info",
      drilldown: makeFindingDrilldown({}),
    },
    {
      id: "hotspot-count",
      label: "Hotspots",
      value: summary.hotspots.length,
      tone: "warning",
      drilldown: makeFindingDrilldown({ files: summary.hotspots.slice(0, EXECUTIVE_LIMIT).map((hotspot) => hotspot.file) }),
    },
    {
      id: "critical-high-vulnerabilities",
      label: "Critical/high vulnerabilities",
      value: criticalHigh,
      tone: criticalHigh > 0 ? "critical" : "positive",
      drilldown: makeFindingDrilldown({ sources: ["trivy"], severities: ["critical", "high"] }),
    },
    {
      id: "duplication-percentage",
      label: "Duplication",
      value: Number(summary.duplication.percentage.toFixed(2)),
      unit: "%",
      tone: summary.duplication.percentage >= 5 ? "warning" : "neutral",
      drilldown: makeArtifactDrilldown("steps/jscpd/report.json"),
    },
    {
      id: "complexity-hotspot-count",
      label: "Complexity hotspots",
      value: summary.complexity.hotspots.length,
      tone: summary.complexity.hotspots.length > 0 ? "warning" : "positive",
      drilldown: makeArtifactDrilldown("steps/lizard/report.csv"),
    },
  ];
}

function buildOverview(summary: RunSummary, findings: NormalizedFinding[]): VisualReport["overview"] {
  const categoryCounts = new Map<string, number>();

  for (const finding of findings) {
    incrementCount(categoryCounts, finding.category);
  }

  const cards = severityCards(summary);
  const totalFindingsCard = cards.find((card) => card.id === "total-findings");
  if (totalFindingsCard) {
    totalFindingsCard.value = findings.length;
  }

  return {
    cards,
    stepStatus: countStepStatuses(summary),
    findingMix: breakdownFromMap(categoryCounts, {
      drilldown: (category) => makeFindingDrilldown({ categories: [category as FindingCategory] }),
    }),
  };
}

function buildExecutive(summary: RunSummary, findings: NormalizedFinding[]): VisualReport["executive"] {
  const topRisks = tableBlock(
    "top-risks",
    "Top risks",
    [
      { key: "file", label: "File" },
      { key: "score", label: "Score" },
      { key: "signals", label: "Signals" },
      { key: "findings", label: "Findings" },
    ],
    hotspotRows(summary.hotspots, findings, EXECUTIVE_LIMIT, { sourceOnly: true }),
  );

  const severityBreakdown: BreakdownPoint[] = SEVERITY_ORDER
    .map((severity) => ({
      key: severity,
      label: severity,
      value: summary.dependencySecurity.countsBySeverity[severity] ?? 0,
      severity,
      drilldown: makeFindingDrilldown({ sources: ["trivy"], severities: [severity] }),
    }))
    .filter((entry) => entry.value > 0);

  const cards = [
    {
      id: "overall-status",
      label: "Run status",
      value: summary.run.overallStatus,
      tone: summary.run.overallStatus === "failed"
        ? "critical"
        : summary.run.overallStatus === "findings"
          ? "warning"
          : "positive",
    },
    {
      id: "weak-signal-areas",
      label: "Weak signal areas",
      value: [
        summary.architecture.coverageAssessment.status !== "useful" ? "architecture" : null,
        summary.secrets.noisyRules.length > 0 ? "secrets" : null,
      ].filter(Boolean).length,
      tone: "info",
    },
  ] satisfies MetricCard[];

  const qualityNotes = [
    ...summary.changeRisk.notes,
    summary.architecture.coverageAssessment.reason,
    ...(summary.secrets.noisyRules.length > 0
      ? [`secret noise includes ${summary.secrets.noisyRules.join(", ")}`]
      : []),
  ];

  return {
    cards,
    topRisks,
    security: {
      severityBreakdown,
      directPackages: tableBlock(
        "direct-vulnerable-packages",
        "Direct vulnerable packages",
        [
          { key: "package", label: "Package" },
          { key: "version", label: "Version" },
          { key: "severity", label: "Severity" },
          { key: "advisories", label: "Advisories" },
        ],
        packageRows(summary.dependencySecurity.directPackages.slice(0, EXECUTIVE_LIMIT)),
      ),
      transitivePackages: tableBlock(
        "transitive-vulnerable-packages",
        "Transitive vulnerable packages",
        [
          { key: "package", label: "Package" },
          { key: "version", label: "Version" },
          { key: "severity", label: "Severity" },
          { key: "advisories", label: "Advisories" },
        ],
        packageRows(summary.dependencySecurity.transitivePackages.slice(0, EXECUTIVE_LIMIT)),
      ),
    },
    quality: {
      cards: [
        {
          id: "duplication-lines",
          label: "Duplicate lines",
          value: summary.duplication.duplicatedLines,
          tone: summary.duplication.duplicatedLines > 0 ? "warning" : "positive",
          drilldown: makeArtifactDrilldown("steps/jscpd/report.json"),
        },
        {
          id: "eslint-warning-count",
          label: "ESLint warnings",
          value: summary.maintainability.warningCount,
          tone: summary.maintainability.warningCount > 0 ? "warning" : "positive",
          drilldown: makeFindingDrilldown({ sources: ["eslint"] }),
        },
      ],
      notes: qualityNotes,
    },
  };
}

function rulesTableRows(
  entries: Array<{ ruleId?: string; ruleFamily?: string; count: number }>,
  source: FindingSource,
): TableRow[] {
  return entries.map((entry) => {
    const key = entry.ruleFamily ?? entry.ruleId ?? "unknown";
    return {
      key,
      label: key,
      values: {
        rule: key,
        count: entry.count,
      },
      drilldown: makeFindingDrilldown({
        sources: [source],
        ...(entry.ruleFamily ? { ruleFamilies: [entry.ruleFamily] } : { ruleIds: [entry.ruleId ?? key] }),
      }),
    };
  });
}

function fileCountRows(
  entries: Array<{ file: string; messageCount?: number; findingCount?: number }>,
  source: FindingSource,
): TableRow[] {
  return entries.map((entry) => ({
    key: entry.file,
    label: entry.file,
    values: {
      file: entry.file,
      count: entry.messageCount ?? entry.findingCount ?? 0,
    },
    drilldown: makeFindingDrilldown({
      sources: [source],
      files: [entry.file],
    }),
  }));
}

export function buildVisualReport(
  summary: RunSummary,
  findings: NormalizedFinding[],
  options: {
    summaryPath: string;
    findingsPath: string;
  },
): VisualReport {
  const facets = {
    ...collectFindingFacets(findings),
    stepStatuses: countStepStatuses(summary),
  };

  const overview = buildOverview(summary, findings);
  const executive = buildExecutive(summary, findings);

  const engineering: VisualReport["engineering"] = {
    hotspots: tableBlock(
      "engineering-hotspots",
      "Engineering hotspots",
      [
        { key: "file", label: "File" },
        { key: "kind", label: "Kind" },
        { key: "score", label: "Score" },
        { key: "signals", label: "Signals" },
        { key: "findings", label: "Findings" },
      ],
      hotspotRows(summary.hotspots, findings, ENGINEERING_LIMIT, { includeKind: true }),
    ),
    complexity: {
      cards: [
        {
          id: "functions-total",
          label: "Functions analyzed",
          value: summary.complexity.functionsTotal,
          tone: "neutral",
          drilldown: makeArtifactDrilldown("steps/lizard/report.csv"),
        },
      ],
      thresholds: [
        {
          key: "ccn-gte-10",
          label: "CCN >= 10",
          value: summary.complexity.thresholds.ccnGte10,
          drilldown: makeArtifactDrilldown("steps/lizard/report.csv"),
        },
        {
          key: "ccn-gte-20",
          label: "CCN >= 20",
          value: summary.complexity.thresholds.ccnGte20,
          drilldown: makeArtifactDrilldown("steps/lizard/report.csv"),
        },
        {
          key: "nloc-gte-150",
          label: "NLOC >= 150",
          value: summary.complexity.thresholds.nlocGte150,
          drilldown: makeArtifactDrilldown("steps/lizard/report.csv"),
        },
      ],
      hotspots: tableBlock(
        "complexity-hotspots",
        "Complexity hotspots",
        [
          { key: "file", label: "File" },
          { key: "function", label: "Function" },
          { key: "ccn", label: "CCN" },
          { key: "nloc", label: "NLOC" },
          { key: "startLine", label: "Start" },
          { key: "endLine", label: "End" },
        ],
        summary.complexity.hotspots.slice(0, ENGINEERING_LIMIT).map((hotspot) => ({
          key: `${hotspot.file}:${hotspot.function}:${hotspot.startLine}`,
          label: hotspot.function,
          values: {
            file: hotspot.file,
            function: hotspot.function,
            ccn: hotspot.ccn,
            nloc: hotspot.nloc,
            startLine: hotspot.startLine,
            endLine: hotspot.endLine,
          },
          drilldown: makeFileDrilldown(hotspot.file, "steps/lizard/report.csv"),
        })),
      ),
    },
    duplication: {
      cards: [
        {
          id: "duplicate-lines",
          label: "Duplicate lines",
          value: summary.duplication.duplicatedLines,
          tone: summary.duplication.duplicatedLines > 0 ? "warning" : "positive",
          drilldown: makeArtifactDrilldown("steps/jscpd/report.json"),
        },
        {
          id: "duplicate-percentage",
          label: "Duplicate percentage",
          value: Number(summary.duplication.percentage.toFixed(2)),
          unit: "%",
          tone: summary.duplication.percentage > 5 ? "warning" : "neutral",
          drilldown: makeArtifactDrilldown("steps/jscpd/report.json"),
        },
      ],
      files: tableBlock(
        "duplicate-files",
        "Most duplicated files",
        [
          { key: "file", label: "File" },
          { key: "duplicatedLines", label: "Duplicated lines" },
          { key: "duplicatedPercentage", label: "Duplicated %" },
        ],
        summary.duplication.topFiles.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: entry.file,
          label: entry.file,
          values: {
            file: entry.file,
            duplicatedLines: entry.duplicatedLines,
            duplicatedPercentage: Number(entry.duplicatedPercentage.toFixed(2)),
          },
          drilldown: makeFileDrilldown(entry.file, "steps/jscpd/report.json"),
        })),
      ),
      pairs: tableBlock(
        "duplicate-pairs",
        "Most duplicated pairs",
        [
          { key: "leftFile", label: "Left file" },
          { key: "rightFile", label: "Right file" },
          { key: "lines", label: "Lines" },
        ],
        summary.duplication.topPairs.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: `${entry.leftFile}::${entry.rightFile}`,
          values: {
            leftFile: entry.leftFile,
            rightFile: entry.rightFile,
            lines: entry.lines,
          },
          drilldown: makeArtifactDrilldown("steps/jscpd/report.json"),
        })),
      ),
    },
    changeRisk: {
      revisions: tableBlock(
        "change-risk-revisions",
        "Most revised files",
        [
          { key: "file", label: "File" },
          { key: "revisions", label: "Revisions" },
        ],
        summary.changeRisk.topRevisions.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: entry.file,
          label: entry.file,
          values: {
            file: entry.file,
            revisions: entry.revisions,
          },
          drilldown: makeFileDrilldown(entry.file, "steps/git-metrics/revisions.csv"),
        })),
      ),
      ownership: tableBlock(
        "change-risk-ownership",
        "Low ownership hotspots",
        [
          { key: "file", label: "File" },
          { key: "owner", label: "Top owner" },
          { key: "ownership", label: "Ownership" },
          { key: "revisions", label: "Revisions" },
        ],
        summary.changeRisk.ownershipHotspots.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: entry.file,
          label: entry.file,
          values: {
            file: entry.file,
            owner: entry.owner,
            ownership: Number(entry.ownership.toFixed(3)),
            revisions: entry.revisions,
          },
          drilldown: makeFileDrilldown(entry.file, "steps/git-metrics/ownership.csv"),
        })),
      ),
      oldest: tableBlock(
        "change-risk-oldest",
        "Oldest files",
        [
          { key: "file", label: "File" },
          { key: "ageDays", label: "Age days" },
        ],
        summary.changeRisk.oldestFiles.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: entry.file,
          label: entry.file,
          values: {
            file: entry.file,
            ageDays: entry.ageDays,
          },
          drilldown: makeFileDrilldown(entry.file, "steps/git-metrics/age.csv"),
        })),
      ),
    },
    maintainability: {
      rules: tableBlock(
        "maintainability-rules",
        "Maintainability rules",
        [
          { key: "rule", label: "Rule" },
          { key: "count", label: "Count" },
        ],
        rulesTableRows(
          summary.maintainability.topRules.map((entry) => ({ ruleId: entry.ruleId, count: entry.count })),
          "eslint",
        ),
      ),
      files: tableBlock(
        "maintainability-files",
        "Maintainability files",
        [
          { key: "file", label: "File" },
          { key: "count", label: "Messages" },
        ],
        fileCountRows(summary.maintainability.topFiles, "eslint"),
      ),
    },
    deadCode: {
      counts: [
        { key: "unused-files", label: "Unused files", value: summary.deadCode.counts.unusedFiles, drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["files"] }) },
        { key: "unused-dependencies", label: "Unused dependencies", value: summary.deadCode.counts.unusedDependencies, drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["dependencies"] }) },
        { key: "unused-dev-dependencies", label: "Unused devDependencies", value: summary.deadCode.counts.unusedDevDependencies, drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["devDependencies"] }) },
        { key: "unlisted-packages", label: "Unlisted packages", value: summary.deadCode.counts.unlistedPackages, drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["unlisted"] }) },
        { key: "unresolved-imports", label: "Unresolved imports", value: summary.deadCode.counts.unresolvedImports, drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["unresolved"] }) },
      ],
      dependencies: tableBlock(
        "dead-code-dependencies",
        "Unused dependencies",
        [
          { key: "name", label: "Name" },
          { key: "file", label: "File" },
        ],
        summary.deadCode.unusedDependencies.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: `${entry.name}:${entry.file}`,
          label: entry.name,
          values: {
            name: entry.name,
            file: entry.file,
          },
          drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["dependencies"], packages: [entry.name], files: [entry.file] }),
        })),
      ),
      devDependencies: tableBlock(
        "dead-code-dev-dependencies",
        "Unused devDependencies",
        [
          { key: "name", label: "Name" },
          { key: "file", label: "File" },
        ],
        summary.deadCode.unusedDevDependencies.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: `${entry.name}:${entry.file}`,
          label: entry.name,
          values: {
            name: entry.name,
            file: entry.file,
          },
          drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["devDependencies"], packages: [entry.name], files: [entry.file] }),
        })),
      ),
      unlistedPackages: tableBlock(
        "dead-code-unlisted",
        "Unlisted packages",
        [
          { key: "name", label: "Name" },
          { key: "file", label: "File" },
        ],
        summary.deadCode.unlistedPackages.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: `${entry.name}:${entry.file}`,
          label: entry.name,
          values: {
            name: entry.name,
            file: entry.file,
          },
          drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["unlisted"], packages: [entry.name], files: [entry.file] }),
        })),
      ),
      unresolvedImports: tableBlock(
        "dead-code-unresolved",
        "Unresolved imports",
        [
          { key: "name", label: "Name" },
          { key: "file", label: "File" },
        ],
        summary.deadCode.unresolvedImports.slice(0, ENGINEERING_LIMIT).map((entry) => ({
          key: `${entry.name}:${entry.file}`,
          label: entry.name,
          values: {
            name: entry.name,
            file: entry.file,
          },
          drilldown: makeFindingDrilldown({ sources: ["knip"], ruleIds: ["unresolved"], packages: [entry.name], files: [entry.file] }),
        })),
      ),
    },
    policy: {
      families: tableBlock(
        "policy-families",
        "Policy rule families",
        [
          { key: "rule", label: "Rule family" },
          { key: "count", label: "Count" },
        ],
        rulesTableRows(
          summary.policy.topRuleFamilies.map((entry) => ({ ruleFamily: entry.ruleFamily, count: entry.count })),
          "opengrep",
        ),
      ),
      files: tableBlock(
        "policy-files",
        "Policy files",
        [
          { key: "file", label: "File" },
          { key: "count", label: "Findings" },
        ],
        fileCountRows(summary.policy.topFiles, "opengrep"),
      ),
    },
    secrets: {
      rules: tableBlock(
        "secret-rules",
        "Secret rules",
        [
          { key: "rule", label: "Rule" },
          { key: "count", label: "Count" },
        ],
        rulesTableRows(
          summary.secrets.topRules.map((entry) => ({ ruleId: entry.ruleId, count: entry.count })),
          "gitleaks",
        ),
      ),
      files: tableBlock(
        "secret-files",
        "Secret files",
        [
          { key: "file", label: "File" },
          { key: "count", label: "Findings" },
        ],
        fileCountRows(summary.secrets.topFiles, "gitleaks"),
      ),
      noisyRules: [...summary.secrets.noisyRules],
    },
    architecture: {
      cards: [
        {
          id: "modules-cruised",
          label: "Modules cruised",
          value: summary.architecture.modulesCruised,
          tone: summary.architecture.coverageAssessment.status === "useful" ? "positive" : "warning",
          drilldown: makeArtifactDrilldown("steps/dependency-cruiser/report.json"),
        },
        {
          id: "dependency-cycles",
          label: "Dependency cycles",
          value: summary.architecture.cycleCount,
          tone: summary.architecture.cycleCount > 0 ? "critical" : "positive",
          drilldown: makeArtifactDrilldown("steps/dependency-cruiser/report.json"),
        },
        {
          id: "unresolved-dependencies",
          label: "Unresolved imports",
          value: summary.architecture.unresolvedCount,
          tone: summary.architecture.unresolvedCount > 0 ? "warning" : "positive",
          drilldown: makeArtifactDrilldown("steps/dependency-cruiser/report.json"),
        },
      ],
      coverageAssessment: summary.architecture.coverageAssessment,
    },
  };

  return {
    schemaVersion: "v1",
    run: {
      target: summary.run.target,
      resultsDir: summary.run.resultsDir,
      overallStatus: summary.run.overallStatus,
      generatedAt: summary.run.generatedAt,
      summaryPath: options.summaryPath,
      findingsPath: options.findingsPath,
    },
    facets,
    overview,
    executive,
    engineering,
    links: {
      artifacts: summary.run.steps.flatMap((step) =>
        step.artifacts.map((path) => ({
          stepId: step.id,
          path,
        })),
      ),
    },
  };
}

function renderReport(summary: RunSummary, findings: NormalizedFinding[]): string {
  const topHotspots = summary.hotspots.slice(0, 5);
  const topDirectPackages = summary.dependencySecurity.directPackages.slice(0, 5);
  const topSecretRules = summary.secrets.topRules.slice(0, 5);
  const topMaintainabilityRules = summary.maintainability.topRules.slice(0, 5);
  const appendixArtifacts = summary.run.steps.flatMap((step) => step.artifacts);
  const findingCountsByCategory = new Map<string, number>();

  for (const finding of findings) {
    incrementCount(findingCountsByCategory, finding.category);
  }

  const formatCountList = (entries: string[]): string =>
    entries.length > 0 ? entries.map((entry) => `- ${entry}`).join("\n") : "- none";

  return [
    "# Code Analysis Report",
    "",
    "## Run summary",
    `- Target: \`${summary.run.target}\``,
    `- Results directory: \`${summary.run.resultsDir}\``,
    `- Overall status: \`${summary.run.overallStatus}\``,
    `- Generated at: \`${summary.run.generatedAt}\``,
    "",
    "## Top risks",
    formatCountList([
      ...topHotspots.map((hotspot) => `${hotspot.file} (${hotspot.signals.join(", ")})`),
      ...topDirectPackages.map(
        (pkg) => `${pkg.package}@${pkg.installedVersion} (${pkg.severity}, ${pkg.advisoryCount} advisories)`,
      ),
    ].slice(0, 5)),
    "",
    "## Hotspots",
    formatCountList(
      topHotspots.map(
        (hotspot) =>
          `${hotspot.file} — score ${hotspot.score}; signals: ${hotspot.signals.join(", ")}`,
      ),
    ),
    "",
    "## Security summary",
    `- Vulnerabilities: critical ${summary.dependencySecurity.countsBySeverity.critical}, high ${summary.dependencySecurity.countsBySeverity.high}, medium ${summary.dependencySecurity.countsBySeverity.medium}, low ${summary.dependencySecurity.countsBySeverity.low}`,
    `- Secret findings: ${topSecretRules.map((entry) => `${entry.ruleId} (${entry.count})`).join(", ") || "none"}`,
    `- Secret noisy rules: ${summary.secrets.noisyRules.join(", ") || "none"}`,
    "",
    "## Maintainability summary",
    `- Complexity hotspots: ${summary.complexity.hotspots.length}`,
    `- Duplicate lines: ${summary.duplication.duplicatedLines} (${summary.duplication.percentage}%)`,
    `- ESLint messages: ${summary.maintainability.errorCount} errors, ${summary.maintainability.warningCount} warnings`,
    `- Top maintainability rules: ${topMaintainabilityRules.map((entry) => `${entry.ruleId} (${entry.count})`).join(", ") || "none"}`,
    "",
    "## Appendix",
    `- Flattened findings by category: ${sortCountEntries(findingCountsByCategory).map(({ key, count }) => `${key}=${count}`).join(", ") || "none"}`,
    ...appendixArtifacts.map((artifact) => `- Raw artifact: \`${artifact}\``),
    "",
  ].join("\n");
}

export function summarizeRun(options: SummarizeOptions): SummarizeArtifacts {
  const resultsDir = resolve(options.resultsDir);
  const outDir = resolve(options.outDir ?? resultsDir);
  const manifestPath = join(resultsDir, "manifest.json");

  if (!fileExists(manifestPath)) {
    throw new Error(`Missing manifest.json in results directory: ${resultsDir}`);
  }

  const manifest = readJson<RunManifest>(manifestPath);
  const size = parseScc(resultsDir);
  const complexity = buildComplexity(resultsDir, manifest.target);
  const duplication = buildDuplication(resultsDir, manifest.target);
  const changeRisk = buildChangeRisk(resultsDir, manifest.target);
  const dependencySecurity = buildDependencySecurity(resultsDir, manifest.target);
  const architecture = buildArchitecture(resultsDir, size);
  const deadCode = buildDeadCode(resultsDir, manifest.target);
  const maintainability = buildMaintainability(resultsDir, manifest.target);
  const policy = buildPolicy(resultsDir, manifest.target);
  const secrets = buildSecrets(resultsDir, manifest.target);

  const hotspots = buildHotspots(
    complexity,
    duplication,
    changeRisk,
    maintainability.fileMessageCounts,
    policy.fileFindingCounts,
  );

  const findings = sortFindings([
    ...dependencySecurity.findings,
    ...deadCode.findings,
    ...maintainability.findings,
    ...policy.findings,
    ...secrets.findings,
  ]);

  const summary: RunSummary = {
    schemaVersion: "v1",
    run: {
      target: manifest.target,
      resultsDir,
      overallStatus: manifest.overallStatus,
      generatedAt: new Date().toISOString(),
      steps: manifest.steps.map((step) => ({
        id: step.id,
        status: step.status,
        artifacts: step.artifacts,
      })),
    },
    size,
    complexity,
    duplication,
    changeRisk,
    dependencySecurity: dependencySecurity.section,
    architecture,
    deadCode: deadCode.section,
    maintainability: maintainability.section,
    policy: policy.section,
    secrets: secrets.section,
    hotspots,
  };

  const visualReport = buildVisualReport(summary, findings, {
    summaryPath: "summary.json",
    findingsPath: "findings.json",
  });

  ensureDirectory(outDir);
  const reportMarkdown = renderReport(summary, findings);
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));
  writeFileSync(join(outDir, "visual-report.json"), JSON.stringify(visualReport, null, 2));
  writeFileSync(join(outDir, "report.md"), reportMarkdown);

  return {
    summary,
    findings,
    visualReport,
    reportMarkdown,
    outDir,
  };
}

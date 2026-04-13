import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface RevisionRow {
  entity: string;
  nRevs: number;
}

interface CouplingRow {
  entity: string;
  coupled: string;
  degree: number;
}

interface OwnershipRow {
  entity: string;
  owner: string;
  ownership: number;
}

interface EffortRow {
  author: string;
  added: number;
  deleted: number;
}

interface AgeRow {
  entity: string;
  ageDays: number;
}

interface CommitFileChange {
  path: string;
  added: number;
  deleted: number;
}

interface CommitRecord {
  date: Date;
  author: string;
  files: CommitFileChange[];
}

export interface GitMetricsReport {
  revisions: RevisionRow[];
  churn: RevisionRow[];
  coupling: CouplingRow[];
  ownership: OwnershipRow[];
  effort: EffortRow[];
  age: AgeRow[];
}

function roundTo4(value: number): number {
  return Number(value.toFixed(4));
}

function parseCommitHeader(line: string): CommitRecord | null {
  const match = line.match(/^--([0-9a-f]+)--(\d{4}-\d{2}-\d{2})--(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    date: new Date(`${match[2]}T00:00:00Z`),
    author: match[3],
    files: [],
  };
}

function parseGitHistory(gitLog: string): CommitRecord[] {
  const commits: CommitRecord[] = [];
  let currentCommit: CommitRecord | null = null;

  for (const line of gitLog.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const header = parseCommitHeader(line);
    if (header) {
      currentCommit = header;
      commits.push(currentCommit);
      continue;
    }

    if (!currentCommit) {
      continue;
    }

    const [addedRaw, deletedRaw, path] = line.split("\t");

    if (!path || addedRaw === "-" || deletedRaw === "-") {
      continue;
    }

    currentCommit.files.push({
      path,
      added: Number.parseInt(addedRaw, 10) || 0,
      deleted: Number.parseInt(deletedRaw, 10) || 0,
    });
  }

  return commits;
}

export function analyzeGitHistory(
  gitLog: string,
  referenceDate: Date = new Date(),
): GitMetricsReport {
  const commits = parseGitHistory(gitLog);
  const revisions = new Map<string, number>();
  const effort = new Map<string, { added: number; deleted: number }>();
  const lastTouchedAt = new Map<string, Date>();
  const ownership = new Map<string, Map<string, number>>();
  const coupling = new Map<string, number>();

  for (const commit of commits) {
    const uniqueFiles = new Set<string>();

    for (const file of commit.files) {
      revisions.set(file.path, (revisions.get(file.path) ?? 0) + 1);
      uniqueFiles.add(file.path);

      const authorEffort = effort.get(commit.author) ?? { added: 0, deleted: 0 };
      authorEffort.added += file.added;
      authorEffort.deleted += file.deleted;
      effort.set(commit.author, authorEffort);

      const fileOwnership = ownership.get(file.path) ?? new Map<string, number>();
      fileOwnership.set(
        commit.author,
        (fileOwnership.get(commit.author) ?? 0) + file.added + file.deleted,
      );
      ownership.set(file.path, fileOwnership);

      const priorTouchedAt = lastTouchedAt.get(file.path);
      if (!priorTouchedAt || priorTouchedAt < commit.date) {
        lastTouchedAt.set(file.path, commit.date);
      }
    }

    const files = [...uniqueFiles].sort((left, right) => left.localeCompare(right));
    for (let index = 0; index < files.length; index += 1) {
      for (let peerIndex = index + 1; peerIndex < files.length; peerIndex += 1) {
        const key = `${files[index]}:::${files[peerIndex]}`;
        coupling.set(key, (coupling.get(key) ?? 0) + 1);
      }
    }
  }

  const revisionRows = [...revisions.entries()]
    .map(([entity, nRevs]) => ({ entity, nRevs }))
    .sort((left, right) => right.nRevs - left.nRevs || left.entity.localeCompare(right.entity));

  const couplingRows = [...coupling.entries()]
    .map(([pair, count]) => {
      const [entity, coupled] = pair.split(":::");
      return {
        entity,
        coupled,
        degree: commits.length === 0 ? 0 : roundTo4(count / commits.length),
      };
    })
    .sort(
      (left, right) =>
        left.degree - right.degree ||
        left.entity.localeCompare(right.entity) ||
        left.coupled.localeCompare(right.coupled),
    );

  const ownershipRows = [...ownership.entries()]
    .map(([entity, fileOwnership]) => {
      const contributors = [...fileOwnership.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      );
      const total = contributors.reduce((sum, [, changed]) => sum + changed, 0);
      const [owner, ownerChanged] = contributors[0];

      return {
        entity,
        owner,
        ownership: total === 0 ? 0 : roundTo4(ownerChanged / total),
      };
    })
    .sort((left, right) => left.entity.localeCompare(right.entity));

  const effortRows = [...effort.entries()]
    .map(([author, totals]) => ({
      author,
      added: totals.added,
      deleted: totals.deleted,
    }))
    .sort(
      (left, right) =>
        right.added + right.deleted - (left.added + left.deleted) ||
        left.author.localeCompare(right.author),
    );

  const ageRows = [...lastTouchedAt.entries()]
    .map(([entity, lastTouched]) => ({
      entity,
      ageDays: Math.round((referenceDate.getTime() - lastTouched.getTime()) / 86_400_000),
    }))
    .sort((left, right) => left.ageDays - right.ageDays || left.entity.localeCompare(right.entity));

  return {
    revisions: revisionRows,
    churn: revisionRows,
    coupling: couplingRows,
    ownership: ownershipRows,
    effort: effortRows,
    age: ageRows,
  };
}

function escapeCsvValue(value: string | number): string {
  const stringValue = String(value);

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function writeCsv(
  outputPath: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  const body = rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
  const content = `${headers.join(",")}\n${body}${rows.length > 0 ? "\n" : ""}`;
  writeFileSync(outputPath, content);
}

export function writeGitMetricsCsv(report: GitMetricsReport, outputDir: string): string[] {
  mkdirSync(outputDir, { recursive: true });

  writeCsv(join(outputDir, "revisions.csv"), ["entity", "n-revs"], report.revisions.map((row) => [
    row.entity,
    row.nRevs,
  ]));
  writeCsv(join(outputDir, "churn.csv"), ["entity", "n-revs"], report.churn.map((row) => [
    row.entity,
    row.nRevs,
  ]));
  writeCsv(
    join(outputDir, "coupling.csv"),
    ["entity", "coupled", "degree"],
    report.coupling.map((row) => [row.entity, row.coupled, row.degree]),
  );
  writeCsv(
    join(outputDir, "ownership.csv"),
    ["entity", "owner", "ownership"],
    report.ownership.map((row) => [row.entity, row.owner, row.ownership]),
  );
  writeCsv(
    join(outputDir, "effort.csv"),
    ["author", "added", "deleted"],
    report.effort.map((row) => [row.author, row.added, row.deleted]),
  );
  writeCsv(
    join(outputDir, "age.csv"),
    ["entity", "age-days"],
    report.age.map((row) => [row.entity, row.ageDays]),
  );

  return [
    "revisions.csv",
    "churn.csv",
    "coupling.csv",
    "ownership.csv",
    "effort.csv",
    "age.csv",
  ];
}

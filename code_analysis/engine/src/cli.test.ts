import { describe, expect, test } from "bun:test";
import Ajv from "ajv";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildVisualReport } from "./summarize";
import type { NormalizedFinding, RunSummary, VisualReport } from "./types";

const CLI_PATH = join(import.meta.dir, "cli.ts");
const BUN_PATH = process.execPath;
const REPO_ROOT = join(import.meta.dir, "..", "..");
const FIXTURE_RUN_DIR = join(
  REPO_ROOT,
  "results",
  "service-finance-final-20260409-230635",
);

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function writeStub(binDir: string, name: string, content: string): void {
  const path = join(binDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${content}\n`);
  chmodSync(path, 0o755);
}

describe("code-analysis analyze", () => {
  test("package metadata matches the documented command", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { name?: string; bin?: Record<string, string> };

    expect(packageJson.name).toBe("code-analysis");
    expect(packageJson.bin).toEqual({
      "code-analysis": "./src/cli.ts",
    });
  });

  test("writes manifest.json and git-metrics artifacts for a repository root target", () => {
    const workspace = makeTempDir("code-analysis-cli-root-");
    const repoDir = join(workspace, "repo");
    const outDir = join(workspace, "results");

    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src/app.ts"), "export const app = 1;\n");

    runGit(["init", "-q", repoDir]);
    runGit(["config", "user.name", "Test User"], repoDir);
    runGit(["config", "user.email", "test@example.com"], repoDir);
    runGit(["add", "src/app.ts"], repoDir);
    runGit(["commit", "-qm", "init"], repoDir);

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      repoDir,
      "--out",
      outDir,
      "--steps",
      "git-metrics",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const stdout = Buffer.from(result.stdout).toString("utf8");
    const manifest = JSON.parse(stdout);

    expect(manifest.overallStatus).toBe("passed");
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "git-metrics",
        status: "passed",
        artifacts: [
          "steps/git-metrics/revisions.csv",
          "steps/git-metrics/churn.csv",
          "steps/git-metrics/coupling.csv",
          "steps/git-metrics/ownership.csv",
          "steps/git-metrics/effort.csv",
          "steps/git-metrics/age.csv",
        ],
      }),
    ]);

    expect(existsSync(join(outDir, "manifest.json"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/revisions.csv"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/churn.csv"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/coupling.csv"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/ownership.csv"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/effort.csv"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/git-metrics/age.csv"))).toBeTrue();

    const manifestOnDisk = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    expect(manifestOnDisk.steps[0].status).toBe("passed");
  });

  test("marks git-metrics unsupported for nested repository targets", () => {
    const workspace = makeTempDir("code-analysis-cli-nested-");
    const repoDir = join(workspace, "repo");
    const packageDir = join(repoDir, "packages/app");
    const outDir = join(workspace, "results");

    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "index.ts"), "export const app = 1;\n");

    runGit(["init", "-q", repoDir]);
    runGit(["config", "user.name", "Test User"], repoDir);
    runGit(["config", "user.email", "test@example.com"], repoDir);
    runGit(["add", "packages/app/index.ts"], repoDir);
    runGit(["commit", "-qm", "init"], repoDir);

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      packageDir,
      "--out",
      outDir,
      "--steps",
      "git-metrics",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));

    expect(manifest.overallStatus).toBe("unsupported");
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "git-metrics",
        status: "unsupported",
      }),
    ]);
    expect(manifest.steps[0].reason).toContain("repository root");
    expect(existsSync(join(outDir, "steps/git-metrics/revisions.csv"))).toBeFalse();
  });

  test("marks missing external tools as skipped instead of passed", () => {
    const workspace = makeTempDir("code-analysis-cli-skip-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");

    mkdirSync(targetDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "scc",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.overallStatus).toBe("skipped");
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "scc",
        status: "skipped",
        artifacts: [],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/scc/report.json"))).toBeFalse();
  });

  test("reports unsupported overall status when only skipped and unsupported steps are selected", () => {
    const workspace = makeTempDir("code-analysis-cli-no-pass-");
    const repoDir = join(workspace, "repo");
    const packageDir = join(repoDir, "packages/app");
    const outDir = join(workspace, "results");

    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "index.ts"), "export const app = 1;\n");

    runGit(["init", "-q", repoDir]);
    runGit(["config", "user.name", "Test User"], repoDir);
    runGit(["config", "user.email", "test@example.com"], repoDir);
    runGit(["add", "packages/app/index.ts"], repoDir);
    runGit(["commit", "-qm", "init"], repoDir);

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      packageDir,
      "--out",
      outDir,
      "--steps",
      "scc,git-metrics",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.overallStatus).toBe("unsupported");
    expect(manifest.steps.map((step: { status: string }) => step.status)).toEqual([
      "skipped",
      "unsupported",
    ]);
  });

  test("rejects file targets instead of analyzing them", () => {
    const workspace = makeTempDir("code-analysis-cli-file-target-");
    const targetFile = join(workspace, "target.txt");
    const outDir = join(workspace, "results");

    writeFileSync(targetFile, "not a directory\n");

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetFile,
      "--out",
      outDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(1);
    expect(Buffer.from(result.stderr).toString("utf8")).toContain("directory");
    expect(existsSync(join(outDir, "manifest.json"))).toBeFalse();
  });

  test("preserves finding artifacts for accepted non-zero exits", () => {
    const workspace = makeTempDir("code-analysis-cli-findings-");
    const repoDir = join(workspace, "repo");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");

    mkdirSync(repoDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    writeStub(
      binDir,
      "gitleaks",
      `
report_path=""
while (($#)); do
  case "$1" in
    --report-path)
      report_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '{"runs":[{"results":[{"ruleId":"secret"}]}]}\n' > "$report_path"
exit 1
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      repoDir,
      "--out",
      outDir,
      "--steps",
      "gitleaks",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "gitleaks",
        status: "findings",
        artifacts: ["steps/gitleaks/report.sarif"],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/gitleaks/report.sarif"))).toBeTrue();
  });

  test("isolates trivy from the local docker credential config", () => {
    const workspace = makeTempDir("code-analysis-cli-trivy-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    writeStub(
      binDir,
      "trivy",
      `
output_path=""
while (($#)); do
  case "$1" in
    -o)
      output_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -z "\${DOCKER_CONFIG:-}" ]]; then
  echo "missing docker config isolation" >&2
  exit 1
fi
mkdir -p "$(dirname "$output_path")"
printf '{"ok":true}\n' > "$output_path"
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "trivy",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "trivy",
        status: "passed",
        artifacts: [
          "steps/trivy/findings.json",
          "steps/trivy/sbom.cyclonedx.json",
        ],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/trivy/findings.json"))).toBeTrue();
    expect(existsSync(join(outDir, "steps/trivy/sbom.cyclonedx.json"))).toBeTrue();
  });

  test("uses the generic eslint runtime when a project config exists but no local eslint is available", () => {
    const workspace = makeTempDir("code-analysis-cli-eslint-legacy-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(targetDir, ".eslintrc.js"), "module.exports = {};\n");
    writeFileSync(join(targetDir, "index.ts"), "export const answer = 42;\n");

    writeStub(
      binDir,
      "npm",
      `
if [[ "$1" != "--prefix" ]]; then
  echo "expected --prefix" >&2
  exit 1
fi
runtime_dir="$2"
if [[ "$3" != "install" ]]; then
  echo "expected install command" >&2
  exit 1
fi
mkdir -p "$runtime_dir/node_modules/.bin" "$runtime_dir/node_modules"
cat > "$runtime_dir/node_modules/.bin/eslint" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '[{"filePath":"index.ts","messages":[],"errorCount":0,"warningCount":0}]\\n'
EOF
chmod +x "$runtime_dir/node_modules/.bin/eslint"
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "eslint",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "eslint",
        status: "passed",
        artifacts: ["steps/eslint/report.json"],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/eslint/report.json"))).toBeTrue();
  });

  test("reuses a non-empty legacy opengrep rules cache without a ready marker", () => {
    const workspace = makeTempDir("code-analysis-cli-opengrep-cache-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");
    const cacheDir = join(workspace, "cache", "opengrep-rules");

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(join(cacheDir, "javascript"), { recursive: true });
    writeFileSync(join(cacheDir, "javascript", "rule.yaml"), "rules: []\n");

    writeStub(
      binDir,
      "opengrep",
      `
report_path=""
while (($#)); do
  case "$1" in
    --sarif-output=*)
      report_path="\${1#--sarif-output=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
printf '{"runs":[{"tool":{"driver":{"name":"opengrep"}}}]}\n' > "$report_path"
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "opengrep",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
        XDG_CACHE_HOME: join(workspace, "cache"),
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.overallStatus).toBe("passed");
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "opengrep",
        status: "passed",
        artifacts: ["steps/opengrep/report.sarif"],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/opengrep/report.sarif"))).toBeTrue();
  });

  test("passes opengrep only rule directories instead of the cache root", () => {
    const workspace = makeTempDir("code-analysis-cli-opengrep-configs-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");
    const cacheDir = join(workspace, "cache", "opengrep-rules");

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(cacheDir, "javascript"), { recursive: true });
    mkdirSync(join(cacheDir, "typescript"), { recursive: true });
    writeFileSync(join(cacheDir, ".ready"), "");
    writeFileSync(join(cacheDir, ".pre-commit-config.yaml"), "repos: []\n");

    writeStub(
      binDir,
      "opengrep",
      `
report_path=""
cache_root="\${XDG_CACHE_HOME}/opengrep-rules"
configs=()
while (($#)); do
  case "$1" in
    scan)
      shift
      ;;
    --config)
      configs+=("$2")
      shift 2
      ;;
    --sarif-output=*)
      report_path="\${1#--sarif-output=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
if [[ "\${#configs[@]}" -eq 0 ]]; then
  echo "missing rule configs" >&2
  exit 1
fi
for config in "\${configs[@]}"; do
  if [[ "$config" == "$cache_root" ]]; then
    echo "cache root passed directly" >&2
    exit 1
  fi
  if [[ ! -d "$config" ]]; then
    echo "non-directory config: $config" >&2
    exit 1
  fi
done
mkdir -p "$(dirname "$report_path")"
printf '{"runs":[{"tool":{"driver":{"name":"opengrep"}}}]}\n' > "$report_path"
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "opengrep",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
        XDG_CACHE_HOME: join(workspace, "cache"),
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "opengrep",
        status: "passed",
        artifacts: ["steps/opengrep/report.sarif"],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/opengrep/report.sarif"))).toBeTrue();
  });

  test("runs jscpd through a target-local binary and stages the json report", () => {
    const workspace = makeTempDir("code-analysis-cli-jscpd-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const localBin = join(targetDir, "node_modules/.bin/jscpd");

    mkdirSync(join(targetDir, "src"), { recursive: true });
    mkdirSync(join(targetDir, "node_modules/.bin"), { recursive: true });
    writeFileSync(
      join(targetDir, "src/a.js"),
      [
        "function sharedOne() {",
        "  const values = [1, 2, 3, 4, 5];",
        "  const mapped = values.map((value) => value * 2);",
        "  const filtered = mapped.filter((value) => value > 4);",
        "  return filtered.join(',');",
        "}",
        "",
        "function sharedTwo() {",
        "  return sharedOne();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(targetDir, "src/b.js"),
      readFileSync(join(targetDir, "src/a.js"), "utf8"),
    );
    symlinkSync(
      join(import.meta.dir, "..", "node_modules/.bin/jscpd"),
      localBin,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "jscpd",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "jscpd",
        status: "passed",
        artifacts: ["steps/jscpd/report.json"],
      }),
    ]);
    expect(existsSync(join(outDir, "steps/jscpd/report.json"))).toBeTrue();
  });

  test("does not leave partial artifacts behind for hard failures", () => {
    const workspace = makeTempDir("code-analysis-cli-hard-fail-");
    const targetDir = join(workspace, "target");
    const outDir = join(workspace, "results");
    const binDir = join(workspace, "bin");

    mkdirSync(targetDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    writeStub(
      binDir,
      "scc",
      `
printf '{"files":1}\n'
exit 2
`,
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "analyze",
      targetDir,
      "--out",
      outDir,
      "--steps",
      "scc",
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(manifest.steps).toEqual([
      expect.objectContaining({
        id: "scc",
        status: "failed",
        artifacts: [],
        exitCode: 2,
      }),
    ]);
    expect(existsSync(join(outDir, "steps/scc/report.json"))).toBeFalse();
  });
});

describe("code-analysis summarize", () => {
  test("writes summary.json, findings.json, visual-report.json, and report.md for the service-finance run", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-");
    const runDir = join(workspace, "run");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(summary.schemaVersion).toBe("v1");
    expect(summary.run.overallStatus).toBe("findings");
    expect(summary).toEqual(
      expect.objectContaining({
        size: expect.any(Object),
        complexity: expect.any(Object),
        duplication: expect.any(Object),
        changeRisk: expect.any(Object),
        dependencySecurity: expect.any(Object),
        architecture: expect.any(Object),
        deadCode: expect.any(Object),
        maintainability: expect.any(Object),
        policy: expect.any(Object),
        secrets: expect.any(Object),
        hotspots: expect.any(Array),
      }),
    );

    expect(existsSync(join(runDir, "summary.json"))).toBeTrue();
    expect(existsSync(join(runDir, "findings.json"))).toBeTrue();
    expect(existsSync(join(runDir, "visual-report.json"))).toBeTrue();
    expect(existsSync(join(runDir, "report.md"))).toBeTrue();
  });

  test("normalizes findings across SARIF, JSON, and issue-stream sources with stable drilldown fields", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-findings-");
    const runDir = join(workspace, "run");
    const outDir = join(workspace, "summary");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--out",
      outDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const findings = JSON.parse(readFileSync(join(outDir, "findings.json"), "utf8"));
    expect(findings).toEqual(expect.any(Array));
    expect(findings.length).toBeGreaterThan(0);

    const gitleaksFinding = findings.find(
      (finding: {
        source: string;
        ruleId: string;
        file: string | null;
      }) =>
        finding.source === "gitleaks" &&
        finding.ruleId === "generic-api-key" &&
        finding.file === "package.json",
    );
    expect(gitleaksFinding).toEqual(
      expect.objectContaining({
        source: "gitleaks",
        stepId: "gitleaks",
        category: "secret",
        ruleId: "generic-api-key",
        severity: "high",
        file: "package.json",
        id: expect.any(String),
        subjectType: "config",
        subjectKey: "config:package.json",
      }),
    );

    const opengrepFinding = findings.find(
      (finding: {
        source: string;
        ruleFamily: string | null;
      }) => finding.source === "opengrep" && finding.ruleFamily === "jsx-not-internationalized",
    );
    expect(opengrepFinding).toEqual(
      expect.objectContaining({
        source: "opengrep",
        stepId: "opengrep",
        category: "policy",
        ruleFamily: "jsx-not-internationalized",
        id: expect.any(String),
      }),
    );

    const trivyFinding = findings.find(
      (finding: {
        source: string;
        severity: string;
        packageName?: string;
      }) =>
        finding.source === "trivy" &&
        finding.severity === "critical" &&
        finding.packageName === "axios",
    );
    expect(trivyFinding).toEqual(
      expect.objectContaining({
        source: "trivy",
        stepId: "trivy",
        category: "dependency-vulnerability",
        severity: "critical",
        subjectType: "dependency",
        packageName: "axios",
        packageVersion: "1.13.2",
        dependencyKind: "direct",
        subjectKey: "dependency:direct:axios@1.13.2",
      }),
    );

    const knipFinding = findings.find(
      (finding: {
        source: string;
        ruleId: string;
        bucket?: string;
      }) => finding.source === "knip" && finding.ruleId === "dependencies",
    );
    expect(knipFinding).toEqual(
      expect.objectContaining({
        source: "knip",
        stepId: "knip",
        category: "unused-code",
        ruleId: "dependencies",
        bucket: "dependencies",
        subjectType: "dependency",
        dependencyKind: "direct",
      }),
    );

    const knipUnlistedFinding = findings.find(
      (finding: {
        source: string;
        ruleId: string;
      }) => finding.source === "knip" && finding.ruleId === "unlisted",
    );
    expect(knipUnlistedFinding).toEqual(
      expect.objectContaining({
        source: "knip",
        stepId: "knip",
        category: "unused-code",
        ruleId: "unlisted",
        subjectType: "dependency",
      }),
    );
    expect(knipUnlistedFinding?.dependencyKind).toBeUndefined();

    const eslintFinding = findings.find(
      (finding: {
        source: string;
        ruleId: string;
      }) => finding.source === "eslint" && finding.ruleId === "complexity",
    );
    expect(eslintFinding).toEqual(
      expect.objectContaining({
        source: "eslint",
        stepId: "eslint",
        category: "maintainability",
        ruleId: "complexity",
        id: expect.any(String),
        severity: "warning",
      }),
    );

    expect(
      findings.every(
        (finding: { file: string | null }) =>
          finding.file === null || !finding.file.startsWith("/"),
      ),
    ).toBeTrue();
  });

  test("produces deterministic finding ids across summarize runs", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-deterministic-");
    const runDir = join(workspace, "run");
    const outDirOne = join(workspace, "out-one");
    const outDirTwo = join(workspace, "out-two");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    for (const outDir of [outDirOne, outDirTwo]) {
      const result = Bun.spawnSync([
        BUN_PATH,
        "run",
        CLI_PATH,
        "summarize",
        runDir,
        "--out",
        outDir,
        "--json",
      ], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      expect(result.exitCode).toBe(0);
    }

    const first = JSON.parse(readFileSync(join(outDirOne, "findings.json"), "utf8"));
    const second = JSON.parse(readFileSync(join(outDirTwo, "findings.json"), "utf8"));

    expect(first.map((finding: { id: string }) => finding.id)).toEqual(
      second.map((finding: { id: string }) => finding.id),
    );
  });

  test("keeps opengrep finding ids stable when raw rule ids change across cache paths", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-opengrep-stable-id-");
    const runOne = join(workspace, "run-one");
    const runTwo = join(workspace, "run-two");

    cpSync(FIXTURE_RUN_DIR, runOne, { recursive: true });
    cpSync(FIXTURE_RUN_DIR, runTwo, { recursive: true });

    const reportOnePath = join(runOne, "steps", "opengrep", "report.sarif");
    const reportTwoPath = join(runTwo, "steps", "opengrep", "report.sarif");
    const reportOne = JSON.parse(readFileSync(reportOnePath, "utf8"));
    const reportTwo = JSON.parse(readFileSync(reportTwoPath, "utf8"));

    const firstResultOne = reportOne.runs[0].results.find(
      (result: { ruleId?: string }) => String(result.ruleId ?? "").includes("jsx-not-internationalized"),
    );
    const firstResultTwo = reportTwo.runs[0].results.find(
      (result: { ruleId?: string }) => String(result.ruleId ?? "").includes("jsx-not-internationalized"),
    );

    firstResultOne.ruleId =
      "Users.alpha..cache.opengrep-rules.typescript.react.portability.i18next.jsx-not-internationalized";
    firstResultTwo.ruleId =
      "Users.beta..cache.opengrep-rules.typescript.react.portability.i18next.jsx-not-internationalized";

    writeFileSync(reportOnePath, JSON.stringify(reportOne, null, 2));
    writeFileSync(reportTwoPath, JSON.stringify(reportTwo, null, 2));

    const summarize = (runDir: string, outDir: string): Array<{ source: string; ruleFamily: string | null; id: string }> => {
      const result = Bun.spawnSync([
        BUN_PATH,
        "run",
        CLI_PATH,
        "summarize",
        runDir,
        "--out",
        outDir,
        "--json",
      ], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      expect(result.exitCode).toBe(0);
      return JSON.parse(readFileSync(join(outDir, "findings.json"), "utf8"));
    };

    const outOne = join(workspace, "out-one");
    const outTwo = join(workspace, "out-two");
    const findingsOne = summarize(runOne, outOne);
    const findingsTwo = summarize(runTwo, outTwo);

    const findingOne = findingsOne.find(
      (finding) => finding.source === "opengrep" && finding.ruleFamily === "jsx-not-internationalized",
    );
    const findingTwo = findingsTwo.find(
      (finding) => finding.source === "opengrep" && finding.ruleFamily === "jsx-not-internationalized",
    );

    expect(findingOne?.id).toBeDefined();
    expect(findingOne?.id).toBe(findingTwo?.id);
  });

  test("builds change-risk notes and hotspot signals from the service-finance run", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-hotspots-");
    const runDir = join(workspace, "run");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(summary.changeRisk.notes).toContain(
      "git-metrics churn.csv is excluded from headline metrics in v1",
    );
    expect(summary.changeRisk.topRevisions).toContainEqual(
      expect.objectContaining({
        file: "app.json",
        revisions: 305,
      }),
    );
    expect(summary.hotspots).toContainEqual(
      expect.objectContaining({
        file: "src/scenes/SignOn/scenes/Login/index.tsx",
        score: expect.any(Number),
        signals: expect.arrayContaining([
          "complexity",
          "duplication",
          "high-revisions",
          "low-ownership",
        ]),
      }),
    );
    expect(
      summary.dependencySecurity.directPackages.filter(
        (pkg: { package: string; installedVersion: string }) =>
          pkg.package === "axios" && pkg.installedVersion === "1.13.2",
      ),
    ).toEqual([
      expect.objectContaining({
        package: "axios",
        installedVersion: "1.13.2",
        severity: "critical",
        advisoryCount: 2,
      }),
    ]);
  });

  test("writes a visual-report view model that matches the evidence layer", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-visual-");
    const runDir = join(workspace, "run");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
    const findings = JSON.parse(readFileSync(join(runDir, "findings.json"), "utf8"));
    const visual = JSON.parse(readFileSync(join(runDir, "visual-report.json"), "utf8"));

    expect(visual).toEqual(
      expect.objectContaining({
        schemaVersion: "v1",
        run: expect.objectContaining({
          summaryPath: "summary.json",
          findingsPath: "findings.json",
        }),
        facets: expect.any(Object),
        overview: expect.any(Object),
        executive: expect.any(Object),
        engineering: expect.any(Object),
        links: expect.any(Object),
      }),
    );

    const totalFindingsCard = visual.overview.cards.find(
      (card: { id: string }) => card.id === "total-findings",
    );
    expect(totalFindingsCard.value).toBe(findings.length);

    const hotspotCard = visual.overview.cards.find(
      (card: { id: string }) => card.id === "hotspot-count",
    );
    expect(hotspotCard.value).toBe(summary.hotspots.length);

    const directPackagesRows = visual.executive.security.directPackages.rows;
    expect(directPackagesRows[0]).toEqual(
      expect.objectContaining({
        key: "axios@1.13.2",
        drilldown: expect.objectContaining({
          type: "findings",
        }),
      }),
    );

    expect(visual.engineering.complexity.thresholds).toContainEqual(
      expect.objectContaining({
        key: "ccn-gte-20",
        value: summary.complexity.thresholds.ccnGte20,
      }),
    );

    expect(visual.executive.topRisks.rows[0].drilldown).toEqual(
      expect.objectContaining({
        type: "findings",
      }),
    );

    expect(
      visual.executive.topRisks.rows.every(
        (row: { key: string }) => !["package.json", "yarn.lock", "app.json"].includes(row.key),
      ),
    ).toBeTrue();
  });

  test("builds visual-report from summary and findings without touching raw artifacts", () => {
    const summary: RunSummary = {
      schemaVersion: "v1",
      run: {
        target: "/tmp/example",
        resultsDir: "/tmp/results",
        overallStatus: "findings",
        generatedAt: "2026-04-10T00:00:00.000Z",
        steps: [
          {
            id: "eslint",
            status: "findings",
            artifacts: ["steps/eslint/report.json"],
          },
        ],
      },
      size: {
        filesTotal: 1,
        linesTotal: 10,
        codeLines: 8,
        commentLines: 1,
        blankLines: 1,
        languages: [],
      },
      complexity: {
        functionsTotal: 1,
        thresholds: {
          ccnGte10: 1,
          ccnGte20: 0,
          nlocGte150: 0,
        },
        hotspots: [],
      },
      duplication: {
        cloneGroups: 0,
        duplicatedLines: 0,
        duplicatedTokens: 0,
        percentage: 0,
        topPairs: [],
        topFiles: [],
      },
      changeRisk: {
        topRevisions: [],
        ownershipHotspots: [],
        oldestFiles: [],
        topCouplings: [],
        effortByAuthor: [],
        notes: [],
      },
      dependencySecurity: {
        countsBySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          warning: 0,
          info: 0,
        },
        directPackages: [],
        transitivePackages: [],
        sbomArtifact: null,
      },
      architecture: {
        modulesCruised: 0,
        dependenciesCruised: 0,
        cycleCount: 0,
        unresolvedCount: 0,
        coverageAssessment: {
          status: "weak",
          reason: "not enough data",
        },
      },
      deadCode: {
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
      maintainability: {
        errorCount: 1,
        warningCount: 2,
        topRules: [{ ruleId: "complexity", count: 2 }],
        topFiles: [{ file: "src/example.ts", messageCount: 2 }],
      },
      policy: {
        topRuleFamilies: [],
        topFiles: [],
      },
      secrets: {
        topRules: [],
        topFiles: [],
        noisyRules: [],
      },
      hotspots: [
        {
          file: "src/example.ts",
          score: 2,
          signals: ["lint-heavy", "complexity"],
          notes: ["many ESLint messages"],
        },
        {
          file: "package.json",
          score: 3,
          signals: ["high-revisions", "low-ownership", "policy-heavy"],
          notes: ["ownership is fragmented"],
        },
        {
          file: "android/app/build.gradle",
          score: 2,
          signals: ["high-revisions", "low-ownership"],
          notes: ["ownership is fragmented"],
        },
      ],
    };

    const findings: NormalizedFinding[] = [
      {
        id: "finding-1",
        stepId: "eslint",
        source: "eslint",
        category: "maintainability",
        severity: "warning",
        ruleId: "complexity",
        ruleFamily: null,
        file: "src/example.ts",
        line: 10,
        message: "too complex",
        fingerprint: null,
        rawRef: "steps/eslint/report.json",
        subjectType: "file",
        subjectKey: "file:src/example.ts",
      },
    ];

    const visual = buildVisualReport(summary, findings, {
      summaryPath: "summary.json",
      findingsPath: "findings.json",
    });

    expect(visual.overview.cards.find((card) => card.id === "total-findings")?.value).toBe(1);
    expect(visual.executive.topRisks.rows[0]).toEqual(
      expect.objectContaining({
        key: "src/example.ts",
      }),
    );
    expect(visual.executive.topRisks.rows.some((row) => row.key === "package.json")).toBeFalse();
    expect(visual.engineering.hotspots.rows.find((row) => row.key === "package.json")).toEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          kind: "config",
        }),
      }),
    );
    expect(visual.engineering.hotspots.rows.find((row) => row.key === "android/app/build.gradle")).toEqual(
      expect.objectContaining({
        drilldown: expect.objectContaining({
          type: "file",
        }),
      }),
    );
  });

  test("cleans duplication self-pairs and caps duplicated percentages in normalized outputs", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-dup-cleanup-");
    const runDir = join(workspace, "run");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
    const visual = JSON.parse(readFileSync(join(runDir, "visual-report.json"), "utf8"));

    expect(
      summary.duplication.topPairs.every(
        (pair: { leftFile: string; rightFile: string }) => pair.leftFile !== pair.rightFile,
      ),
    ).toBeTrue();
    expect(
      summary.duplication.topFiles.every(
        (file: { duplicatedPercentage: number }) => file.duplicatedPercentage <= 100,
      ),
    ).toBeTrue();
    expect(
      visual.engineering.duplication.pairs.rows.every(
        (row: { values: { leftFile: string; rightFile: string } }) =>
          row.values.leftFile !== row.values.rightFile,
      ),
    ).toBeTrue();
  });

  test("validates summary, findings, and visual-report against generated json schemas", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-schemas-");
    const runDir = join(workspace, "run");

    cpSync(FIXTURE_RUN_DIR, runDir, { recursive: true });

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const ajv = new Ajv({ allErrors: true, strict: false });
    const summarySchema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "run-summary.schema.json"), "utf8"),
    );
    const findingsSchema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "normalized-findings.schema.json"), "utf8"),
    );
    const visualSchema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "visual-report.schema.json"), "utf8"),
    );

    const validateSummary = ajv.compile(summarySchema);
    const validateFindings = ajv.compile(findingsSchema);
    const validateVisual = ajv.compile(visualSchema);

    const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
    const findings = JSON.parse(readFileSync(join(runDir, "findings.json"), "utf8"));
    const visual = JSON.parse(readFileSync(join(runDir, "visual-report.json"), "utf8"));

    expect(validateSummary(summary)).toBeTrue();
    expect(validateFindings(findings)).toBeTrue();
    expect(validateVisual(visual)).toBeTrue();
  });

  test("handles skipped and unsupported steps without requiring report artifacts", () => {
    const workspace = makeTempDir("code-analysis-cli-summarize-minimal-");
    const runDir = join(workspace, "run");

    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "manifest.json"),
      JSON.stringify(
        {
          target: "/tmp/example",
          startedAt: "2026-04-10T00:00:00.000Z",
          finishedAt: "2026-04-10T00:01:00.000Z",
          overallStatus: "unsupported",
          steps: [
            {
              id: "scc",
              status: "skipped",
              durationMs: 10,
              reason: "scc is not installed",
              artifacts: [],
            },
            {
              id: "git-metrics",
              status: "unsupported",
              durationMs: 20,
              reason: "git-metrics only supports repository root targets in this version",
              artifacts: [],
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = Bun.spawnSync([
      BUN_PATH,
      "run",
      CLI_PATH,
      "summarize",
      runDir,
      "--json",
    ], {
      cwd: join(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(Buffer.from(result.stdout).toString("utf8"));
    expect(summary.run.overallStatus).toBe("unsupported");
    expect(summary.run.generatedAt).not.toBe("2026-04-10T00:01:00.000Z");
    expect(summary.run.steps.map((step: { status: string }) => step.status)).toEqual([
      "skipped",
      "unsupported",
    ]);
    expect(summary.hotspots).toEqual([]);
    expect(summary.secrets.topRules).toEqual([]);
    expect(summary.maintainability.topRules).toEqual([]);
    expect(existsSync(join(runDir, "visual-report.json"))).toBeTrue();
    expect(existsSync(join(runDir, "summary.json"))).toBeTrue();
    expect(existsSync(join(runDir, "findings.json"))).toBeTrue();
    expect(existsSync(join(runDir, "report.md"))).toBeTrue();

    const visual = JSON.parse(readFileSync(join(runDir, "visual-report.json"), "utf8")) as VisualReport;
    expect(visual.executive.topRisks.rows).toEqual([]);
    expect(visual.engineering.policy.families.rows).toEqual([]);
    expect(visual.engineering.secrets.rules.rows).toEqual([]);
  });
});

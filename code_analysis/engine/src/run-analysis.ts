import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { analyzeGitHistory, writeGitMetricsCsv } from "./git-metrics";
import { resolveJsToolInvocation } from "./js-tools";
import type { RunManifest, StepResult, StepStatus } from "./types";

const COMMON_IGNORE_GLOB = "**/{node_modules,dist,build,coverage,.next,.turbo,.git}/**";
const COMMON_SKIP_DIRS = ["node_modules", ".next", "dist", "build", "coverage", ".turbo", "out", "bin"];
const RULES_CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opengrep-rules");
const STEP_IDS = [
  "scc",
  "lizard",
  "jscpd",
  "gitleaks",
  "trivy",
  "dependency-cruiser",
  "knip",
  "eslint",
  "opengrep",
  "git-metrics",
] as const;

type StepId = (typeof STEP_IDS)[number];

interface AnalyzeOptions {
  targetDir: string;
  outDir: string;
  stepFilter?: string[];
}

interface StepContext {
  targetDir: string;
  outDir: string;
  tempDir: string;
  nodeCacheDir: string;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface StepDefinition {
  id: StepId;
  run: (context: StepContext) => StepResult;
}

function commandExists(command: string): boolean {
  return Bun.which(command) !== null;
}

function execute(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options?.cwd,
    env: options?.env,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return {
        exitCode: 127,
        stdout: "",
        stderr: error.message,
      };
    }

    return {
      exitCode: 1,
      stdout: result.stdout ?? "",
      stderr: error.message,
    };
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function makeStepResult(
  id: StepId,
  status: StepStatus,
  startedAt: number,
  options?: { exitCode?: number; reason?: string; artifacts?: string[] },
): StepResult {
  const durationMs = Date.now() - startedAt;

  return {
    id,
    status,
    durationMs,
    exitCode: options?.exitCode,
    reason: options?.reason,
    artifacts: options?.artifacts ?? [],
  };
}

function ensureParentDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function normalizeCommandReason(stderr: string, fallback: string): string {
  const firstLine = stderr.trim().split("\n")[0];
  return firstLine || fallback;
}

function moveFile(sourcePath: string, destinationPath: string): void {
  ensureParentDirectory(destinationPath);
  renameSync(sourcePath, destinationPath);
}

function writeArtifactFromStdout(
  context: StepContext,
  relativePath: string,
  commandResult: CommandResult,
): string {
  const tempPath = join(context.tempDir, relativePath);
  ensureParentDirectory(tempPath);
  writeFileSync(tempPath, commandResult.stdout);
  return tempPath;
}

function hasNonEmptyFile(path: string): boolean {
  return existsSync(path) && statSync(path).size > 0;
}

function acceptedStatus(exitCode: number, findingsExitCodes: Set<number>): StepStatus {
  return findingsExitCodes.has(exitCode) ? "findings" : "passed";
}

function acceptedStepFromStdout(options: {
  id: StepId;
  context: StepContext;
  startedAt: number;
  commandResult: CommandResult;
  relativePath: string;
  acceptedExitCodes?: number[];
  findingsExitCodes?: number[];
}): StepResult {
  const acceptedExitCodes = new Set(options.acceptedExitCodes ?? [0]);
  const findingsExitCodes = new Set(options.findingsExitCodes ?? []);

  if (!acceptedExitCodes.has(options.commandResult.exitCode)) {
    return makeStepResult(options.id, "failed", options.startedAt, {
      exitCode: options.commandResult.exitCode,
      reason: normalizeCommandReason(options.commandResult.stderr, `${options.id} failed`),
    });
  }

  const tempPath = writeArtifactFromStdout(
    options.context,
    options.relativePath,
    options.commandResult,
  );

  if (!hasNonEmptyFile(tempPath)) {
    rmSync(tempPath, { force: true });
    return makeStepResult(options.id, "failed", options.startedAt, {
      exitCode: options.commandResult.exitCode,
      reason: `${options.id} produced no report output`,
    });
  }

  moveFile(tempPath, join(options.context.outDir, options.relativePath));

  return makeStepResult(
    options.id,
    acceptedStatus(options.commandResult.exitCode, findingsExitCodes),
    options.startedAt,
    {
      exitCode: options.commandResult.exitCode === 0 ? undefined : options.commandResult.exitCode,
      artifacts: [options.relativePath],
    },
  );
}

function acceptedStepFromFiles(options: {
  id: StepId;
  context: StepContext;
  startedAt: number;
  commandResult: CommandResult;
  relativePaths: string[];
  acceptedExitCodes?: number[];
  findingsExitCodes?: number[];
}): StepResult {
  const acceptedExitCodes = new Set(options.acceptedExitCodes ?? [0]);
  const findingsExitCodes = new Set(options.findingsExitCodes ?? []);

  if (!acceptedExitCodes.has(options.commandResult.exitCode)) {
    return makeStepResult(options.id, "failed", options.startedAt, {
      exitCode: options.commandResult.exitCode,
      reason: normalizeCommandReason(options.commandResult.stderr, `${options.id} failed`),
    });
  }

  for (const relativePath of options.relativePaths) {
    const tempPath = join(options.context.tempDir, relativePath);
    if (!hasNonEmptyFile(tempPath)) {
      return makeStepResult(options.id, "failed", options.startedAt, {
        exitCode: options.commandResult.exitCode,
        reason: `${options.id} did not create ${relativePath}`,
      });
    }
  }

  for (const relativePath of options.relativePaths) {
    moveFile(join(options.context.tempDir, relativePath), join(options.context.outDir, relativePath));
  }

  return makeStepResult(
    options.id,
    acceptedStatus(options.commandResult.exitCode, findingsExitCodes),
    options.startedAt,
    {
      exitCode: options.commandResult.exitCode === 0 ? undefined : options.commandResult.exitCode,
      artifacts: options.relativePaths,
    },
  );
}

function readGitTopLevel(targetDir: string): string | null {
  const result = execute("git", ["-C", targetDir, "rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) {
    return null;
  }
  const topLevel = result.stdout.trim();
  if (!topLevel) {
    return null;
  }
  return realpathSync(topLevel);
}

function listGitFiles(targetDir: string): string[] | null {
  const result = execute("git", [
    "-C",
    targetDir,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findDependencyCruiserConfig(targetDir: string): string | null {
  const candidates = [
    ".dependency-cruiser.cjs",
    ".dependency-cruiser.js",
    ".dependency-cruiser.json",
    ".dependency-cruiser.mjs",
  ];

  for (const candidate of candidates) {
    const fullPath = join(targetDir, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function findTsconfig(targetDir: string): string | null {
  const candidate = join(targetDir, "tsconfig.json");
  return existsSync(candidate) ? candidate : null;
}

function writeDependencyCruiserConfig(context: StepContext, targetDir: string): string {
  const tsconfig = findTsconfig(targetDir);
  const tsConfigLine = tsconfig ? `    tsConfig: { fileName: ${JSON.stringify(tsconfig)} },\n` : "";
  const configPath = join(context.tempDir, "dependency-cruiser.cjs");
  const content = `module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      from: {},
      to: { circular: true }
    }
  ],
  options: {
    tsPreCompilationDeps: true,
${tsConfigLine}    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist|build|coverage|.git)(/|$)" }
  }
};
`;
  writeFileSync(configPath, content);
  return configPath;
}

function findEslintConfig(targetDir: string): string | null {
  const candidates = [
    "eslint.config.js",
    "eslint.config.cjs",
    "eslint.config.mjs",
    "eslint.config.ts",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];

  for (const candidate of candidates) {
    const fullPath = join(targetDir, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function writeFallbackEslintConfig(context: StepContext): string {
  const configPath = join(context.tempDir, "eslint.config.cjs");
  writeFileSync(
    configPath,
    `const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.turbo/**"
    ]
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines-per-function": ["warn", 100],
      "max-params": ["warn", 5],
      "no-duplicate-imports": "warn"
    }
  }
];
`,
  );
  return configPath;
}

function npmCacheEnv(context: StepContext): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_cache: context.nodeCacheDir,
    NPM_CONFIG_CACHE: context.nodeCacheDir,
  };
}

function ensureOpenGrepRulesCache(): string | null {
  mkdirSync(RULES_CACHE, { recursive: true });
  const readyMarker = join(RULES_CACHE, ".ready");
  if (existsSync(readyMarker)) {
    return RULES_CACHE;
  }

  if (readdirSync(RULES_CACHE).length > 0) {
    return RULES_CACHE;
  }

  if (!commandExists("curl") || !commandExists("tar")) {
    return null;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "code-analysis-opengrep-rules-"));
  const archivePath = join(tempDir, "semgrep-rules.tar.gz");

  try {
    const download = execute("curl", [
      "-fsSL",
      "-o",
      archivePath,
      "https://github.com/semgrep/semgrep-rules/archive/refs/heads/develop.tar.gz",
    ]);

    if (download.exitCode !== 0) {
      return null;
    }

    const extract = execute("tar", ["-xzf", archivePath, "-C", tempDir]);
    if (extract.exitCode !== 0) {
      return null;
    }

    const extractedDir = readdirSync(tempDir, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.startsWith("semgrep-rules-"))
      ?.name;

    if (!extractedDir) {
      return null;
    }

    rmSync(RULES_CACHE, { recursive: true, force: true });
    mkdirSync(dirname(RULES_CACHE), { recursive: true });
    const stagedPath = join(tempDir, extractedDir);
    cpSync(stagedPath, RULES_CACHE, { recursive: true });
    writeFileSync(join(RULES_CACHE, ".ready"), "");
    return RULES_CACHE;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function resolveOpenGrepRuleConfigs(rulesCache: string): string[] {
  return readdirSync(rulesCache, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => name !== "scripts" && name !== "stats")
    .map((name) => join(rulesCache, name));
}

function runScc(context: StepContext): StepResult {
  const startedAt = Date.now();
  if (!commandExists("scc")) {
    return makeStepResult("scc", "skipped", startedAt, {
      reason: "scc is not installed",
    });
  }

  const result = execute("scc", ["--format", "json", context.targetDir]);
  return acceptedStepFromStdout({
    id: "scc",
    context,
    startedAt,
    commandResult: result,
    relativePath: "steps/scc/report.json",
  });
}

function runLizard(context: StepContext): StepResult {
  const startedAt = Date.now();
  if (!commandExists("lizard")) {
    return makeStepResult("lizard", "skipped", startedAt, {
      reason: "lizard is not installed",
    });
  }

  const gitFiles = listGitFiles(context.targetDir);
  if (gitFiles) {
    const inputPath = join(context.tempDir, "lizard-input.txt");
    writeFileSync(inputPath, `${gitFiles.join("\n")}\n`);
    const result = execute("lizard", ["--csv", "-f", inputPath], {
      cwd: context.targetDir,
    });
    return acceptedStepFromStdout({
      id: "lizard",
      context,
      startedAt,
      commandResult: result,
      relativePath: "steps/lizard/report.csv",
    });
  }

  const args = ["--csv", context.targetDir];
  for (const dir of COMMON_SKIP_DIRS) {
    args.push("-x", `*/${dir}/*`);
  }

  const result = execute("lizard", args);
  return acceptedStepFromStdout({
    id: "lizard",
    context,
    startedAt,
    commandResult: result,
    relativePath: "steps/lizard/report.csv",
  });
}

function runJscpd(context: StepContext): StepResult {
  const startedAt = Date.now();
  const invocation = resolveJsToolInvocation({
    targetDir: context.targetDir,
    binary: "jscpd",
    packageName: "jscpd",
    args: [
      ".",
      "--reporters",
      "json",
      "--output",
      join(context.tempDir, "steps/jscpd"),
      "--gitignore",
      "--silent",
      "--ignore",
      COMMON_IGNORE_GLOB,
    ],
  });

  if (!invocation) {
    return makeStepResult("jscpd", "unsupported", startedAt, {
      reason: "no supported executor found for jscpd",
    });
  }

  const result = execute(invocation.command, invocation.args, {
    cwd: context.targetDir,
    env: npmCacheEnv(context),
  });

  const generatedReport = join(context.tempDir, "steps/jscpd/jscpd-report.json");
  const finalReport = join(context.tempDir, "steps/jscpd/report.json");
  if (hasNonEmptyFile(generatedReport)) {
    moveFile(generatedReport, finalReport);
  }

  return acceptedStepFromFiles({
    id: "jscpd",
    context,
    startedAt,
    commandResult: result,
    relativePaths: ["steps/jscpd/report.json"],
  });
}

function runGitleaks(context: StepContext): StepResult {
  const startedAt = Date.now();
  if (!commandExists("gitleaks")) {
    return makeStepResult("gitleaks", "skipped", startedAt, {
      reason: "gitleaks is not installed",
    });
  }

  const reportPath = join(context.tempDir, "steps/gitleaks/report.sarif");
  ensureParentDirectory(reportPath);
  const result = execute("gitleaks", [
    "detect",
    "--source",
    context.targetDir,
    "--report-format",
    "sarif",
    "--report-path",
    reportPath,
  ]);

  return acceptedStepFromFiles({
    id: "gitleaks",
    context,
    startedAt,
    commandResult: result,
    relativePaths: ["steps/gitleaks/report.sarif"],
    acceptedExitCodes: [0, 1],
    findingsExitCodes: [1],
  });
}

function runTrivy(context: StepContext): StepResult {
  const startedAt = Date.now();
  if (!commandExists("trivy")) {
    return makeStepResult("trivy", "skipped", startedAt, {
      reason: "trivy is not installed",
    });
  }

  const findingsPath = join(context.tempDir, "steps/trivy/findings.json");
  const sbomPath = join(context.tempDir, "steps/trivy/sbom.cyclonedx.json");
  const dockerConfigDir = join(context.tempDir, "trivy-docker-config");
  ensureParentDirectory(findingsPath);
  ensureParentDirectory(sbomPath);
  mkdirSync(dockerConfigDir, { recursive: true });
  const baseArgs = ["fs"];
  const trivyEnv = {
    ...process.env,
    DOCKER_CONFIG: dockerConfigDir,
  };

  for (const dir of COMMON_SKIP_DIRS) {
    baseArgs.push("--skip-dirs", dir);
  }

  const findingsResult = execute("trivy", [
    ...baseArgs,
    "--format",
    "json",
    "-o",
    findingsPath,
    context.targetDir,
  ], {
    env: trivyEnv,
  });

  if (findingsResult.exitCode !== 0) {
    return makeStepResult("trivy", "failed", startedAt, {
      exitCode: findingsResult.exitCode,
      reason: normalizeCommandReason(findingsResult.stderr, "trivy findings failed"),
    });
  }

  const sbomResult = execute("trivy", [
    ...baseArgs,
    "--format",
    "cyclonedx",
    "-o",
    sbomPath,
    context.targetDir,
  ], {
    env: trivyEnv,
  });

  return acceptedStepFromFiles({
    id: "trivy",
    context,
    startedAt,
    commandResult: sbomResult,
    relativePaths: ["steps/trivy/findings.json", "steps/trivy/sbom.cyclonedx.json"],
  });
}

function runDependencyCruiser(context: StepContext): StepResult {
  const startedAt = Date.now();
  const configPath =
    findDependencyCruiserConfig(context.targetDir) ??
    writeDependencyCruiserConfig(context, context.targetDir);
  const invocation = resolveJsToolInvocation({
    targetDir: context.targetDir,
    binary: "depcruise",
    packageName: "dependency-cruiser",
    args: ["--config", configPath, "--metrics", "--output-type", "json", "."],
  });

  if (!invocation) {
    return makeStepResult("dependency-cruiser", "unsupported", startedAt, {
      reason: "no supported executor found for dependency-cruiser",
    });
  }

  const result = execute(invocation.command, invocation.args, {
    cwd: context.targetDir,
    env: npmCacheEnv(context),
  });

  return acceptedStepFromStdout({
    id: "dependency-cruiser",
    context,
    startedAt,
    commandResult: result,
    relativePath: "steps/dependency-cruiser/report.json",
  });
}

function runKnip(context: StepContext): StepResult {
  const startedAt = Date.now();
  const invocation = resolveJsToolInvocation({
    targetDir: context.targetDir,
    binary: "knip",
    packageName: "knip",
    args: ["--reporter", "json"],
  });

  if (!invocation) {
    return makeStepResult("knip", "unsupported", startedAt, {
      reason: "no supported executor found for knip",
    });
  }

  const result = execute(invocation.command, invocation.args, {
    cwd: context.targetDir,
    env: npmCacheEnv(context),
  });

  return acceptedStepFromStdout({
    id: "knip",
    context,
    startedAt,
    commandResult: result,
    relativePath: "steps/knip/report.json",
    acceptedExitCodes: [0, 1],
    findingsExitCodes: [1],
  });
}

function runEslint(context: StepContext): StepResult {
  const startedAt = Date.now();
  const projectConfig = findEslintConfig(context.targetDir);

  if (projectConfig) {
    const invocation = resolveJsToolInvocation({
      targetDir: context.targetDir,
      binary: "eslint",
      packageName: "eslint",
      args: [
        "--format",
        "json",
        "--no-error-on-unmatched-pattern",
        "--ignore-pattern",
        "**/node_modules/**",
        "--ignore-pattern",
        "**/.next/**",
        "--ignore-pattern",
        "**/dist/**",
        "--ignore-pattern",
        "**/build/**",
        "--ignore-pattern",
        "**/coverage/**",
        "--ignore-pattern",
        "**/.turbo/**",
        "--ignore-pattern",
        "**/out/**",
        "--ignore-pattern",
        "**/bin/**",
        ".",
      ],
    });

    if (invocation?.kind === "local") {
      const result = execute(invocation.command, invocation.args, {
        cwd: context.targetDir,
        env: npmCacheEnv(context),
      });

      return acceptedStepFromStdout({
        id: "eslint",
        context,
        startedAt,
        commandResult: result,
        relativePath: "steps/eslint/report.json",
        acceptedExitCodes: [0, 1],
        findingsExitCodes: [1],
      });
    }
  }

  if (!commandExists("npm")) {
    return makeStepResult("eslint", "unsupported", startedAt, {
      reason: "eslint fallback runtime requires npm when the target has no runnable local eslint",
    });
  }

  const runtimeDir = join(context.tempDir, "eslint-runtime");
  mkdirSync(runtimeDir, { recursive: true });
  const install = execute(
    "npm",
    [
      "--prefix",
      runtimeDir,
      "install",
      "--silent",
      "eslint",
      "@typescript-eslint/parser",
    ],
    {
      env: npmCacheEnv(context),
    },
  );

  if (install.exitCode !== 0) {
    return makeStepResult("eslint", "failed", startedAt, {
      exitCode: install.exitCode,
      reason: normalizeCommandReason(install.stderr, "eslint fallback runtime install failed"),
    });
  }

  const fallbackConfig = writeFallbackEslintConfig(context);
  const eslintBinary = join(runtimeDir, "node_modules/.bin/eslint");
  const result = execute(
    eslintBinary,
    [
      "--config",
      fallbackConfig,
      "--format",
      "json",
      "--no-error-on-unmatched-pattern",
      context.targetDir,
    ],
    {
      env: {
        ...npmCacheEnv(context),
        NODE_PATH: join(runtimeDir, "node_modules"),
      },
      cwd: context.targetDir,
    },
  );

  return acceptedStepFromStdout({
    id: "eslint",
    context,
    startedAt,
    commandResult: result,
    relativePath: "steps/eslint/report.json",
    acceptedExitCodes: [0, 1],
    findingsExitCodes: [1],
  });
}

function runOpenGrep(context: StepContext): StepResult {
  const startedAt = Date.now();
  if (!commandExists("opengrep")) {
    return makeStepResult("opengrep", "skipped", startedAt, {
      reason: "opengrep is not installed",
    });
  }

  const rulesCache = ensureOpenGrepRulesCache();
  if (!rulesCache) {
    return makeStepResult("opengrep", "unsupported", startedAt, {
      reason: "opengrep rules cache is unavailable",
    });
  }

  const ruleConfigs = resolveOpenGrepRuleConfigs(rulesCache);
  if (ruleConfigs.length === 0) {
    return makeStepResult("opengrep", "unsupported", startedAt, {
      reason: "opengrep rules cache does not contain usable rule directories",
    });
  }

  const reportPath = join(context.tempDir, "steps/opengrep/report.sarif");
  ensureParentDirectory(reportPath);
  const result = execute("opengrep", [
    "scan",
    ...ruleConfigs.flatMap((config) => ["--config", config]),
    `--sarif-output=${reportPath}`,
    context.targetDir,
  ]);

  return acceptedStepFromFiles({
    id: "opengrep",
    context,
    startedAt,
    commandResult: result,
    relativePaths: ["steps/opengrep/report.sarif"],
  });
}

function runGitMetrics(context: StepContext): StepResult {
  const startedAt = Date.now();
  const gitTopLevel = readGitTopLevel(context.targetDir);

  if (!gitTopLevel) {
    return makeStepResult("git-metrics", "skipped", startedAt, {
      reason: "target is not a git repository",
    });
  }

  if (gitTopLevel !== realpathSync(context.targetDir)) {
    return makeStepResult("git-metrics", "unsupported", startedAt, {
      reason: "git-metrics only supports repository root targets in this version",
    });
  }

  const gitLog = execute("git", [
    "-C",
    context.targetDir,
    "log",
    "--all",
    "--numstat",
    "--date=short",
    "--pretty=format:--%H--%ad--%aN",
    "--no-renames",
  ]);

  if (gitLog.exitCode !== 0) {
    return makeStepResult("git-metrics", "failed", startedAt, {
      exitCode: gitLog.exitCode,
      reason: normalizeCommandReason(gitLog.stderr, "git log failed"),
    });
  }

  const report = analyzeGitHistory(gitLog.stdout);
  const tempOutputDir = join(context.tempDir, "steps/git-metrics");
  const files = writeGitMetricsCsv(report, tempOutputDir);
  const relativePaths = files.map((file) => `steps/git-metrics/${file}`);

  for (const relativePath of relativePaths) {
    moveFile(join(context.tempDir, relativePath), join(context.outDir, relativePath));
  }

  return makeStepResult("git-metrics", "passed", startedAt, {
    artifacts: relativePaths,
  });
}

const STEP_DEFINITIONS: StepDefinition[] = [
  { id: "scc", run: runScc },
  { id: "lizard", run: runLizard },
  { id: "jscpd", run: runJscpd },
  { id: "gitleaks", run: runGitleaks },
  { id: "trivy", run: runTrivy },
  { id: "dependency-cruiser", run: runDependencyCruiser },
  { id: "knip", run: runKnip },
  { id: "eslint", run: runEslint },
  { id: "opengrep", run: runOpenGrep },
  { id: "git-metrics", run: runGitMetrics },
];

function deriveOverallStatus(steps: StepResult[]): StepStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "findings")) {
    return "findings";
  }

  if (steps.some((step) => step.status === "passed")) {
    return "passed";
  }

  if (steps.some((step) => step.status === "unsupported")) {
    return "unsupported";
  }

  return "skipped";
}

function resolveSteps(stepFilter?: string[]): StepDefinition[] {
  if (!stepFilter || stepFilter.length === 0) {
    return STEP_DEFINITIONS;
  }

  const allowed = new Set(stepFilter);
  const invalid = [...allowed].filter((stepId) => !STEP_IDS.includes(stepId as StepId));
  if (invalid.length > 0) {
    throw new Error(`Unknown step ids: ${invalid.join(", ")}`);
  }

  return STEP_DEFINITIONS.filter((step) => allowed.has(step.id));
}

export function runAnalysis(options: AnalyzeOptions): RunManifest {
  const targetDir = resolve(options.targetDir);
  const outDir = resolve(options.outDir);
  const tempDir = mkdtempSync(join(tmpdir(), "code-analysis-run-"));
  const nodeCacheDir = join(tempDir, "npm-cache");
  mkdirSync(nodeCacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const startedAtDate = new Date();
  const context: StepContext = {
    targetDir,
    outDir,
    tempDir,
    nodeCacheDir,
  };

  try {
    const steps = resolveSteps(options.stepFilter).map((step) => step.run(context));
    const manifest: RunManifest = {
      target: targetDir,
      startedAt: startedAtDate.toISOString(),
      finishedAt: new Date().toISOString(),
      overallStatus: deriveOverallStatus(steps),
      steps,
    };

    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

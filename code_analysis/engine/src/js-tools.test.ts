import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { detectTargetPackageManager, resolveJsToolInvocation } from "./js-tools";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "code-analysis-js-tools-"));
}

describe("detectTargetPackageManager", () => {
  test("detects yarn from yarn.lock", () => {
    const targetDir = makeTempDir();
    writeFileSync(join(targetDir, "yarn.lock"), "");

    expect(detectTargetPackageManager(targetDir)).toBe("yarn");
  });
});

describe("resolveJsToolInvocation", () => {
  test("prefers a target-local binary over host executors", () => {
    const targetDir = makeTempDir();
    const localBin = join(targetDir, "node_modules/.bin/eslint");
    mkdirSync(dirname(localBin), { recursive: true });
    writeFileSync(localBin, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(localBin, 0o755);

    const invocation = resolveJsToolInvocation({
      targetDir,
      binary: "eslint",
      packageName: "eslint",
      args: ["--format", "json", "."],
      commandExists: (command) => command === "pnpm" || command === "npx",
    });

    expect(invocation).toEqual({
      kind: "local",
      command: localBin,
      args: ["--format", "json", "."],
    });
  });

  test("uses the target package manager before generic fallback", () => {
    const targetDir = makeTempDir();
    writeFileSync(join(targetDir, "yarn.lock"), "");

    const invocation = resolveJsToolInvocation({
      targetDir,
      binary: "knip",
      packageName: "knip",
      args: ["--reporter", "json"],
      commandExists: (command) => command === "yarn" || command === "npx",
      readCommandVersion: (command) => (command === "yarn" ? "4.4.0" : null),
    });

    expect(invocation).toEqual({
      kind: "package-manager",
      command: "yarn",
      args: ["dlx", "knip", "--reporter", "json"],
    });
  });

  test("falls back when the target uses Yarn Classic without dlx support", () => {
    const targetDir = makeTempDir();
    writeFileSync(join(targetDir, "yarn.lock"), "");

    const invocation = resolveJsToolInvocation({
      targetDir,
      binary: "jscpd",
      packageName: "jscpd",
      args: ["--reporters", "json"],
      commandExists: (command) => command === "yarn" || command === "npx",
      readCommandVersion: (command) => (command === "yarn" ? "1.22.22" : null),
    });

    expect(invocation).toEqual({
      kind: "fallback",
      command: "npx",
      args: ["--yes", "jscpd", "--reporters", "json"],
    });
  });

  test("falls back to npx when the target has no package manager lockfile", () => {
    const targetDir = makeTempDir();

    const invocation = resolveJsToolInvocation({
      targetDir,
      binary: "dependency-cruiser",
      packageName: "dependency-cruiser",
      args: ["--output-type", "json", "."],
      commandExists: (command) => command === "npx",
    });

    expect(invocation).toEqual({
      kind: "fallback",
      command: "npx",
      args: ["--yes", "dependency-cruiser", "--output-type", "json", "."],
    });
  });
});

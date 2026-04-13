import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { join } from "node:path";

export type DetectedPackageManager = "bun" | "pnpm" | "npm" | "yarn" | "unknown";

export interface JsToolInvocation {
  kind: "local" | "package-manager" | "fallback";
  command: string;
  args: string[];
}

interface ResolveJsToolInvocationOptions {
  targetDir: string;
  binary: string;
  packageName: string;
  args: string[];
  commandExists?: (command: string) => boolean;
  readCommandVersion?: (command: string, cwd?: string) => string | null;
}

function defaultCommandExists(command: string): boolean {
  return Bun.which(command) !== null;
}

function defaultReadCommandVersion(command: string, cwd?: string): string | null {
  const result = spawnSync(command, ["--version"], {
    cwd,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  const value = (result.stdout ?? result.stderr ?? "").trim();
  return value.length > 0 ? value : null;
}

function parseMajorVersion(version: string | null): number | null {
  if (!version) {
    return null;
  }

  const match = version.match(/(\d+)/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function resolveLocalBinary(targetDir: string, binary: string): string | null {
  const candidate = join(targetDir, "node_modules/.bin", binary);

  if (!existsSync(candidate)) {
    return null;
  }

  try {
    accessSync(candidate, constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

export function detectTargetPackageManager(targetDir: string): DetectedPackageManager {
  if (existsSync(join(targetDir, "bun.lock")) || existsSync(join(targetDir, "bun.lockb"))) {
    return "bun";
  }

  if (existsSync(join(targetDir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (
    existsSync(join(targetDir, "package-lock.json")) ||
    existsSync(join(targetDir, "npm-shrinkwrap.json"))
  ) {
    return "npm";
  }

  if (existsSync(join(targetDir, "yarn.lock"))) {
    return "yarn";
  }

  return "unknown";
}

export function resolveJsToolInvocation(
  options: ResolveJsToolInvocationOptions,
): JsToolInvocation | null {
  const commandExists = options.commandExists ?? defaultCommandExists;
  const readCommandVersion = options.readCommandVersion ?? defaultReadCommandVersion;
  const localBinary = resolveLocalBinary(options.targetDir, options.binary);

  if (localBinary) {
    return {
      kind: "local",
      command: localBinary,
      args: options.args,
    };
  }

  const packageManager = detectTargetPackageManager(options.targetDir);

  if (packageManager === "bun" && commandExists("bunx")) {
    return {
      kind: "package-manager",
      command: "bunx",
      args: [options.packageName, ...options.args],
    };
  }

  if (packageManager === "pnpm" && commandExists("pnpm")) {
    return {
      kind: "package-manager",
      command: "pnpm",
      args: ["dlx", options.packageName, ...options.args],
    };
  }

  if (packageManager === "yarn" && commandExists("yarn")) {
    const yarnMajorVersion = parseMajorVersion(
      readCommandVersion("yarn", options.targetDir),
    );

    if (yarnMajorVersion !== null && yarnMajorVersion >= 2) {
      return {
        kind: "package-manager",
        command: "yarn",
        args: ["dlx", options.packageName, ...options.args],
      };
    }
  }

  if (packageManager === "npm" && commandExists("npx")) {
    return {
      kind: "package-manager",
      command: "npx",
      args: ["--yes", options.packageName, ...options.args],
    };
  }

  if (commandExists("bunx")) {
    return {
      kind: "fallback",
      command: "bunx",
      args: [options.packageName, ...options.args],
    };
  }

  if (commandExists("npx")) {
    return {
      kind: "fallback",
      command: "npx",
      args: ["--yes", options.packageName, ...options.args],
    };
  }

  return null;
}

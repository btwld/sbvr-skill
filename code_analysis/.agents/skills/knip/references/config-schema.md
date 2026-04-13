# Knip configuration reference

Full schema for `knip.json` / `knip.jsonc` / `knip.ts` / `knip.js` / `package.json#knip`.

Use `"$schema": "https://unpkg.com/knip@5/schema.json"` in JSON configs for editor autocomplete.

## Top-level options

| Option | Type | Purpose |
|---|---|---|
| `entry` | `string[]` | Files Knip starts the module graph from. Plugins add more automatically. Suffix a pattern with `!` to mark it production-only. |
| `project` | `string[]` | Files Knip considers part of the project. Anything matched but not reachable from `entry` is reported as unused. Suffix with `!` for production-only. |
| `paths` | `Record<string, string[]>` | TypeScript-style path aliases. Same semantics as `compilerOptions.paths` in `tsconfig.json`. Use when Knip can't pick them up from `tsconfig.json` automatically. |
| `ignore` | `string[]` | Glob patterns to exclude from analysis entirely. **Avoid** — breaks the module graph. Use targeted options instead. |
| `ignoreBinaries` | `string[]` | Binaries referenced in npm scripts to skip reporting (e.g. `["zip", "docker-compose"]`). |
| `ignoreDependencies` | `string[]` | Dependencies to never report as unused. Regex allowed in dynamic configs. |
| `ignoreExportsUsedInFile` | `boolean \| object` | Don't report exports that are only used inside the same file. Pass `true` for all, or `{ interface: true, type: true }` to limit to specific kinds. |
| `ignoreFiles` | `string[]` | Suppress the "unused files" section only, while keeping those files in the analysis for their imports/exports. |
| `ignoreWorkspaces` | `string[]` | Glob patterns of workspaces to exclude (monorepos). |
| `ignoreMembers` | `string[]` | Enum/namespace member names to skip. |
| `ignoreUnresolved` | `string[]` | Import specifiers to skip when they can't be resolved. |
| `rules` | `object` | Per-issue-type severity. Keys: `files`, `dependencies`, `devDependencies`, `optionalPeerDependencies`, `unlisted`, `binaries`, `unresolved`, `exports`, `types`, `nsExports`, `nsTypes`, `enumMembers`, `classMembers`, `duplicates`. Values: `"error"`, `"warn"`, `"off"`. |
| `includeEntryExports` | `boolean` | By default entry-file exports aren't reported. Enable to include them — useful for private/self-contained repos. Can be set per workspace. |
| `workspaces` | `Record<string, WorkspaceConfig>` | Per-workspace config in a monorepo. Keys are relative paths; `"."` is the root. Each value accepts `entry`, `project`, `paths`, `ignore*`, plus most plugin config. |
| `tags` | `string[]` | Custom JSDoc tags to recognize. Prefix with `-` to report-on (e.g., `["-knipignore"]` reports anything tagged `@knipignore`). |
| `compilers` | `object` | Custom preprocessors for non-standard file types (only in dynamic configs). Keys are file extensions, values are functions that return extracted imports. |
| `exclude` / `include` | `string[]` | Shortcuts for filtering issue types at config level (same as CLI `--exclude` / `--include`). |
| `typescript` | `boolean \| object` | Explicit TypeScript plugin config. Rarely needed — auto-activates. |

## Plugin configuration

Most plugins activate automatically and need no config. When a plugin needs an override, use the plugin name as a top-level key:

```json
{
  "next": {
    "entry": ["next.config.{js,ts,mjs}", "src/app/**/page.{js,jsx,ts,tsx}"]
  },
  "vitest": {
    "config": ["vitest.config.ts"],
    "entry": ["src/**/*.{test,spec}.ts"]
  },
  "eslint": false
}
```

Each plugin accepts:
- `config` — path(s) to the plugin's config file
- `entry` — additional entry files the plugin should know about
- `project` — project files to include for this plugin
- `false` — disable the plugin entirely

Full list of ~100 plugins at https://knip.dev/reference/plugins.

## Dynamic configs (knip.ts / knip.js)

When you need regex, conditionals, or imports:

```ts
import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
  ignoreDependencies: [/^@internal\//],
  compilers: {
    css: text => [...text.matchAll(/(?<=@import ['"])[^'"]+/g)].join('\n'),
  },
};

export default config;
```

## Workspace config example

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      "entry": ["scripts/**/*.ts", "tools/*.mjs"]
    },
    "apps/web": {
      "entry": ["src/main.tsx", "src/routes/**/*.tsx"],
      "project": ["src/**/*.{ts,tsx}"],
      "ignoreDependencies": ["@my-org/internal-types"]
    },
    "packages/*": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    }
  },
  "rules": {
    "exports": "warn",
    "types": "warn"
  }
}
```

Wildcard workspace keys (`packages/*`) apply the same config to every matching workspace.

## Precedence

Knip searches for a config file in this order and uses the first one it finds: `knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc`, `knip.ts`, `knip.js`, then `"knip"` in `package.json`. Command-line flags always override config-file values.

---
name: knip
description: Find and remove unused files, dependencies, and exports in JavaScript and TypeScript projects using Knip. Use this skill whenever the user wants to clean up dead code, shrink their bundle, find unused npm packages, detect orphan files, remove unused TypeScript exports/types, audit a codebase before a release or refactor, or set up dead-code detection in CI. Also use it when the user mentions knip, knip.json, dead code, unused exports, unused dependencies, dependency hygiene, codebase cleanup, or asks to run knip on their project — even if they don't say "knip" by name and are just describing the problem ("which packages am I not actually using?", "are there files nobody imports?").
---

# Knip

Knip is a project-wide linter for JavaScript and TypeScript that finds unused files, dependencies, and exports. Unlike ESLint (which analyzes each file in isolation), Knip builds a module graph of the whole project starting from entry files and reports anything that isn't reachable.

This skill covers how to run Knip correctly, how to read its output, and — most importantly — how to configure it so the report is trustworthy. Getting the configuration right is the whole game. A raw knip run on an unconfigured project often produces dozens of false positives, and if you act on them blindly you will delete code that your app actually uses.

## The configuration-first workflow

This is the single most important thing to understand about Knip. Do not delete anything based on a knip report until the configuration is dialed in and the report is clean. The order is always:

1. **Check the environment.** Is knip installed? (`npx knip --version`) If not, install it as a dev dependency with the project's package manager. Look at `package.json` to see what frameworks and tools the project uses — Next.js, Vite, Vitest, Jest, ESLint, Storybook, and ~100 others have auto-activating plugins. A config file may already exist (`knip.json`, `knip.jsonc`, `.knip.json`, `knip.ts`, `knip.js`, or a `"knip"` key in `package.json`).

2. **Run knip and read the top of the output first.** Knip prints **configuration hints** before the issues. These hints are Knip telling you "I don't understand part of your project yet." Examples: "Create knip.json configuration file, and add entry and/or refine project files (42 unused files)" or "Unresolved imports". Fix the hints before you look at anything else. If you ignore them, every downstream number is unreliable.

3. **Iterate on the config.** Add entry files, refine project globs, enable production mode, or add workspaces until the hints disappear and the unused-files count looks sane. Re-run after every change.

4. **Only then act on the report.** Start with unused files (removing them cascades into fewer reported unused deps and exports), then unused dependencies, then unused exports and types.

5. **Use `--fix` last, not first.** Running `knip --fix` on a project with unresolved hints will happily strip exports that are actually used and delete files that are actually reached through a plugin Knip doesn't know about yet. Only auto-fix after the report is clean and you trust it.

The reason this matters: Knip's accuracy depends entirely on whether its module graph matches reality. A missing plugin, a forgotten entry file, or a TypeScript path alias it doesn't understand will make hundreds of valid things look unused. The hints are Knip asking for help — give it help, and the report becomes reliable.

## Installation and first run

```bash
# Install as a dev dependency (Knip needs typescript and @types/node as peers)
npm install -D knip typescript @types/node

# Or, to scaffold a starter config at the same time:
npm init @knip/config

# Run it
npx knip
```

Add a script to `package.json` so it's easy to rerun:

```json
{
  "scripts": {
    "knip": "knip",
    "knip:fix": "knip --fix",
    "knip:prod": "knip --production"
  }
}
```

For a first look at a large codebase where the output is overwhelming, limit the noise: `npx knip --max-issues 1` shows one example per type so you can see what's going on without drowning.

## Reading the report

Knip groups findings by issue type. The common ones:

- **Unused files** — files in the project glob that nothing (reachable from an entry file) imports. Fix these first; many other reported issues disappear once unused files are gone.
- **Unused dependencies** — packages in `package.json` that no source file imports. If a dependency is reported as unused but you know it's used, the likely causes are (a) a framework plugin is missing, (b) the dependency is referenced in a config file Knip doesn't parse, or (c) it's imported from a file Knip thinks is unused.
- **Unused devDependencies** — same idea, for devDependencies.
- **Unlisted dependencies** — imported in source but not in `package.json`. These are real bugs — you're relying on a transitive dependency that could vanish.
- **Unresolved imports** — import specifiers Knip couldn't resolve to a file or package. Often a path-alias misconfiguration.
- **Unused exports** — exported from a non-entry file but never imported elsewhere.
- **Unused exported types** — same, for TypeScript types/interfaces.
- **Unused enum members / class members** — fields on exported enums or classes that are never read.
- **Duplicate exports** — the same thing exported under two names.
- **Unused binaries** — CLI binaries referenced in scripts but not installed.

Report location format is IDE-friendly (`path/to/file.ts:12:3`), so in VS Code or WebStorm you can click straight through.

## Configuration

Knip looks for config in this order: `knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc`, `knip.ts`, `knip.js`, then `"knip"` in `package.json`. JSON is fine for most projects; use `knip.ts` when you need logic or regular expressions.

A good starting config for a single-package TypeScript project:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/index.ts"],
  "project": ["src/**/*.{js,ts,tsx}"]
}
```

- **`entry`** — the files Knip starts from when walking the module graph. Be specific; wildcards here work against you because every wildcard-matched file becomes an entry and anything it exports is considered "used." Plugins add entry files automatically for the frameworks they cover, so you usually only need to add entries the plugins don't know about (custom scripts, standalone CLI entrypoints, etc.).
- **`project`** — the files Knip considers part of the project. Anything matched here but not reachable from an entry is "unused file." This should cover your source code.

### Plugins do most of the work

Knip ships with ~100 plugins (Next.js, Nuxt, Astro, Remix, Vite, Vitest, Jest, Playwright, Cypress, Storybook, ESLint, Webpack, Rollup, Svelte, Nx, GitHub Actions, and many more). They activate automatically when the plugin detects the tool is installed. Each plugin knows that tool's default entry points and config file format.

**For framework apps, you often don't need `entry` at all.** The Next.js plugin already knows about `pages/**`, `app/**`, `middleware.ts`, `next.config.*`, API routes, and so on. The Remix plugin knows `app/routes/**`. The SvelteKit plugin knows `+page.svelte` and `+layout.svelte`. In those cases you typically only need to set `project` so Knip knows the analysis scope — the plugin handles entry discovery. Only add explicit `entry` patterns for things the plugin can't know about: custom scripts, CLI binaries, standalone tools, or nonstandard file layouts.

If a framework is in use and Knip is still reporting its files as unused, the plugin either isn't activating or doesn't know where your code lives. The fastest way to diagnose this is:

```bash
npx knip --debug 2>&1 | head -80
```

Look at the enabled plugins list near the top. If your framework isn't there, the plugin didn't activate — usually because the package isn't in `package.json` at the level Knip is looking (common in monorepos where the dep lives in a parent workspace). If the plugin is enabled but your files still look unused, you probably have a nonstandard layout and need a plugin override. See the plugin's page on knip.dev.

### Do not use `ignore` as a muffler

The temptation when Knip reports something you think is a false positive is to add it to `ignore`. Resist it. The `ignore` option excludes files entirely from analysis, which means Knip stops tracking what they import — and now their dependencies and exports look unused too. You've created more false positives, not fewer.

Better alternatives, in order:
1. **Address the configuration hint** if there is one.
2. **Refine `entry` and `project`** so Knip sees the real shape of the code.
3. **Use production mode** (`--production`) if the issue is that test files are keeping things "alive" that aren't really used in production.
4. **Targeted ignore options** — `ignoreDependencies`, `ignoreBinaries`, `ignoreWorkspaces`, `ignoreExportsUsedInFile` — these are scoped and safe.
5. **JSDoc tags** on individual exports (see below).
6. **Only as a last resort**, `ignore` with a comment explaining why.

The one thing `ignore` is good for: a temporary investigation. `ignore: ["!src/problem-area/**"]` (note the `!`) inverts the pattern so Knip reports only that area while you work on it.

### Handling false positives on individual exports

When a non-entry file has a public export that should not be reported — say it's part of your package's public API, or it's consumed through some mechanism Knip can't see (reflection, dynamic import from outside the graph, a framework convention) — tag it with a JSDoc comment:

```ts
/**
 * Merge two objects.
 * @public
 */
export const merge = (a, b) => ({ ...a, ...b });
```

Recognized tags:
- `@public` — don't report as unused. Works on exports and types. Does not rescue a file that is unused as a whole (if nothing imports the file, `@public` on one of its exports won't save it — make it an entry file instead).
- `@beta` — identical to `@public`.
- `@internal` — only relevant in production mode. Marks an export as intentionally internal so production mode knows not to expect it to be used from production code.
- `@alias` — for the duplicate-exports report. Tag one side of a legitimate duplicate to silence it.

You can also define custom tags via the `tags` config option.

### The `ignoreExportsUsedInFile` escape hatch

A common noise source: TypeScript interfaces or types exported for re-export purposes but only referenced within the same file. Set:

```json
{
  "ignoreExportsUsedInFile": { "interface": true, "type": true }
}
```

This tells Knip: if a type is exported and only used inside the same file, don't report it.

## Production mode

By default Knip considers tests, Storybook stories, and config files as part of the analyzed project. This is usually what you want — you do want to know about tests importing unused helpers. But it means a helper used only by tests is considered "used." If you want to find code that's reachable only through tests (i.e., code that could be deleted along with its tests), run:

```bash
npx knip --production
```

In production mode, Knip only looks at entry/project patterns suffixed with `!` and at plugin entry files tagged as production (e.g. Next.js pages, Remix routes, but not `*.test.ts` or `*.stories.tsx`). Only `dependencies` are considered — `devDependencies` are ignored.

```json
{
  "entry": ["src/index.ts!", "build/script.js"],
  "project": ["src/**/*.ts!", "build/*.js"]
}
```

**Important:** the right way to exclude tests is production mode, **not** `ignore` or negated `project` globs. Using ignore patterns to hide tests breaks Knip's module graph.

`--strict` implies `--production` and additionally isolates each workspace (assumes each workspace lists its own dependencies in its own `package.json`).

## Monorepos

Knip handles monorepos via a `workspaces` object in config. Each workspace is a directory with a `package.json`. Knip auto-detects workspaces from `package.json#workspaces` or `pnpm-workspace.yaml`; you only need to configure workspaces that aren't listed there.

```json
{
  "workspaces": {
    ".": {
      "entry": ["scripts/**/*.ts"]
    },
    "packages/app": {
      "entry": ["src/main.tsx"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "packages/shared": {
      "entry": ["src/index.ts"]
    }
  }
}
```

In a monorepo, top-level `entry` and `project` are ignored — put those under `workspaces["."]` for the root.

To analyze a single workspace: `npx knip --workspace packages/app`. Note that this also pulls in ancestor and dependent workspaces by default (ancestors might list shared deps, dependents might use exports from the target). To truly isolate one workspace, combine with `--strict`.

**Path-alias pitfall in monorepos:** if your `tsconfig.json` uses `compilerOptions.paths` to alias into sibling workspaces (e.g. `"@myapp/shared": ["../shared/src"]`), Knip won't special-case those aliases and will often report them as false positives. The fix is structural: list the other workspace as a real dependency in `package.json` and import it by package name. This is also the recommendation from every other tool in the ecosystem.

## Auto-fix

Once the config is settled and the report looks right, let Knip delete what it can:

```bash
# Remove unused export keywords and unused deps from package.json
npx knip --fix

# Also delete files (only after you've reviewed the unused-files list)
npx knip --fix --allow-remove-files

# Limit what gets fixed
npx knip --fix --fix-type exports,types

# Format modified files afterwards (Biome, Prettier, deno fmt, dprint)
npx knip --fix --format
```

What auto-fix does and doesn't do:
- **Removes** the `export` keyword on unused exports and re-exports, removes unused deps from `package.json`, and with `--allow-remove-files` deletes unused files.
- **Does not** remove unused variables inside a file, unused imports, or the right-hand side of export assignments (those may have side effects). Pair Knip with an unused-vars cleanup tool like ESLint's `no-unused-vars` or `remove-unused-vars` for a complete sweep.
- **Does not** install missing dependencies — if Knip reports "unlisted dependencies," you still need to `npm install` them yourself.

**Always commit before running `--fix`.** This is the single most important habit with auto-fix. A clean working tree means the fix shows up as one reviewable diff, and if Knip gets something wrong you can `git restore` instead of reconstructing deleted code. Even better: do two separate `--fix` passes with commits in between — first the safe stuff (`knip --fix` without file removal), then file deletion (`knip --fix --allow-remove-files`). Reviewing two smaller diffs beats reviewing one giant one.

## Useful CLI flags

```bash
# Focus the report on one category
npx knip --files          # only unused files
npx knip --dependencies   # only dependency issues
npx knip --exports        # only unused exports/types

# Include/exclude specific issue types
npx knip --include exports,types
npx knip --exclude classMembers,enumMembers

# Output (built-in reporters: symbols [default], compact, codeowners, json,
# codeclimate, markdown, disclosure, github-actions)
npx knip --reporter json             # machine-readable, for parsing
npx knip --reporter compact          # one line per issue
npx knip --reporter markdown         # for saving to a file or PR comments
npx knip --reporter codeowners       # groups by CODEOWNERS
npx knip --reporter github-actions   # inline PR annotations in GitHub Actions
npx knip --reporter disclosure       # collapsible HTML-in-markdown (good for big reports)

# CI behavior
npx knip --max-issues 0            # fail CI on any issue (default)
npx knip --no-exit-code            # never fail (just report)
npx knip --treat-config-hints-as-errors  # fail CI if hints exist

# Scoping
npx knip --workspace packages/app  # single workspace
npx knip --production              # production only
npx knip --strict                  # implies --production + isolate

# Debugging false positives
npx knip --debug                   # verbose: see what plugins activated, which files resolved
npx knip --trace-file src/util/foo.ts  # show where exports from this file go
npx knip --trace-export myFn       # show where a specific export is imported
npx knip --trace-dependency lodash # show where a specific dependency is imported
npx knip --performance             # profile slow parts
npx knip --cache                   # 10-40% faster on reruns (safe, uses file metadata)
```

## CI integration

The minimal GitHub Actions step once the config is stable:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npm ci
- run: npx knip
```

By default Knip exits non-zero on any issue, so the step fails on regressions. For a gentler rollout, start with `npx knip --max-issues <current-count>` and ratchet down over time, or use `--treat-config-hints-as-errors` on its own to enforce just the hint-free-config rule first.

## Troubleshooting checklist

When Knip's output doesn't match reality, walk this list before changing anything:

1. **Are there configuration hints at the top of the output?** Fix those first. Every other number depends on them.
2. **Is a framework plugin failing to activate?** Run `npx knip --debug 2>&1 | head -80` and look for the list of enabled plugins near the top. If your framework isn't in the list, the plugin isn't picking it up — usually because the framework package isn't in `package.json` where Knip is looking (e.g. it's hoisted to a parent workspace), or because the plugin doesn't exist yet. Check the plugin list at knip.dev/reference/plugins.
3. **Does the project use TypeScript path aliases?** Verify they resolve by running `tsc --noEmit`. If aliases point across monorepo workspaces, convert them to proper package dependencies.
4. **Are you confusing Knip with ESLint?** Knip does inter-file analysis only. Unused *variables inside a file* are ESLint's job, not Knip's.
5. **Is something referenced dynamically** (reflection, string-based imports, framework file conventions)? Knip cannot follow those. Either add the file to `entry`, add the export to a file that is an entry, or tag the export `@public`.
6. **Is a dependency re-exported from a type package in `dependencies` while being used only in dev?** Knip is strict about the dev/prod split; production mode may flag this. Add to `ignoreDependencies` as a documented exception.
7. **Is your `tsconfig.json` in a nonstandard location?** Pass `--tsConfig path/to/tsconfig.json`.

## When to reach for more detail

- For the full configuration schema (every option, every default), see `references/config-schema.md`.
- For deeper notes on specific issue types and how Knip resolves each one, see `references/issue-types.md`.
- Upstream docs live at https://knip.dev — the FAQ and "Handling Issues" page are especially useful when stuck on a false positive.

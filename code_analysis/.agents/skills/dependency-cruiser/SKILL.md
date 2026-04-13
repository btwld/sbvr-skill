---
name: dependency-cruiser
description: Use dependency-cruiser to validate, enforce, and visualize module dependencies in JavaScript, TypeScript, CoffeeScript, and Vue/Svelte projects. Trigger whenever the user mentions dependency-cruiser, depcruise, circular dependencies, import cycles, architectural boundaries in JS/TS, detecting orphan modules, finding missing or unresolved imports, visualizing a module graph, enforcing layered architecture (UI can't import DB, etc.), impact analysis of a change, or generating a dependency SVG/HTML/mermaid graph. Also trigger when the user has a `.dependency-cruiser.cjs`/`.js`/`.json` file, asks "which files would break if I change X", wants to fail CI on forbidden imports, or wants to ban `npm-dev` deps from production code.
---

# dependency-cruiser

dependency-cruiser (`depcruise` on the CLI) walks a JavaScript/TypeScript codebase, builds a dependency graph, validates it against user-defined rules, and reports or visualizes the result. It handles ES modules, CommonJS, AMD, dynamic imports, TypeScript path aliases, webpack resolve config, and more.

Use this skill for three broad jobs:

1. **Validation** — enforce "no circular deps", "UI can't import DB", "no dev deps in prod code", "no orphan modules". Fail CI on violations.
2. **Visualization** — generate SVG/HTML/mermaid dependency graphs, possibly scoped to one module or folder.
3. **Analysis** — answer questions like "what modules does X reach?", "what depends on Y?", "what's affected if I change Z?".

## Contents

- [Orient first](#orient-first) — checks to run before writing any command
- [Installation](#installation)
- [Core CLI patterns](#core-cli-patterns) — the 6 commands covering 90% of use cases
- [Config file anatomy](#config-file-anatomy) — sections, rule shape, condition keys
- [Picking a rule type](#picking-a-rule-type) — forbidden vs allowed vs required
- [The starter rule set](#the-starter-rule-set) — rule names from `depcruise --init`
- [Options that actually matter](#options-that-actually-matter)
- [Common workflows](#common-workflows) — CI gate, baseline, arch docs, pre-commit
- [Suppressing violations](#suppressing-violations) — there's no inline disable
- [dependency-cruiser vs ESLint `no-restricted-imports`](#dependency-cruiser-vs-eslint-no-restricted-imports)
- [Defaults to prefer](#when-writing-config-prefer-these-defaults)
- [Gotchas](#gotchas)
- [Complete CLI reference](#complete-cli-reference) — every flag, reporter, sister command
- [Rules cookbook](#rules-cookbook) — cycles, orphans, layers, features, monorepo, license
- [Config examples](#config-examples) — minimal, TypeScript, monorepo starters
- [Programmatic API](#programmatic-api) — `cruise()`, result shape, vite plugin example
- [Further reading](#further-reading)

## Orient first

Before writing any commands or config, figure out what the user actually has and wants. A few quick checks save a lot of wasted effort:

- Is dependency-cruiser already installed? Check `package.json` devDependencies and look for `.dependency-cruiser.cjs`, `.dependency-cruiser.js`, or `.dependency-cruiser.json` in the repo root.
- Is this TypeScript? Look for `tsconfig.json`. If yes, `tsConfig` needs to point at it or TS path aliases won't resolve and you'll see lots of `couldNotResolve` noise.
- Is there a webpack/vite config with path aliases? Same story — pass `webpackConfig` or you'll get false positives.
- What's the user's goal: a one-off graph, a CI check, or ongoing architecture enforcement?

If there's no config yet and the user wants ongoing validation, run `npx depcruise --init` (interactive in a terminal, or write a config file directly — see the "Config examples" section). If the user just wants a one-off graph, skip init entirely and use CLI flags.

## Installation

```bash
npm install --save-dev dependency-cruiser
# or: yarn add -D dependency-cruiser / pnpm add -D dependency-cruiser
```

Install as a dev dependency, not global. This ensures the version is pinned and transpilers (TypeScript, Babel) resolve from the project's `node_modules`.

**For SVG/PNG/PDF graphs**, GraphViz `dot` must be installed on the system (`brew install graphviz`, `apt install graphviz`, etc.). HTML, mermaid, JSON, CSV, and text reporters work without GraphViz.

## Core CLI patterns

The command is `depcruise` (aliases: `dependency-cruiser`, `dependency-cruise`). From v13 onward it auto-discovers any of `.dependency-cruiser.json`, `.dependency-cruiser.js`, `.dependency-cruiser.cjs`, or `.dependency-cruiser.mjs` in the project root — no `--config` flag needed. On v12 and older, pass `--config` explicitly.

**Validate against rules and print human-readable violations:**
```bash
npx depcruise src --output-type err
# or err-long for more detail, err-html for a browseable report
```

**Visualize the src tree as SVG** (requires GraphViz):
```bash
npx depcruise src --include-only "^src" --output-type dot | dot -T svg > deps.svg
```

**Standalone interactive HTML report** (no GraphViz needed):
```bash
npx depcruise src --output-type html --metrics --output-to deps.html
```

**Focus on one module and its neighbors:**
```bash
npx depcruise src --focus "src/features/auth" --output-type html --output-to auth.html
```

**Impact analysis — what changed since main:**
```bash
npx depcruise src --affected main --output-type err-long
```

**What reaches (depends on) a module — useful for "what breaks if I change this":**
```bash
npx depcruise src --reaches "src/shared/config" --output-type text
```

**Folder-level architecture view:**
```bash
npx depcruise src --output-type archi | dot -T svg > architecture.svg
# or use 'ddot' for a simpler folder-summarized graph
```

## Config file anatomy

A dependency-cruiser config is a CommonJS (`.cjs`) or JSON file with four top-level sections:

```js
module.exports = {
  forbidden: [ /* rules that describe disallowed deps */ ],
  allowed:   [ /* rules describing the only deps that ARE allowed */ ],
  required:  [ /* "every controller must depend on base" style rules */ ],
  options:   { /* cruise options — tsConfig, includeOnly, doNotFollow, etc. */ },
};
```

Each rule in `forbidden` / `allowed` / `required` has this shape:

```js
{
  name: "no-circular",           // short, eslint-style, appears in reports
  severity: "error",             // error | warn | info | ignore (error fails CI)
  comment: "why this rule exists",
  from: { path: "^src", pathNot: "\\.spec\\." },
  to:   { circular: true },
}
```

`from` and `to` are **condition objects**. Conditions are ANDed together — a dependency is caught by the rule only if it matches every condition in both `from` and `to`. Paths are **regular expressions, not globs**, and always use forward slashes even on Windows.

**Key condition keys:**
- `path` / `pathNot` — regex match on the file path
- `dependencyTypes` / `dependencyTypesNot` — `["npm", "npm-dev", "npm-peer", "npm-optional", "core", "local", "aliased", "type-only", "unknown", "undetermined", "npm-no-pkg", "npm-unknown"]`
- `circular: true` — the dependency is part of a cycle
- `orphan: true` — only valid in `from`; modules with **no dependents and no dependencies** (the strictest form of dead code)
- `reachable: true/false` — used with a `from` to check reachability
- `license` / `licenseNot` — regex against detected license strings
- `dynamic: true` — dynamic import (`import('...')`)
- `moreUnstable: true` — for the stable-dependencies principle

## Picking a rule type

The three rule arrays mean different things. Pick the one that matches how the user thinks about the constraint.

**`forbidden`** — blocklist. Any dependency matching the rule's `from` + `to` combination is a violation. Use for specific prohibitions: "no circular deps", "UI can't touch the DB", "don't import moment", "no dev deps in prod code". This is the default choice and what `depcruise --init` scaffolds. Reach for it unless you have a specific reason not to.

**`allowed`** — allowlist (stricter). You describe the only dependency shapes that ARE permitted. Anything not matching any `allowed` rule produces a `not-in-allowed` violation. Use for greenfield projects with a clear architectural vision where you want every dependency to be explicitly sanctioned. Retrofitting `allowed` onto an existing codebase is painful — prefer `forbidden` for brownfield work.

**`required`** — positive obligation. Different shape from the other two: you specify `module` (which files the rule applies to) and `to` (what they must import). Use for rules like "every controller must import BaseController" or "every feature module must expose an index.ts". These are rare in practice — most architecture is about what you can't do, not what you must.

When in doubt, use `forbidden` with descriptive rule names. Most real-world dependency-cruiser configs have a dozen `forbidden` rules, zero or one `allowed` rule, and no `required` rules.

## The starter rule set

When `depcruise --init` scaffolds a config, it populates `forbidden` with these battle-tested rules. Know them by name — users will reference them:

- **no-circular** — forbid cycles (usually `severity: "warn"` at first, tighten later)
- **no-orphans** — forbid modules nobody imports
- **no-deprecated-core** — no imports of deprecated Node core modules
- **no-deprecated-npm** — no imports of npm packages flagged deprecated
- **not-to-unresolvable** — error if an import can't be resolved to a file
- **not-to-dev-dep** — production code (`^src`) must not import `dependencyTypes: ["npm-dev"]`
- **no-non-package-json** — catches `npm i`'d packages missing from `package.json` (`npm-no-pkg`, `npm-unknown`, `unknown`, `undetermined`)
- **optional-deps-used** / **peer-deps-used** — informational warnings
- **no-duplicate-dep-types** — a dep appearing in both `dependencies` and `devDependencies`
- **not-to-spec** — regular code can't import `.spec` / `.test` files
- **not-to-test** — nothing outside `test/` can import from `test/`

Don't invent these names from scratch — keep them consistent with the starter set so the user's muscle memory transfers.

## Options that actually matter

Inside `options`, the keys that come up most:

```js
options: {
  doNotFollow: { path: "node_modules" }, // traverse into, but don't recurse further
  exclude:     { path: "\\.spec\\.(js|ts)$" },
  // Deliberately no `includeOnly` — see Gotchas. Scope rules with `from.path` instead.
  tsConfig:    { fileName: "tsconfig.json" },   // critical for TS projects w/ path aliases
  tsPreCompilationDeps: true,                    // catch type-only imports too
  webpackConfig: { fileName: "webpack.config.js" }, // pick up webpack resolve aliases
  enhancedResolveOptions: {
    // These are examples, not defaults. Tune to match your project's module resolution.
    exportsFields: ["exports"],
    conditionNames: ["import", "require", "node", "default", "types"],
    mainFields: ["main", "types", "typings"],
  },
  reporterOptions: {
    dot: { collapsePattern: "^(packages|src|node_modules)/[^/]+" },
    archi: { collapsePattern: "^(src/[^/]+|node_modules/[^/]+)" },
  },
}
```

**TypeScript projects must set `tsConfig`.** This is the single most common source of "it reports things as unresolvable" confusion. Without it, path aliases from `tsconfig.json` (`@/foo`, `~/bar`) won't resolve and the report is useless.

**Do not put `includeOnly` in `options` if you have any rule that targets `dependencyTypes` (`npm-dev`, `npm`, `core`, etc.).** It silently filters out node_modules edges before rules run, and `not-to-dev-dep` will exit zero on a project that's full of dev-dep violations. Scope rules with `from: { path: "^src" }` instead. See Gotchas for the full story.

## Common workflows

**CI gate:** add a `depcruise` script to `package.json` that runs `depcruise --output-type err src` and make it part of `npm test` or a dedicated CI step. Non-zero exit means violations at `error` severity.

**Baseline existing violations** (so you can fix new ones without drowning in old ones):
```bash
npx depcruise-baseline src                          # writes .dependency-cruiser-known-violations.json
npx depcruise --ignore-known src --output-type err  # ignores those in subsequent runs
```

**Generate architecture docs on every release:**
```bash
npx depcruise src --include-only "^src" --output-type dot | dot -T svg > docs/architecture.svg
npx depcruise src --output-type archi | dot -T svg > docs/architecture-high-level.svg
```

**Pre-commit hook** (with husky/lint-staged): run `depcruise --output-type err-long` on the `src` tree. Fast enough for most projects; add `--cache` for big ones.

## Suppressing violations

dependency-cruiser has **no inline disable comment** — there's no equivalent to `// eslint-disable-next-line`. Users coming from ESLint will look for one. When they need to suppress a violation, guide them to one of these three approaches, in order of preference:

1. **Refine the rule.** The usual "suppression" is a more precise `pathNot` or `dependencyTypesNot` in the rule's `from` or `to`. If a legitimate import is being flagged, the rule is too broad. Narrow it.
2. **Baseline the violation.** For genuine existing violations you can't fix right now, use `depcruise-baseline src` to snapshot them into `.dependency-cruiser-known-violations.json`, then run `depcruise --ignore-known` from then on. This is the canonical "tech debt" workflow: fail CI on *new* violations without drowning in existing ones.
3. **Drop the rule's severity to `warn` or `info`.** Keeps the signal visible in reports without failing CI. Good for rules the team isn't ready to enforce yet.

There's no fourth option. If none of these fit, the rule probably doesn't match the intent.

## dependency-cruiser vs ESLint `no-restricted-imports`

Users sometimes ask why they'd use dependency-cruiser over ESLint's built-in `no-restricted-imports` or `no-restricted-paths`. The short version:

- **ESLint** runs per-file and only knows about direct imports. It can't detect cycles (which are a graph property), can't do reachability or impact analysis, can't enforce orphan rules, and can't distinguish `npm-dev` from `npm` dependency types.
- **dependency-cruiser** builds the whole graph, so it handles cycles, orphans, reachability, layering with transitive awareness, dependency-type rules, stability metrics, and visualization.
- Use ESLint for simple "this file can't import from that path" rules that should show up in the editor's red-squiggle feedback loop. Use dependency-cruiser for architecture enforcement, CI gates, and anything that needs whole-graph analysis.
- They coexist fine. Many projects run both.

## When writing config, prefer these defaults

- Start with `depcruise --init` output; don't hand-roll from scratch unless you have a reason.
- Use `.cjs` extension for the config file (avoids ESM headaches even in ESM projects).
- Start `no-circular` at `severity: "warn"` — projects with existing cycles get demoralized if the first run has 40 errors. Promote to `error` after cleanup.
- Always set `tsConfig` for TypeScript projects. Always.
- Use `doNotFollow: { path: "node_modules" }` unless you specifically want to cruise into packages.
- For architecture enforcement, prefer `forbidden` rules with descriptive `name` and `comment` fields — they show up in violation messages and help other devs understand why the rule exists.

## Gotchas

- **Regex, not glob.** `"src/**/*.ts"` does not work. Use `"^src/.+\\.ts$"`.
- **Paths are forward-slash.** dependency-cruiser normalizes internally.
- **Group matching in rules:** if `from.path` has capture groups, `to.path` and `to.pathNot` can reference them with `$1`, `$2`, etc. Great for "a module in folder X can only import from folder X".
- **`orphan` is only valid in `from`**, never `to`.
- **`err` reporter exit code:** only `severity: "error"` violations produce a non-zero exit. `warn` and `info` don't fail CI — this trips people up.
- **Transpilers are not bundled.** dependency-cruiser uses whatever TypeScript/CoffeeScript/Vue/Svelte compiler is in the project's `node_modules`. Run `depcruise --info` to diagnose missing transpilers.
- **Dynamic imports with variables** (`import(someVar)`) can't be statically resolved. They show up as `dynamic: true` or unresolved.
- **Jest `moduleNameMapper` is invisible.** dependency-cruiser reads `tsconfig.json` paths and webpack/vite aliases, but not jest's `moduleNameMapper`. Test files using jest-only aliases will show as `couldNotResolve`. Either add the aliases to `tsconfig.json` (where jest can also pick them up) or exclude test files from the cruise.
- **API vs config rule nesting:** in on-disk config, `forbidden`/`allowed`/`required` are top-level. In the JS API's `ICruiseOptions`, they must be nested under `ruleSet`. See "Programmatic API" below.
- **Don't use `options.includeOnly: "^src"` if you want `not-to-dev-dep` to work.** This is the single nastiest gotcha in the whole tool, and it's silent. `includeOnly` is a graph-level filter: any module whose source path doesn't match the pattern is dropped from the cruise output entirely, *including npm packages under `node_modules`*. That means edges from `src/foo.ts` to `node_modules/vitest/...` disappear before any rule sees them, and `not-to-dev-dep` (and any other rule that targets `dependencyTypes: ["npm-dev"]`, `["npm"]`, `["core"]`, etc.) silently never fires. Your config exits zero. CI is green. Every dev-dep import is unchecked. The fix is to **not put `includeOnly` in `options`** — instead, scope each rule with `from: { path: "^src" }` (which is what the starter `not-to-dev-dep` rule already does). Use `includeOnly` only when you genuinely want to drop external nodes from a *report* (e.g. piping through `--output-type dot` for an architecture diagram), and pass it on the CLI for that one invocation, not in the persistent config.
- **Don't blanket-exclude `\.d\.ts$` in `options.exclude` either.** Related but separate failure mode. With `tsPreCompilationDeps: true` and `enhancedResolveOptions.mainFields` containing `"types"` or `"typings"`, npm packages resolve to their `.d.ts` entry point (e.g. `node_modules/vitest/dist/index.d.ts`). A blanket `exclude: { path: "\\.d\\.ts$" }` then drops those resolved nodes from the graph and breaks `not-to-dev-dep` the same way `includeOnly` does. If you want to keep project-internal `.d.ts` files out of orphan reports, do that in the `no-orphans` rule's `pathNot` (the starter rule already does this), not in the global exclude.

---

## Complete CLI reference

### Basic invocation

```bash
depcruise [options] <files-or-directories-or-globs>
```

You can pass any mix of files, directories, and glob patterns. dependency-cruiser uses picomatch for cross-platform glob matching, then scans directories recursively for supported extensions.

### All flags

**Configuration**
- `-c, --config [file]` — use a specific config file. v13+ auto-discovers if omitted.
- `--no-config` — ignore any config file; run with CLI flags only.
- `--init` — interactive wizard that scaffolds `.dependency-cruiser.cjs`.
- `--init oneshot` — non-interactive init with defaults.

**Output**
- `-T, --output-type <type>` — reporter type (see below). Default `err`.
- `-f, --output-to <file>` — write to file; `-` for stdout.

**Validation and metrics**
- `-v, --validate` — force validation (usually implicit when a config is loaded).
- `-m, --metrics` — compute stability metrics (afferent/efferent coupling, instability per folder).
- `--no-metrics` — turn off metrics.
- `--ignore-known [file]` — ignore violations in the baseline file (default `.dependency-cruiser-known-violations.json`).

**Filtering**
- `-I, --include-only <regex>` — only files matching the regex.
- `-x, --exclude <regex>` — exclude matching files.
- `-X, --do-not-follow <regex>` — include as nodes but don't traverse further (typical for `node_modules`).
- `-F, --focus <regex>` — show only matching modules plus neighbors.
- `--focus-depth <n>` — how many hops from the focus. 1 = direct neighbors.
- `-R, --reaches <regex>` — show matching modules plus everything (direct and transitive) that reaches them. Impact analysis.
- `-A, --affected [revision]` — show modules changed since the given git revision plus what they affect.
- `-H, --highlight <regex>` — highlight (don't filter) matching modules in visual reporters.
- `-S, --collapse <regex-or-number>` — collapse matching modules to a parent folder in visual output.

**Transpiler and resolver hints**
- `--ts-config [file]` — path to `tsconfig.json`. Essential for TS projects with path aliases.
- `--ts-pre-compilation-deps` — also track type-only imports.
- `--webpack-config [file]` — path to webpack config (reads `resolve` section for aliases).
- `--preserve-symlinks` — follow symlinks as-is.
- `--module-systems <list>` — comma-separated: `cjs`, `amd`, `es6`, `tsd`. Default all. Limiting speeds things up.

**Performance**
- `--cache [folder]` — enable caching. Default `node_modules/.cache/dependency-cruiser`.
- `--cache-strategy <strategy>` — `metadata` (fast, mtime) or `content` (hash, more reliable).
- `--progress [mode]` — `cli-feedback`, `performance-log`, `none`.
- `--max-depth <n>` — limit traversal depth.

**Info and debugging**
- `--info` — show what transpilers and extensions dependency-cruiser sees in the current environment. First thing to check when TypeScript/Vue files aren't being detected.
- `--help`, `--version`.

### Output types (reporters)

**Text-based (no GraphViz needed)**
- **`err`** — concise violation list. Default. Exits non-zero on `error` severity.
- **`err-long`** — `err` plus the rule comment.
- **`err-html`** — self-contained HTML of `err-long`, nice for CI artifacts.
- **`text`** — every dependency as `from → to`, one per line. Good for grep.
- **`markdown`** — violation table in markdown, ideal for PR comments.
- **`csv`** — one row per dependency.
- **`json`** — full structured result. Feed into `depcruise-fmt` to generate multiple reports from one cruise.
- **`anon`** — `json` with obfuscated module names. For sharing bug repros without leaking code.
- **`teamcity`** — TeamCity service messages.
- **`null`** — no output, only exit code.
- **`metrics`** — tabular stability metrics per folder.
- **`baseline`** — generates `.dependency-cruiser-known-violations.json`. Shortcut: `depcruise-baseline`.

**Graph-based (require GraphViz `dot`)**
- **`dot`** — full module-level graph. The classic. `depcruise src -T dot | dot -T svg > deps.svg`.
- **`ddot`** — folder-level summary graph. Cleaner for big codebases.
- **`archi` / `cdot`** — collapse to architecturally-meaningful folders (configurable via `reporterOptions.archi.collapsePattern`).
- **`flat` / `fdot`** — flat layout, no clustering.

**Standalone graphs (no GraphViz)**
- **`html`** — interactive single-file HTML report with search, filter, metrics. Friendliest format for humans.
- **`mermaid`** — mermaid markup. Great for markdown docs and GitHub READMEs (GitHub renders mermaid natively).

### Caching

For monorepos and big codebases, `--cache` is the difference between "too slow to run on every commit" and "under 1 second on a warm cache":

```bash
depcruise src --cache node_modules/.cache/dependency-cruiser
```

Note: on macOS running via `npm run` vs directly via `node`, the `metadata` strategy sees about a 7x overhead from package.json resolution. If your cache seems slow inside npm scripts, try `--cache-strategy content` or call `node_modules/.bin/depcruise` directly.

### Exit codes

- **0** — no `error`-severity violations. `warn` and `info` don't fail CI.
- **non-zero** — at least one `error`-severity violation, or dependency-cruiser itself crashed.

### Sister commands

**`depcruise-fmt`** — takes a previously-saved JSON cruise result and runs a different reporter over it. Useful for big codebases where the cruise itself is slow:

```bash
# Run the expensive cruise once
depcruise src -T json -f cruise-result.json

# Now generate multiple reports without re-cruising
depcruise-fmt -T html -f report.html cruise-result.json
depcruise-fmt -T dot cruise-result.json | dot -T svg > graph.svg
depcruise-fmt -T err-long cruise-result.json
depcruise-fmt -T markdown -f violations.md cruise-result.json
```

Accepts the same `-T`, `-f`, `-I`, `-F`, `--focus-depth`, `-R`, `-H`, `-x`, `-S`, and `-P` (prefix) flags as the main command.

**`depcruise-baseline`** — shortcut for generating a known-violations file:

```bash
depcruise-baseline src
# writes .dependency-cruiser-known-violations.json
```

Equivalent to `depcruise -T baseline -f .dependency-cruiser-known-violations.json src`.

**`depcruise-wrap-stream-in-html`** — wraps GraphViz SVG output in an interactive HTML shell (search, zoom, clickable nodes):

```bash
depcruise src -T dot | dot -T svg | depcruise-wrap-stream-in-html > interactive.html
```

---

## Rules cookbook

Copy-adapt these rule recipes into `forbidden`, `allowed`, or `required`.

### Cycles

```js
{
  name: "no-circular",
  severity: "warn", // start at warn, promote to error after cleanup
  comment: "Circular dependencies complicate module initialization order and make code harder to reason about.",
  from: { pathNot: "^(node_modules)" },
  to: { circular: true },
}
```

**Allow type-only cycles** (they vanish at runtime):
```js
{
  name: "no-runtime-circular",
  severity: "error",
  from: {},
  to: {
    circular: true,
    viaOnly: { dependencyTypesNot: ["type-only"] },
  },
}
```

### Dead code and orphans

```js
{
  name: "no-orphans",
  severity: "warn",
  from: {
    orphan: true,
    pathNot: [
      "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$", // dotfiles like .eslintrc
      "\\.d\\.ts$",
      "(^|/)tsconfig\\.json$",
      "(^|/)(babel|webpack|vite|rollup)\\.config\\.(js|cjs|mjs|ts)$",
    ],
  },
  to: {},
}
```

**Unreachable from entry point:**
```js
{
  name: "no-unreachable-from-root",
  severity: "error",
  from: { path: "src/index\\.ts$" },
  to: {
    path: "^src",
    pathNot: "\\.(spec|test)\\.(js|ts)$|\\.d\\.ts$",
    reachable: false,
  },
}
```

### Dependency hygiene (package.json)

```js
{
  name: "not-to-unresolvable",
  severity: "error",
  from: {},
  to: { couldNotResolve: true },
},
{
  name: "no-non-package-json",
  severity: "error",
  comment: "Using a package that isn't in package.json breaks clean installs.",
  from: { pathNot: "^node_modules" },
  to: {
    dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"],
  },
},
{
  name: "not-to-dev-dep",
  severity: "error",
  comment: "Production code must not depend on devDependencies.",
  from: {
    path: "^src",
    pathNot: "\\.(spec|test)\\.(js|ts)$",
  },
  to: { dependencyTypes: ["npm-dev"] },
},
{
  name: "no-duplicate-dep-types",
  severity: "warn",
  from: {},
  to: { moreThanOneDependencyType: true },
}
```

### Test code isolation

```js
{
  name: "not-to-spec",
  severity: "error",
  from: { pathNot: "\\.(spec|test)\\." },
  to: { path: "\\.(spec|test)\\." },
},
{
  name: "not-to-test",
  severity: "error",
  from: { pathNot: "^(test|spec)" },
  to: { path: "^(test|spec)" },
}
```

### Layered architecture

A layered app where `ui → application → domain → infrastructure`:

```js
forbidden: [
  {
    name: "ui-cant-touch-infra",
    severity: "error",
    comment: "UI must go through the application layer.",
    from: { path: "^src/ui" },
    to:   { path: "^src/infrastructure" },
  },
  {
    name: "domain-is-pure",
    severity: "error",
    comment: "Domain must not depend on UI, application, or infrastructure.",
    from: { path: "^src/domain" },
    to:   { path: "^src/(ui|application|infrastructure)" },
  },
  {
    name: "application-cant-reach-into-ui",
    severity: "error",
    from: { path: "^src/application" },
    to:   { path: "^src/ui" },
  },
]
```

### Feature isolation (same-folder-only)

Prevent one feature from reaching into another's internals using group matching. Features live under `src/features/<name>/` and may import each other only through a top-level `index.ts` barrel.

```js
{
  name: "no-feature-cross-talk",
  severity: "error",
  comment: "Features may only import each other through their public index.",
  from: { path: "^src/features/([^/]+)/" },
  to: {
    path: "^src/features/([^/]+)/(?!index\\.ts$).+",
    pathNot: "^src/features/$1/", // same feature is fine
  },
}
```

The `$1` back-reference in `pathNot` matches the feature captured in `from.path`.

### Banning specific packages

```js
{
  name: "no-moment",
  severity: "error",
  comment: "Use date-fns or dayjs instead of moment (40kB gzipped).",
  from: {},
  to: { path: "^moment$" },
},
{
  name: "not-to-core-http",
  severity: "error",
  comment: "Use the internal @company/http client instead of node:http.",
  from: { pathNot: "^node_modules" },
  to: { dependencyTypes: ["core"], path: "^http$" },
}
```

### License enforcement

```js
{
  name: "only-permissive-licenses",
  severity: "error",
  from: { pathNot: "^(node_modules|test)" },
  to: {
    dependencyTypes: ["npm"],
    licenseNot: "MIT|ISC|BSD|Apache-2\\.0|CC0-1\\.0|Unlicense|0BSD",
  },
}
```

### Monorepo package boundaries

Prevent `packages/a` from reaching directly into `packages/b/src` (must go through the published entry):

```js
{
  name: "no-cross-package-internals",
  severity: "error",
  from: { path: "^packages/([^/]+)/src" },
  to: {
    path: "^packages/([^/]+)/src",
    pathNot: "^packages/$1/src",
  },
}
```

### Required-module rules

`required` rules have different semantics: you specify `module` (which files the rule applies to) and `to` (what they must import).

```js
required: [
  {
    name: "controllers-must-extend-base",
    severity: "error",
    module: { path: "^src/controllers/.+Controller\\.ts$" },
    to:     { path: "^src/controllers/BaseController\\.ts$" },
  },
]
```

### Allowed-only (whitelist) mode

Instead of listing forbidden patterns, list the only patterns that ARE allowed. Any dependency not matching any `allowed` rule emits a `not-in-allowed` message:

```js
module.exports = {
  allowedSeverity: "error",
  allowed: [
    { from: { path: "^src/ui" },             to: { path: "^src/(ui|application|shared)" } },
    { from: { path: "^src/application" },    to: { path: "^src/(application|domain|shared)" } },
    { from: { path: "^src/domain" },         to: { path: "^src/(domain|shared)" } },
    { from: { path: "^src/infrastructure" }, to: { path: "^src/(infrastructure|domain|shared)" } },
    { from: { path: "^src/shared" },         to: { path: "^src/shared" } },
    // always allow external npm deps
    { from: {}, to: { dependencyTypes: ["npm", "core", "type-only"] } },
  ],
};
```

Allowed-mode is stricter and better for greenfield projects. Retrofit is painful.

---

## Config examples

Three complete starter configs. Pick the closest match and adapt. All three use `.cjs` because it sidesteps ESM-loading headaches in mixed projects.

### Minimal (plain JavaScript)

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      from: { pathNot: "^(node_modules)" },
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|json)$",
          "(^|/)(babel|webpack|rollup|vite|jest)\\.config\\.(js|cjs|mjs)$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      from: { path: "^src", pathNot: "\\.(spec|test)\\.js$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      from: { pathNot: "^node_modules" },
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(spec|test)\\.js$|^dist|^build|^coverage" },
    // No `includeOnly` here — it would silently disable not-to-dev-dep by
    // filtering out node_modules edges. Each rule above already scopes itself
    // with `from.path` to the directories that matter.
    reporterOptions: {
      dot: { collapsePattern: "^node_modules/(@[^/]+/[^/]+|[^/]+)" },
      archi: {
        collapsePattern:
          "^(node_modules|packages|src|lib|app)/[^/]+|^(src/[^/]+/[^/]+)",
      },
    },
  },
};
```

### TypeScript project

Critical bit is `tsConfig` — without it, path aliases don't resolve and the whole report is noise.

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      from: { pathNot: "^(node_modules)" },
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig(\\.[^/]+)?\\.json$",
          "(^|/)(babel|webpack|vite|rollup|tsup|tsconfig)\\.config\\.(js|cjs|mjs|ts)$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      from: { pathNot: "^node_modules" },
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"],
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      from: {
        path: "^(src|app|lib)",
        pathNot: "\\.(spec|test|stories)\\.(js|jsx|ts|tsx)$",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-duplicate-dep-types",
      severity: "warn",
      from: {},
      to: { moreThanOneDependencyType: true },
    },
    {
      name: "not-to-spec",
      severity: "error",
      from: { pathNot: "\\.(spec|test)\\.(js|jsx|ts|tsx)$" },
      to: { path: "\\.(spec|test)\\.(js|jsx|ts|tsx)$" },
    },
    {
      name: "not-to-test",
      severity: "error",
      from: { pathNot: "^(test|spec|__tests__)" },
      to: { path: "^(test|spec|__tests__)" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
      dependencyTypes: [
        "npm", "npm-dev", "npm-optional", "npm-peer", "npm-bundled", "npm-no-pkg",
      ],
    },
    exclude: {
      // Note: deliberately do NOT exclude `\\.d\\.ts$` here. With
      // tsPreCompilationDeps + mainFields:["main","types","typings"], npm
      // packages resolve to their .d.ts entry. A blanket .d.ts exclude would
      // drop those resolved nodes from the graph, silently disabling rules
      // like not-to-dev-dep. The no-orphans rule below has its own .d.ts
      // exclusion so project-internal type declarations still won't appear
      // as orphans.
      path: "^dist|^build|^coverage|^\\.next|^out|^storybook-static",
    },
    // Note: deliberately no `includeOnly`. It is a graph-level filter that
    // drops node_modules edges before rules run, which silently breaks
    // not-to-dev-dep (and any other rule scoped to npm/npm-dev/core types).
    // Each rule above already scopes itself with `from.path`, which is the
    // correct way to limit a rule's domain. See Gotchas for the full story.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["main", "types", "typings"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    reporterOptions: {
      dot: { collapsePattern: "^node_modules/(@[^/]+/[^/]+|[^/]+)" },
      archi: {
        collapsePattern:
          "^(node_modules|packages|src|app|lib)/[^/]+|^(src/[^/]+/[^/]+)",
      },
    },
  },
};
```

### Monorepo (pnpm/yarn/npm workspaces)

For a `packages/*` layout where each package has its own `src`:

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-cross-package-internals",
      severity: "error",
      comment:
        "Packages may only import each other through their published entry point, not by reaching into src.",
      from: { path: "^packages/([^/]+)/src" },
      to: {
        path: "^packages/([^/]+)/src",
        pathNot: "^packages/$1/src",
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      from: { pathNot: "^node_modules" },
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"],
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      from: {
        path: "^packages/[^/]+/src",
        pathNot: "\\.(spec|test)\\.(js|jsx|ts|tsx)$",
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Don't exclude `\\.d\\.ts$` globally — see the Gotchas section.
    exclude: { path: "/dist/|/build/|/coverage/" },
    // No `includeOnly` either — same reason. Each rule above is already
    // scoped with `from.path: "^packages/..."`, which is the correct way
    // to limit a rule's domain without dropping node_modules edges.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["main", "module", "types"],
    },
    reporterOptions: {
      archi: { collapsePattern: "^packages/[^/]+/src/[^/]+" },
    },
  },
};
```

---

## Programmatic API

Use the Node API when the CLI isn't enough: custom lint rules, monorepo orchestration, vite/webpack plugins that check cycles on hot reload, or tooling that consumes the dependency graph as data.

### The `cruise` function

```ts
import { cruise } from "dependency-cruiser";
import type { ICruiseOptions, IReporterOutput } from "dependency-cruiser";

const result: IReporterOutput = await cruise(
  ["src"],         // files, dirs, or globs to cruise
  cruiseOptions,   // ICruiseOptions
  resolveOptions,  // optional enhanced-resolve options
  transpileOptions // optional { tsConfig, babelConfig }
);
```

`cruise` is **async** in recent versions. Older (v12 and earlier) versions were synchronous — always `await` it in modern code.

### Minimal example

```js
import { cruise } from "dependency-cruiser";

const result = await cruise(["src"]);
console.dir(result.output, { depth: 10 });
```

### With options

```ts
import { cruise, type ICruiseOptions } from "dependency-cruiser";

const cruiseOptions: ICruiseOptions = {
  // Note: omit `includeOnly` here. It would drop node_modules edges from
  // the graph and silently break any rule scoped to dependencyTypes
  // (npm-dev, npm, core, etc). Use `from.path` on individual rules instead.
  doNotFollow: { path: "node_modules" },
  tsPreCompilationDeps: true,
  validate: true,
  ruleSet: {
    forbidden: [
      {
        name: "no-circular",
        severity: "error",
        from: {},
        to: { circular: true },
      },
    ],
  },
  outputType: "json",
};

const result = await cruise(["src"], cruiseOptions);
```

### The ruleSet gotcha

**In on-disk config, `forbidden`/`allowed`/`required` are top-level. In the API's `ICruiseOptions`, they must be nested under `ruleSet`.** If you load a config with `extractDepcruiseConfig` and pass it straight to `cruise`, the rules won't be applied.

```js
// Wrong
const cfg = await extractDepcruiseConfig("./.dependency-cruiser.cjs");
const result = await cruise(["src"], cfg); // rules ignored

// Right
const cfg = await extractDepcruiseConfig("./.dependency-cruiser.cjs");
const result = await cruise(["src"], {
  ...cfg.options,
  ruleSet: {
    forbidden: cfg.forbidden,
    allowed: cfg.allowed,
    required: cfg.required,
    allowedSeverity: cfg.allowedSeverity,
  },
  validate: true,
});
```

### Result shape

```ts
interface IReporterOutput {
  output: string | ICruiseResult; // string for text reporters, object for json
  exitCode: number;
}

interface ICruiseResult {
  modules: IModule[];
  summary: {
    violations: IViolation[];
    error: number;
    warn: number;
    info: number;
    ignore: number;
    totalCruised: number;
    totalDependenciesCruised: number;
    optionsUsed: ICruiseOptions;
    ruleSetUsed?: IRuleSet;
  };
}
```

Each `IModule` has `source`, `dependencies` (with `resolved`, `module`, `dependencyTypes`, `dynamic`, `circular`), `dependents`, and — if metrics were enabled — `instability`, `afferentCouplings`, `efferentCouplings`.

Each `IViolation` has `type` ("dependency" | "module" | "cycle" | "reachability" | "instability"), `from`, `to`, `rule: { name, severity }`, and a `cycle` array for circular violations.

Typical consumer code:

```js
const { summary } = result.output;
if (summary.error > 0) {
  for (const v of summary.violations) {
    if (v.rule.severity === "error") {
      console.error(`${v.rule.name}: ${v.from} → ${v.to}`);
    }
  }
  process.exit(1);
}
```

### Helper imports

```ts
import extractDepcruiseConfig
  from "dependency-cruiser/config-utl/extract-depcruise-config";
import extractTSConfig
  from "dependency-cruiser/config-utl/extract-ts-config";
import extractWebpackResolveConfig
  from "dependency-cruiser/config-utl/extract-webpack-resolve-config";
import extractBabelConfig
  from "dependency-cruiser/config-utl/extract-babel-config";
```

These understand `extends` chains, comments in JSON, ESM/CJS config formats, etc. Prefer them over hand-rolled `JSON.parse` / `require`.

**extractTSConfig** resolves the full effective tsconfig after `extends`, `references`, etc.:

```js
const tsConfig = await extractTSConfig("./tsconfig.json");
const result = await cruise(["src"], cruiseOptions, undefined, { tsConfig });
```

**extractWebpackResolveConfig** pulls the `resolve` section out of a webpack config, including aliases:

```js
const resolve = await extractWebpackResolveConfig("./webpack.config.js");
const result = await cruise(["src"], cruiseOptions, resolve);
```

If your webpack config exports an array of configurations, dependency-cruiser uses only the first one's `resolve`.

### Full example: vite plugin that fails the build on cycles

```ts
import { cruise, type ICruiseOptions, type ICruiseResult } from "dependency-cruiser";
import type { Plugin } from "vite";

export function noCyclesPlugin(): Plugin {
  return {
    name: "no-cycles",
    async buildStart() {
      const options: ICruiseOptions = {
        // `includeOnly` is fine here because this plugin only checks
        // no-circular, which doesn't care about npm/npm-dev edges. Don't
        // copy this pattern into a config that uses not-to-dev-dep.
        includeOnly: "^src",
        doNotFollow: { path: "node_modules" },
        tsPreCompilationDeps: true,
        validate: true,
        ruleSet: {
          forbidden: [
            {
              name: "no-circular",
              severity: "error",
              from: {},
              to: { circular: true },
            },
          ],
        },
      };

      const { output } = await cruise(["src"], options, undefined, {
        tsConfig: { fileName: "tsconfig.json" },
      });

      const result = output as ICruiseResult;
      const cycles = result.summary.violations.filter(
        (v) => v.rule.name === "no-circular"
      );

      if (cycles.length > 0) {
        for (const cycle of cycles) {
          this.warn(`Circular: ${cycle.from} → ${cycle.cycle?.join(" → ")}`);
        }
        this.error(`${cycles.length} circular dependency violation(s)`);
      }
    },
  };
}
```

### API tips

- **Pass `validate: true`** when you want rules enforced. Without it, `cruise` returns the raw graph and skips rule evaluation, even if `ruleSet` is populated.
- **Pass `tsConfig`** via the 4th argument (`{ tsConfig }`) or via `options.tsConfig`. Both work in recent versions — the 4th-argument form is what official examples use.
- **For hot-reload use cases** (a single file on save), pass just the changed file as the first argument. Cruise is fast on single files.
- **Exit code** is available as `result.exitCode` — you don't have to count violations yourself for a pass/fail signal.
- **The API follows semver in lockstep with the CLI.** Check the changelog when the CLI bumps a major version.

---

## Further reading

When the user's question goes beyond what this skill covers, these are the authoritative sources. Prefer `depcruise --help` and `depcruise --info` as the first fallback — they reflect the installed version, which is what matters.

- `depcruise --help` — full CLI flag list for the installed version.
- `depcruise --info` — which transpilers, extensions, and module systems dependency-cruiser sees in the current project. First stop for "why isn't my TS file being picked up".
- Official docs: https://github.com/sverweij/dependency-cruiser/tree/main/doc
  - `rules-reference.md` — every condition key with full semantics
  - `options-reference.md` — every option including the deep `reporterOptions` theming
  - `cli.md` — CLI companion to `--help`
  - `api.md` — the programmatic API
  - `faq.md` — TypeScript setup, webpack config, performance tuning
- npm: https://www.npmjs.com/package/dependency-cruiser
- TypeScript types: `import type { IConfiguration, ICruiseOptions, ICruiseResult } from "dependency-cruiser"` — the shipped `.d.ts` is the most accurate reference for result shapes and option keys.

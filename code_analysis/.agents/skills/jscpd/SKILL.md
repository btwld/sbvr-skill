---
name: jscpd
description: Run, configure, and interpret jscpd (the copy/paste detector) to find duplicated code blocks in a codebase. Use this skill whenever the user wants to find duplicated code, measure copy-paste technical debt, run jscpd, set up a `.jscpd.json` config, add a duplication check to CI, read a jscpd JSON/HTML report, tune min-lines/min-tokens/thresholds, or asks things like "is there duplicated code in this project", "find copy-paste", "detect clones", "check for repeated code", or mentions jscpd by name. Also use it when the user wants to pick ignore patterns, choose between strict/mild/weak modes, or decide which reporter format to emit.
---

# jscpd — copy/paste detector

jscpd finds duplicated blocks across a codebase. It tokenizes source files, then uses the Rabin-Karp algorithm to find matching token sequences. It supports 150+ languages and formats, runs as a CLI, and outputs reports in multiple formats (console, HTML, JSON, XML, Markdown, CSV, badge).

The tool ships as two things in one package:

1. **A CLI** — `npx jscpd ./src`. Use this for one-off runs, CI checks, and quick reports. Most of this skill is about the CLI because that's what users hit first.
2. **A Node/TypeScript client** — `import { detectClones } from 'jscpd'`. Use this when you're building a custom reporter, wiring jscpd into a larger build tool, filtering or transforming clone results before showing them, or consuming clones in a typed pipeline. See "Using jscpd from TypeScript / Node" near the bottom.

The tool is installed on demand via `npx jscpd` — no global install needed. For programmatic use, install it as a project dependency: `npm install --save-dev jscpd`.

## When to reach for jscpd

- The user wants to find duplicated code in a project.
- The user wants a "clones" or "copy-paste" report for code review.
- The user wants to add a duplication check to CI that fails the build past a threshold.
- The user asks about technical debt from repeated code.
- The user already has a `jscpd-report.json` or `.jscpd.json` file and wants help reading or editing it.

## How to deliver the answer (read this first)

jscpd work tends to produce a lot of artifacts: a config file, a report file, a few command runs, some boundary tests. The temptation is to dump each of these into its own file and hand the user a directory. **Don't.** Almost every jscpd request resolves to **one or two output files, total**:

- A **diagnostic question** ("why did jscpd find zero clones," "what does this report mean," "is this duplication number high") → **one** summary file. The explanation, the commands you ran, the fix, and the verification all live inside it. Inline the relevant snippets. Do not split them out.
- A **CI setup question** ("add jscpd to CI," "give me a config") → **two** files: the `.jscpd.json` and the workflow YAML. Notes go inside the YAML as comments, or inside the chat reply — not in a third file.
- A **report-reading question** → reply in chat. Do not create a file at all unless the user asked for one.

**Hard rules. No exceptions.**

1. If you find yourself about to create a third file, stop and consolidate into the first two.
2. If you find yourself writing a `README.md`, `00-START-HERE.md`, `INVESTIGATION_SUMMARY.md`, or any "index" file that exists to explain your *other* files, you have already lost. Delete the other files and put their content into the index.
3. Do not create separate `BOUNDARY_TEST.txt`, `VERIFICATION.txt`, `COMMANDS_RUN.txt`, `FINAL_CHECK.txt`, `TEST_LOG.txt`, or `QUICK_FIX.md` files. That information goes inline in the one summary file, under headings like "Commands run" or "Verification."
4. Do not create separate "executive summary" + "deep dive" pairs. Pick one document, write it well.

The user wants an answer they can read in two minutes, plus any config they actually need to drop into their repo. They do not want a folder of homework. If you catch yourself producing more than two files for a jscpd task, treat it as a bug in your own response and consolidate before replying.

## Quick start

From the project root:

```bash
npx --yes jscpd ./src
```

That's the whole tool. It prints a summary table and a list of any clones it finds. For a real run you usually want a report file, a narrower path, and tuned thresholds — see the rest of this doc.

## The one thing that trips everyone up: default thresholds hide small clones

The defaults are `min-lines: 5` and `min-tokens: 50`. A short duplicated function — say, 6 lines with 30 tokens — won't show up, because it fails the token check. If a user runs jscpd and says "it found nothing but I know there's duplication," the fix is almost always to lower `min-tokens`:

```bash
npx jscpd ./src --min-tokens 20 --min-lines 3
```

Token counts are roughly "identifiers + operators + punctuation + literals." For calibration: a 9-line JavaScript function with a `for` loop and an `if` clocks in around 57 tokens. A 16-line function with two nested objects and a couple of conditionals lands around 130. So the default 50-token floor catches anything bigger than a small helper, but routinely misses medium-sized React components, small utility functions, and short test setups. Explain this reasoning when tuning — don't just silently change the number.

Conversely, on a large codebase the defaults may be too permissive and produce noise. There, raising `min-lines` to 10 or `min-tokens` to 100 gives you only the clones worth refactoring.

## Detection modes (`--mode`)

Three quality modes control what counts as "the same":

- `strict` — every token matters, including whitespace tokens. Catches the most, noisiest.
- `mild` — default. Skips empty lines and blank-token noise. Good general setting.
- `weak` — also skips comments. Use when teams copy-paste blocks and then change comments, or when comments legitimately vary but the code is the same.

Example: `npx jscpd ./src --mode weak`

## Common CLI options

| Flag | What it does | Default |
|---|---|---|
| `-l, --min-lines` | Minimum duplicated block size in lines | 5 |
| `-k, --min-tokens` | Minimum duplicated block size in tokens | 50 |
| `-x, --max-lines` | Skip files longer than this | 1000 |
| `-z, --max-size` | Skip files bigger than this (e.g. `200kb`) | 100kb |
| `-t, --threshold` | Fail with non-zero exit if duplication % >= this | — |
| `-i, --ignore` | Glob(s) to exclude, comma-separated | — |
| `-p, --pattern` | Glob of files to include (e.g. `**/*.ts`) | — |
| `-f, --format` | Restrict to specific formats (`javascript,python`) | all |
| `-r, --reporters` | Comma-separated reporter list | `console` |
| `-o, --output` | Where report files go | `./report/` |
| `-m, --mode` | `strict` / `mild` / `weak` | `mild` |
| `-g, --gitignore` | Respect `.gitignore` | off |
| `-s, --silent` | Suppress console output | off |
| `-b, --blame` | Include git blame info in reports | off |
| `--skipLocal` | Only detect clones across different folders | off |
| `--ignoreCase` | Case-insensitive matching (experimental) | off |
| `--exitCode` | Exit code to use when clones are detected | 0 |
| `-c, --config` | Path to config file | `.jscpd.json` |

Get the full list any time with `npx jscpd --help`.

## Config file (`.jscpd.json`)

For anything beyond a one-off scan, put config in `.jscpd.json` at the project root. It's easier to read, commits cleanly, and CI can use the same file as local runs.

A good starting config for a JS/TS project:

```json
{
  "threshold": 5,
  "reporters": ["console", "html", "json"],
  "output": "./jscpd-report",
  "ignore": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.map",
    "**/__snapshots__/**",
    "**/*.test.ts",
    "**/*.spec.ts"
  ],
  "gitignore": true,
  "absolute": true,
  "minLines": 5,
  "minTokens": 50,
  "mode": "mild"
}
```

Alternatively, stick the same object under a `"jscpd"` key in `package.json`.

**Why those ignores:** tests legitimately repeat setup; snapshots are generated; minified files look like one giant clone of themselves; `dist`/`build` is output, not source. If you leave these in, the report drowns in noise.

### Ignore recipes by language

The starter config above is JS/TS. For other ecosystems, swap the `ignore` array:

**Python:**
```json
"ignore": [
  "**/.venv/**", "**/venv/**", "**/__pycache__/**",
  "**/.pytest_cache/**", "**/migrations/**",
  "**/tests/**", "**/test_*.py", "**/*_test.py", "**/conftest.py"
]
```

**Java / Kotlin:**
```json
"ignore": [
  "**/target/**", "**/build/**", "**/.gradle/**",
  "**/generated/**", "**/generated-sources/**",
  "**/src/test/**", "**/*Test.java", "**/*Test.kt"
]
```

**Go:**
```json
"ignore": [
  "**/vendor/**", "**/bin/**",
  "**/*_test.go", "**/mocks/**", "**/*.pb.go"
]
```

**Rust:**
```json
"ignore": [
  "**/target/**", "**/Cargo.lock",
  "**/tests/**", "**/benches/**"
]
```

The themes are universal: skip dependencies, build output, generated/protobuf code, and tests (which legitimately repeat setup). Adjust to match the project's actual layout.

## Choosing reporters

Match the reporter to the audience:

- **`console`** — the default. Good for quick local runs. Shows a summary table.
- **`consoleFull`** — same but prints the actual duplicated code snippets. Useful when you want to eyeball clones without opening a file.
- **`html`** — an interactive report. Best for humans reviewing a one-time audit. Writes to `<output>/html/`.
- **`json`** — structured data for programmatic use or CI parsing. Writes `<output>/jscpd-report.json`.
- **`markdown`** — drops a `jscpd-report.md` you can paste into a PR or wiki.
- **`xml`** — for tools that want JUnit-style output.
- **`csv`** — for spreadsheets or custom pipelines.
- **`badge`** — generates an SVG badge you can embed in a README.
- **`threshold`** — doesn't emit a file; just enforces the threshold and exits non-zero. Combine with others in CI.

You can pass multiple: `--reporters console,html,json`.

## Reading a report

There are two paths here, and choosing the right one matters more than people expect. Most agents reach straight for the JSON reporter and write a custom analysis script. That's the wrong default.

### Path A — small reports: just read the console table

If a project has only a handful of clones (one or two pairs, a few files), the default console reporter prints everything you need: the summary table, file paths, line ranges. Don't add `--reporters json`. Don't write a script. Don't generate a `jscpd-report.json` file the user didn't ask for. Just run:

```bash
npx --yes jscpd ./src
```

…then write the user a clean two-paragraph summary: the duplication %, the offender file pair, and a one-sentence refactor suggestion. That's the deliverable. The user wanted *interpretation*, not more files.

This is the path for the vast majority of "is there duplicated code in my project" requests.

### Path B — non-trivial reports: run the bundled summarizer first

When there are enough clones that you'd have to scroll through console output to find the interesting ones (think dozens of clone pairs across many files), generate the JSON report and run the bundled `scripts/summarize_report.py` against it before doing anything else. This is the default move on any non-trivial report.

```bash
npx --yes jscpd ./src --reporters json --output ./jscpd-report --silent
python <skill_dir>/scripts/summarize_report.py ./jscpd-report/jscpd-report.json --top 5
```

Replace `<skill_dir>` with the actual path you read this SKILL.md from. The summarizer prints headline duplication %, per-language breakdown, top offender files (ranked by how many clone pairs they appear in), and the biggest individual clones with line ranges.

Two reasons to use the bundled summarizer instead of rolling your own analysis: it already handles the JSON quirks (per-clone `tokens` sometimes coming back as `0`), and reusing it keeps every invocation consistent. Don't reinvent the wheel — every minute spent writing a one-off analysis script is a minute not spent helping the user decide what to refactor.

After running the summarizer, base your written summary on what it surfaced. Open the raw JSON only if you need a field the summarizer doesn't expose.

### JSON structure reference

Use this only when you need a field the summarizer doesn't print. The `jscpd-report.json` file has two top-level keys:

```jsonc
{
  "statistics": {
    "detectionDate": "2026-04-09T...",
    "formats": {
      "javascript": {
        "sources": { /* per-file stats */ },
        "total": { "lines": 18, "tokens": 174, "clones": 1, "duplicatedLines": 7, "percentage": 38.89 }
      }
    },
    "total": { /* rolled up across all formats */ }
  },
  "duplicates": [
    {
      "format": "javascript",
      "lines": 8,
      "tokens": 57,
      "fragment": "...actual duplicated source text...",
      "firstFile":  { "name": "src/a.js", "start": 3, "end": 10, "startLoc": {"line":3,"column":6}, "endLoc": {"line":10,"column":2} },
      "secondFile": { "name": "src/b.js", "start": 3, "end": 10, "startLoc": {"line":3,"column":9}, "endLoc": {"line":10,"column":2} }
    }
  ]
}
```

When pulling signal out of this structure by hand, focus on `statistics.total.percentage` for the headline, `duplicates` length for the clone count, file-grouping for top offenders, and `lines` desc for the biggest wins. But again — `summarize_report.py` already does all of that. Reach for the raw JSON only as a last resort.

## CI integration

The two-line version: run jscpd with a threshold and a JSON report. If duplication exceeds the threshold, jscpd exits non-zero and the build fails.

```yaml
# .github/workflows/duplication.yml (excerpt)
- name: Check for code duplication
  run: npx --yes jscpd ./src --threshold 5 --reporters console,json --output ./jscpd-report
- name: Upload report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: jscpd-report
    path: jscpd-report/
```

**How to pick the threshold.** jscpd exits non-zero when the duplication percentage is *greater than or equal to* the threshold. So if your current duplication is 8%, setting `--threshold 5` fails the build immediately; setting `--threshold 10` passes. The workflow is:

1. Run jscpd locally without `--threshold` and note the current percentage.
2. Set `--threshold` slightly *above* that number (e.g., current 8% → threshold 10) so the build passes today.
3. Over time, ratchet the threshold *down* as you refactor duplication away.

Starting at `--threshold 0` on a project that already has duplication guarantees a failing build on day one, which isn't motivating.

**One limitation worth knowing:** jscpd reports a single duplication percentage for the whole scan. If a user asks "I want each microservice in my monorepo to stay under 3% individually," jscpd can't enforce that in one run — you have to invoke it once per service directory in CI, each with its own threshold. There's no built-in "per-subdirectory" check.

One quirk to warn the user about: when the threshold is exceeded, jscpd doesn't print a clean error message — it throws a stack trace from inside the threshold reporter. The build still fails correctly (exit 1), but the noisy output can look like jscpd crashed. It didn't; that's just how it signals failure.

### Anti-patterns to avoid in CI workflows

When generating a CI workflow for the user, resist these tempting-but-broken approaches. They look reasonable, they show up in copy-pasted snippets across the internet, and they all create more problems than they solve.

- **Don't roll your own threshold check with `bc` or `grep`.** Some example workflows pipe jscpd output through `grep -o '"percent":"[^"]*'` and compare with `bc`. Skip all of that. jscpd's built-in `--threshold` flag (or `"threshold"` in `.jscpd.json`) handles the comparison and sets the exit code. The shell-glue version is fragile, version-dependent on the JSON shape, and silently breaks when jscpd updates its output format.
- **The flag is `--reporters`, not `--format`.** jscpd doesn't have a `--format` flag. If you reach for `--format json`, the run will either error out or be silently ignored. Use `--reporters json` (plural).
- **Use `actions/upload-artifact@v4`, not `@v3`.** v3 is deprecated and GitHub started rejecting workflows that use it. Default to v4 unless the user has a specific reason to pin older.
- **Don't mix `ignore` and `exclude` in `.jscpd.json`.** jscpd's config key for skipping files is `ignore`. Some config snippets you'll see online use `exclude`, copying from other tools' conventions, but jscpd doesn't honor it. Put everything you want skipped under `ignore`.
- **Don't add a separate "extract percentage and post a PR comment" step unless the user explicitly asks for it.** It triples the workflow length, requires `pull-requests: write` permissions, and tends to break on the first jscpd version bump. The artifact upload is enough — anyone who wants the report can download it.
- **Don't add `continue-on-error: true` to the jscpd step.** This is the trap that sounds helpful and isn't. Agents reach for it thinking "this lets the build pass while we monitor," then dress it up as a phased rollout. It silently negates the threshold the user just asked for. The correct way to keep day-1 builds green is to set the *threshold* above the current duplication number — not to neuter the exit code. If the user said "fail builds going forward," they meant from day one, with `threshold` doing the gating. The only legitimate use of `continue-on-error: true` on jscpd is when the user has *explicitly* asked for a no-gate informational mode, and even then, set the threshold to a sane upper bound first.

The clean version is short on purpose: install nothing (`npx --yes` handles it), call jscpd once with `--threshold` and `--reporters`, upload the artifact `if: always()`, *no* `continue-on-error`. That's the whole pattern. If the user later wants PR comments or per-package thresholds, add them as a follow-up.

## Troubleshooting

**"It found zero clones but I know there's duplication."**
Lower `--min-tokens` (try 20) and `--min-lines` (try 3). The defaults are tuned for medium/large projects.

**"The report is full of duplicate test setup / generated code."**
Add patterns to `ignore`. Typical suspects: `**/*.test.*`, `**/__snapshots__/**`, `**/migrations/**`, `**/generated/**`, `**/*.min.js`, `**/vendor/**`.

**"It's scanning stuff it shouldn't, like `node_modules`."**
Set `"gitignore": true` in the config, or add `**/node_modules/**` to `ignore`. `gitignore: true` is usually the right move.

**"It's too slow on a big repo."**
Use `--store leveldb` to spill to disk instead of keeping everything in memory. Also raise `--min-lines` and `--min-tokens` so the tokenizer bails out earlier on small blocks.

**"I want to detect copy-paste between two separate folders but ignore duplication within each."**
Pass both paths and add `--skipLocal`: `npx jscpd ./service-a ./service-b --skipLocal`.

**"It flags boilerplate that legitimately has to be duplicated (DTOs, imports, generated code)."**
You have two different tools here and they work at different levels:

- *Inline comment markers* — wrap a specific block in `// jscpd:ignore-start` and `// jscpd:ignore-end` (use the appropriate comment syntax for the language). jscpd will skip that exact block during detection. Best when a single known section is the problem and you can touch the source.
- *Regex ignore pattern* — pass `--ignore-pattern "<regex>"` (or `"ignorePattern"` in the config file) to skip any block whose content matches the regex. Best when the boilerplate pattern is widespread and you don't want to edit every file — e.g., `--ignore-pattern "^import .*"` to strip import blocks from consideration.

Use the comment markers for surgical exclusions, the regex for cross-cutting patterns.

**"Which mode should I use?"**
Start with `mild` (default). Move to `weak` if teams copy code and tweak comments. Use `strict` only when you specifically want to catch whitespace-identical clones.

## Using jscpd from TypeScript / Node

The CLI is a thin wrapper around a real programmatic API. Reach for the client (not the CLI) when you need to: filter/transform/enrich clones before reporting, build a custom reporter (Slack, Jira, custom SARIF), embed jscpd inside a larger tool where spawning a subprocess is awkward, or consume clones in a typed pipeline with full IDE autocomplete. For anything that's just "run jscpd and look at a report," stick to the CLI.

### Install and basic call

```bash
npm install --save-dev jscpd
```

```typescript
import { detectClones } from 'jscpd';
import type { IOptions, IClone, IStatistic } from '@jscpd/core';

const clones: IClone[] = await detectClones({
  path: ['./src'],
  minTokens: 30,
  minLines: 3,
  silent: true,       // suppress console output
  reporters: [],      // skip built-in reporters; handle results ourselves
});
```

TypeScript types come from `@jscpd/core`, which is a transitive dependency — you don't list it in `package.json`, but you import types from it by name. `detectClones` returns a `Promise<IClone[]>`; each element is one **pair** of duplicated locations, not one duplicated block.

### Important: jscpd 4.0.8 has a broken ESM build — use `createRequire` in ESM projects

This is the single biggest footgun with the programmatic API right now. The `jscpd` package is published as dual ESM/CJS, but the ESM chunk has a bad internal import: it references `'colors/safe'` without the `.js` extension, which Node's strict ESM resolver refuses to load. If your project has `"type": "module"` in `package.json` or your entry file is `.mjs`, the plain import above will crash at **module load time** before your code even runs:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/colors/safe'
  imported from .../node_modules/jscpd/dist/chunk-XXXXXXXX.mjs
Did you mean to import "colors/safe.js"?
```

CommonJS (`require('jscpd')`) is unaffected — use it if your project is CJS and skip the rest of this section.

**Workaround for ESM projects** — use `createRequire` to load the CJS build. One-line fix, types still work:

```typescript
import { createRequire } from 'module';
import type { IClone, IOptions, IStatistic } from '@jscpd/core';
const require = createRequire(import.meta.url);
const { detectClones } = require('jscpd') as typeof import('jscpd');

const clones: IClone[] = await detectClones({ path: ['./src'], silent: true, reporters: [] });
```

If you can't add `createRequire` (say, a strict-ESM downstream tool), fall back to shelling out to the CLI via `execSync` and parsing the JSON reporter file — see "JSON structure reference" above for the shape. It's uglier but it bypasses the broken chunk entirely.

Remove the workaround once jscpd ships a fixed ESM build. Don't skip it — an unguarded `import { detectClones } from 'jscpd'` in an ESM project will fail at runtime, not at build time, and it's easy to miss in testing.

### The option shape (`IOptions`)

All fields are optional. The most useful ones, by purpose:

```typescript
interface IOptions {
  // what to scan
  path?: string[]; pattern?: string; ignore?: string[];
  format?: string[];          // e.g. ['javascript','typescript']
  gitignore?: boolean;        // recommended: true

  // thresholds
  minLines?: number;          // default 5
  minTokens?: number;         // default 50
  maxLines?: number; maxSize?: string;  // skip oversized files
  threshold?: number;         // fail when duplication % >= this (CLI)
  exitCode?: number;          // CLI-only

  // detection tuning
  mode?: (token: IToken) => boolean;  // see "mode gotcha" below
  ignorePattern?: string[];   // regex content-skips (e.g. imports)
  skipLocal?: boolean; ignoreCase?: boolean;

  // output
  reporters?: string[];       // ['console','json','html']; pass [] for none
  reportersOptions?: Record<string, unknown>;
  output?: string;            // directory for report files
  silent?: boolean; blame?: boolean;

  // plumbing
  store?: string;             // 'leveldb' for on-disk store on big repos
  cache?: boolean;
  hashFunction?: (value: string) => string;
}
```

Three gotchas:

- `reporters: []` disables built-in output. If you leave `reporters` unset, jscpd defaults to `['console']` and will print to stdout even when you're capturing clones programmatically. Set `reporters: []` and `silent: true` for a clean library-style call.
- `gitignore: true` is almost always what you want for a real project. The CLI defaults it to off; the programmatic API follows the same default. Set it explicitly.
- **`mode` must be a function, not a string, when you call `detectClones` directly.** The CLI converts `--mode mild` to the actual `mild` function behind the scenes (via `getModeHandler`), but `detectClones` does not. Passing `mode: 'mild'` programmatically crashes later in the detector with `mode is not a function`. The safe moves are (a) omit `mode` entirely — the default is `mild`, which is what most people want — or (b) import the function:
  ```typescript
  import { mild, weak, strict } from '@jscpd/core';
  await detectClones({ path: ['./src'], mode: weak, silent: true, reporters: [] });
  ```
  In a `.jscpd.json` config file or on the CLI, the string form is still fine — the parsing layer does the conversion. The trap is specifically the in-process `detectClones` call.

### The clone shape (`IClone`)

This is what `detectClones` returns **in memory**:

```typescript
interface IClone {
  format: string;          // language, e.g. "javascript"
  isNew?: boolean;
  foundDate?: number;      // epoch ms
  duplicationA: {
    sourceId: string;      // file path
    start: ITokenLocation; // { line, column, position }
    end:   ITokenLocation;
    range: [number, number]; // [startPos, endPos] byte offsets
    fragment?: string;       // the duplicated source text (if captured)
    blame?: IBlamedLines;    // git blame, only when options.blame === true
  };
  duplicationB: { /* same shape as duplicationA */ };
}

interface ITokenLocation {
  line: number;
  column: number;
  position: number;
}
```

Each `IClone` describes **one pair** — the same code in location A and location B. Clone size in lines is `duplicationA.end.line - duplicationA.start.line + 1`. Clone size in tokens lives on the statistic object (see below), not on `IClone` itself.

**Heads up — the in-memory shape and the JSON reporter file shape are different.** `detectClones` hands you objects with `duplicationA` / `duplicationB` (above). The `jscpd-report.json` file written by the JSON reporter uses the legacy shape with `firstFile` / `secondFile` / `startLoc` / `endLoc` — see the "JSON structure reference" section up above. If you mix them up (use `clone.firstFile` on an in-memory `IClone`, or `dup.duplicationA` after parsing the JSON file), you'll get `undefined` with no error. Pick the shape based on **where the data came from**, not what the docs of some other tool say.

### Getting statistics alongside clones

`detectClones` returns only clones, not stats. For totals (lines scanned, duplication %, per-format breakdown) either write a custom reporter — see next section — or re-parse the JSON file jscpd writes when `'json'` is in `reporters`. The `IStatistic` shape from `@jscpd/core` exposes `total` (a row with `lines`, `tokens`, `duplicatedLines`, `duplicatedTokens`, `clones`, `percentage`, `percentageTokens`) and a per-format breakdown in `formats`.

### Writing a custom reporter

Reporters are the cleanest extension point. The contract is one method:

```typescript
import type { IReporter, IClone, IStatistic } from '@jscpd/core';

class SlackReporter implements IReporter {
  constructor(private webhookUrl: string) {}

  report(clones: IClone[], statistic: IStatistic | undefined): void {
    if (clones.length === 0) return;
    const summary = `Found ${clones.length} clone pairs — ${statistic?.total.percentage ?? 0}% duplication`;
    // fire-and-forget webhook POST
    void fetch(this.webhookUrl, {
      method: 'POST',
      body: JSON.stringify({ text: summary }),
    });
  }
}
```

jscpd's public API wires reporters by string name (`reporters: ['console', 'json']`), resolving each to a module. Two practical ways to plug in a class like `SlackReporter`:

1. **Call your reporter yourself after `detectClones` returns.** Recommended:
   ```typescript
   const clones = await detectClones({ path: ['./src'], reporters: [], silent: true });
   new SlackReporter(process.env.SLACK_HOOK!).report(clones, undefined);
   ```
2. **Publish the reporter as a package and name it in `reporters`** (how the built-in HTML and badge reporters work). Only worth it when jscpd needs to own the lifecycle, e.g. a CLI users run directly.

Default to option 1. It keeps the reporter plain TypeScript, trivial to unit test, and decoupled from jscpd's plugin resolver.

### Error handling and edge cases

`detectClones` rejects rather than throwing synchronously, so always `await` inside `try`. Failure modes:

- **Empty repo / no matching files** → resolves with `[]`. Check `clones.length` and handle "nothing to scan" explicitly; an empty array is not an error.
- **Path doesn't exist** → rejects with a filesystem error. Validate `path` entries before calling.
- **Threshold exceeded** → `detectClones` does **not** throw on threshold breaches; that's CLI-only (via `exitCode`). If you want to fail a build from code, compute the percentage yourself and throw.
- **Huge repo OOM** → set `store: 'leveldb'` to spill to disk. Resolved by name through `@jscpd/leveldb-store`.
- **Mixed formats** → pass `format: ['javascript', 'typescript']` to scope detection; without it, jscpd scans everything it recognizes.

Pattern for a safe library-style call:

```typescript
async function runJscpd(paths: string[]): Promise<IClone[]> {
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`jscpd: path does not exist: ${p}`);
  }
  try {
    return await detectClones({
      path: paths,
      minTokens: 30,
      minLines: 3,
      gitignore: true,
      silent: true,
      reporters: [],
    });
  } catch (err) {
    throw new Error(`jscpd failed: ${(err as Error).message}`);
  }
}
```

### The argv-style entry point (legacy)

There's also a `jscpd(argv: string[])` export that takes command-line arguments as an array (the first two slots are placeholders for `node` and the script name, mirroring `process.argv`). It exists so the CLI and programmatic API can share one implementation. **Don't use it for new integrations** — no typed options, prints to stdout unless you pass `--silent`. Prefer `detectClones`.

### Quick decision table

| You want to... | Use |
|---|---|
| Scan a repo once and look at the report | CLI (`npx jscpd`) |
| Run a duplication check in CI with a threshold | CLI + `.jscpd.json` + `threshold` |
| Filter clones by directory/author before reporting | `detectClones` + your own filter |
| Post clone results to Slack / Jira / a dashboard | `detectClones` + a custom reporter |
| Wrap jscpd inside another Node tool | `detectClones` |

## One last thing

jscpd is a detector, not a refactoring tool. It tells you where the duplication is; it doesn't fix it. When the user gets a report, the next useful step is usually to look at the top 3-5 clones and decide which are worth extracting into a shared function, which are coincidental (two different things that happen to look alike), and which should just be marked ignored. Offer to help with that follow-up work once they have the report.

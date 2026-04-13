---
name: lizard
description: Use when working with terryyin/lizard, the Python static-analysis CLI for code complexity metrics and threshold-based warnings. Trigger on requests to run or interpret Lizard analysis, generate `lizard.csv`, inspect NLOC/CCN/token/parameter counts, configure complexity thresholds or CI warnings, or disambiguate this tool from unrelated projects named Lizard.
---

# Lizard

Treat `Lizard` in this repo as [`terryyin/lizard`](https://github.com/terryyin/lizard), the Python CLI, not any unrelated project with the same name.

## Core Workflow

1. Confirm the tool: run `lizard --version` or `python3 -m lizard --version`.
2. Start with the repo's baseline CSV flow when the task is broad: `lizard --csv "$TARGET_DIR"`.
3. Read the per-function metrics first: `nloc`, `CCN`, `token_count`, and `parameter_count`.
4. Add thresholds only when the user wants gating or hotspot detection:
   - `-C <n>` for cyclomatic complexity
   - `-L <n>` for function length
   - `-a <n>` for parameter count
   - `-T field=value` for field-specific thresholds
5. Choose an output format for the task:
   - default table for quick terminal inspection
   - `--csv` for spreadsheets or scripted post-processing
   - `--xml`, `--checkstyle`, or `--html` for CI/reporting
6. If warnings matter in CI, pair thresholds with `-w` or `--warnings_only` and control failure behavior with `-i`.

## Working Rules

- Prefer analyzing a specific target directory instead of the whole repo when the user asks about one package or folder.
- Keep the command explicit in answers. Do not assume wrapper scripts exist unless you verified them in the repo.
- Explain the columns when summarizing results; do not dump raw CSV without interpretation.
- When comparing hotspots, sort by the metric the user actually cares about: `CCN`, `nloc`, `token_count`, or `parameter_count`.
- Mention that Lizard supports many languages, including JavaScript, TypeScript, Python, Java, C/C++, Go, Rust, Swift, Kotlin, and Vue, when cross-language analysis matters.
- Mention copy-paste detection and other extensions only at a high level unless you verify the exact extension command from upstream docs or the local environment.

## Repo-Specific Usage

Use this repo pattern as the default starting point when the user asks for a broad scan or a `lizard.csv` artifact:

```bash
lizard --csv "$TARGET_DIR"
```

For this workspace's analyzer wrapper, prefer a git-aware file list when the target is a git repo:

```bash
git -C "$TARGET_DIR" ls-files --cached --others --exclude-standard > /tmp/lizard-files.txt
(cd "$TARGET_DIR" && lizard --csv -f /tmp/lizard-files.txt)
```

If the target is not a git repo, fall back to explicit excludes such as `-x "*/node_modules/*"` and `-x "*/dist/*"`.

If a wrapper script is expected, verify the script path in the repo before claiming it exists. In this workspace, the command itself is the reliable baseline.

## Metrics Guide

- `nloc`: non-comment lines of code in the function
- `CCN`: cyclomatic complexity number
- `token_count`: token count for the function
- `parameter_count`: parameter count for the function

Use `references/cli-reference.md` when you need concrete command recipes, output formats, or threshold examples.

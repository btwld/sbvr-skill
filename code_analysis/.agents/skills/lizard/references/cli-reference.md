# Lizard CLI Reference

Upstream:
- PyPI: https://pypi.org/project/lizard/
- GitHub: https://github.com/terryyin/lizard

Verified for this skill on 2026-04-09:
- PyPI package: `lizard`
- Current version at validation time: `1.21.3`
- Release upload timestamp: `2026-03-30T08:36:55Z`
- Local binary in this workspace: `lizard --version` returns `1.21.3`

## What Lizard Reports

Lizard is a Python-based static-analysis CLI that scans source files and reports per-function metrics:

- `nloc`
- `CCN`
- `token_count`
- `parameter_count`

It supports many languages, including:

- JavaScript / JSX
- TypeScript / TSX
- Python
- Java
- C / C++
- Go
- Rust
- Swift
- Kotlin
- Vue

It can also emit multiple report formats and supports extensions such as copy-paste detection.

## Command Recipes

Check the installed version:

```bash
lizard --version
```

Run a broad recursive scan:

```bash
lizard path/to/target
```

Generate CSV for post-processing:

```bash
lizard --csv path/to/target > lizard.csv
```

Generate XML, HTML, or Checkstyle output:

```bash
lizard --xml path/to/target > lizard.xml
lizard --html path/to/target > lizard.html
lizard --checkstyle path/to/target > lizard-checkstyle.xml
```

Warn on high complexity, long functions, or too many parameters:

```bash
lizard -C 15 -L 100 -a 4 path/to/target
```

Show warning-style output only:

```bash
lizard -C 15 -w path/to/target
```

Control CI exit behavior when warnings are present:

```bash
lizard -C 15 -w -i 0 path/to/target
```

Filter by language:

```bash
lizard -l typescript -l javascript path/to/target
```

Exclude paths:

```bash
lizard path/to/target -x "*/node_modules/*" -x "*/dist/*"
```

Repo analyzer pattern in this workspace:

```bash
git -C path/to/target ls-files --cached --others --exclude-standard > /tmp/lizard-files.txt
(cd path/to/target && lizard --csv -f /tmp/lizard-files.txt)
```

## Interpreting Output

Use the default table for quick interactive reviews. Use CSV when you need to:

- sort functions by complexity in a spreadsheet
- compare hotspots across runs
- feed another script or report generator

Use thresholds when the task is "find the risky functions" rather than "describe the codebase." The useful starting point from upstream is `-C 15`, but treat thresholds as policy, not universal truth.

## Cautions

- Do not confuse `Lizard` with unrelated packages or products that share the name.
- Do not promise clone-detection command syntax unless you verify the installed extension support first.
- Do not claim a repo wrapper exists unless you found it locally.
- In this analyzer, prefer `.gitignore`-aware file selection for git repos and explicit `-x` excludes only as the non-git fallback.

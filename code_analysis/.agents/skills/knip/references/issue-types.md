# Knip issue types reference

Every issue Knip reports belongs to one of these types. Each has its own resolution path.

## files

**What it means:** a file matched by `project` globs but not reachable from any `entry` file through static imports.

**Formula:** `unused files = project files − (entry files + resolved files)`

**Why it might be wrong:**
- A framework plugin that would add the file as an entry isn't activating.
- The file is reached through a dynamic import or framework convention Knip doesn't know about (e.g. a custom file-router).
- The file is an entry point you forgot to declare (scripts, bin entries, serverless handlers).

**Fix:**
1. Address configuration hints first.
2. Enable or configure the appropriate plugin.
3. Add the file to `entry`.
4. As a last resort, add to `ignore` (with a comment) or use `ignoreFiles` to suppress only the files report while keeping the file in analysis.

## dependencies / devDependencies / optionalPeerDependencies

**What it means:** listed in `package.json` but no source file imports it.

**Why it might be wrong:**
- A plugin is missing → the dep is referenced in a framework config file Knip can't parse.
- The dep is only used in an unused file → fix the unused file first; this will cascade.
- It's a transitive runtime requirement (peer dep, type-only that ships with another package).
- It provides CLI binaries used only in npm scripts → should be picked up automatically, but check with `npx knip --debug`.

**Fix:** resolve any unused-files issues first; most unused-deps reports go away on their own. For the rest, add to `ignoreDependencies` with a comment explaining why.

## unlisted

**What it means:** imported in source but not declared in `package.json`. Usually a real bug — the project is relying on a transitive dependency.

**Fix:** add it to `dependencies` or `devDependencies` with your package manager. Never ignore this one without a very good reason.

## unresolved

**What it means:** an import specifier Knip couldn't resolve to a file or a package.

**Common causes:**
- Path aliases in `tsconfig.json` that Knip couldn't pick up → pass `--tsConfig` or set `paths` in knip config.
- A file extension Knip doesn't recognize (e.g. `.vue`, `.svelte`, `.css` without a plugin).
- A typo in the import.

**Fix:** verify the import actually works (`tsc --noEmit` or run the build). If it does, check plugin/path config.

## exports

**What it means:** a symbol is exported from a non-entry file but nothing imports it.

**Fix options:**
- Delete the export (the usual case).
- If it's public API, tag with `/** @public */` or add the file to `entry`.
- If it's only used inside its own file, set `ignoreExportsUsedInFile`.
- If you want entry-file exports reported too, enable `includeEntryExports`.

## types / nsExports / nsTypes

**What it means:** unused exported types, unused exports inside a namespace, unused types inside a namespace. Same logic as `exports` but for TypeScript type-land.

**Common pattern:** internal types that are exported "just in case" but only referenced in their own file. Use `ignoreExportsUsedInFile: { type: true, interface: true }` to silence the common case.

## enumMembers / classMembers

**What it means:** individual members of an exported enum or class that are never read. The enum/class itself is used, but some of its fields aren't.

**Fix:** delete the unused members, or exclude the type with `--exclude classMembers,enumMembers` if you don't want to track this granularity.

## duplicates

**What it means:** the same value is exported under two names (e.g. `export { foo }; export { foo as bar }`).

**Fix:** remove one. If the duplication is intentional (a rename for backwards compat), tag one side `/** @alias */` or use `--exclude duplicates`.

## binaries

**What it means:** a binary is referenced in `package.json` scripts but no package installs it.

**Fix:** add the providing package, or add the binary to `ignoreBinaries` if it's a system tool (`["zip", "docker-compose"]`).

---

## Priority order when fixing a report

Work in this order — each step reduces noise in the next:

1. **Configuration hints** (before anything else).
2. **Unused files** — removing these makes unused-deps and unused-exports reports shrink automatically.
3. **Unused dependencies** — after files are clean, the remaining deps reports are trustworthy.
4. **Unlisted dependencies** — always real bugs, install them.
5. **Unused exports and types** — safest to auto-fix once the rest is clean.
6. **Enum/class members, duplicates** — last pass for completeness.

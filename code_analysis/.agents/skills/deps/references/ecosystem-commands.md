# Ecosystem Commands

Use the repository's existing package manager and scripts first. These commands are safe starting points when the repo does not already define a better workflow.

## Detect manifests recursively

```bash
rg --files \
  -g 'package.json' \
  -g 'pnpm-lock.yaml' \
  -g 'yarn.lock' \
  -g 'package-lock.json' \
  -g 'go.mod' \
  -g 'pyproject.toml' \
  -g 'requirements*.txt' \
  -g 'poetry.lock' \
  -g 'Cargo.toml' \
  -g 'Gemfile'
```

If the repo is a monorepo, group findings by workspace before auditing.

## Node

Pick the command family that matches the lockfile already in the repo.

In monorepos, prefer package-manager workspace/recursive commands or loop per workspace. A single root-only run often misses package-local drift and vulnerabilities.

If the audit command requires a lockfile and the repo snapshot does not include one, avoid mutating the target tree in an audit-only pass. Either report the limitation or generate the lockfile in an isolated copy and make it explicit that the result is provisional.

### npm

```bash
npm outdated
npm audit --json
npm update <pkg>
npm install <pkg>@<version>
npm test
```

For transitive vulnerability remediation, consider `overrides` when the package can stay on the current major line.

### pnpm

```bash
pnpm outdated
pnpm audit
pnpm update <pkg>
pnpm add <pkg>@<version>
pnpm test
```

For transitive vulnerability remediation, consider `overrides` in `package.json` before taking a broader major upgrade.

### yarn

Use the repo's existing scripts first. Yarn audit commands differ between classic and berry, so confirm the project version before choosing an audit command.

If the repo uses Yarn resolutions, treat them as part of the dependency strategy rather than as an incidental config detail.

## Go

```bash
go list -m -u all
govulncheck ./...
go get <module>@<version>
go test ./...
```

Only run `go mod tidy` after an approved update, never as part of a read-only audit.

If `govulncheck` is missing:

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
```

## Python

Use the toolchain already implied by the repo.

### pip / requirements.txt

```bash
python -m pip list --outdated
pip-audit
python -m pip install --upgrade <pkg>
pytest
```

### Poetry

```bash
poetry show --outdated
poetry update <pkg>
poetry run pytest
```

If `pip-audit` is missing:

```bash
python -m pip install pip-audit
```

## Rust

```bash
cargo audit
cargo outdated
cargo update -p <crate>
cargo test
```

For a major version change, edit `Cargo.toml` first, then run `cargo update`.

If the audit tools are missing:

```bash
cargo install cargo-audit
cargo install cargo-outdated
```

## Ruby

```bash
bundle audit check
bundle outdated
bundle update <gem>
bundle exec rspec
```

If `bundler-audit` is missing:

```bash
gem install bundler-audit
```

## License notes

- Prefer an existing repo script or approved internal tool for license reporting.
- If the repo has no license tooling, say that explicitly rather than silently adding a third-party scanner.
- If no approved license tool exists, report the gap and limit the result to the license data you can verify from lockfiles, manifests, or existing package metadata.
- When in doubt, capture the package name, version, and reported license string, then apply the policy in [license-guidance.md](license-guidance.md).

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$ROOT_DIR/analyze.sh"
CLI_PATH="$ROOT_DIR/code-analysis"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local needle="$1"
  local haystack="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain '$needle'"
}

test_wrapper_delegates_to_bun_cli() {
  local workdir repo_dir out_dir stub_bin log_file output
  workdir="$(mktemp -d)"
  repo_dir="$workdir/repo"
  out_dir="$workdir/results"
  stub_bin="$workdir/bin"
  log_file="$workdir/bun.log"

  mkdir -p "$repo_dir" "$out_dir" "$stub_bin"

  cat >"$stub_bin/bun" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$*" > "$log_file"
exit 0
EOF
  chmod +x "$stub_bin/bun"

  export PATH="$stub_bin:/usr/bin:/bin"

  if ! output="$("$SCRIPT_PATH" "$repo_dir" "$out_dir" --steps git-metrics --json 2>&1)"; then
    printf '%s\n' "$output" >&2
    fail "expected analyze.sh wrapper to succeed"
  fi

  assert_contains "deprecated" "$output"
  [[ -f "$log_file" ]] || fail "expected bun to be invoked"

  local logged
  logged="$(cat "$log_file")"
  assert_contains "run" "$logged"
  assert_contains "engine/src/cli.ts" "$logged"
  assert_contains "analyze" "$logged"
  assert_contains "$repo_dir" "$logged"
  assert_contains "--out" "$logged"
  assert_contains "$out_dir" "$logged"
  assert_contains "--steps" "$logged"
  assert_contains "git-metrics" "$logged"
  assert_contains "--json" "$logged"
}

test_public_cli_delegates_to_bun_cli() {
  local workdir repo_dir out_dir stub_bin log_file
  workdir="$(mktemp -d)"
  repo_dir="$workdir/repo"
  out_dir="$workdir/results"
  stub_bin="$workdir/bin"
  log_file="$workdir/bun.log"

  mkdir -p "$repo_dir" "$out_dir" "$stub_bin"

  cat >"$stub_bin/bun" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$*" > "$log_file"
exit 0
EOF
  chmod +x "$stub_bin/bun"

  export PATH="$stub_bin:/usr/bin:/bin"

  "$CLI_PATH" analyze "$repo_dir" --out "$out_dir" --steps git-metrics --json >/dev/null 2>&1 \
    || fail "expected code-analysis wrapper to succeed"

  [[ -f "$log_file" ]] || fail "expected bun to be invoked by code-analysis"

  local logged
  logged="$(cat "$log_file")"
  assert_contains "run" "$logged"
  assert_contains "engine/src/cli.ts" "$logged"
  assert_contains "analyze" "$logged"
  assert_contains "$repo_dir" "$logged"
  assert_contains "--out" "$logged"
  assert_contains "$out_dir" "$logged"
  assert_contains "--steps" "$logged"
  assert_contains "git-metrics" "$logged"
  assert_contains "--json" "$logged"
}

test_wrapper_delegates_to_bun_cli
test_public_cli_delegates_to_bun_cli

echo "PASS: code_analysis/test_cli_wrapper.sh"

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROGRAM_NAME="$(basename "$0")"

usage() {
  cat <<EOF
Usage: $PROGRAM_NAME <project-directory> [results-directory] [--steps <csv>] [--json]

Deprecated compatibility wrapper for the TypeScript CLI.
Prefer: ./code-analysis analyze <project-directory> --out <results-directory>
EOF
}

if (($# < 1)); then
  usage >&2
  exit 1
fi

if [[ ! -d "$1" ]]; then
  printf '[warn] Target directory does not exist: %s\n' "$1" >&2
  usage >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  printf '[FAIL] bun is required to run the code-analysis CLI\n' >&2
  exit 127
fi

TARGET_DIR="$(cd "$1" && pwd)"
shift

RESULTS_DIR=""
if (($# > 0)) && [[ "$1" != --* ]]; then
  RESULTS_DIR="$1"
  shift
fi

if [[ -z "$RESULTS_DIR" ]]; then
  RESULTS_DIR="$SCRIPT_DIR/results/$(date +"%Y%m%d-%H%M%S")"
fi

mkdir -p "$RESULTS_DIR"

printf '[warn] analyze.sh is deprecated; delegating to the TypeScript CLI\n' >&2

exec bun run "$SCRIPT_DIR/engine/src/cli.ts" analyze "$TARGET_DIR" --out "$RESULTS_DIR" "$@"

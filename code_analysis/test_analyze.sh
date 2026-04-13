#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

(
  cd "$ROOT_DIR/engine"
  bun test
)

bash "$ROOT_DIR/test_cli_wrapper.sh"

echo "PASS: code_analysis/test_analyze.sh"

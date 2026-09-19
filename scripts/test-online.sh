#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/logs"
cd "$project_dir"
node scripts/browser_smoke.js 'https://zenzenzense520-bit.github.io/contradiction-analyzer/' 2>&1 | tee logs/test-online.log

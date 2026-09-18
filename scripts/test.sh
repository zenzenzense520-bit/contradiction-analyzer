#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/logs"
cd "$project_dir"
node scripts/verify.js 2>&1 | tee logs/test.log
node scripts/browser_smoke.js 2>&1 | tee -a logs/test.log

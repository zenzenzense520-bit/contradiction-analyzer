#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/logs"
cd "$project_dir"
export PYTHONIOENCODING=utf-8
uv run --no-project python scripts/build_corpus.py 2>&1 | tee logs/build.log

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required. Install from https://k6.io/docs/get-started/installation/"
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
export BASE_URL

k6 run perf/k6-kv.js

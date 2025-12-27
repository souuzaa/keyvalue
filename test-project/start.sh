#!/usr/bin/env bash
set -euo pipefail

# Start the test project server.
PORT="${PORT:-3100}" bun server.mjs

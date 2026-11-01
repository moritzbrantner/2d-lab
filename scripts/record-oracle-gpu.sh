#!/usr/bin/env bash
# Runs the oracle with both gates on the local GPU (RTX 3060 Ti) and records its report in
# docs/oracle-local-gpu.json, stamped with the commit and date. Commit that file: the report site
# (/2d-lab/oracle/) shows it as the GPU-time table, since CI has no GPU.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/target/oracle-gpu"
status=0
(cd "$root" && bun run oracle --out "$out") || status=$?
jq --arg commit "$(git -C "$root" rev-parse HEAD)" --arg date "$(date -u +%Y-%m-%d)" \
  '{commit: $commit, date: $date} + .' "$out/report.json" > "$root/docs/oracle-local-gpu.json"
echo "recorded docs/oracle-local-gpu.json (oracle exit $status)"
exit "$status"

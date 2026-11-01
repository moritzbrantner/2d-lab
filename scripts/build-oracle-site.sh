#!/usr/bin/env bash
# Assembles the oracle report site: oracle/site/ plus one oracle run's images and report.json
# (run/), the latest committed local GPU run (gpu/report.json) and build.json (commit, CI run).
# The page renders everything from those JSON files, so it cannot drift from the oracle.
# Usage: bash scripts/build-oracle-site.sh [oracle-out] [site-out]
#        (defaults target/oracle and target/oracle-site; run `bun run oracle` first)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$root/target/oracle}"
out="${2:-$root/target/oracle-site}"
rm -rf "$out"
mkdir -p "$out/run" "$out/gpu"
cp "$root"/oracle/site/* "$out/"
if [[ -f "$src/report.json" ]]; then
  cp "$src"/*.png "$src/report.json" "$out/run/" 2>/dev/null || cp "$src/report.json" "$out/run/"
fi
cp "$root/docs/oracle-local-gpu.json" "$out/gpu/report.json"
sha="${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD 2>/dev/null || true)}"
run_url=""
if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
  run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi
jq -n --arg sha "$sha" --arg run_url "$run_url" --arg date "$(date -u +%Y-%m-%d)" \
  '{sha: $sha, run_url: (if $run_url == "" then null else $run_url end), date: $date}' > "$out/build.json"
echo "oracle site ready: $out"

#!/usr/bin/env bash
# Verify the canonical PowerSync sync-config.yaml in the repo matches
# what's actually deployed to the cloud instance.
#
# Usage:
#   PS_ADMIN_TOKEN=<token> ./backend-imu/scripts/verify-powersync-config.sh
#
# Exit codes:
#   0  — repo matches live
#   1  — drift detected
#   2  — environment / setup error

set -euo pipefail

REPO_FILE="backend-imu/powersync/sync-config.yaml"
INSTANCE_ID="69cd6b238fa42c16d7f725a9"
PROJECT_ID="69cd6b22aaa9a3000762ff0b"

if [[ -z "${PS_ADMIN_TOKEN:-}" ]]; then
  echo "ERROR: PS_ADMIN_TOKEN environment variable is required" >&2
  exit 2
fi

if [[ ! -f "$REPO_FILE" ]]; then
  echo "ERROR: $REPO_FILE not found" >&2
  exit 2
fi

TMP_LIVE="$(mktemp -t ps-live-XXXXXX.yaml)"
trap 'rm -f "$TMP_LIVE"' EXIT

# Fetch live sync rules and extract just the syncRules: block
powersync fetch config \
  --instance-id "$INSTANCE_ID" \
  --project-id "$PROJECT_ID" \
  --output yaml > "$TMP_LIVE"

# The live config returns a wrapper YAML with `syncRules:` containing the rules
# as a string. We need to compare just the rules content.
LIVE_RULES="$(python3 -c "
import yaml, sys
with open('$TMP_LIVE') as f:
    cfg = yaml.safe_load(f)
print(cfg.get('syncRules', '').strip())
")"

REPO_RULES="$(cat "$REPO_FILE" | python3 -c "
import sys
content = sys.stdin.read()
print(content.strip())
")"

if [[ "$LIVE_RULES" == "$REPO_RULES" ]]; then
  echo "✓ Repo sync-config matches deployed cloud config"
  exit 0
else
  echo "✗ DRIFT DETECTED — repo and live diverge" >&2
  echo "" >&2
  diff <(echo "$REPO_RULES") <(echo "$LIVE_RULES") >&2 || true
  exit 1
fi

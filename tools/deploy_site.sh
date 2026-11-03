#!/usr/bin/env bash
# Upload the built site (./site) together with the gatekeeper worker (gate/) to Cloudflare.
# Quiet on purpose: this is a public repo, so the log shows counts only - never file names or settings.
set -euo pipefail
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || { echo "::error::CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID secrets missing"; exit 1; }
LEADERS=$(python3 -c "import json;print(','.join(json.load(open('config.json')).get('gate',{}).get('leader_positions',['Leader','Co-leader'])))")
cd gate
npm install --no-save --silent wrangler@4 >/dev/null 2>&1
if npx wrangler deploy --var LEADER_POSITIONS:"$LEADERS" > "$RUNNER_TEMP/deploy.log" 2>&1; then
  echo "Site deployed: $(find ../site -type f | wc -l) files"
  grep -oE "[0-9]+ (new or modified )?(static )?assets?[^.]*" "$RUNNER_TEMP/deploy.log" | grep -v "/" | head -3 || true
else
  echo "::error::Cloudflare deploy failed"
  grep -iE "error|limit|exceed|too large|denied|auth" "$RUNNER_TEMP/deploy.log" | sed -E 's#[^ ]*/[^ ]*#<path>#g' | head -15
  exit 1
fi

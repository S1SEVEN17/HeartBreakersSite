#!/usr/bin/env bash
# Upload the built site (./site) together with the gatekeeper worker (gate/) to Cloudflare.
# Quiet on purpose: this is a public repo, so the log shows counts only - never file names or settings.
set -euo pipefail
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || { echo "::error::CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID secrets missing"; exit 1; }
LEADERS=$(python3 -c "import json;print(','.join(json.load(open('config.json')).get('gate',{}).get('leader_positions',['Leader','Co-leader'])))")
cd gate
npm install --no-save --silent wrangler@4 >/dev/null 2>&1

# ---- OC Payout Optimizer storage (Nov 2026): D1 "hb-oc" + KV "hb-oc-cache" ----
# Created here the first time (needs the Cloudflare token to have D1 Edit + Workers KV Storage Edit); the schema
# (gate/oc_schema.sql, IF NOT EXISTS) is applied every deploy. Their ids go into a deploy-only copy of
# wrangler.toml (wrangler.deploy.toml) - nothing to keep in the repo. If anything here fails, the site still
# deploys without them and the /oc/cpr routes answer 503 "not set up yet".
CFG=wrangler.toml
echo "off" > "$RUNNER_TEMP/oc_storage"      # banner.yml: while "off", the next update deploys again (retries the setup)
d1_id() { npx wrangler d1 list --json 2>/dev/null | python3 -c "import json,sys
try: print(next((d.get('uuid') or d.get('id')) for d in json.load(sys.stdin) if d.get('name')=='hb-oc'))
except Exception: pass"; }
kv_id() { npx wrangler kv namespace list 2>/dev/null | python3 -c "import json,sys
try: print(next(n['id'] for n in json.load(sys.stdin) if n.get('title') in ('hb-oc-cache','hb-gate-hb-oc-cache')))
except Exception: pass"; }
# (|| true: "not found yet" must never stop the deploy - set -e / pipefail)
D1=$(d1_id || true); [ -n "$D1" ] || { npx wrangler d1 create hb-oc >/dev/null 2>&1 || true; D1=$(d1_id || true); }
KV=$(kv_id || true); [ -n "$KV" ] || { npx wrangler kv namespace create hb-oc-cache >/dev/null 2>&1 || true; KV=$(kv_id || true); }
if [ -n "$D1" ]; then
  if npx wrangler d1 execute hb-oc --remote --file=oc_schema.sql -y > "$RUNNER_TEMP/d1.log" 2>&1; then
    cp wrangler.toml wrangler.deploy.toml
    printf '\n[[d1_databases]]\nbinding = "OC_DB"\ndatabase_name = "hb-oc"\ndatabase_id = "%s"\n' "$D1" >> wrangler.deploy.toml
    if [ -n "$KV" ]; then printf '\n[[kv_namespaces]]\nbinding = "OC_KV"\nid = "%s"\n' "$KV" >> wrangler.deploy.toml; fi
    CFG=wrangler.deploy.toml
    echo "on" > "$RUNNER_TEMP/oc_storage"
    echo "OC storage: ready (D1$([ -n "$KV" ] && echo " + KV"))"
  else
    echo "::warning::OC storage: schema not applied - OC routes off this deploy"
    grep -iE "error|auth|permission" "$RUNNER_TEMP/d1.log" | sed -E 's#[^ ]*/[^ ]*#<path>#g' | head -5
  fi
else
  echo "::warning::OC storage: D1 database not available (the Cloudflare token may need D1 Edit) - OC routes off this deploy"
fi

if npx wrangler deploy -c "$CFG" --var LEADER_POSITIONS:"$LEADERS" > "$RUNNER_TEMP/deploy.log" 2>&1; then
  echo "Site deployed: $(find ../site -type f | wc -l) files"
  grep -oE "[0-9]+ (new or modified )?(static )?assets?[^.]*" "$RUNNER_TEMP/deploy.log" | grep -v "/" | head -3 || true
else
  echo "::error::Cloudflare deploy failed"
  grep -iE "error|limit|exceed|too large|denied|auth" "$RUNNER_TEMP/deploy.log" | sed -E 's#[^ ]*/[^ ]*#<path>#g' | head -15
  exit 1
fi

# ---- OC data feed (Nov 2026): the Worker pulls OC data from Torn itself with the site's own Torn key ----
# Copied from the GitHub secret into a Cloudflare Worker secret (encrypted; never in a file, log or address).
# Piped on stdin; the output goes to a temp file and only a yes/no is printed.
if [ -n "${TORN_API_KEY:-}" ]; then
  if printf '%s' "$TORN_API_KEY" | npx wrangler secret put HUB_TORN_KEY -c "$CFG" > "$RUNNER_TEMP/secret.log" 2>&1; then
    echo "OC data feed: key set"
  else
    echo "::warning::OC data feed: couldn't set the Worker's Torn key (the feed pull stays off)"
  fi
  rm -f "$RUNNER_TEMP/secret.log"
fi

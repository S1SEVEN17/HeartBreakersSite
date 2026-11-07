-- OC Payout Optimizer <-> Heart Breakers Hub (gatekeeper worker /oc/cpr routes, Nov 2026).
-- Contract: project doc claude/oc-optimizer-worker-contract.md. Applied by tools/deploy_site.sh on every deploy
-- (IF NOT EXISTS - safe to re-run). One row per member per env; roles = JSON text {"CrimeName|Role": passRate%}.
CREATE TABLE IF NOT EXISTS oc_cpr (
  env         TEXT    NOT NULL,          -- 'test' | 'prod'
  faction_id  INTEGER NOT NULL,          -- always 51384 (Heart Breakers)
  player_id   INTEGER NOT NULL,          -- derived from the verified key
  name        TEXT,                      -- display name at last write
  roles       TEXT    NOT NULL,          -- JSON: {"CrimeName|Role": passRate, ...}
  ts          INTEGER NOT NULL,          -- epoch ms of last write
  PRIMARY KEY (env, faction_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_cpr_lookup ON oc_cpr (env, faction_id);

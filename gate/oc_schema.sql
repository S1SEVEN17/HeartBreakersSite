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

-- OC Management (leaders' oc.html, Nov 2026): per env, key -> JSON value.
--   'disabled'  ["Crime name", ...]  crimes the OC Optimizer script should NOT suggest
--   'plan'      {teams: [{id, crime, difficulty, roles: [{position, pid, name, rate}]}], deployed, by}
CREATE TABLE IF NOT EXISTS oc_config (
  env   TEXT    NOT NULL,          -- 'test' | 'prod' ('all' for the shared Refresh cooldown)
  k     TEXT    NOT NULL,          -- 'disabled' | 'plan' | 'refresh' (last Refresh time, env 'all')
  v     TEXT    NOT NULL,          -- JSON
  ts    INTEGER NOT NULL,          -- epoch ms of last save
  by    TEXT,                      -- leader who saved it ("Name [id]")
  PRIMARY KEY (env, k)
);

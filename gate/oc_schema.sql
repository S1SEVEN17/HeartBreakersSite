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

-- OC DATA FEED (Nov 2026, project doc claude/oc-optimizer-hub-datafeed-contract.md): faction-wide OC data the Hub
-- pulls from Torn itself (Worker timer, every 3 min) and serves to the OC Optimizer script, plus members' write-backs.
--   oc_snap  one row per env + dataset ('crimes' | 'roster' | 'catalog' | 'prices'), data = JSON text as served
--            (+ 'pull:<dataset>' rows: when the Hub itself last pulled it - drives the timer's schedule)
--   oc_hist  completed (successful) crimes, one row per crime: a read sends only rows stored after the client's 'have'
--   oc_wb    last write-back per member (one per minute)
CREATE TABLE IF NOT EXISTS oc_snap (
  env    TEXT    NOT NULL,          -- 'test' | 'prod'
  ds     TEXT    NOT NULL,          -- dataset name
  as_of  INTEGER NOT NULL,          -- epoch ms the data is from
  data   TEXT    NOT NULL,          -- JSON
  by     TEXT,                      -- 'hub' or the member who wrote it back ("Name [id]")
  PRIMARY KEY (env, ds)
);
CREATE TABLE IF NOT EXISTS oc_hist (
  env          TEXT    NOT NULL,
  id           INTEGER NOT NULL,    -- Torn crime id
  executed_at  INTEGER,             -- epoch s
  as_of        INTEGER NOT NULL,    -- epoch ms the row was stored (the delta key)
  data         TEXT    NOT NULL,    -- the crime as Torn returned it (JSON)
  PRIMARY KEY (env, id)
);
CREATE INDEX IF NOT EXISTS idx_oc_hist_asof ON oc_hist (env, as_of);
CREATE INDEX IF NOT EXISTS idx_oc_hist_exec ON oc_hist (env, executed_at);
CREATE TABLE IF NOT EXISTS oc_wb (
  env        TEXT    NOT NULL,
  player_id  INTEGER NOT NULL,
  ts         INTEGER NOT NULL,
  PRIMARY KEY (env, player_id)
);

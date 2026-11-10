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

-- CHAIN WATCHING SCHEDULE (Nov 2026, project doc claude/chainwatch-hub-contract.md §10): members sign up for chain
-- watch shifts on the Members Hub (/m/chainwatch-schedule.html). Whole hours (TCT), up to 6 h, up to 7 days ahead;
-- 3 roles per hour (primary / backup / backup2); ONE registration per member at a time (until it ends).
--   est_hits / need_hits: the energy check at sign-up (hits their energy covers alone vs 1 hit per 5 min)
--   notified: the Worker's Discord "your shift is starting" ping went out (worker.js cwShiftAlerts)
CREATE TABLE IF NOT EXISTS cw_shift (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pid        INTEGER NOT NULL,
  name       TEXT,
  role       TEXT    NOT NULL,          -- 'primary' | 'backup' | 'backup2'
  start_at   INTEGER NOT NULL,          -- epoch s, on the hour (TCT = UTC)
  end_at     INTEGER NOT NULL,          -- epoch s
  created    INTEGER NOT NULL,          -- epoch ms
  est_hits   INTEGER,
  need_hits  INTEGER,
  notified   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cw_shift_time ON cw_shift (start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_cw_shift_pid ON cw_shift (pid, end_at);

-- NEWEST RATE PER CRIME/ROLE (Nov 2026, the user's rule: only the newest rate for each crime/role counts). oc_cpr keeps
-- ONE ts per member, so an old role looked as new as the last share. This keeps WHEN each role's rate was last read:
--   t = JSON {"Crime|Role": ms}  (worker.js ocCprTimes; written by script shares and opt-in reads, read by the planner
--   and OC Management to compare against history rates). Rows without a key fall back to oc_cpr.ts.
CREATE TABLE IF NOT EXISTS oc_cpr_t (
  env        TEXT    NOT NULL,
  faction_id INTEGER NOT NULL,
  player_id  INTEGER NOT NULL,
  t          TEXT    NOT NULL,
  PRIMARY KEY (env, faction_id, player_id)
);

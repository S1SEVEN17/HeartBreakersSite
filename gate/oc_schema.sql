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
-- Chain Watch schedule Discord pings (Nov 10 2026, user): each "shift starting" message's Discord id, so the Hub
-- deletes it once the slot ends (end_at = the latest end among the shifts in that message). Kept separately from
-- cw_shift so a cancelled shift doesn't lose its message. Only the message id - never the webhook URL.
CREATE TABLE IF NOT EXISTS cw_ping (
  msg_id   TEXT PRIMARY KEY,
  end_at   INTEGER NOT NULL,          -- epoch s: delete the message once this has passed
  created  INTEGER NOT NULL,          -- epoch ms
  tries    INTEGER NOT NULL DEFAULT 0 -- failed delete attempts (given up after 20)
);
CREATE INDEX IF NOT EXISTS idx_cw_ping_end ON cw_ping (end_at);

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

-- SCRIPTS DIRECTORY (Nov 10 2026, user): the members' Hub page scripts.html lists the faction's userscripts; leaders
-- add / edit / remove the listings there (worker.js scriptsRoute). Only listing text + links - no code is hosted.
CREATE TABLE IF NOT EXISTS hub_script (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',   -- one line under the name
  description TEXT NOT NULL DEFAULT '',   -- the full listing (plain text; line breaks and https links kept)
  install_url TEXT NOT NULL DEFAULT '',   -- https only (Greasy Fork page, .user.js, ...)
  version     TEXT NOT NULL DEFAULT '',
  created     INTEGER NOT NULL,           -- epoch ms
  updated     INTEGER NOT NULL,           -- epoch ms
  updated_by  TEXT NOT NULL DEFAULT ''    -- leader's Torn name
);

-- CHAIN WATCH SHIFT ATTENDANCE (Nov 10 2026, user): per shift, time the watcher spent in the queue (not away) and
-- their landed hits during it - written by the ChainRoom while the shift runs. No row for an ended shift = the room
-- never saw them in the queue (missed). Removed with the shift when it's cancelled / removed.
CREATE TABLE IF NOT EXISTS cw_att (
  shift_id    INTEGER PRIMARY KEY,      -- cw_shift.id
  in_queue_s  INTEGER NOT NULL DEFAULT 0,
  hits        INTEGER NOT NULL DEFAULT 0,
  first_in    INTEGER,                  -- epoch s: first time in the queue during the shift
  updated     INTEGER NOT NULL          -- epoch ms
);

-- RECRUITMENT (Nov 11 2026, user): recruits shared from the Torn Recruit Scout userscript to the Leaders Hub's
-- Recruitment page (leaders' recruitment.html, worker.js rcScriptRoute / rcLeaderRoute). One row per recruit.
--   data       JSON scouting snapshot as the script sent it (level, battle-stat estimate, ranked war hits, last action,
--              activity, which checks passed ...) - replaced on every push; claim / status / note are never touched by a push
--   claim_*    the leader handling this recruit ("I'm messaging them") so leaders don't double-message
--   status     'new' | 'contacted' | 'joined' | 'declined' (+ who set it, when)
--   note       one shared note every leader sees (+ who wrote it, when)
--   removed_at a leader removed it: hidden from the page, and auto-sends from the script skip it (a MANUAL send from
--              the script brings it back). Removed rows are deleted for good after 180 days.
CREATE TABLE IF NOT EXISTS rc_recruit (
  pid         INTEGER PRIMARY KEY,      -- the recruit's Torn id
  name        TEXT,
  data        TEXT    NOT NULL,         -- JSON
  sent_by     TEXT,                     -- leader who last sent it ("Name [id]")
  first_sent  INTEGER NOT NULL,         -- epoch ms
  updated     INTEGER NOT NULL,         -- epoch ms of the last push
  status      TEXT    NOT NULL DEFAULT 'new',
  status_by   TEXT,
  status_at   INTEGER,
  claim_pid   INTEGER,
  claim_name  TEXT,
  claim_at    INTEGER,
  note        TEXT    NOT NULL DEFAULT '',
  note_by     TEXT,
  note_at     INTEGER,
  removed_at  INTEGER,
  removed_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_rc_recruit_upd ON rc_recruit (removed_at, updated);

-- Heart Breakers Hub script: sharing FROM THE SCRIPT (Nov 11 2026) - the member's key stays on their device; only the
-- readings arrive here. One row per member; everything off = row deleted. (The Worker also creates it on first use.)
CREATE TABLE IF NOT EXISTS sx_share (
  pid     INTEGER PRIMARY KEY,
  name    TEXT,
  bs      TEXT    NOT NULL DEFAULT 'off',   -- battle stats: off | leaders | faction
  ws      TEXT    NOT NULL DEFAULT 'off',   -- work stats:   off | leaders | faction
  ready   INTEGER NOT NULL DEFAULT 0,       -- war readiness on
  oc      INTEGER NOT NULL DEFAULT 0,       -- OC pass rates on (rates go to oc_cpr)
  cw      INTEGER NOT NULL DEFAULT 0,       -- chain timer readings during live chains on
  bs_s    TEXT,                             -- JSON [[day, str, def, spd, dex], ...] once a day
  ws_s    TEXT,                             -- JSON [[day, man, int, end], ...]
  rd      TEXT,                             -- JSON latest readiness reading
  rd_at   INTEGER,                          -- ms
  since   INTEGER,
  updated INTEGER
);

-- Sharing sources (Nov 11 2026): who wrote OC pass rates and when - "site" (Hub key), "script" (Hub script),
-- "ocopt" (OC Optimizer script). Shown on View my shared data and to leaders. (The Worker also creates it.)
CREATE TABLE IF NOT EXISTS share_src (
  pid  INTEGER NOT NULL,
  kind TEXT    NOT NULL,    -- 'oc'
  src  TEXT    NOT NULL,    -- 'site' | 'script' | 'ocopt'
  ts   INTEGER NOT NULL,    -- ms, last write
  PRIMARY KEY (pid, kind, src)
);

-- SCRIPT USERS (Nov 12 2026, user): the last time each member asked for their OC assignment (POST /oc/plan, /oc/bundle -
-- the OC Optimizer script). At most one write per member an hour. Used by the planner (script users first when it's
-- close) and the OC Management page ("no script" flag). No key, no name.
CREATE TABLE IF NOT EXISTS oc_seen (
  env TEXT    NOT NULL,
  pid INTEGER NOT NULL,
  ts  INTEGER NOT NULL,          -- epoch ms
  PRIMARY KEY (env, pid)
);

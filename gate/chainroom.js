/* ============================================================================
 * Faction Chain Watch — Hub backend (ChainRoom Durable Object + /cw/* routes)
 *
 * Phase 1 of the Chain Watch migration off Firebase (project doc claude/chainwatch-hub-contract.md).
 * Imported by gate/worker.js: `export {ChainRoom}` (so wrangler can bind the class) and cwRoute for /cw/*.
 * Leaders change the settings on /l/chainwatch.html (worker.js cwLeaderRoute -> D1 oc_config 'chainwatch'), which
 * pokes this object's /config so every connected script gets the new values at once.
 *
 * WHAT THIS IS
 *   One Durable Object instance per faction ("ChainRoom"). It is the single source of truth for the shared
 *   chain-watch layer: the chain timer, the queue, retaliations, queued members' online/idle status, and the
 *   faction settings. It holds the members' WebSocket connections and PUSHES every change to all of them the
 *   instant it happens. It reads Torn ONCE for the whole faction on a self-scheduled alarm (Hub key HUB_TORN_KEY,
 *   Torn V2, key in the Authorization header - never in the address), and folds in the chain readings scripts send
 *   from their own keys (which can only ever make the timer look *shorter* — contract §3).
 *
 * WHY A DURABLE OBJECT
 *   - It holds the ~50 live WebSockets and broadcasts to them with no polling.
 *   - Own storage + one self-scheduled alarm, so the poll loop lives in one place and survives restarts.
 *   - WebSocket *hibernation* API + alarms only (never setInterval) + an automatic ping/pong reply that doesn't wake
 *     the object: it sleeps between events, which keeps it inside the Free plan (§8).
 *
 * IDENTITY MODEL (OC identity addendum, Nov 9 2026)
 *   The script NEVER sends its Torn key. It sends {pid, faction, name}; the Hub trusts it, scoped to Heart Breakers
 *   (FACTION_ID) and - when the Hub has a member list - to current members. Damage from a spoofed pid is contained:
 *     - one live connection per pid (a new one replaces the old),
 *     - leader rights come from the Hub's own member list (LEADER_POSITIONS), never the client,
 *     - a script's chain reading can only shorten the timer, never hide a break,
 *     - the Hub's OWN Torn reads are what move the queue on hits and drive retals.
 *
 * Changes from the first draft (Hub chat review, Nov 9 2026):
 *   - D1 binding is env.OC_DB; Torn reads are V2 with the key in the Authorization header (site rule) and V2 shapes
 *     (faction/chain, faction/attacks, faction/members - V2 'basic' has no member list).
 *   - Session secret derived from the existing Worker secrets (no hard-coded fallback, no new secret to set).
 *   - A replaced socket's close no longer drops the NEW connection; "done" retals stay done; a Hub read can't
 *     lengthen a fresher (shorter) script reading with the same count; hello re-reads members at most every 10 min
 *     and refuses pids not on the member list; /cw/sync devices keep the loop running; settings reload on save;
 *     the governor reports both levels (70% degraded / 90% fall back).
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 * CONSTANTS (contract §4/§5/§8). Timers are generous on purpose — Torn caches each key's response ~30 s, so
 * reading faster just re-reads the same bytes.
 * -------------------------------------------------------------------------- */

const TORN_COMMENT = "Heart Breakers Hub"; // on every Torn call the Hub makes (site rule)

// How often the Hub reads each thing from Torn with its OWN faction key, by room state:
// live chain / no chain but someone queued / nobody queued. Nobody connected => alarm off.
const READ_MS = {
  chain:   { live: 30000, queued: 60000, idle: 120000 },
  attacks: { live: 30000, queued: 60000, idle: 0 },      // 0 = don't read in that state
  members: { live: 60000, queued: 60000, idle: 0 },
};
const MEMBERS_HELLO_MAX_AGE_MS = 10 * 60 * 1000; // a hello re-reads the member list only if it's older than this

const RETAL_WINDOW_MS = 5 * 60 * 1000;    // a retaliation is open for 5 min after the enemy's hit
const HITTING_FLAG_MS = 45000;            // "I'm hitting now" lasts this long then auto-clears
const CALL_TTL_MS = 90000;                // a "called" retal lapses if not taken
const SCRIPT_READING_FRESH_MS = 35000;    // a script reading younger than this beats the Hub's (cached) read
const IDLE_WIPE_MS = 5 * 60 * 1000;       // chain ended + queue empty this long => clear transient data
const CONN_STALE_MS = 70000;              // a socket with no msg/ping for this long is treated as gone
const SYNC_STALE_MS = 45000;              // a /cw/sync device counts as present this long after its last sync
const SESSION_TTL_MS = 24 * 3600 * 1000;  // HMAC session token lifetime
const PING = '{"t":"ping"}', PONG = '{"t":"pong"}'; // answered by the runtime without waking the object

// Member-supplied "stats" (energy/cooldowns) — used for queue auto-remove rules (§5).
const HIT_ENERGY_COST = 25;
const BOOSTER_CD_CEILING = 24 * 3600;     // booster usable while cooldown < 24h (stacks to 24h)
const FAIL_RESULTS = ["Lost", "Stalemate", "Interrupted", "Assist", "Escape", "Timeout"]; // not a landed hit
const BONUS_HITS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const CHAIN_TIMEOUT_S = 300;              // every hit resets the chain timer to 5 minutes
const MIN_PACE_HITS_PER_HOUR = 12;        // the slowest pace that keeps a chain alive (1 hit / 5 min)
const CONFIRM_READ_GAP_MS = 10000;        // a higher count from a script -> one confirming Hub read, at most every 10 s
const RECRUIT_DAYS = 3;                   // Torn: members can't add chain hits during their first 72 h (Recruit)
// STORED-KEY CHAIN READS (away/opt-in addendum, Nov 2026): members who turned on "Chain timer (during live chains)"
const OPTIN_KEY_GAP_MS = 30000;           // each member's key at most once per 30 s (<= 2 calls/min)
const OPTIN_TICK_MS = 15000;              // live chain + usable opt-in keys: the alarm also ticks between Hub reads
const OPTIN_BAD_KEY_MS = 6 * 3600 * 1000; // a key Torn refuses is skipped this long

// Free-plan self-governor (§8): incoming DO requests per UTC day (100k free).
const DAILY_DO_REQUEST_SOFT = 70000;      // 70% -> "degraded": timers doubled
const DAILY_DO_REQUEST_HARD = 90000;      // 90% -> scripts fall back to their own reads

// Default faction settings — the current Firebase values set by Chris5295 (contract §7).
export const CW_DEFAULT_CONFIG = {
  topAlertSeconds: 90,
  restAlertSeconds: 60,
  thirdAlertSeconds: 30,
  firstAlertPrimaryOnly: true,
  minChain: 25,
  // Nov 2026 (user): alert the backup (#2) when #1 hasn't hit within this many seconds of being up
  handoffSeconds: 120,
  // Nov 2026 (user): bonus heads-up this many hits before a bonus milestone
  bonusWarnHits: 5,
  set_by: "Chris5295 [974757]",
  set_at: 0,
};
const EDIT_PATH = "/l/chainwatch.html";   // the Leaders Hub settings page (public path; the folder name stays secret)

/* ----------------------------------------------------------------------------
 * SHARED HELPERS (CORS + JSON) — the same allow-list and {ok:false,error} shape as the /oc/* endpoints
 * -------------------------------------------------------------------------- */
const CW_CORS = {
  "Access-Control-Allow-Origin": "https://www.torn.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, CW_CORS),
  });
}
function errResponse(error, status = 400) { return jsonResponse({ ok: false, error }, status); }
function factionId(env) { return Number(env.FACTION_ID) || 51384; }
function leaderPos(env, position) {
  // same rule as worker.js isLeader (LEADER_POSITIONS from config.json gate.leader_positions)
  const want = String(env.LEADER_POSITIONS || "Leader,Co-leader").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return want.includes(String(position || "").toLowerCase());
}
export function cwStub(env) { return env.CHAINROOM.get(env.CHAINROOM.idFromName(String(factionId(env)))); }

/* ----------------------------------------------------------------------------
 * SESSION TOKEN — HMAC(pid . exp). Binds a connection to a pid + 24 h TTL so the profile isn't re-sent with every
 * message. Not a security boundary (identity is client-trusted). Secret: CW_SESSION_SECRET if set, else derived
 * from the Worker's existing secrets (like the site's own session secret) — never a constant in code.
 * -------------------------------------------------------------------------- */
async function hmac(env, data) {
  const secret = env.CW_SESSION_SECRET || env.SESSION_SECRET || `${env.MEMBER_DIR}|${env.LEADER_DIR}|hb-chainwatch`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeToken(env, pid) {
  const exp = Date.now() + SESSION_TTL_MS;
  const body = `${pid}.${exp}`;
  return { token: `${body}.${await hmac(env, body)}`, exp };
}
async function verifyToken(env, token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [pid, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  const good = await hmac(env, `${pid}.${exp}`);
  if (sig.length !== good.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ good.charCodeAt(i);
  return diff === 0 && Number(pid) > 0 ? Number(pid) : null;
}

/* ----------------------------------------------------------------------------
 * ROUTER — /cw/hello, /cw/ws, /cw/sync. One ChainRoom per faction (idFromName(faction id)).
 * -------------------------------------------------------------------------- */
export async function cwRoute(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CW_CORS });
  if (!env.CHAINROOM) return errResponse("chain watch isn't set up on the Hub yet", 503);
  const path = url.pathname;

  // ---- POST /cw/hello : client-reported identity -> session token ----------
  // Body: { pid, faction, name, ver?, pda? }. No key, ever (identity addendum).
  if (path === "/cw/hello" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return errResponse("bad_json", 400); }
    const pid = Number(body && body.pid);
    if (!Number.isInteger(pid) || pid <= 0) return errResponse("missing_identity", 400);
    if (Number(body.faction) !== factionId(env)) return errResponse("wrong_faction", 403);
    // the room checks the member list (and refreshes it if older than 10 min) and works out leader rights
    const reg = await cwStub(env).fetch("https://do/register", {
      method: "POST", body: JSON.stringify({ pid, name: String(body.name || "").slice(0, 40) }),
    });
    let r = {};
    try { r = await reg.json(); } catch (e) { /* ignore */ }
    if (!r.ok) return errResponse(r.error || "not_member", 403);
    const t = await makeToken(env, pid);
    return jsonResponse({ ok: true, token: t.token, player_id: pid, name: r.name, is_leader: !!r.is_leader, expires: t.exp });
  }

  // ---- GET /cw/ws?token=...&faction=... : WebSocket upgrade --------------
  // (the token is the Hub's own session token, not a Torn key)
  if (path === "/cw/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return errResponse("expected_websocket", 426);
    const pid = await verifyToken(env, url.searchParams.get("token"));
    if (!pid) return errResponse("bad_token", 403);
    const fac = Number(url.searchParams.get("faction")) || factionId(env);
    if (fac !== factionId(env)) return errResponse("wrong_faction", 403);
    return cwStub(env).fetch(new Request(`https://do/ws?pid=${pid}`, request));
  }

  // ---- POST /cw/sync : no-WebSocket fallback (§6) --------------------------
  // Body: { token, out: [msgs §2], since }. Returns { ok, in: [msgs §3], now }.
  if (path === "/cw/sync" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return errResponse("bad_json", 400); }
    const pid = await verifyToken(env, body && body.token);
    if (!pid) return errResponse("bad_token", 403);
    const out = Array.isArray(body.out) ? body.out.slice(0, 20) : [];
    const res = await cwStub(env).fetch("https://do/sync", { method: "POST", body: JSON.stringify({ pid, out }) });
    return jsonResponse(await res.json());
  }

  return errResponse("not_found", 404);
}

/* ============================================================================
 * THE DURABLE OBJECT
 * ========================================================================== */
export class ChainRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
    this.mem = null;          // the room, loaded lazily in ensureLoaded()
    this.conns = new Map();   // pid -> { ws, name } live sockets (rebuilt from hibernated sockets after a wake)
    // pings are answered by the runtime itself: no wake-up, no billed request (§8)
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG)); } catch (e) { /* older runtime */ }
  }

  /* ---- persistence: one compact object holds the whole room ---------------- */
  async ensureLoaded() {
    if (this.mem) return;
    const saved = await this.storage.get("room");
    this.mem = Object.assign({
      chain: null,           // { current, max, cooldown, modifier, expires_at, as_of, src }
      queue: {},             // pid -> { pid, name, joined_at, hitting_until, stats, hits }
      status: {},            // pid -> { status, relative, ts }   (queued members only)
      retals: {},            // id  -> { id, attacker_id, attacker_name, attacker_faction, ts, expires_at, call_by, call_at, done }
      config: null,
      members: {},           // pid -> { name, position, is_leader }  (Hub's own faction/members read)
      membersAt: 0,
      syncSeen: {},          // pid -> last /cw/sync (ms)
      lastChainEndedAt: 0,
      usageDay: todayUTC(),
      usageCount: 0,
      level: 0,              // 0 normal, 1 degraded (>=70%), 2 fall back (>=90%)
      lastErr: "",           // last Torn error code (status line only)
      bonus: null,           // {at, pid, name, by, set_at} - a leader's "Assign bonus" (cleared once `at` is reached)
      turnUp: 0, turnUpAt: 0,// who's up (#1 eligible) and since when (for the backup alert)
      lastStats: {},         // pid -> the member's last stats report (kept after they leave the queue - schedule check)
      notices: {},           // pid -> [messages] waiting for a /cw/sync device
      cwOptin: {},           // pid -> ENCRYPTED stored key (sealed by worker.js; opened only for a chain read)
      cwOptinUsed: {},       // pid -> last time their key read the chain (ms)
      cwOptinBad: {},        // pid -> when Torn refused their key (skipped for 6 h)
      optinReads: 0, optinDay: "",
    }, saved || {});
    // Chain Watching Schedule (script addendum): kept in memory only, re-read from D1 when it changes / hourly
    this.sched = null; this.schedAt = 0; this.schedDirty = false;
    if (!this.mem.config) this.mem.config = await this.loadConfig();
    // Recover live sockets after a hibernation wake.
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment() || {};
      if (meta.pid) this.conns.set(meta.pid, { ws, name: meta.name });
    }
  }
  async save() { await this.storage.put("room", this.mem); }

  async loadConfig() {
    // D1 oc_config 'chainwatch' (saved on the Leaders Hub); defaults until a leader saves.
    try {
      if (this.env.OC_DB) {
        const row = await this.env.OC_DB.prepare("SELECT v, by, ts FROM oc_config WHERE env = 'prod' AND k = 'chainwatch'").first();
        if (row && row.v) {
          return Object.assign({}, CW_DEFAULT_CONFIG, JSON.parse(row.v), { set_by: row.by || "", set_at: Number(row.ts) || 0 });
        }
      }
    } catch (e) { /* defaults */ }
    return Object.assign({}, CW_DEFAULT_CONFIG);
  }

  /* ---- DO request router (called through cwStub) ------------------------- */
  async fetch(request) {
    await this.ensureLoaded();
    this.countUsage();
    const path = new URL(request.url).pathname;
    if (path === "/register") return this.handleRegister(request);
    if (path === "/ws")       return this.handleWsUpgrade(request, new URL(request.url));
    if (path === "/sync")     return this.handleSync(request);
    if (path === "/config")   return this.handleConfigReload();
    if (path === "/status")   return this.handleStatus(new URL(request.url).searchParams.get("detail") === "1");
    if (path === "/reading")  return this.handleWebReading(request);
    if (path === "/schedule-changed") {   // the Hub page changed a shift -> re-read + push to every script
      await this.reloadSchedule(true); this.broadcastDeltas();
      return Response.json({ ok: true });
    }
    if (path === "/cw-optin") {   // worker.js: the full list of "Chain timer" opt-ins {pid: sealed key} (save + every 15 min)
      let b = {}; try { b = await request.json(); } catch (e) { /* ignore */ }
      const list = b && b.members && typeof b.members === "object" ? b.members : {};
      const next = {};
      Object.keys(list).forEach((p) => { if (Number(p) > 0 && typeof list[p] === "string" && list[p]) next[Number(p)] = list[p]; });
      this.mem.cwOptin = next;
      Object.keys(this.mem.cwOptinBad).forEach((p) => { if (!next[p]) delete this.mem.cwOptinBad[p]; });
      await this.save();
      return Response.json({ ok: true, count: Object.keys(next).length });
    }
    if (path === "/laststats") {   // schedule page: one member's last stats report (worker.js, signed-in member's own)
      const pid = Number(new URL(request.url).searchParams.get("pid"));
      return Response.json({ ok: true, stats: this.mem.lastStats[pid] || null });
    }
    return new Response("not found", { status: 404 });
  }

  /* ---- /register : member check + leader rights (from /cw/hello) ---------- */
  async handleRegister(request) {
    const body = await request.json();
    const pid = Number(body.pid);
    if (Date.now() - (this.mem.membersAt || 0) > MEMBERS_HELLO_MAX_AGE_MS) await this.readMembers(Date.now());
    const haveList = Object.keys(this.mem.members).length > 0;
    const m = this.mem.members[pid];
    await this.save();
    // with a member list: current members only. Without one (Torn down): trust the client, like the OC endpoints.
    if (haveList && !m) return Response.json({ ok: false, error: "not_member" });
    return Response.json({ ok: true, name: (m && m.name) || body.name || "", is_leader: !!(m && m.is_leader) });
  }

  /* ---- /ws : accept the socket with hibernation --------------------------- */
  async handleWsUpgrade(request, url) {
    const pid = Number(url.searchParams.get("pid"));
    if (!pid) return new Response("no pid", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const name = (this.mem.members[pid] && this.mem.members[pid].name) || "Unknown";
    server.serializeAttachment({ pid, name, seen: Date.now() });
    this.state.acceptWebSocket(server);

    // One live connection per member (§1): the older one is closed.
    const existing = this.conns.get(pid);
    if (existing && existing.ws && existing.ws !== server) {
      try { existing.ws.close(1000, "replaced"); } catch (e) { /* ignore */ }
    }
    this.conns.set(pid, { ws: server, name });

    await this.ensureAlarm();                       // first connection: start the read loop
    if (!this.sched) await this.reloadSchedule(false);
    this.sendTo(server, this.snapshotMessage(pid)); // full snapshot right away
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---- hibernation callbacks ---------------------------------------------- */
  async webSocketMessage(ws, raw) {
    await this.ensureLoaded();
    this.countUsage();
    const meta = ws.deserializeAttachment() || {};
    const pid = meta.pid;
    if (!pid) return;
    meta.seen = Date.now();
    ws.serializeAttachment(meta);
    if (!this.conns.get(pid) || this.conns.get(pid).ws !== ws) {
      // a socket we'd replaced: ignore it (only the newest connection speaks for the member)
      if (this.conns.get(pid)) return;
      this.conns.set(pid, { ws, name: meta.name });
    }
    let msg;
    try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch (e) { return; }
    await this.onMessage(pid, msg);
  }
  async webSocketClose(ws) {
    const meta = ws.deserializeAttachment() || {};
    // only forget the member if THIS was their current socket (a replaced one closing must not drop the new one)
    const c = meta.pid && this.conns.get(meta.pid);
    if (c && c.ws === ws) this.conns.delete(meta.pid);
    try { ws.close(1000, "bye"); } catch (e) { /* already closed */ }
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  /* ---- message handling (script -> Hub, contract §2) --------------------- */
  async onMessage(pid, msg) {
    const t = msg && msg.t;
    if (!t) return;
    let changed = false;
    switch (t) {
      case "chain": changed = this.applyScriptChain(msg); break;       // shorten-only (§3)
      case "stats": {
        const st = sanitizeStats(msg);
        this.mem.lastStats[pid] = st;            // kept for the Chain Watching Schedule's energy check
        const q = this.mem.queue[pid];
        if (q) { q.stats = st; changed = true; } else await this.save();
        break;
      }
      case "bonus": changed = this.doAssignBonus(pid, msg); break;
      // CHAIN WATCHING SCHEDULE from the script (addendum): same rules as the Hub page (cwShiftAdd / cwShiftDelete)
      case "shift_add": case "shift_cancel": case "shift_remove": changed = await this.doShift(pid, t, msg); break;
      case "join": changed = this.doJoin(pid, msg); break;
      // AWAY (addendum, Nov 2026): stay in the queue but don't get picked as up / backup until back
      case "away": {
        const q = this.mem.queue[pid];
        if (q && !!msg.on !== !!q.away) { q.away = !!msg.on; q._offlineSince = 0; changed = true; }
        break;
      }
      case "leave":
        if (this.mem.queue[pid]) { delete this.mem.queue[pid]; delete this.mem.status[pid]; changed = true; }
        break;
      case "hitting": {
        const q = this.mem.queue[pid];
        if (q) { q.hitting_until = msg.on ? Date.now() + HITTING_FLAG_MS : 0; changed = true; }
        break;
      }
      case "retal": changed = this.doRetalAction(pid, msg); break;
      default: break; // hello / ping: nothing to store
    }
    if (changed) {
      await this.save();
      this.broadcastDeltas();
      if (t === "join") await this.ensureAlarm();
    }
  }

  /* ---- JOIN (queue rules live here now, §5) ------------------------------- */
  doJoin(pid, msg) {
    if (this.mem.queue[pid]) return false;
    const m = this.mem.members[pid] || {};
    // RECRUITS (Nov 2026, user): Torn doesn't count chain hits from members in their first 72 h, so they can't join
    // - and they're told why.
    if (isRecruit(m)) {
      const d = Number(m.days);
      this.notify(pid, { t: "notice", kind: "join_refused", reason: "recruit", now: Date.now(),
        text: "You're still a Recruit, so your hits won't count toward the chain yet. Torn only counts chain hits from "
          + "members who've been in the faction for 72 hours" + (Number.isFinite(d) ? ` (you joined ${d} day${d === 1 ? "" : "s"} ago)` : "")
          + ". You can join the queue once your Recruit status ends." });
      return false;
    }
    this.mem.queue[pid] = {
      pid,
      name: m.name || (this.conns.get(pid) && this.conns.get(pid).name) || "Unknown",
      joined_at: Date.now(), hitting_until: 0, away: false,
      stats: msg.stats ? sanitizeStats(msg.stats) : (this.mem.lastStats[pid] || null), hits: 0,
    };
    if (msg.stats) this.mem.lastStats[pid] = this.mem.queue[pid].stats;
    return true;
  }

  /* ---- ASSIGN BONUS (Nov 2026, user): a leader names who takes the next bonus hit (script button) ---------- */
  doAssignBonus(pid, msg) {
    const me = this.mem.members[pid];
    if (!me || !me.is_leader) { this.notify(pid, { t: "notice", kind: "bonus_refused", text: "Only leaders can assign the bonus hit.", now: Date.now() }); return false; }
    if (msg.pid == null || msg.pid === 0) { if (!this.mem.bonus) return false; this.mem.bonus = null; return true; }
    const who = this.mem.members[Number(msg.pid)];
    if (!who) { this.notify(pid, { t: "notice", kind: "bonus_refused", text: "That player isn't on the member list.", now: Date.now() }); return false; }
    const cur = (this.mem.chain && this.mem.chain.current) || 0;
    const at = Number(msg.at) > cur && BONUS_HITS.includes(Number(msg.at)) ? Number(msg.at) : nextBonus(cur);
    this.mem.bonus = { at, pid: Number(msg.pid), name: who.name, by: `${me.name} [${pid}]`, set_at: Date.now() };
    return true;
  }

  /* ---- schedule: script sign-up / cancel / leader remove -> D1, then push the new schedule to everyone ---- */
  async doShift(pid, t, msg) {
    if (!this.env.OC_DB) { this.notify(pid, { t: "notice", kind: "shift_refused", text: "The schedule isn't available right now.", now: Date.now() }); return false; }
    const m = this.mem.members[pid] || {};
    let r;
    if (t === "shift_add") {
      r = await cwShiftAdd(this.env, pid, m.name || (this.conns.get(pid) || {}).name || "Unknown", msg.start, msg.hours, msg.role,
                           await cwStatsFor(this.env, pid, this.mem.lastStats[pid]));
    } else if (t === "shift_remove") {
      if (!m.is_leader) r = { ok: false, error: "Only leaders can remove other members' shifts." };
      else r = await cwShiftDelete(this.env, msg.id, pid, true);
    } else {
      r = await cwShiftDelete(this.env, msg.id || null, pid, false);   // own registration only
    }
    if (!r.ok) { this.notify(pid, { t: "notice", kind: "shift_refused", text: r.error, now: Date.now() }); return false; }
    await this.reloadSchedule(true);
    return true;
  }
  async reloadSchedule(dirty) {
    try { this.sched = this.env.OC_DB ? await cwShiftRows(this.env) : []; this.schedAt = Date.now(); if (dirty) this.schedDirty = true; }
    catch (e) { /* keep the last copy */ }
  }
  // the addendum's payload: {shifts: [{id, pid, name, start, hours, role, est_hits, need_hits}], mine}
  schedulePayload(pid) {
    const rows = this.sched || [];
    const mine = rows.find((x) => Number(x.pid) === Number(pid));
    return {
      shifts: rows.map((x) => ({ id: x.id, pid: x.pid, name: x.name, start: x.start_at, hours: Math.round((x.end_at - x.start_at) / 3600),
                                role: x.role, est_hits: x.est_hits, need_hits: x.need_hits })),
      mine: mine ? mine.id : null,
    };
  }

  /* ---- a message for one member (WebSocket now, or held for their next /cw/sync) ---- */
  notify(pid, obj) {
    const c = this.conns.get(pid);
    if (c) { this.sendTo(c.ws, obj); return; }
    const list = (this.mem.notices[pid] = (this.mem.notices[pid] || []).concat(obj).slice(-5));
    return list;
  }

  /* ---- RETAL actions (call / release / done) ----------------------------- */
  doRetalAction(pid, msg) {
    const r = this.mem.retals[msg.id];
    if (!r || r.done) return false;
    const name = (this.mem.members[pid] && this.mem.members[pid].name) || "someone";
    if (msg.action === "call") { r.call_by = name; r.call_at = Date.now(); }
    else if (msg.action === "release") { if (r.call_by !== name) return false; r.call_by = null; r.call_at = 0; }
    else if (msg.action === "done") { r.done = true; }
    else return false;
    return true;
  }

  /* ---- CHAIN: script-sourced reading (shorten-only, §3) ------------------- */
  applyScriptChain(msg) {
    const now = Date.now();
    const cur = Number(msg.current) || 0;
    const timeout = Number(msg.timeout) || 0;
    if (!timeout || cur <= 0) return false;              // a script can never start/stop a chain on its own
    const reading_expires = now + timeout * 1000;
    const c = this.mem.chain;
    if (!c || (!c.current && now - c.as_of > 60000)) {
      // No (recent) Hub baseline -> accept it as a provisional reading; the Hub read confirms/corrects `current`.
      // A Hub reading of 0 from the last minute wins: a late script reading can't bring a broken chain back.
      this.mem.chain = {
        current: cur, max: Number(msg.max) || cur, cooldown: Number(msg.cooldown) || 0,
        modifier: msg.modifier != null ? Number(msg.modifier) : null,
        expires_at: reading_expires, as_of: now, src: "script",
      };
      return true;
    }
    if (cur > c.current && c.current > 0 && cur - c.current <= 10) {
      // CONFIRMED-HIT REFRESH (Nov 2026, user): a higher count means a hit probably just landed - but a reading
      // could be wrong, so the Hub CONFIRMS it with one read of its own (at most every 10 s) instead of trusting it.
      // Nothing changes until that read says so.
      this.requestConfirmRead();
      return false;
    }
    if (cur !== c.current) return false;                // only for the count the Hub itself saw
    if (reading_expires < c.expires_at) { c.expires_at = reading_expires; c.as_of = now; c.src = "script"; return true; }
    return false;
  }

  requestConfirmRead() {
    const now = Date.now();
    if (now - (this.mem._confirmAt || 0) < CONFIRM_READ_GAP_MS) return;
    this.mem._confirmAt = now;
    this.mem._chainAt = 0;                               // the chain read is due on the next alarm...
    this.storage.setAlarm(now + 250).catch(() => {});    // ...which runs now (it reschedules itself after)
  }

  /* ---- CHAIN: Hub-sourced reading (authoritative for `current`) ---------- */
  applyHubChain(chain) {
    const now = Date.now();
    const cur = Number(chain.current) || 0;
    const timeout = Number(chain.timeout) || 0;
    let expires = cur > 0 ? now + timeout * 1000 : 0;
    const prev = this.mem.chain;
    // The Hub's read can be up to ~30 s old (Torn's cache). If a script read the SAME count more recently and saw
    // less time left, keep the shorter value (never show more time than a fresh reading did).
    if (prev && cur > 0 && prev.current === cur && prev.src === "script" && now - prev.as_of < SCRIPT_READING_FRESH_MS
        && prev.expires_at && prev.expires_at < expires) expires = prev.expires_at;
    this.mem.chain = {
      current: cur, max: Number(chain.max) || cur, cooldown: Number(chain.cooldown) || 0,
      modifier: chain.modifier != null ? Number(chain.modifier) : null,
      expires_at: expires, as_of: now, src: "hub",
      // COOLDOWN (Nov 2026): after a break Torn cools the chain 6 s per hit - when the next chain can start
      cooldown_until: cur === 0 && Number(chain.cooldown) > 0 ? now + Number(chain.cooldown) * 1000 : 0,
    };
    // the assigned bonus is done once the chain reaches it (or the chain ends)
    if (this.mem.bonus && (cur >= this.mem.bonus.at || cur === 0)) this.mem.bonus = null;
    if (prev && prev.current > 0 && cur === 0) this.mem.lastChainEndedAt = now;
    if (cur > 0) this.mem.lastChainEndedAt = 0;
  }

  /* ======================================================================
   * THE ALARM — the single self-scheduled loop. NEVER setInterval.
   * ==================================================================== */
  async ensureAlarm() {
    if ((await this.storage.getAlarm()) == null) await this.storage.setAlarm(Date.now() + 1000);
  }

  present(now) {
    // anyone here? live sockets, or a /cw/sync device seen recently
    Object.keys(this.mem.syncSeen).forEach((p) => { if (now - this.mem.syncSeen[p] > SYNC_STALE_MS) delete this.mem.syncSeen[p]; });
    return this.conns.size > 0 || Object.keys(this.mem.syncSeen).length > 0;
  }

  async alarm() {
    await this.ensureLoaded();
    this.countUsage();
    const now = Date.now();
    this.pruneConns(now);
    if (!this.present(now)) { await this.save(); return; } // nobody here: the loop stops; a connect re-arms it

    const live = !!(this.mem.chain && this.mem.chain.current > 0);
    const stateKey = live ? "live" : (Object.keys(this.mem.queue).length ? "queued" : "idle");
    const mult = this.mem.level >= 1 ? 2 : 1;

    // ---- Hub Torn reads, each on its own cadence (API: Heart Breakers Hub - Chain Watch) ----
    let hubChainRead = false;
    if (due(this.mem._chainAt, READ_MS.chain[stateKey] * mult, now)) {
      this.mem._chainAt = now; hubChainRead = true;
      const d = await this.tornGet("faction/chain");
      if (d && d.chain) this.applyHubChain(d.chain);
    }
    if (READ_MS.attacks[stateKey] && due(this.mem._attacksAt, READ_MS.attacks[stateKey] * mult, now)) {
      this.mem._attacksAt = now;
      const from = Math.floor((now - RETAL_WINDOW_MS) / 1000) - 5;
      const d = await this.tornGet(`faction/attacks?from=${from}&limit=100&sort=DESC`);
      if (d && d.attacks) this.ingestAttacks(d.attacks, now);
    }
    if (READ_MS.members[stateKey] && due(this.mem.membersAt, READ_MS.members[stateKey] * mult, now)) {
      await this.readMembers(now);
    }
    // ---- stored-key chain reads (opt-in "Chain timer (during live chains)") - live chain only, one key per tick,
    //      each key <= 2 calls/min, never a member whose own script is connected
    let optinNext = 0;
    if (live && this.mem.level < 2) {
      const pick = this.nextOptinKey(now);
      if (pick && !hubChainRead) await this.readChainWithMemberKey(pick, now);   // between the Hub's own reads
      if (this.nextOptinKey(now + OPTIN_TICK_MS)) optinNext = OPTIN_TICK_MS;
    }

    // ---- housekeeping ----
    // schedule: drop ended shifts once an hour passes (shifts end on whole hours) - 1 D1 read
    if (this.sched && Math.floor(now / 3600000) !== Math.floor(this.schedAt / 3600000)) await this.reloadSchedule(true);
    this.expireRetals(now);
    this.enforceQueueRules(now);
    this.maybeIdleWipe(now);
    this.updateLevel();
    await this.save();
    this.broadcastDeltas();

    let base = Math.min(READ_MS.chain[stateKey] || 120000, READ_MS.attacks[stateKey] || 120000, READ_MS.members[stateKey] || 120000);
    if (optinNext) base = Math.min(base, optinNext);       // tick between Hub reads while opt-in keys can help
    await this.storage.setAlarm(now + Math.max(5000, base) * mult);
  }

  /* ---- STORED-KEY CHAIN READS (away/opt-in addendum §2, contract §4) -------------------------------------------
   * Members who turned on "Chain timer (during live chains)" on My data & sharing. Their key is kept ENCRYPTED here
   * (sealed by worker.js) and opened only for one faction/chain read: during a live chain, at most once per 30 s per
   * key, and only while that member's own Chain Watch script isn't connected. The reading is applied exactly like a
   * script reading (shorten-only + confirmed-hit refresh). Never starts the read loop (only runs inside it).
   * ------------------------------------------------------------------------------------------------------------- */
  nextOptinKey(now) {
    const ids = Object.keys(this.mem.cwOptin || {}).map(Number).filter((p) =>
      this.mem.members[p]                                            // still in the faction
      && !this.conns.has(p) && !this.mem.syncSeen[p]                 // their own script isn't connected
      && !(this.mem.cwOptinBad[p] && now - this.mem.cwOptinBad[p] < OPTIN_BAD_KEY_MS)
      && now - (this.mem.cwOptinUsed[p] || 0) >= OPTIN_KEY_GAP_MS);   // <= 2 calls/min per key
    if (!ids.length) return 0;
    ids.sort((a, b) => (this.mem.cwOptinUsed[a] || 0) - (this.mem.cwOptinUsed[b] || 0));   // least recently used
    return ids[0];
  }
  async readChainWithMemberKey(pid, now) {
    this.mem.cwOptinUsed[pid] = now;
    let key;
    try { key = await openSealedKey(this.env, this.mem.cwOptin[pid]); } catch (e) { this.mem.cwOptinBad[pid] = now; return; }
    try {
      // API: Heart Breakers Hub - Chain Watch (faction/chain with the member's opted-in key, Authorization header)
      const base = this.env.TORN_API_BASE || "https://api.torn.com";
      const res = await fetch(`${base}/v2/faction/chain?comment=${encodeURIComponent(TORN_COMMENT)}`,
        { headers: { Authorization: "ApiKey " + key, Accept: "application/json" } });
      const d = await res.json();
      key = null;
      if (d && d.error) { if ([2, 10, 13, 16, 18].includes(Number(d.error.code))) this.mem.cwOptinBad[pid] = now; return; }
      const day = todayUTC();
      if (this.mem.optinDay !== day) { this.mem.optinDay = day; this.mem.optinReads = 0; }
      this.mem.optinReads++;
      if (d && d.chain) this.applyScriptChain(d.chain);
    } catch (e) { /* network - try again next tick */ }
  }

  /* ---- member list: names, leader rights, online status of queued members (1 call) ---- */
  async readMembers(now) {
    this.mem.membersAt = now;
    const d = await this.tornGet("faction/members");
    if (!d || !Array.isArray(d.members)) return;
    const members = {}, status = {};
    d.members.forEach((mm) => {
      const id = String(mm.id);
      members[id] = { name: mm.name || "Unknown", position: String(mm.position || ""), is_leader: leaderPos(this.env, mm.position),
                      days: mm.days_in_faction != null ? Number(mm.days_in_faction) : null };
      const la = mm.last_action || {}, ps = mm.status || {};
      // state: Okay / Hospital / Jail / Traveling / Abroad / Federal ... + until (epoch s) - members who can't
      // attack right now go to the back of the queue until they're Okay (§5)
      if (this.mem.queue[id]) status[id] = { status: la.status || "Unknown", relative: la.relative || "", ts: now,
        state: String(ps.state || ""), until: Number(ps.until) || 0, desc: String(ps.description || "").slice(0, 60) };
    });
    this.mem.members = members;
    this.mem.status = status;
    // anyone who left the faction drops out of the queue
    Object.keys(this.mem.queue).forEach((p) => { if (!members[p]) delete this.mem.queue[p]; });
  }

  /* ---- attacks -> retals + hit detection (contract §3 hit, §5 queue) ----- */
  ingestAttacks(attacks, now) {
    const FAC = String(factionId(this.env));
    const facOf = (side) => String((side && side.faction && side.faction.id) || "");
    const rows = (Array.isArray(attacks) ? attacks : Object.values(attacks)).filter(Boolean)
      .map((a) => ({ a, ended: Number(a.ended || a.started || 0) * 1000, res: String(a.result || "") }))
      .sort((x, y) => x.ended - y.ended);

    // our landed hits on each enemy (latest time) - a retal is done once we've hit the attacker after their hit
    const ourHitOn = {};
    rows.forEach(({ a, ended, res }) => {
      if (facOf(a.attacker) !== FAC || FAIL_RESULTS.includes(res) || !a.defender) return;
      const d = String(a.defender.id || "");
      if (d) ourHitOn[d] = Math.max(ourHitOn[d] || 0, ended);
    });

    // queued members' landed hits: counted + logged (energy estimate); the queue reorders by energy
    rows.forEach(({ a, ended, res }) => {
      const atkId = String((a.attacker && a.attacker.id) || "");
      const q = this.mem.queue[atkId];
      if (!q || facOf(a.attacker) !== FAC || FAIL_RESULTS.includes(res)) return;
      if (!ended || now - ended > 120000) return;               // only fresh hits
      if (q._lastHitTs && ended <= q._lastHitTs) return;        // already counted
      q._lastHitTs = ended;
      // ENERGY ORDER (Nov 2026, user): the queue is ordered by current energy, so a hit no longer moves the member
      // to the back - it's logged so their estimated energy drops 25 straight away (until their next stats report).
      q.hitTimes = (q.hitTimes || []).concat(ended).slice(-20);
      q.hitting_until = 0;
      q.hits = (q.hits || 0) + 1;
      this.queueHit(Number(atkId), q.hits);
    });

    // incoming enemy hits become retal targets (5-min window)
    const next = {};
    rows.forEach(({ a, ended, res }) => {
      if (!ended || now - ended > RETAL_WINDOW_MS) return;
      if (facOf(a.defender) !== FAC) return;                    // incoming only
      if (!a.attacker || a.is_stealthed) return;                // stealthed: no target
      if (facOf(a.attacker) === FAC) return;                    // not our own
      if (FAIL_RESULTS.includes(res)) return;
      if (a.modifiers && Number(a.modifiers.overseas) > 1) return; // overseas: can't quick-retal
      const attackerId = Number(a.attacker.id) || 0;
      if (!attackerId) return;
      if ((ourHitOn[String(attackerId)] || 0) >= ended) return; // we've already hit them back
      const id = String(a.code || a.id || `${attackerId}-${ended}`);
      const old = this.mem.retals[id];
      next[id] = {
        id, attacker_id: attackerId, attacker_name: String(a.attacker.name || ""),
        attacker_faction: (a.attacker.faction && a.attacker.faction.name) || "",
        ts: ended, expires_at: ended + RETAL_WINDOW_MS,
        call_by: old ? old.call_by || null : null, call_at: old ? old.call_at || 0 : 0,
        done: !!(old && old.done),                              // "done" stays done
      };
    });
    this.mem.retals = next;
  }
  queueHit(pid, n) { (this._pendingHits = this._pendingHits || []).push({ pid, n }); }

  expireRetals(now) {
    Object.keys(this.mem.retals).forEach((id) => {
      const r = this.mem.retals[id];
      if (now - r.ts > RETAL_WINDOW_MS) delete this.mem.retals[id];
      else if (r.call_by && now - r.call_at > CALL_TTL_MS) { r.call_by = null; r.call_at = 0; }
    });
  }

  /* ---- queue auto-remove rules (contract §5) ----------------------------- */
  enforceQueueRules(now) {
    const cooling = this.coolingDown(now);
    this.orderedQueue(true).forEach((q, idx) => {
      const s = q.stats, e = energyNow(q, now);
      if (s && e != null && e < HIT_ENERGY_COST && !canRestoreEnergy(s, now)) {   // under 25e, no way back
        delete this.mem.queue[q.pid]; delete this.mem.status[q.pid]; return;
      }
      const st = this.mem.status[q.pid];
      if (st && st.status === "Offline" && !q.away) {   // away = a soft pause: no offline removal
        q._offlineSince = q._offlineSince || now;
        // paused while the chain cools down: the queue is for the NEXT chain then
        if (!cooling && idx < 2 && now - q._offlineSince > 5 * 60 * 1000) { delete this.mem.queue[q.pid]; delete this.mem.status[q.pid]; } // #1/#2 offline 5 min+
      } else q._offlineSince = 0;
    });
  }

  /* ---- idle wipe (contract §5) ------------------------------------------ */
  coolingDown(now) {
    const c = this.mem.chain;
    return !!(c && !c.current && c.cooldown_until && c.cooldown_until > (now || Date.now()));
  }
  maybeIdleWipe(now) {
    const live = !!(this.mem.chain && this.mem.chain.current > 0);
    if (live || Object.keys(this.mem.queue).length || this.coolingDown(now)) return;
    if (!this.mem.lastChainEndedAt) { this.mem.lastChainEndedAt = now; return; }
    if (now - this.mem.lastChainEndedAt < IDLE_WIPE_MS) return;
    // transient data cleared; settings + member list kept
    this.mem.queue = {}; this.mem.status = {}; this.mem.retals = {};
    if (this.mem.chain && !this.mem.chain.cooldown) this.mem.chain = null;
  }

  /* ---- self-governor (§8) ----------------------------------------------- */
  countUsage() {
    if (!this.mem) return;
    const day = todayUTC();
    if (this.mem.usageDay !== day) { this.mem.usageDay = day; this.mem.usageCount = 0; }
    this.mem.usageCount++;
  }
  modeOf() { return this.mem.level >= 1 ? "degraded" : "normal"; }
  reasonOf() { return this.mem.level >= 2 ? "daily_limit" : this.mem.level === 1 ? "near_daily_limit" : ""; }
  updateLevel() {
    const lvl = this.mem.usageCount >= DAILY_DO_REQUEST_HARD ? 2 : this.mem.usageCount >= DAILY_DO_REQUEST_SOFT ? 1 : 0;
    if (lvl === this.mem.level) return;
    this.mem.level = lvl;
    // "daily_limit" = scripts fall back to their own reads (§6); "near_daily_limit" = Hub timers doubled
    this.broadcast({ t: "mode", mode: this.modeOf(), reason: this.reasonOf(), now: Date.now() });
  }

  /* ---- connection pruning (sockets that stopped pinging) ------------------ */
  pruneConns(now) {
    for (const [pid, c] of this.conns) {
      const meta = c.ws.deserializeAttachment() || {};
      let auto = 0;
      try { const d = this.state.getWebSocketAutoResponseTimestamp(c.ws); auto = d ? d.getTime() : 0; } catch (e) { /* none */ }
      if (now - Math.max(meta.seen || 0, auto) > CONN_STALE_MS) {
        try { c.ws.close(1001, "stale"); } catch (e) { /* ignore */ }
        this.conns.delete(pid);
      }
    }
  }

  /* ---- Torn GET: V2, Hub key in the Authorization header (never in the address) ---- */
  async tornGet(path) {
    // API: Heart Breakers Hub - Chain Watch (faction/chain, faction/attacks, faction/members)
    const key = this.env.HUB_TORN_KEY;
    if (!key) return null;
    const base = this.env.TORN_API_BASE || "https://api.torn.com";
    const sep = path.includes("?") ? "&" : "?";
    try {
      const res = await fetch(`${base}/v2/${path}${sep}comment=${encodeURIComponent(TORN_COMMENT)}`,
        { headers: { Authorization: "ApiKey " + String(key).trim(), Accept: "application/json" } });
      const data = await res.json();
      if (data && data.error) { this.mem.lastErr = `${path.split("?")[0]} ${data.error.code}`; return null; }
      return data;
    } catch (e) { this.mem.lastErr = `${path.split("?")[0]} fetch`; return null; }
  }

  /* ======================================================================
   * OUTBOUND — snapshot + deltas (contract §3). ws.send() isn't a billed DO request, so every change goes out at once.
   * ==================================================================== */
  snapshotMessage(pid) {
    const me = this.mem.members[pid] || {};
    return {
      t: "state", now: Date.now(),
      chain: this.mem.chain, queue: this.orderedQueue(), status: this.mem.status,
      retals: this.openRetals(), config: this.publicConfig(),
      me: { pid, is_leader: !!me.is_leader, phase_ms: this.phaseFor(pid),
            // leaders get the member list for the script's "Assign bonus" picker
            members: me.is_leader ? Object.keys(this.mem.members).map((k) => ({ pid: Number(k), name: this.mem.members[k].name })) : undefined },
      mode: this.modeOf(), reason: this.reasonOf(),
      ...this.extras(),
      schedule: this.schedulePayload(pid),
    };
  }
  broadcastDeltas() {
    const now = Date.now();
    const base = Object.assign({
      t: "sync", now, chain: this.mem.chain, queue: this.orderedQueue(), status: this.mem.status,
      retals: this.openRetals(), config: this.publicConfig(),
    }, this.extras());
    if (this.schedDirty && this.sched) {
      // schedule changed: each member gets it with their own `mine`
      this.schedDirty = false;
      for (const [pid, c] of this.conns) {
        try { c.ws.send(JSON.stringify(Object.assign({}, base, { schedule: this.schedulePayload(pid) }))); } catch (e) { this.conns.delete(pid); }
      }
    } else this.broadcast(base);
    if (this._pendingHits && this._pendingHits.length) {
      this._pendingHits.forEach((h) => this.broadcast(Object.assign({ t: "hit" }, h, { now })));
      this._pendingHits = [];
    }
  }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const [pid, c] of this.conns) { try { c.ws.send(s); } catch (e) { this.conns.delete(pid); } }
  }
  sendTo(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ } }

  /* ---- turn / bonus / runway / cooldown (Nov 2026, user) - carried in every state + sync --------------------
   * turn    {up, backup, since, reason}: `up` = who should hit next (#1 who can attack; the assigned bonus hitter
   *         when the next hit IS the bonus), `backup` = the next one after them. The script tells `up` "you're up"
   *         and alerts `backup` if no hit lands within config.handoffSeconds of `since` (later of: last hit, up changed).
   * bonus   {next, warn_from, pid, name, by}: next bonus milestone, from which count to show the heads-up, who's
   *         assigned (null = nobody).
   * runway  {banked_hits, regen_per_hour, hits_to_bonus, bonus_reachable, hours}: from the queue's energy now -
   *         hours = how long the queue alone keeps the chain at the slowest safe pace (null = regen covers it).
   * cooldown {until} when the chain is cooling down (the queue is for the next chain; offline removal paused).
   * ----------------------------------------------------------------------------------------------------------- */
  extras() {
    const now = Date.now();
    const c = this.mem.chain || {};
    const cur = Number(c.current) || 0;
    const q = this.orderedQueue();
    const able = q.filter((x) => x.can_hit && !x.away);   // up / backup: can attack AND not away
    const cfg = this.mem.config || CW_DEFAULT_CONFIG;
    const next = nextBonus(cur);
    const b = this.mem.bonus && this.mem.bonus.at === next ? this.mem.bonus : null;
    // who's up: the bonus hitter when the very next hit is the (assigned) bonus, else #1 who can attack
    let up = able[0] ? able[0].pid : 0, reason = "order";
    if (b && cur > 0 && cur === next - 1) { up = b.pid; reason = "bonus"; }
    const backup = (able.find((x) => x.pid !== up) || {}).pid || 0;
    if (up !== this.mem.turnUp) { this.mem.turnUp = up; this.mem.turnUpAt = now; }
    const lastHit = cur > 0 && c.expires_at ? c.expires_at - CHAIN_TIMEOUT_S * 1000 : 0;
    // runway
    let banked = 0, regen = 0;
    q.forEach((x) => {
      if (x.energy != null) banked += Math.floor(x.energy / HIT_ENERGY_COST);
      const s = x.stats;
      if (s && Number(s.energyInt) > 0 && (x.energy == null || x.energy < Number(s.energyMax))) regen += (Number(s.energyInc) || 0) * 3600 / Number(s.energyInt) / HIT_ENERGY_COST;
    });
    regen = Math.round(regen * 10) / 10;
    const toBonus = next ? next - cur : 0;
    return {
      turn: cur > 0 ? { up, backup, since: Math.max(this.mem.turnUpAt, lastHit), reason } : null,
      bonus: next ? { next, warn_from: Math.max(1, next - (Number(cfg.bonusWarnHits) || 0)),
                      pid: b ? b.pid : null, name: b ? b.name : null, by: b ? b.by : null } : null,
      runway: { banked_hits: banked, regen_per_hour: regen, hits_to_bonus: toBonus, bonus_reachable: banked >= toBonus,
                hours: regen >= MIN_PACE_HITS_PER_HOUR ? null : Math.round(banked / (MIN_PACE_HITS_PER_HOUR - regen) * 10) / 10 },
      cooldown: this.coolingDown(now) ? { until: c.cooldown_until } : null,
    };
  }

  /* ---- views ------------------------------------------------------------ */
  // QUEUE ORDER (Nov 2026, user): most CURRENT energy first (energy bar only - refills / Xanax not counted).
  // Members who can't attack right now (hospital, jail, travelling/abroad...) go to the back - still in energy order
  // - until they're Okay again (their `until` time passing counts, no need to wait for the next member read).
  // Ties: earlier join first. Members who haven't reported stats yet go last within their group, in join order.
  orderedQueue(raw) {
    const now = Date.now();
    const list = Object.values(this.mem.queue).map((q) => ({ q, e: energyNow(q, now), ok: canAttack(this.mem.status[q.pid], now) }))
      .sort((a, b) => ((b.ok ? 1 : 0) - (a.ok ? 1 : 0)) || ((b.e == null ? -1 : b.e) - (a.e == null ? -1 : a.e)) || (a.q.joined_at - b.q.joined_at));
    if (raw) return list.map((x) => x.q);
    return list.map(({ q, e, ok }) => ({
      pid: q.pid, name: q.name, joined_at: q.joined_at, energy: e, can_hit: ok, away: !!q.away,
      hitting_until: q.hitting_until || 0, stats: q.stats || null, hits: q.hits || 0,
    }));
  }
  openRetals() {
    const now = Date.now();
    return Object.values(this.mem.retals)
      .filter((r) => r && !r.done && now - r.ts <= RETAL_WINDOW_MS)
      .sort((a, b) => b.ts - a.ts)
      .map((r) => ({
        id: r.id, attacker_id: r.attacker_id, attacker_name: r.attacker_name, attacker_faction: r.attacker_faction,
        ts: r.ts, expires_at: r.expires_at, call_by: r.call_by || null, call_at: r.call_at || 0,
      }));
  }
  publicConfig() {
    // Only the alert settings go to scripts (Discord, phase 3, will stay server-side).
    const c = this.mem.config || CW_DEFAULT_CONFIG;
    const origin = String(this.env.HUB_ORIGIN || "https://hb-gate.heartbreakers.workers.dev").replace(/\/$/, "");
    return {
      topAlertSeconds: c.topAlertSeconds, restAlertSeconds: c.restAlertSeconds, thirdAlertSeconds: c.thirdAlertSeconds,
      firstAlertPrimaryOnly: !!c.firstAlertPrimaryOnly, minChain: c.minChain,
      handoffSeconds: Number(c.handoffSeconds) || CW_DEFAULT_CONFIG.handoffSeconds,
      bonusWarnHits: c.bonusWarnHits != null ? Number(c.bonusWarnHits) : CW_DEFAULT_CONFIG.bonusWarnHits,
      edit_url: origin + EDIT_PATH, set_by: c.set_by || "", set_at: c.set_at || 0,
    };
  }

  /* ---- §4 phase offset: spread connected contributors across the 30 s window --- */
  phaseFor(pid) {
    const ids = [...new Set([...this.conns.keys(), pid])].sort((a, b) => a - b);
    return Math.round((Math.max(0, ids.indexOf(pid)) / ids.length) * 30000);
  }

  /* ---- /sync fallback (no WebSocket) ------------------------------------ */
  async handleSync(request) {
    const body = await request.json();
    const pid = Number(body.pid);
    this.mem.syncSeen[pid] = Date.now();
    for (const m of body.out || []) await this.onMessage(pid, m);
    await this.save();
    await this.ensureAlarm();   // keep Hub reads going for these devices too
    if (!this.sched) await this.reloadSchedule(false);
    const held = this.mem.notices[pid] || [];
    if (held.length) { delete this.mem.notices[pid]; await this.save(); }
    return Response.json({ ok: true, in: [this.snapshotMessage(pid)].concat(held), now: Date.now() });
  }

  /* ---- /config : a leader saved new settings on the Hub -> reload + push ---- */
  async handleConfigReload() {
    this.mem.config = await this.loadConfig();
    await this.save();
    this.broadcast({ t: "sync", now: Date.now(), config: this.publicConfig() });
    return Response.json({ ok: true, config: this.publicConfig() });
  }

  /* ---- /reading : a chain reading from the Hub homepage's "Right Now" card (Nov 2026) ----------------------
   * Members with the Hub homepage open read faction/chain with their OWN Public key in their browser every 15 s
   * (the key never leaves that browser). worker.js /m/cw/reading forwards the reading here (signed-in members only,
   * the pid comes from the site's sign-in, not the client). Recycled as a script-style reading: the same
   * shorten-only rule (§3) applies, it never starts the room's read loop, and the page only sends it during a live
   * chain when Torn's data actually changed (~2 a minute per open page).
   * ------------------------------------------------------------------------------------------------------- */
  async handleWebReading(request) {
    let b = {};
    try { b = await request.json(); } catch (e) { /* ignore */ }
    const changed = this.applyScriptChain({
      current: b.current, max: b.max, timeout: b.timeout, cooldown: b.cooldown, modifier: b.modifier,
    });
    const day = todayUTC();
    if (this.mem.webDay !== day) { this.mem.webDay = day; this.mem.webReadings = 0; }
    this.mem.webReadings = (this.mem.webReadings || 0) + 1;
    await this.save();
    if (changed) this.broadcastDeltas();
    return Response.json({ ok: true, used: changed });
  }

  /* ---- /status : counts only (Leaders' settings page + the OC check workflow) ---- */
  async handleStatus(detail) {
    const now = Date.now();
    this.pruneConns(now);
    // detail=1 (Leaders' Chain Watch page only): the queue in order with each member's reported energy /
    // cooldowns / refill, online status and whether their script is connected - no keys, nothing from Torn here
    const queue = detail ? this.orderedQueue().map((q) => Object.assign(q, {
      status: this.mem.status[q.pid] || null, connected: this.conns.has(q.pid) || !!this.mem.syncSeen[q.pid],
    })) : undefined;
    return Response.json({ queue, now, extras: detail ? this.extras() : undefined,
      ok: true, connected: this.conns.size, sync_devices: Object.keys(this.mem.syncSeen).length,
      queued: Object.keys(this.mem.queue).length, chain: this.mem.chain ? this.mem.chain.current : 0,
      retals: this.openRetals().length, members: Object.keys(this.mem.members).length,
      mode: this.modeOf(), reason: this.reasonOf(), requests_today: this.mem.usageCount,
      alarm: (await this.storage.getAlarm()) != null, last_error: this.mem.lastErr || "",
      homepage_readings_today: this.mem.webDay === todayUTC() ? this.mem.webReadings || 0 : 0,
      optin_keys: Object.keys(this.mem.cwOptin || {}).length,
      optin_reads_today: this.mem.optinDay === todayUTC() ? this.mem.optinReads || 0 : 0,
    });
  }
}

/* ----------------------------------------------------------------------------
 * small helpers
 * -------------------------------------------------------------------------- */
// A queued member's energy NOW, estimated from their last stats report (scripts send it every 60-180 s): the reported
// bar, minus 25 for each hit the Hub saw since that report, plus natural regen ticks (only up to max - a stacked bar
// doesn't regen). null = no report yet.
function energyNow(q, now) {
  const s = q && q.stats;
  if (!s) return null;
  let e = Number(s.energyCur) || 0;
  const max = Number(s.energyMax) || 0, at = Number(s.at) || now;
  e -= HIT_ENERGY_COST * (q.hitTimes || []).filter((t) => t > at).length;
  const inc = Number(s.energyInc) || 0, int = Number(s.energyInt) || 0, tick = Number(s.energyTick) || 0;
  if (inc > 0 && int > 0 && e < max) {
    const el = (now - at) / 1000;
    const ticks = tick > 0 ? (el >= tick ? 1 + Math.floor((el - tick) / int) : 0) : Math.floor(el / int);
    e = Math.min(max, e + ticks * inc);
  }
  return Math.max(0, Math.round(e));
}
// Can this queued member attack right now? Unknown status counts as yes (don't punish a missing read).
// Hospital / Jail / Federal jail / mid-flight (Traveling) can't attack. Abroad CAN (they hit targets in that country,
// which still counts for the chain), so Abroad stays in the normal order.
const CANT_ATTACK = ["Hospital", "Jail", "Federal", "Traveling", "Fallen"];
function canAttack(st, now) {
  if (!st || !st.state || !CANT_ATTACK.includes(st.state)) return true;
  return !!(st.until && st.until * 1000 <= now);         // hospital / jail time is up, or the plane has landed
}
function isRecruit(m) {
  if (!m) return false;
  return /^recruit$/i.test(String(m.position || "")) || (m.days != null && Number(m.days) < RECRUIT_DAYS);
}
function nextBonus(cur) { return BONUS_HITS.find((b) => b > (Number(cur) || 0)) || 0; }
function due(last, every, now) { return !!every && now - (last || 0) >= every - 1000; }
function todayUTC() { return new Date().toISOString().slice(0, 10); }
function sanitizeStats(s) {
  s = s || {};
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return {
    energyCur: n(s.energyCur), energyMax: n(s.energyMax),
    energyInc: n(s.energyInc), energyInt: n(s.energyInt), energyTick: n(s.energyTick),
    drug: n(s.drug), booster: n(s.booster), refill: n(s.refill), at: Date.now(),
  };
}
function canRestoreEnergy(s, now) {
  if (!s) return true;                                     // unknown -> don't drop on a guess
  // cooldowns were reported as seconds left at s.at - count them down to now
  const el = Math.max(0, ((now || Date.now()) - (Number(s.at) || 0)) / 1000);
  if (Number(s.refill) === 1) return true;
  if (Number(s.drug) - el <= 0) return true;               // drug cooldown clear
  if (Number(s.booster) - el < BOOSTER_CD_CEILING) return true; // booster usable (<24h)
  return false;
}

/* ----------------------------------------------------------------------------
 * CHAIN WATCHING SCHEDULE energy check (Nov 2026, user): can this member cover a shift ALONE (one hit every 5 min)?
 * From their last stats report (`at` = when): energy at the shift start (regen up to max), regen during the shift,
 * plus what they can restore - the daily refill (+max, if unused, or if the shift is on a later TCT day: refills reset
 * at 00:00 TCT) and one Xanax (+250, if the drug cooldown is clear by the start). Boosters aren't counted.
 * The schedule page runs the same formula for its preview (tools/chainwatch_schedule.html cover()).
 * -> {hits, need, start_e, regen_e, refill_e, xanax_e} or null (no report)
 * -------------------------------------------------------------------------- */
export function cwEnergyCover(s, startS, endS) {
  if (!s || !(Number(s.energyMax) > 0)) return null;
  const at = Number(s.at) || Date.now(), max = Number(s.energyMax);
  const inc = Number(s.energyInc) || 5, int = Number(s.energyInt) || 600;
  const toStart = Math.max(0, startS - at / 1000), dur = Math.max(0, endS - Math.max(startS, at / 1000));
  let e = Number(s.energyCur) || 0;
  if (e < max) e = Math.min(max, e + Math.floor(toStart / int) * inc);
  const regen = Math.floor(dur / int) * inc;
  const day = (t) => Math.floor(t / 86400);
  const refill = Number(s.refill) === 1 || day(startS) > day(at / 1000) ? max : 0;
  const xanax = Number(s.drug) - toStart <= 0 ? 250 : 0;
  const need = Math.ceil((endS - startS) / 300);
  return { hits: Math.floor((e + regen + refill + xanax) / HIT_ENERGY_COST), need,
           start_e: Math.round(e), regen_e: regen, refill_e: refill, xanax_e: xanax };
}

/* ============================================================================
 * CHAIN WATCHING SCHEDULE core (contract §10 + claude/chainwatch-schedule-script-addendum.md) - ONE set of rules for
 * both ways in: the Hub page (worker.js /m/cw/schedule) and the script (WebSocket shift_add / shift_cancel /
 * shift_remove, handled by the ChainRoom). D1 table cw_shift. No Torn call.
 * ========================================================================== */
export const CW_ROLES = { primary: "Primary", backup: "Backup", backup2: "2nd backup" };
export const CW_MAX_HOURS = 6, CW_AHEAD_S = 7 * 86400;

// every shift that hasn't ended, inside the 7-day window
export async function cwShiftRows(env) {
  const nowS = Math.floor(Date.now() / 1000);
  const { results } = await env.OC_DB.prepare("SELECT id, pid, name, role, start_at, end_at, est_hits, need_hits FROM cw_shift " +
    "WHERE end_at > ? AND start_at < ? ORDER BY start_at, role").bind(nowS, nowS + CW_AHEAD_S).all();
  return results || [];
}

// the member's latest energy reading: their Chain Watch script report (lastStats, from the room) or the opt-in War
// readiness reading (D1 oc_snap hub/readiness) - whichever is newer
export async function cwStatsFor(env, pid, scriptStats) {
  let best = scriptStats ? Object.assign({ src: "script" }, scriptStats) : null;
  try {
    const r = await env.OC_DB.prepare("SELECT as_of, data FROM oc_snap WHERE env = 'hub' AND ds = 'readiness'").first();
    const data = r ? JSON.parse(r.data) : null;
    const list = data && Array.isArray(data.members) ? data.members : [];
    const m = list.find((x) => Number(x.id) === Number(pid) && !x.err) || null;
    if (m && m.energy && (!best || Number(r.as_of) > Number(best.at))) {
      const e = m.energy, rate = e.cur < e.max && e.full > 0 ? (e.max - e.cur) / e.full : 0;   // energy per second
      best = { src: "readiness", energyCur: e.cur, energyMax: e.max, energyInc: 5, energyInt: rate > 0 ? Math.round(5 / rate) : 600,
               drug: Number((m.cd || {}).drug) || 0, booster: Number((m.cd || {}).booster) || 0,
               refill: m.refill === false ? 1 : 0, at: Number(r.as_of) };
    }
  } catch (e) { /* script reading only */ }
  return best;
}

// sign up -> {ok, cover} or {ok:false, error, status}
export async function cwShiftAdd(env, pid, name, start, hours, role, stats) {
  const nowS = Math.floor(Date.now() / 1000);
  start = Math.floor(Number(start)); hours = Math.floor(Number(hours)); role = String(role || "");
  const no = (error, status) => ({ ok: false, error, status: status || 400 });
  if (!CW_ROLES[role]) return no("Pick a role: Primary, Backup or 2nd backup.");
  if (!(hours >= 1 && hours <= CW_MAX_HOURS)) return no(`Shifts are 1-${CW_MAX_HOURS} hours.`);
  if (!Number.isFinite(start) || start % 3600) return no("Shifts start on the hour (TCT).");
  const end = start + hours * 3600;
  if (end <= nowS) return no("That time has already passed.");
  if (start < nowS - 3600 || start > nowS + CW_AHEAD_S) return no("Pick a time within the next 7 days.");
  const mine = await env.OC_DB.prepare("SELECT id FROM cw_shift WHERE pid = ? AND end_at > ?").bind(pid, nowS).first();
  if (mine) return no("You already have a chain watch shift - one at a time. Cancel it first to pick another.", 409);
  const clash = await env.OC_DB.prepare("SELECT name, start_at, end_at FROM cw_shift WHERE role = ? AND start_at < ? AND end_at > ? LIMIT 1")
    .bind(role, end, start).first();
  if (clash) return no(`${CW_ROLES[role]} is already taken by ${clash.name} for part of that time.`, 409);
  const cover = cwEnergyCover(stats, start, end);
  await env.OC_DB.prepare("INSERT INTO cw_shift (pid, name, role, start_at, end_at, created, est_hits, need_hits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(pid, name, role, start, end, Date.now(), cover ? cover.hits : null, cover ? cover.need : hours * 12).run();
  return { ok: true, cover };
}

// cancel / remove -> {ok} or {ok:false, error, status}. id null = the member's own current registration.
export async function cwShiftDelete(env, id, pid, isLeader) {
  const nowS = Math.floor(Date.now() / 1000);
  const row = id ? await env.OC_DB.prepare("SELECT id, pid FROM cw_shift WHERE id = ?").bind(Number(id)).first()
                 : await env.OC_DB.prepare("SELECT id, pid FROM cw_shift WHERE pid = ? AND end_at > ? ORDER BY start_at LIMIT 1").bind(pid, nowS).first();
  if (!row) return { ok: false, error: id ? "That shift isn't on the schedule any more." : "You don't have a chain watch shift.", status: 404 };
  if (Number(row.pid) !== Number(pid) && !isLeader) return { ok: false, error: "You can only cancel your own shift - leaders can remove others'.", status: 403 };
  await env.OC_DB.prepare("DELETE FROM cw_shift WHERE id = ?").bind(row.id).run();
  return { ok: true };
}

/* ----------------------------------------------------------------------------
 * Open a member's stored key - the SAME scheme as worker.js optinKey/openKey (AES-256-GCM, key =
 * sha256(MEMBER_DIR|LEADER_DIR|hb-optin), base64url of iv + ciphertext). Only ever held in a local variable for one
 * request; never stored, logged or sent anywhere but Torn.
 * -------------------------------------------------------------------------- */
async function openSealedKey(env, sealed) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.MEMBER_DIR}|${env.LEADER_DIR}|hb-optin`));
  const k = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const b = String(sealed).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "===".slice((b.length + 3) % 4));
  const all = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, k, all.slice(12));
  return new TextDecoder().decode(pt).trim();
}

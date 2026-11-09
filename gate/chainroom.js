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
    }, saved || {});
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
        const q = this.mem.queue[pid];
        if (q) { q.stats = sanitizeStats(msg); changed = true; }
        break;
      }
      case "join": changed = this.doJoin(pid, msg); break;
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
    this.mem.queue[pid] = {
      pid,
      name: m.name || (this.conns.get(pid) && this.conns.get(pid).name) || "Unknown",
      joined_at: Date.now(), hitting_until: 0,
      stats: msg.stats ? sanitizeStats(msg.stats) : null, hits: 0,
    };
    return true;
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
    if (cur !== c.current) return false;                // only for the count the Hub itself saw
    if (reading_expires < c.expires_at) { c.expires_at = reading_expires; c.as_of = now; c.src = "script"; return true; }
    return false;
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
    };
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
    if (due(this.mem._chainAt, READ_MS.chain[stateKey] * mult, now)) {
      this.mem._chainAt = now;
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

    // ---- housekeeping ----
    this.expireRetals(now);
    this.enforceQueueRules(now);
    this.maybeIdleWipe(now);
    this.updateLevel();
    await this.save();
    this.broadcastDeltas();

    const base = Math.min(READ_MS.chain[stateKey] || 120000, READ_MS.attacks[stateKey] || 120000, READ_MS.members[stateKey] || 120000);
    await this.storage.setAlarm(now + Math.max(5000, base) * mult);
  }

  /* ---- member list: names, leader rights, online status of queued members (1 call) ---- */
  async readMembers(now) {
    this.mem.membersAt = now;
    const d = await this.tornGet("faction/members");
    if (!d || !Array.isArray(d.members)) return;
    const members = {}, status = {};
    d.members.forEach((mm) => {
      const id = String(mm.id);
      members[id] = { name: mm.name || "Unknown", position: String(mm.position || ""), is_leader: leaderPos(this.env, mm.position) };
      const la = mm.last_action || {};
      if (this.mem.queue[id]) status[id] = { status: la.status || "Unknown", relative: la.relative || "", ts: now };
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
    this.orderedQueue(true).forEach((q, idx) => {
      const s = q.stats, e = energyNow(q, now);
      if (s && e != null && e < HIT_ENERGY_COST && !canRestoreEnergy(s, now)) {   // under 25e, no way back
        delete this.mem.queue[q.pid]; delete this.mem.status[q.pid]; return;
      }
      const st = this.mem.status[q.pid];
      if (st && st.status === "Offline") {
        q._offlineSince = q._offlineSince || now;
        if (idx < 2 && now - q._offlineSince > 5 * 60 * 1000) { delete this.mem.queue[q.pid]; delete this.mem.status[q.pid]; } // #1/#2 offline 5 min+
      } else q._offlineSince = 0;
    });
  }

  /* ---- idle wipe (contract §5) ------------------------------------------ */
  maybeIdleWipe(now) {
    const live = !!(this.mem.chain && this.mem.chain.current > 0);
    if (live || Object.keys(this.mem.queue).length) return;
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
      me: { pid, is_leader: !!me.is_leader, phase_ms: this.phaseFor(pid) },
      mode: this.modeOf(), reason: this.reasonOf(),
    };
  }
  broadcastDeltas() {
    const now = Date.now();
    this.broadcast({
      t: "sync", now, chain: this.mem.chain, queue: this.orderedQueue(), status: this.mem.status,
      retals: this.openRetals(), config: this.publicConfig(),
    });
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

  /* ---- views ------------------------------------------------------------ */
  // QUEUE ORDER (Nov 2026, user): most CURRENT energy first (energy bar only - refills / Xanax not counted).
  // Ties: earlier join first. Members who haven't reported stats yet go last, in join order.
  orderedQueue(raw) {
    const now = Date.now();
    const list = Object.values(this.mem.queue).map((q) => ({ q, e: energyNow(q, now) }))
      .sort((a, b) => ((b.e == null ? -1 : b.e) - (a.e == null ? -1 : a.e)) || (a.q.joined_at - b.q.joined_at));
    if (raw) return list.map((x) => x.q);
    return list.map(({ q, e }) => ({
      pid: q.pid, name: q.name, joined_at: q.joined_at, energy: e,
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
    return Response.json({ ok: true, in: [this.snapshotMessage(pid)], now: Date.now() });
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
    return Response.json({ queue, now,
      ok: true, connected: this.conns.size, sync_devices: Object.keys(this.mem.syncSeen).length,
      queued: Object.keys(this.mem.queue).length, chain: this.mem.chain ? this.mem.chain.current : 0,
      retals: this.openRetals().length, members: Object.keys(this.mem.members).length,
      mode: this.modeOf(), reason: this.reasonOf(), requests_today: this.mem.usageCount,
      alarm: (await this.storage.getAlarm()) != null, last_error: this.mem.lastErr || "",
      homepage_readings_today: this.mem.webDay === todayUTC() ? this.mem.webReadings || 0 : 0,
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

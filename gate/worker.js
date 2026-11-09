// =====================================================================================================
// Heart Breakers - GATEKEEPER (Cloudflare Worker, deployed with the site by tools/deploy_site.sh)
//
// Serves the whole site. The site's files are uploaded WITH this worker (Workers static assets, "ASSETS"
// binding, run_worker_first = true), so there is no other address they can be read from - every request
// comes through here first:
//   /login            sign in with a Torn API key (Public access is enough). The key is used ONCE to ask
//                     Torn who the person is and which faction they're in, then thrown away - never stored.
//                     A Heart Breakers member gets a signed pass (cookie "hb_s", 30 days, HttpOnly).
//   /logout           removes the pass
//   /m/mine.json      the signed-in member's OWN reliability / armory figures (from the leaders' db/private.json)
//   /l/gh/contents/*  leaders' tools save to the private data repo through here (faction token, never on devices)
//   /m/whoami.json    JSON {id, name, position, leader, since, until} for the signed-in member (My Account, menus, scripts)
//   /m/...            members' pages  (pass + still in the faction)
//   /m/me             -> their own profile (member.html?id=<their id>)
//   /l/...            leaders' pages  (pass + position in LEADER_POSITIONS)
//   /                 the dashboard: Leaders Hub (/l/) for leader access, else the Members Hub (/m/)
//   /<image>          public images at the site root (the faction description banner: banner-animated.webp ...)
//   /oc/cpr           OC Payout Optimizer pass-rate sharing (D1 "OC_DB") - its own auth: the member's Torn key
//                     on every call (not the pass cookie). See OC OPTIMIZER below.
//   /oc/plan          OC Optimizer: the crimes leaders turned off + the caller's OWN assigned role (key-checked)
//   /l/oc/*           leaders' OC Management page: settings, deployed plan, shared rates (pass cookie, leaders)
//
// Nothing from GitHub shows through: GitHub's response headers are dropped (only type / caching headers are
// passed on) and GitHub's own error pages are replaced by ours, so visitors only ever see this address.
//
// Every visit re-checks the pass against the CURRENT member list (db/members.json, refreshed by the site
// every update), so someone who leaves the faction loses access straight away, and a
// leader who's demoted loses the leader pages. Images/fonts (png webp jpg gif ttf ico) are served WITHOUT
// a pass, because Torn announcements / newsletters and Discord load them without signing in.
//
// Folder names inside the upload are derived from the MEMBER_DIR / LEADER_DIR secrets
// (sha256(dir + "|gate"), first 32 hex chars) - generate.py writes there when the gate is on. They never
// appear in any page, link or log (and the files can't be reached without this worker anyway).
//
// Settings (wrangler.toml [vars] + secrets put by the workflow):
//   ASSETS             the site's files (binding from wrangler.toml [assets], uploaded by the deploy)
//   FACTION_ID         51384
//   LEADER_POSITIONS   comma list, e.g. "Leader,Co-leader"   (case-insensitive)
//   MEMBER_DIR, LEADER_DIR   (secrets - same values as the GitHub secrets)
//   SESSION_SECRET     (secret) signs the passes; changing it signs everyone out
//   (no Torn key here: members' Public keys at sign-in are the only Torn access the site uses)
// =====================================================================================================

import {ocPlan} from "./oc_planner.js";   // shared OC team planner (also inlined into the OC Management page)

const COOKIE = "hb_s";
const API_COMMENT = "Heart Breakers Hub";        // on every Torn API call the site makes
const PASS_DAYS = 30;
const PUBLIC_EXT = /\.(png|webp|jpe?g|gif|ttf|ico)$/i;
const enc = new TextEncoder();

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function sha256hex(s) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(env) {
  const secret = env.SESSION_SECRET || (await sha256hex(`${env.MEMBER_DIR}|${env.LEADER_DIR}|hb-session`));
  return crypto.subtle.importKey("raw", enc.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign", "verify"]);
}
async function makePass(env, user) {
  const body = b64u(enc.encode(JSON.stringify({...user, t: Date.now(), e: Date.now() + PASS_DAYS * 864e5})));
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body)));
  return `${body}.${sig}`;
}
async function readPass(env, req) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return p.e > Date.now() ? p : null;
  } catch (e) { return null; }
}
const cookie = (v, maxAge) => `${COOKIE}=${v}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

// hidden folder names inside the uploaded site
const physDir = async dir => (await sha256hex(`${dir}|gate`)).slice(0, 32);

// current members (db/members.json from the uploaded site - always the latest deploy)
async function currentMembers(env, ctx) {
  const r = await env.ASSETS.fetch(new Request(`https://assets.local/${await physDir(env.MEMBER_DIR)}/db/members.json`));
  if (!r.ok) return null;
  const d = await r.json();
  const map = new Map();
  for (const m of d.members || []) if (m.current) map.set(m.id, m);
  return map;
}
function isLeader(env, position) {
  const want = String(env.LEADER_POSITIONS || "Leader,Co-leader").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return want.includes(String(position || "").toLowerCase());
}

// who is this? -> {id, name, position, leader, since, until} or null. Position comes from the live member list;
// since / until = when this device signed in / when the pass runs out (ms) - shown on My Account.
async function whoIs(env, ctx, req) {
  const p = await readPass(env, req);
  if (!p) return null;
  const members = await currentMembers(env, ctx);
  if (members) {
    const m = members.get(p.i);
    if (!m) return null;                     // left the faction -> no access
    return {id: p.i, name: m.name, position: m.position || "", leader: isLeader(env, m.position), since: p.t, until: p.e};
  }
  return {id: p.i, name: p.n, position: p.p || "", leader: isLeader(env, p.p), since: p.t, until: p.e};   // list unavailable: trust the pass
}

// ---------- pages ----------
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function page(title, body, status = 200) {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>
body{background:#100a0b;color:#ddd;font:15px system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.box{background:#170d0e;border:1px solid #5c1c1a;border-radius:12px;max-width:440px;width:100%;padding:22px;box-shadow:0 10px 30px #000a}
h1{color:#e4382e;text-align:center;letter-spacing:3px;font-size:24px;margin:0 0 4px;text-transform:uppercase}.sub{text-align:center;color:#9a9a9c;font-size:13px;margin:0 0 16px}
label{display:block;color:#9a9a9c;font-size:12px;margin:10px 0 4px}input{width:100%;box-sizing:border-box;background:#1f1214;color:#eee;border:1px solid #4a1d1b;border-radius:8px;padding:11px;font:15px system-ui}
button{width:100%;margin-top:12px;background:#e4382e;color:#fff;border:0;border-radius:8px;padding:12px;font-weight:700;font-size:15px;cursor:pointer}
.err{background:#3a1312;border:1px solid #e4382e;color:#ffd2cf;border-radius:8px;padding:9px 12px;font-size:13px;margin:0 0 10px}
.tos{margin-top:16px;font-size:12px;color:#9a9a9c}.tos table{width:100%;border-collapse:collapse;margin-top:6px}.tos td{border-top:1px solid #2a1416;padding:5px 4px;vertical-align:top}
.tos td:first-child{color:#e8be5a;white-space:nowrap}a{color:#e8be5a}</style></head><body><div class="box">${body}</div></body></html>`,
    {status, headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"}});
}
function loginPage(next, err) {
  return page("Heart Breakers - Sign in", `<h1>Heart Breakers</h1><p class="sub">Members only - sign in with your Torn API key</p>
${err ? `<div class="err">${esc(err)}</div>` : ""}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}">
<label>Torn API key (a <b>Public</b> key is enough)</label><input name="key" id="k" type="password" autocomplete="off" required minlength="16" maxlength="16" placeholder="16 characters">
<label style="display:flex;gap:8px;align-items:flex-start;color:#ddd;font-size:13px;margin-top:12px"><input type="checkbox" id="keep" checked style="width:auto;margin-top:2px">
<span>Keep my key in this browser for the live war and chain timers<br><span style="color:#9a9a9c;font-size:12px">Stored only on this device, used only for
your own requests to Torn (comment "Heart Breakers Hub"). Remove it any time from the Me menu, or by signing out.</span></span></label>
<button type="submit">Sign in</button></form>
<script>
// "keep my key": saved in THIS browser only (localStorage hb_pub_key) before the form is sent - the hubs' live war and
// chain timers call Torn from the browser with it. The gatekeeper still uses the key once and throws it away.
(function(){var K="hb_pub_key";try{if(/[?&]out=1/.test(location.search))localStorage.removeItem(K);}catch(e){}
document.querySelector("form").addEventListener("submit",function(){try{var v=document.getElementById("k").value.trim();
if(document.getElementById("keep").checked&&/^[A-Za-z0-9]{16}$/.test(v))localStorage.setItem(K,v);else localStorage.removeItem(K);}catch(e){}});})();
</script>
<div class="tos">Need a key? Torn → <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener">Settings → API Keys</a> → create one with <b>Public</b> access.
<table><tr><td>Used for</td><td>Checking once that you're in Heart Breakers (your Torn ID, name and faction)</td></tr>
<tr><td>Key stored</td><td>Not by the site - it's used for that one check and thrown away. If you tick "keep my key", your own browser keeps it for the live timers</td></tr>
<tr><td>Data kept</td><td>A signed pass in your browser (30 days) with your Torn ID and name</td></tr>
<tr><td>Shared with</td><td>Nobody</td></tr><tr><td>Access level</td><td>Public</td></tr></table></div>`);
}

// ---------- sign in ----------
async function doLogin(env, req) {
  const f = await req.formData();
  const key = String(f.get("key") || "").trim(), next = safeNext(f.get("next"));
  if (!/^[A-Za-z0-9]{16}$/.test(key)) return loginPage(next, "That doesn't look like a Torn API key (16 letters/numbers).");
  let d;
  try {
    const r = await fetch(`https://api.torn.com/user/?selections=profile&key=${encodeURIComponent(key)}&comment=${encodeURIComponent(API_COMMENT)}`);
    d = await r.json();
  } catch (e) { return loginPage(next, "Couldn't reach Torn just now - try again in a minute."); }
  if (d.error) return loginPage(next, `Torn said: ${d.error.error || "error " + d.error.code}`);
  const fid = String((d.faction || {}).faction_id || "");
  if (fid !== String(env.FACTION_ID)) return page("Not a member", `<h1>Members only</h1><p class="sub">${esc(d.name)} [${esc(d.player_id)}] isn't in Heart Breakers,
so these pages aren't available. If you've just joined, try again after the next site update (up to 3 hours).</p>`, 403);
  const pass = await makePass(env, {i: d.player_id, n: d.name, p: (d.faction || {}).position || ""});
  return new Response(null, {status: 302, headers: {Location: next, "Set-Cookie": cookie(pass, PASS_DAYS * 86400), "Cache-Control": "no-store"}});
}
// no / unknown "next" -> "/" (the dashboard: leaders land on the Leaders Hub, everyone else on the Members Hub)
const safeNext = n => { n = String(n || "/"); return /^\/[ml]\//.test(n) || n === "/" ? n : "/"; };

// ---------- proxy to the site's files ----------
// Only these headers are passed on - everything else GitHub sends (Server, X-GitHub-Request-Id, Via,
// X-Served-By, Access-Control-*, ...) is dropped so nothing points back at where the files live.
// (Kept from the GitHub Pages days - the files now come from the ASSETS upload.)
const KEEP_HEADERS = ["content-type", "etag", "last-modified"];
async function proxy(env, dir, rest, req, gated) {
  let path = rest || "";
  if (path === "" || path.endsWith("/")) path += "index.html";
  const where = dir ? `${await physDir(dir)}/` : "";          // dir "" = site root (public images only)
  const h0 = new Headers();
  const inm = req.headers.get("If-None-Match");
  if (inm) h0.set("If-None-Match", inm);
  const r = await env.ASSETS.fetch(new Request(new URL(`/${where}${path}`, req.url), {headers: h0}));
  if (!r.ok && r.status !== 304) return notFound();         // never show GitHub's own error page
  const h = new Headers();
  for (const k of KEEP_HEADERS) { const v = r.headers.get(k); if (v) h.set(k, v); }
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Cache-Control", gated ? "private, max-age=60" : "public, max-age=300");
  return new Response(r.body, {status: r.status, headers: h});
}
const notFound = () => page("Not found", `<h1>Not found</h1><p class="sub">That page doesn't exist.
<br><br><a href="/m/">Go to the Members Hub</a></p>`, 404);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    // the dashboard address: members with leader access default to the Leaders Hub
    if (p === "/") {
      const who = await whoIs(env, ctx, req);
      if (!who) return Response.redirect(`${url.origin}/login`, 302);
      return Response.redirect(url.origin + (who.leader ? "/l/" : "/m/"), 302);
    }
    if (p === "/login") return req.method === "POST" ? doLogin(env, req) : loginPage(safeNext(url.searchParams.get("next")));
    // signing out also tells the login page to forget a key kept in this browser (?out=1)
    if (p === "/logout") return new Response(null, {status: 302, headers: {Location: "/login?out=1", "Set-Cookie": cookie("", 0)}});
    if (p === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");
    // OC Payout Optimizer script (runs on torn.com, authenticates with the member's own Torn key)
    if (p === "/oc/cpr" || p === "/oc/cpr/read" || p === "/oc/cpr/delete") return ocRoute(env, ctx, req, url, p);
    if (p === "/oc/plan") return ocPlanRoute(env, ctx, req);
    if (p === "/oc/snapshot/read" || p === "/oc/snapshot/write" || p === "/oc/bundle" || p === "/oc/history") return ocFeedRoute(env, ctx, req, p);
    if (p === "/oc/history/stats") return ocHistStats(env);
    const area = p.startsWith("/m/") || p === "/m" ? "m" : p.startsWith("/l/") || p === "/l" ? "l" : null;
    // public images at the site root (faction description banner) - one level only, images only
    if (!area && /^\/[\w.-]+$/.test(p) && PUBLIC_EXT.test(p)) return proxy(env, "", p.slice(1), req, false);
    if (!area) return notFound();
    if (p === "/m" || p === "/l") return Response.redirect(url.origin + p + "/", 302);
    const rest = p.slice(3);
    const dir = area === "m" ? env.MEMBER_DIR : env.LEADER_DIR;
    // images + fonts: open (Torn / Discord embed them without a pass)
    if (area === "m" && PUBLIC_EXT.test(rest)) return proxy(env, dir, rest, req, false);
    const who = await whoIs(env, ctx, req);
    if (!who) {
      if (req.method === "GET" && (rest === "" || rest.endsWith(".html") || rest.endsWith("/") || rest === "me"))
        return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(p + url.search)}`, 302);
      return new Response("Sign in first", {status: 401});
    }
    if (area === "l" && !who.leader)
      return page("Leaders only", `<h1>Leaders only</h1><p class="sub">${esc(who.name)}, this part of the site is for faction leaders.
<br><br><a href="/m/">Go to the Members Hub</a></p>`, 403);
    if (rest === "me") return Response.redirect(`${url.origin}/m/member.html?id=${who.id}`, 302);
    if (rest === "whoami.json") return Response.json(who, {headers: {"Cache-Control": "no-store"}});
    // a member's OWN private figures (reliability, Xanax) - picked out of the leaders' db/private.json
    if (area === "m" && rest === "mine.json") return mine(env, who);
    // opt-in stats (own Limited key): settings / save / delete - always the signed-in member's own entry
    if (area === "m" && (rest === "optin" || rest === "optin.json")) return optinRoute(env, req, who);
    // "View my shared data" (My data & sharing): everything the signed-in member shares, and with whom
    if (area === "m" && rest === "shared.json") return mySharedData(env, who);
    // leaders: OC Management page (oc.html) - settings / deployed plan / shared rates (D1)
    if (area === "l" && rest.startsWith("oc/")) return ocLeaderRoute(env, req, url, who, rest.slice(3));
    // leaders: live war readiness of members who opted in
    if (area === "l" && rest === "readiness.json") return readiness(env, ctx);
    // leaders' tools save through here (no GitHub token on their devices) - see ghProxy
    if (area === "l" && rest.startsWith("gh/contents/")) return ghProxy(env, req, who, rest.slice("gh/contents/".length));
    return proxy(env, dir, rest, req, true);
  },

  // ---------- timer: starts the update workflows (GitHub's own schedule proved unreliable) ----------
  // wrangler.toml [triggers]: "0,15,30,45 * * * *" -> Crime delay check (+ Faction banner on the hour),
  // "7,22,37,52 * * * *" -> Chain watch, "*/3 * * * *" -> OC data feed pull (no GitHub). Needs the GH_DISPATCH secret (token with Actions: write on CODE_REPO).
  async scheduled(event, env, ctx) {
    // "*/3 * * * *" -> the OC data feed: the Hub pulls OC data from Torn itself (ocFeedPull, below)
    if (event.cron.startsWith("*/3")) { ctx.waitUntil(ocFeedPull(env).catch(() => {})); return; }
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const runs = event.cron.startsWith("7,") ? [["chainwatch.yml", {}]]
      : [["crimes.yml", {}]].concat(minute === 0 ? [["banner.yml", {scheduled: "1"}]] : []);
    ctx.waitUntil(Promise.all(runs.map(([wf, inputs]) => dispatch(env, wf, inputs))));
  },
};

const CODE_REPO = "S1SEVEN17/HeartBreakersSite";
const DATA_REPO = "S1SEVEN17/HeartBreakersLogo";       // private: config.json + data/

// ---------- leaders' saves (GET / PUT /l/gh/contents/<path>) ----------
// The leaders' tools (Payout Calculator, Newsletter Builder, Faction Description, Announcements) talk to GitHub's
// contents API THROUGH the gatekeeper: it checks the leader's pass (already done before we get here), adds the
// faction's own token (GH_DISPATCH secret = DATA_TOKEN, Contents: write on the data repo) and forwards the call.
// No GitHub token is needed - or ever shown - on any device. Only these paths can be read / written:
const GH_PATHS = [/^config\.json$/, /^data\/payouts\/[\w.-]+$/, /^data\/panels\/[\w.-]+$/];
// read-only for leaders (OC Management): the active crimes and the Refresh button's members + history rates
const GH_READ_ONLY = [/^data\/oc_active\.json$/, /^data\/oc_pool\.json$/];
async function ghProxy(env, req, who, path) {
  path = decodeURIComponent(path.split("?")[0]);
  const readOnly = GH_READ_ONLY.some(rx => rx.test(path));
  if (!readOnly && !GH_PATHS.some(rx => rx.test(path))) return new Response("Not allowed", {status: 403});
  if (readOnly && req.method !== "GET") return new Response("Read only", {status: 403});
  if (!["GET", "PUT"].includes(req.method)) return new Response("Method not allowed", {status: 405});
  // a custom header can't be sent cross-site without CORS approval -> blocks other sites posting with the cookie
  if (req.method === "PUT" && req.headers.get("X-HB-Save") !== "1") return new Response("Missing header", {status: 400});
  const tok = env.GH_SAVE || env.GH_DISPATCH;
  if (!tok) return new Response("Saving isn't set up (GH_DISPATCH secret missing)", {status: 503});
  let body;
  if (req.method === "PUT") {
    const j = await req.json().catch(() => null);
    if (!j || typeof j.content !== "string") return new Response("Bad request", {status: 400});
    // who saved it goes in the commit message (the commit itself is made with the faction's token)
    j.message = `${String(j.message || "Update " + path).slice(0, 200)} (by ${who.name} [${who.id}])`;
    body = JSON.stringify(j);
  }
  const ref = new URL(req.url).searchParams.get("ref");
  const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/${path}${ref ? "?ref=" + encodeURIComponent(ref) : ""}`, {
    method: req.method, body,
    headers: {Authorization: "Bearer " + tok, Accept: "application/vnd.github+json", "User-Agent": "hb-gate",
              "Content-Type": "application/json"}});
  return new Response(r.body, {status: r.status, headers: {"Content-Type": "application/json", "Cache-Control": "no-store"}});
}

// ---------- a member's own private figures ----------
// db/private.json (leaders' folder, written by generate.py): {members: {"<id>": {...reliability, xanax...}}}.
// Members may only see THEIR entry; leaders read the whole file from /l/db/private.json.
async function mine(env, who) {
  const r = await env.ASSETS.fetch(new Request(`https://assets.local/${await physDir(env.LEADER_DIR)}/db/private.json`));
  const j = r.ok ? await r.json().catch(() => ({})) : {};
  return Response.json(Object.assign({id: who.id}, (j.members || {})[String(who.id)] || {}, {averages: j.averages || {}}),
                       {headers: {"Cache-Control": "no-store"}});
}
async function dispatch(env, wf, inputs) {
  if (!env.GH_DISPATCH) { console.log("GH_DISPATCH secret missing"); return; }
  const r = await fetch(`https://api.github.com/repos/${CODE_REPO}/actions/workflows/${wf}/dispatches`, {
    method: "POST", body: JSON.stringify({ref: "main", inputs}),
    headers: {Authorization: "Bearer " + env.GH_DISPATCH, Accept: "application/vnd.github+json",
              "User-Agent": "hb-gate", "Content-Type": "application/json"}});
  console.log(`dispatch ${wf}: ${r.status}`);
}



// =====================================================================================================
// OPT-IN STATS (members' own Limited key) - battle stats, work stats, war readiness. Everything is opt-in.
//   GET    /m/optin.json      the signed-in member's own settings (never the key)
//   PUT    /m/optin           {key?, bs, ws, ready} - bs / ws: "off" | "leaders" | "faction"; ready: true / false.
//                             A new key is checked with Torn first: it must be a Limited (or higher) key and
//                             belong to the signed-in member. Everything off = the same as DELETE.
//   DELETE /m/optin           delete my key and settings (their stats are removed by the next update)
//   GET    /l/readiness.json  leaders: live war readiness (energy, happy, cooldowns, refill, status) for every
//                             member who turned "war readiness" on - read from Torn with THEIR key, ~1 min cache
// Storage: data/optin.json in the private data repo {v, members: {id: {k, bs, ws, ready, since, updated}}}.
//   k = the key encrypted with AES-256-GCM (base64url of iv + ciphertext): the encryption key is
//   sha256(MEMBER_DIR|LEADER_DIR|hb-optin) - the same secrets the update workflow has, so it can read the stats.
//   The plain key is never stored, logged or sent to a browser.
// Deleted automatically (generate.py optin_update): when the member leaves the faction or Torn says the key is
// gone (deleted / account deleted) - and whenever the member deletes it here.
// =====================================================================================================
const OPTIN_PATH = "data/optin.json";
const SHARE = ["off", "leaders", "faction"];
async function optinKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`${env.MEMBER_DIR}|${env.LEADER_DIR}|hb-optin`));
  return crypto.subtle.importKey("raw", raw, {name: "AES-GCM"}, false, ["encrypt", "decrypt"]);
}
async function sealKey(env, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv}, await optinKey(env), enc.encode(key));
  const all = new Uint8Array(12 + ct.byteLength); all.set(iv, 0); all.set(new Uint8Array(ct), 12);
  return b64u(all);
}
async function openKey(env, sealed) {
  const all = unb64u(sealed);
  const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: all.slice(0, 12)}, await optinKey(env), all.slice(12));
  return new TextDecoder().decode(pt);
}
function ghHeaders(env) {
  return {Authorization: "Bearer " + (env.GH_SAVE || env.GH_DISPATCH), Accept: "application/vnd.github+json",
          "User-Agent": "hb-gate", "Content-Type": "application/json"};
}
// read data/optin.json -> {data, sha}; cached in memory a short while for the readiness page
let OPTIN_CACHE = {t: 0, v: null};
async function readOptin(env, fresh) {
  if (!fresh && OPTIN_CACHE.v && Date.now() - OPTIN_CACHE.t < 60e3) return OPTIN_CACHE.v;
  const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/${OPTIN_PATH}?ref=main`, {headers: ghHeaders(env)});
  let v = {data: {v: 1, members: {}}, sha: undefined};
  if (r.ok) {
    const j = await r.json();
    try { v = {data: JSON.parse(new TextDecoder().decode(unb64u(j.content.replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_")))), sha: j.sha}; }
    catch (e) { v = {data: {v: 1, members: {}}, sha: j.sha}; }
  } else if (r.status !== 404) throw new Error("couldn't read the opt-in list (" + r.status + ")");
  v.data.members = v.data.members || {};
  OPTIN_CACHE = {t: Date.now(), v};
  return v;
}
// change one member's entry (fn(entry) -> new entry or null = delete) - retried when the file changed meanwhile
async function writeOptin(env, id, fn, msg) {
  for (let i = 0; i < 3; i++) {
    const {data, sha} = await readOptin(env, true);
    const nv = fn(data.members[id] || null);
    if (nv) data.members[id] = nv; else delete data.members[id];
    const body = JSON.stringify(data, null, 1) + "\n";
    const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/${OPTIN_PATH}`, {method: "PUT", headers: ghHeaders(env),
      body: JSON.stringify({message: msg, sha, branch: "main", content: btoa(unescape(encodeURIComponent(body)))})});
    if (r.ok) { OPTIN_CACHE = {t: 0, v: null}; return true; }
    if (r.status !== 409 && r.status !== 422) throw new Error("save failed (" + r.status + ")");
  }
  throw new Error("save failed - try again");
}
// Torn v1 user call with a member's key (the key goes in the URL for v1 - never logged)
async function tornUser(key, selections) {
  const r = await fetch(`https://api.torn.com/user/?selections=${selections}&key=${encodeURIComponent(key)}&comment=${encodeURIComponent(API_COMMENT)}`);
  return r.json();
}
const publicEntry = e => e ? {opted: true, bs: e.bs, ws: e.ws, ready: !!e.ready, oc: !!e.oc, since: e.since, updated: e.updated} : {opted: false};
// OC PASS RATES WITH THE STORED KEY (Nov 2026, My data & sharing "🕵️ OC pass rates"): the member's opt-in key
// (the same encrypted key as their stats) reads THEIR checkpoint pass rates - v2 user/organizedcrimes: only the open
// roles of recruiting crimes carry the key owner's rate - into oc_cpr (prod), exactly like the OC Optimizer script's
// shares, so OC Management's Team Builder and the script's role suggestions use them.
//   on save (turned on)  -> read at once          turned off / deleted -> their row removed
//   the timer (every 3 min, ocOptinPull) -> each opted-in member about hourly, at most OC_OPTIN_PER_RUN a run
//   nothing recruiting -> the last rates stay (not wiped); key deleted / not theirs (Torn code 2) -> row removed
const OC_OPTIN_EVERY = 60 * 60e3, OC_OPTIN_PER_RUN = 8;
const ocBaseRole = l => String(l || "").replace(/#\s*\d+/g, "").replace(/\s+/g, " ").trim();   // "Muscle #2" -> "Muscle"
const ocFb = x => String(x == null ? "" : x).replace(/[.$#\[\]/\x00-\x1f]/g, "_").trim();     // the script's fbKey
async function ocCprDrop(env, id) {
  if (env.OC_DB) await env.OC_DB.prepare("DELETE FROM oc_cpr WHERE env = 'prod' AND faction_id = ? AND player_id = ?")
    .bind(Number(env.FACTION_ID), Number(id)).run();
}
// -> {roles: n} | {bad: true} (key gone) | {err}
async function ocPullMember(env, id, name, key) {
  // API: Heart Breakers Hub - a member's own OC pass rates with THEIR opt-in key (Torn V2 user/organizedcrimes)
  const r = await fetch(`https://api.torn.com/v2/user/organizedcrimes?comment=${encodeURIComponent(API_COMMENT)}`,
                        {headers: {Authorization: "ApiKey " + key, Accept: "application/json"}});
  const d = await r.json();
  if (d.error) { if (d.error.code === 2) { await ocCprDrop(env, id); return {bad: true}; } return {err: d.error.error || "Torn error"}; }
  const roles = {};
  for (const c of d.organizedcrimes || []) for (const sl of c.slots || []) {
    if (sl.user || typeof sl.checkpoint_pass_rate !== "number") continue;
    roles[ocFb(c.name) + "|" + ocFb(ocBaseRole((sl.position_info && sl.position_info.label) || sl.position))] = Math.round(sl.checkpoint_pass_rate);
  }
  const n = Object.keys(roles).length;
  if (n) await env.OC_DB.prepare(
    "INSERT INTO oc_cpr (env, faction_id, player_id, name, roles, ts) VALUES ('prod', ?, ?, ?, json(?), ?) " +
    "ON CONFLICT (env, faction_id, player_id) DO UPDATE SET name = excluded.name, roles = excluded.roles, ts = excluded.ts")
    .bind(Number(env.FACTION_ID), Number(id), String(name || "").slice(0, 40), JSON.stringify(roles), Date.now()).run();
  return {roles: n};
}
// timer step: members with "OC pass rates" on, oldest-tried first, about hourly each; also removes shared rows of
// anyone no longer in the faction (roster)
async function ocOptinPull(env, now) {
  const {data} = await readOptin(env, false);
  const ros = await ocSnapGet(env, "prod", "roster");
  const roster = (ros && ros.data) || null;
  if (roster && Object.keys(roster).length > 10) {
    const ids = Object.keys(roster).map(Number).filter(Boolean);
    await env.OC_DB.prepare(`DELETE FROM oc_cpr WHERE faction_id = ? AND player_id NOT IN (${ids.join(",")})`).bind(Number(env.FACTION_ID)).run();
  }
  const tried = ((await ocSnapGet(env, "hub", "oc-optin")) || {data: {}}).data || {};
  const due = Object.keys(data.members).filter(i => data.members[i].oc && (!roster || roster[i] != null) && now - (tried[i] || 0) >= OC_OPTIN_EVERY)
    .sort((a, b) => (tried[a] || 0) - (tried[b] || 0)).slice(0, OC_OPTIN_PER_RUN);
  for (const i of due) {
    tried[i] = now;
    try { await ocPullMember(env, i, roster ? roster[i] : "", await openKey(env, data.members[i].k)); } catch (e) {}
  }
  Object.keys(tried).forEach(i => { if (!data.members[i] || !data.members[i].oc) delete tried[i]; });
  if (due.length) await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'oc-optin', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(tried)).run();
}

// DELAYED CRIMES for the script's leader alerts (Nov 2026, crimes-tab addendum): a crime that is READY (ready_at
// passed, every slot filled) but held up by a member - the same rule as the Discord delay posts (generate.py
// crime_issues): not Okay (travelling / abroad / hospital / jail), missing the slot's item, or no longer in the
// faction. Member statuses (faction/members, 1 call) are read ONLY when some crime is ready - normally no call.
// Saved as oc_snap env 'hub' ds 'delays': [{crime, crime_id, members: [{pid, name, position, reason, overdue_hours}], since}]
async function ocDelayCheck(env, crimes, now, ops) {
  const ready = crimes.filter(c => c && c.ready_at && c.ready_at * 1000 <= now && (c.slots || []).length && (c.slots || []).every(sl => sl.user));
  let out = [];
  if (ready.length) {
    const m = await ocTorn(env, "faction/members");
    const mem = new Map((Array.isArray(m.members) ? m.members : Object.values(m.members || {})).map(x => [Number(x.id), x]));
    for (const c of ready) {
      const who = [];
      for (const sl of c.slots || []) {
        const pid = Number(sl.user.id), x = mem.get(pid), pos = ocBaseRole((sl.position_info && sl.position_info.label) || sl.position);
        const st = x && x.status ? x.status : null;
        const reason = !x ? "no longer in the faction"
          : st && String(st.state || "Okay").toLowerCase() !== "okay" ? (st.description || st.state)
          : sl.item_requirement && sl.item_requirement.is_available === false ? "missing the required item" : null;
        if (reason) who.push({pid, name: x ? x.name : "#" + pid, position: pos, reason,
                              overdue_hours: Math.round((now / 1000 - c.ready_at) / 360) / 10});
      }
      if (who.length) out.push({crime: c.name, crime_id: c.id, members: who, since: c.ready_at * 1000});
    }
  }
  ops.push(env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'delays', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(out)));
}

// "View my shared data" (Nov 2026): GET /m/shared.json - ONLY the signed-in member's own data, exactly what others
// can see of it:
//   optin  {bs, ws, ready, since, updated} (never the key - only whether one is stored)
//   stats  {bs: [[day, str, def, spd, dex]...], ws: [[day, man, int, end]...]} from data/optin_stats.json
//   ready  what leaders see on War Readiness right now (read live from Torn with their stored key; nothing saved)
//   oc     {ts, roles: {"Crime|Role": rate}} their shared OC pass rates (D1 oc_cpr, live)
async function mySharedData(env, who) {
  const H = {headers: {"Cache-Control": "no-store"}};
  const id = String(Number(who.id)), out = {id: Number(id), name: who.name};
  try {
    const {data} = await readOptin(env, true);
    const e = data.members[id];
    out.optin = e ? {bs: e.bs, ws: e.ws, ready: !!e.ready, oc: !!e.oc, since: e.since, updated: e.updated, key_stored: !!e.k} : null;
    if (e && (e.bs !== "off" || e.ws !== "off")) {
      const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/data/optin_stats.json?ref=main`,
                            {headers: Object.assign(ghHeaders(env), {Accept: "application/vnd.github.raw"})});
      if (r.ok) { const st = await r.json(); out.stats = st[id] || {}; }
    }
    if (e && e.ready) {
      try {
        const d = await tornUser(await openKey(env, e.k), "bars,cooldowns,profile,refills");
        const bar = b => b ? {cur: b.current, max: b.maximum} : null;
        out.ready = d.error ? {err: d.error.error || "Torn error"} :
          {energy: bar(d.energy), nerve: bar(d.nerve), happy: bar(d.happy), life: bar(d.life), cd: d.cooldowns || {},
           refill: (d.refills || {}).energy_refill_used ?? null, status: d.status ? d.status.description : null};
      } catch (x) { out.ready = {err: "couldn't read right now"}; }
    }
  } catch (x) { out.optin_err = "couldn't read your opt-in settings right now"; }
  if (env.OC_DB) {
    const r = await env.OC_DB.prepare("SELECT roles, ts FROM oc_cpr WHERE env = 'prod' AND faction_id = ? AND player_id = ?")
      .bind(Number(env.FACTION_ID), Number(id)).first();
    let roles = {}; try { roles = r ? JSON.parse(r.roles) : {}; } catch (x) {}
    out.oc = r ? {ts: Number(r.ts), roles} : null;
  }
  return Response.json(out, H);
}

async function optinRoute(env, req, who) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (!env.GH_DISPATCH && !env.GH_SAVE) return new Response("Saving isn't set up", {status: 503});
  const id = String(Number(who.id));
  try {
    if (req.method === "GET") {
      const {data} = await readOptin(env, true);
      return Response.json(publicEntry(data.members[id]), H);
    }
    if (req.headers.get("X-HB-Save") !== "1") return new Response("Missing header", {status: 400});
    const tag = `(by ${who.name} [${who.id}])`;
    if (req.method === "DELETE") {
      await writeOptin(env, id, () => null, `Opt-in data deleted ${tag}`);
      await ocCprDrop(env, id);
      return Response.json({opted: false}, H);
    }
    if (req.method !== "PUT") return new Response("Method not allowed", {status: 405});
    const j = await req.json().catch(() => null);
    if (!j) return new Response("Bad request", {status: 400});
    const bs = SHARE.includes(j.bs) ? j.bs : "off", ws = SHARE.includes(j.ws) ? j.ws : "off", ready = !!j.ready, oc = !!j.oc;
    if (bs === "off" && ws === "off" && !ready && !oc) {
      await writeOptin(env, id, () => null, `Opt-in turned off ${tag}`);
      await ocCprDrop(env, id);
      return Response.json({opted: false}, H);
    }
    let sealed = null;
    if (j.key) {
      const key = String(j.key).trim();
      if (!/^[A-Za-z0-9]{16}$/.test(key)) return new Response("That doesn't look like a Torn API key (16 letters/numbers).", {status: 400});
      const d = await tornUser(key, "basic,battlestats,workstats,bars,cooldowns,refills");
      if (d.error) return new Response(d.error.code === 16 ? "That key's access is too low - create a Limited Access key."
                                        : `Torn said: ${d.error.error || "error " + d.error.code}`, {status: 400});
      if (String(d.player_id) !== id) return new Response("That key belongs to someone else - use your own key.", {status: 400});
      sealed = await sealKey(env, key);
    }
    const now = Math.floor(Date.now() / 1000);
    let missing = false, sealedNow = null;
    await writeOptin(env, id, cur => {
      if (!cur && !sealed) { missing = true; return null; }
      sealedNow = sealed || cur.k;
      return {k: sealedNow, bs, ws, ready, oc, since: cur ? cur.since : now, updated: now};
    }, `Opt-in settings saved ${tag}`);
    if (missing) return new Response("Add your Limited API key first.", {status: 400});
    // OC pass rates: read straight away when on (then hourly by the timer - ocOptinPull); removed when off
    let ocNote = null;
    if (oc) ocNote = await ocPullMember(env, id, who.name, await openKey(env, sealedNow)).catch(() => null);
    else await ocCprDrop(env, id);
    return Response.json(Object.assign(publicEntry({bs, ws, ready, oc, since: now, updated: now}), {oc_now: ocNote}), H);
  } catch (e) {
    return new Response(e.message || "Something went wrong", {status: 502});
  }
}
// live war readiness for leaders: every opted-in member with "ready" on, read with their own key
let READY_CACHE = {t: 0, v: null};
async function readiness(env, ctx) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (READY_CACHE.v && Date.now() - READY_CACHE.t < 60e3) return Response.json(READY_CACHE.v, H);
  const {data} = await readOptin(env, false);
  const members = await currentMembers(env, ctx) || new Map();
  const ids = Object.keys(data.members).filter(i => data.members[i].ready && members.has(Number(i)));
  const rows = await Promise.all(ids.map(async i => {
    const m = members.get(Number(i)) || {};
    try {
      const d = await tornUser(await openKey(env, data.members[i].k), "bars,cooldowns,profile,refills");
      if (d.error) return {id: +i, name: m.name, err: d.error.error || "Torn error " + d.error.code};
      const bar = b => b ? {cur: b.current, max: b.maximum, full: b.fulltime || 0} : null;
      return {id: +i, name: m.name, position: m.position, energy: bar(d.energy), nerve: bar(d.nerve), happy: bar(d.happy), life: bar(d.life),
              cd: d.cooldowns || {}, refill: (d.refills || {}).energy_refill_used ?? null,
              status: d.status ? {state: d.status.state, desc: d.status.description, until: d.status.until} : null,
              last: (d.last_action || {}).timestamp || null};
    } catch (e) { return {id: +i, name: m.name, err: "couldn't read"}; }
  }));
  READY_CACHE = {t: Date.now(), v: {at: Math.floor(Date.now() / 1000), members: rows}};
  return Response.json(READY_CACHE.v, H);
}


// =====================================================================================================
// OC OPTIMIZER - checkpoint pass-rate (CPR) sharing for the "OC Payout Optimizer" userscript (Nov 2026).
// Contract: project doc claude/oc-optimizer-worker-contract.md (the script already calls exactly this).
//   POST /oc/cpr          {key, env, name, roles}  -> upsert the CALLER's own row          -> {ok:true}
//   POST /oc/cpr/read     {key, env}               -> every member's row for that env, keyed by player_id
//   GET  /oc/cpr?env=&key=                         -> the same (OLD - key in the address; switched off with
//                                                     OC_GET_KEY_IN_URL once the script uses POST /oc/cpr/read)
//   POST /oc/cpr/delete   {key, env}               -> delete the CALLER's own row           -> {ok:true}
// Rules:
//   - auth = the member's own Torn key, checked with Torn (user/profile). player_id + faction come from Torn,
//     NEVER from the request body, so a member can only write / delete their own row. Heart Breakers only.
//   - the key is never stored: the key -> {player_id, faction_id, name} answer is cached for 10 minutes under
//     a SHA-256 of the key (KV "OC_KV" when bound, else the Cache API) so repeat calls don't re-ask Torn.
//   - env "test" | "prod" kept apart (part of the primary key). Writes: at most one per player per minute
//     (a faster repeat answers {ok:true, throttled:true} without writing - the script only needs non-error).
//   - key: in the request BODY (all POSTs - Nov 2026: reading moved to POST /oc/cpr/read so the key never sits in
//     a web address, where request logs could pick it up; PDA_httpPost sends bodies), or X-API-Key /
//     Authorization: Bearer headers. The GET's ?key= is only accepted while OC_GET_KEY_IN_URL is true.
//   - CORS for https://www.torn.com (fetch fallback / PDA WebView); OPTIONS -> 204.
//   Torn API calls carry comment=Heart Breakers Hub (API_COMMENT) like every other Hub call.
// Bindings (tools/deploy_site.sh creates them on the first deploy and applies gate/oc_schema.sql):
//   OC_DB  D1 database "hb-oc"     OC_KV  KV namespace "hb-oc-cache" (optional)
// =====================================================================================================
const OC_ENVS = new Set(["test", "prod"]);
// the old GET read with ?key= in the address: switched OFF (Nov 2026 - the script reads with POST /oc/cpr/read
// since v1.45.0); the GET now answers 410 "use POST /oc/cpr/read"
const OC_GET_KEY_IN_URL = false;
const OC_CACHE_SECS = 600;            // key -> identity cache (10 min)
const OC_WRITE_GAP_MS = 60 * 1000;    // one write per player per minute
const OC_MAX_ROLES = 500, OC_MAX_KEY_LEN = 120;
const OC_CORS = {"Access-Control-Allow-Origin": "https://www.torn.com", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                 "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization", "Access-Control-Max-Age": "86400",
                 "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"};
const ocJson = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {...OC_CORS, "Content-Type": "application/json"}});
const ocErr = (status, error) => ocJson({ok: false, error}, status);

async function ocRoute(env, ctx, req, url, p) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: OC_CORS});
  if (!env.OC_DB) return ocErr(503, "OC sharing isn't set up yet");
  const del = p === "/oc/cpr/delete", read = p === "/oc/cpr/read";
  if (req.method === "GET" && p === "/oc/cpr") {
    if (!OC_GET_KEY_IN_URL) return ocErr(410, "use POST /oc/cpr/read");
    return ocRead(env, ctx, url.searchParams.get("env"), ocKey(req, url.searchParams.get("key")));
  }
  if (req.method !== "POST") return ocErr(405, "method not allowed");
  let body;
  try { body = await req.json(); } catch (e) { return ocErr(400, "body must be JSON"); }
  if (!body || typeof body !== "object") return ocErr(400, "body must be JSON");
  if (read) return ocRead(env, ctx, body.env, ocKey(req, body.key));
  return ocWrite(env, ctx, req, body, del);
}

// every member's shared rates for one env, keyed by player_id (both read routes)
async function ocRead(env, ctx, envName, key) {
    if (!OC_ENVS.has(envName)) return ocErr(400, "env must be test or prod");
    const id = await ocIdentify(env, ctx, key);
    if (id.err) return ocErr(id.status, id.err);
    return ocJson(await ocRatesObj(env, envName));
}
// {player_id: {name, ts, roles}} for one env (POST /oc/cpr/read and /oc/bundle)
async function ocRatesObj(env, envName) {
    const {results} = await env.OC_DB.prepare("SELECT player_id, name, roles, ts FROM oc_cpr WHERE env = ? AND faction_id = ?")
      .bind(envName, Number(env.FACTION_ID)).all();
    const out = {};
    for (const r of results || []) {
      let roles = {};
      try { roles = JSON.parse(r.roles); } catch (e) {}
      out[String(r.player_id)] = {name: r.name, ts: r.ts, roles};
    }
    return out;
}

// publish (upsert) or delete the CALLER's own row
async function ocWrite(env, ctx, req, body, del) {
  if (!OC_ENVS.has(body.env)) return ocErr(400, "env must be test or prod");
  const id = await ocIdentify(env, ctx, ocKey(req, body.key));
  if (id.err) return ocErr(id.status, id.err);
  const fid = Number(env.FACTION_ID);
  if (del) {
    await env.OC_DB.prepare("DELETE FROM oc_cpr WHERE env = ? AND faction_id = ? AND player_id = ?").bind(body.env, fid, id.player_id).run();
    return ocJson({ok: true});
  }
  // roles: {"Crime|Role": integer 0-100}; anything else is refused (bad data never reaches the table)
  const roles = body.roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return ocErr(400, "roles must be an object");
  const clean = {};
  const ks = Object.keys(roles);
  if (ks.length > OC_MAX_ROLES) return ocErr(400, "too many roles");
  for (const k of ks) {
    const v = roles[k];
    if (typeof k !== "string" || !k.includes("|") || k.length > OC_MAX_KEY_LEN) return ocErr(400, "bad role name");
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return ocErr(400, "pass rates must be 0-100");
    clean[k] = Math.round(v);
  }
  const now = Date.now();
  const last = await env.OC_DB.prepare("SELECT ts FROM oc_cpr WHERE env = ? AND faction_id = ? AND player_id = ?")
    .bind(body.env, fid, id.player_id).first();
  if (last && now - Number(last.ts) < OC_WRITE_GAP_MS) return ocJson({ok: true, throttled: true});
  // name: Torn's name for the key (the body's name is only a fallback) - nobody can label a row as someone else
  const name = String(id.name || body.name || "").slice(0, 40);
  await env.OC_DB.prepare(
    "INSERT INTO oc_cpr (env, faction_id, player_id, name, roles, ts) VALUES (?, ?, ?, ?, json(?), ?) " +
    "ON CONFLICT (env, faction_id, player_id) DO UPDATE SET name = excluded.name, roles = excluded.roles, ts = excluded.ts")
    .bind(body.env, fid, id.player_id, name, JSON.stringify(clean), now).run();
  return ocJson({ok: true});
}

// the key: X-API-Key / Authorization: Bearer header first, else the body / query value
function ocKey(req, fallback) {
  const h = req.headers.get("X-API-Key") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return String(h || fallback || "").trim();
}

// key -> {player_id, faction_id, name}, cached 10 min under sha256(key) (the key itself is never stored)
async function ocIdentify(env, ctx, key) {
  if (!/^[A-Za-z0-9]{16}$/.test(key)) return {status: 401, err: "missing or invalid Torn API key"};
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("hb-oc|" + key)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const cacheReq = new Request(`https://oc-id.cache/${hash}`);
  let who = null;
  try {
    if (env.OC_KV) who = await env.OC_KV.get(`id:${hash}`, "json");
    else { const c = await caches.default.match(cacheReq); if (c) who = await c.json(); }
  } catch (e) { who = null; }
  if (!who) {
    let d;
    try {
      const base = env.TORN_API_BASE || "https://api.torn.com";          // TORN_API_BASE: local tests only
      const r = await fetch(`${base}/user/?selections=profile&key=${encodeURIComponent(key)}&comment=${encodeURIComponent(API_COMMENT)}`);
      d = await r.json();
    } catch (e) { return {status: 502, err: "couldn't reach Torn"}; }
    if (d.error) {
      // 2 = incorrect key, 13/18 = key disabled / paused, 10 = owner in federal jail
      const bad = [2, 10, 13, 16, 18].includes(Number(d.error.code));
      return {status: bad ? 401 : 502, err: `Torn: ${d.error.error || "error " + d.error.code}`};
    }
    who = {player_id: Number(d.player_id), faction_id: Number((d.faction || {}).faction_id || 0), name: String(d.name || "")};
    const save = env.OC_KV ? env.OC_KV.put(`id:${hash}`, JSON.stringify(who), {expirationTtl: OC_CACHE_SECS})
      : caches.default.put(cacheReq, new Response(JSON.stringify(who), {headers: {"Cache-Control": `max-age=${OC_CACHE_SECS}`}}));
    ctx.waitUntil(save.catch(() => {}));
  }
  if (!who.player_id) return {status: 401, err: "Torn didn't return a player for that key"};
  if (String(who.faction_id) !== String(env.FACTION_ID)) return {status: 403, err: "Heart Breakers members only"};
  return who;
}


// =====================================================================================================
// OC MANAGEMENT (Nov 2026) - leaders turn crimes off for the OC Optimizer's suggestions and deploy Team Builder
// teams; the script asks POST /oc/plan for what applies to the CALLER.
//   D1 oc_config (env, k, v JSON, ts, by):  k = 'disabled' ["Crime", ...]   k = 'plan' {teams: [...], ...}
//   POST /oc/plan {key, env}   (script; key in the body, checked like /oc/cpr)
//        -> {ok:true, disabled:[...], assignment: null | {crime, position, team, rate, difficulty, deployed}, plan_ts}
//        Only the caller's OWN assignment is returned - nobody else's.
//   Leaders (pass cookie, /l/oc/...):
//     GET  /l/oc/config.json?env=   -> {disabled, plan, disabled_ts, plan_ts, disabled_by, plan_by}
//     PUT  /l/oc/config  (X-HB-Save: 1) {env, k: "disabled"|"plan", v}   -> saved (by = the signed-in leader)
//     GET  /l/oc/rates.json?env=    -> the OC Optimizer's shared rates for that env (same shape as /oc/cpr/read)
//     POST /l/oc/refresh (X-HB-Save: 1)  -> starts a crime check now (crimes.yml, oc_refresh=1) so the active crimes are
//                                    current; ONE per minute for all leaders together (oc_config env 'all', k 'refresh')
//                                    -> {ok, next_at} or 429 {ok:false, retry_in (seconds)}
// =====================================================================================================
async function ocConfig(env, envName) {
  const {results} = await env.OC_DB.prepare("SELECT k, v, ts, by FROM oc_config WHERE env = ?").bind(envName).all();
  const out = {disabled: [], plan: null};
  for (const r of results || []) {
    let v = null;
    try { v = JSON.parse(r.v); } catch (e) {}
    out[r.k] = v; out[r.k + "_ts"] = r.ts; out[r.k + "_by"] = r.by;
  }
  if (!Array.isArray(out.disabled)) out.disabled = [];
  return out;
}

async function ocPlanRoute(env, ctx, req) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: OC_CORS});
  if (!env.OC_DB) return ocErr(503, "OC sharing isn't set up yet");
  if (req.method !== "POST") return ocErr(405, "method not allowed");
  let body;
  try { body = await req.json(); } catch (e) { return ocErr(400, "body must be JSON"); }
  if (!body || !OC_ENVS.has(body.env)) return ocErr(400, "env must be test or prod");
  const id = await ocIdentify(env, ctx, ocKey(req, body.key));
  if (id.err) return ocErr(id.status, id.err);
  return ocJson(await ocPlanObj(env, body.env, id));
}
// {ok, disabled, assignment, plan_ts} for the caller (POST /oc/plan and /oc/bundle)
async function ocPlanObj(env, envName, id) {
  const cfg = await ocConfig(env, envName);
  const teamsCfg = (cfg.plan || {}).teams || [];
  // the feed's crimes (every 3 min + members' write-backs) - read once for every spawn / status check below
  const snap = await env.OC_DB.prepare("SELECT as_of, data FROM oc_snap WHERE env = ? AND ds = 'crimes'").bind(envName).first();
  let crimes = null;
  try { crimes = snap ? JSON.parse(snap.data) : null; } catch (e) { crimes = null; }
  let assignment = null;
  for (const t of teamsCfg) {
    for (const r of (t.roles || [])) {
      if (Number(r.pid) === Number(id.player_id)) {
        if (r.existing) continue;                           // already in that crime in Torn - nothing to do
        assignment = {crime: t.crime, position: r.position, team: t.id, rate: r.rate ?? null,
                      difficulty: t.difficulty ?? null, deployed: cfg.plan_ts || null,
                      kind: t.kind || "spawn", crime_id: t.crime_id || null,   // live: join THIS crime id + exact slot
                      queued: !!r.queued, free_at: r.queued ? r.free_at || null : null};   // QUEUE: join after the current crime pays out
      }
    }
  }
  // Spawn state (Nov 2026): teams are planned whether or not the crime is recruiting, so tell the member when
  // there's nothing to join yet. From the feed's crimes (every 3 min):
  //   recruiting   a Recruiting instance of the crime has at least one open slot
  //   role_open    a Recruiting instance has the member's role (base role, "#n" ignored) open
  //   spawn_needed !role_open -> the script warns "this crime needs to be spawned"
  if (assignment) Object.assign(assignment, assignment.crime_id
    ? (() => { const c = (crimes || []).find(x => String(x.id) === String(assignment.crime_id));
        const open = !!(c && c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user && ((sl.position_info && sl.position_info.label) || sl.position) === assignment.position));
        return {recruiting: !!(c && c.status === "Recruiting"), role_open: open, spawn_needed: false, crimes_as_of: snap ? Number(snap.as_of) : null}; })()
    : ocSpawnState(crimes, snap, assignment.crime, assignment.position));

  // ---- Crimes-tab addendum (Nov 2026, project doc claude/oc-optimizer-hub-crimestab-addendum.md) ----
  // is_leader: the key's player holds a leader position (the same LEADER_POSITIONS check as the Leaders Hub)
  const members = await currentMembers(env).catch(() => null);
  const me = members && members.get(Number(id.player_id));
  const is_leader = !!(me && isLeader(env, me.position));
  // teams: EVERY deployed team, visible to all members (the user approved showing the full roster). status per team:
  //   needs_spawn  no Recruiting / Planning instance of the crime
  //   recruiting   a Recruiting instance has at least one open slot
  //   spawned      instances exist but none has an open slot (full / planning)
  const teams = teamsCfg.length ? teamsCfg.map(t => {
    const inst = (crimes || []).filter(c => c && (t.crime_id ? String(c.id) === String(t.crime_id) : c.name === t.crime) && (c.status === "Recruiting" || c.status === "Planning"));
    const open = inst.some(c => c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user));
    return {team: t.id, crime: t.crime, difficulty: t.difficulty ?? null, deployed: cfg.plan_ts || null,
            kind: t.kind || "spawn", crime_id: t.crime_id || null,
            status: crimes == null ? null : !inst.length ? "needs_spawn" : open ? "recruiting" : "spawned",
            members: (t.roles || []).filter(r => r.pid != null).map(r => ({position: ocBaseRole(r.position), slot: r.position, pid: Number(r.pid),
              name: (members && members.get(Number(r.pid)) || {}).name || r.name || ("#" + r.pid), rate: r.rate ?? null,
              existing: !!r.existing, joined: !!r.joined, queued: !!r.queued, free_at: r.queued ? r.free_at || null : null}))};
  }) : null;
  // delays: leaders only (gated here) - the timer's delay check (ocDelayCheck): ready crimes held up by a member
  let delays = [];
  if (is_leader) {
    const d = await ocSnapGet(env, "hub", "delays");
    delays = ((d && d.data) || []).map(x => {
      const t = teamsCfg.find(tm => tm.crime === x.crime && (tm.roles || []).some(r => x.members.some(m => Number(m.pid) === Number(r.pid))));
      return Object.assign({}, x, {team: t ? t.id : null});
    });
  }
  return {ok: true, disabled: cfg.disabled, assignment, plan_ts: cfg.plan_ts || null, is_leader, teams, delays};
}
function ocSpawnState(crimes, snap, crime, position) {
  if (!crimes) return {recruiting: null, role_open: null, spawn_needed: null};
  const want = ocBaseRole(position);
  let recruiting = false, roleOpen = false;
  for (const c of crimes) {
    if (!c || c.name !== crime || c.status !== "Recruiting") continue;
    for (const sl of c.slots || []) {
      if (sl.user) continue;
      recruiting = true;
      if (ocBaseRole((sl.position_info && sl.position_info.label) || sl.position) === want) roleOpen = true;
    }
  }
  return {recruiting, role_open: roleOpen, spawn_needed: !roleOpen, crimes_as_of: Number(snap.as_of)};
}

// a plan's teams, checked + trimmed (leaders' Deploy and the automatic planner) - see gate/oc_planner.js for the shape
function ocCleanTeams(teams) {
  return (teams || []).slice(0, 100).map(t => ({id: String(t.id || "").slice(0, 40), crime: String(t.crime || "").slice(0, 80),
    difficulty: Number(t.difficulty) || null, kind: t.kind === "live" ? "live" : "spawn",
    crime_id: t.kind === "live" && t.crime_id != null ? Number(t.crime_id) || null : null, lock: !!t.lock,
    roles: (Array.isArray(t.roles) ? t.roles : []).slice(0, 10).map(r => ({position: String(r.position || "").slice(0, 40),
      pid: r.pid == null ? null : Number(r.pid) || null, name: String(r.name || "").slice(0, 40),
      rate: r.rate == null ? null : Math.round(Number(r.rate)) || 0, src: r.src ? String(r.src).slice(0, 20) : null,
      existing: !!r.existing, joined: !!r.joined,
      queued: !!r.queued, free_at: r.queued && Number(r.free_at) ? Number(r.free_at) : null}))}));   // QUEUE: still in a Planning crime
}

async function ocLeaderRoute(env, req, url, who, sub) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (!env.OC_DB) return Response.json({ok: false, error: "OC storage isn't set up yet"}, {status: 503});
  if (req.method === "GET" && (sub === "config.json" || sub === "rates.json")) {
    const envName = url.searchParams.get("env");
    if (!OC_ENVS.has(envName)) return Response.json({ok: false, error: "env must be test or prod"}, {status: 400});
    if (sub === "config.json") return Response.json(await ocConfig(env, envName), H);
    const {results} = await env.OC_DB.prepare("SELECT player_id, name, roles, ts FROM oc_cpr WHERE env = ? AND faction_id = ?")
      .bind(envName, Number(env.FACTION_ID)).all();
    const out = {};
    for (const r of results || []) { let roles = {}; try { roles = JSON.parse(r.roles); } catch (e) {} out[String(r.player_id)] = {name: r.name, ts: r.ts, roles}; }
    return Response.json(out, H);
  }
  // GET /l/oc/crimes.json?env= -> the feed's crimes {as_of, crimes} (recruiting + planning, every 3 min) - the
  // OC Management page's "needs to be spawned" warnings
  if (req.method === "GET" && sub === "crimes.json") {
    const envName = url.searchParams.get("env");
    if (!OC_ENVS.has(envName)) return Response.json({ok: false, error: "env must be test or prod"}, {status: 400});
    const r = await env.OC_DB.prepare("SELECT as_of, data FROM oc_snap WHERE env = ? AND ds = 'crimes'").bind(envName).first();
    return new Response(`{"as_of":${r ? Number(r.as_of) : 0},"crimes":${r ? r.data : "[]"}}`,
                        {headers: {"Content-Type": "application/json", "Cache-Control": "no-store"}});
  }
  // GET /l/oc/summaries.json?env= -> {summaries, prices} - the same payout data the OC Optimizer script uses, so the
  // OC Management page shows the SAME pay per day (max payout recorded, Nov 2026)
  if (req.method === "GET" && sub === "summaries.json") {
    const envName = url.searchParams.get("env");
    if (!OC_ENVS.has(envName)) return Response.json({ok: false, error: "env must be test or prod"}, {status: 400});
    const {results} = await env.OC_DB.prepare("SELECT ds, data FROM oc_snap WHERE env = ? AND ds IN ('summaries', 'prices')").bind(envName).all();
    const by = {};
    (results || []).forEach(r => { by[r.ds] = r.data; });
    return new Response(`{"summaries":${by.summaries || "null"},"prices":${by.prices || "null"}}`,
                        {headers: {"Content-Type": "application/json", "Cache-Control": "no-store"}});
  }
  if (req.method === "POST" && sub === "refresh") {
    if (req.headers.get("X-HB-Save") !== "1") return new Response("Missing header", {status: 400});
    const now = Date.now(), GAP = 60 * 1000;
    const last = await env.OC_DB.prepare("SELECT ts FROM oc_config WHERE env = 'all' AND k = 'refresh'").first();
    if (last && now - Number(last.ts) < GAP)
      return Response.json({ok: false, retry_in: Math.ceil((GAP - (now - Number(last.ts))) / 1000)}, {status: 429, headers: H.headers});
    await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES ('all', 'refresh', '{}', ?, ?) " +
      "ON CONFLICT (env, k) DO UPDATE SET ts = excluded.ts, by = excluded.by").bind(now, `${who.name} [${who.id}]`).run();
    if (!env.GH_DISPATCH) return Response.json({ok: false, error: "can't start a crime check (no dispatch token)"}, {status: 503});
    const r = await fetch(`https://api.github.com/repos/${CODE_REPO}/actions/workflows/crimes.yml/dispatches`, {
      method: "POST", body: JSON.stringify({ref: "main", inputs: {oc_refresh: "1"}}),
      headers: {Authorization: "Bearer " + env.GH_DISPATCH, Accept: "application/vnd.github+json", "User-Agent": "hb-gate",
                "Content-Type": "application/json"}});
    if (!r.ok) return Response.json({ok: false, error: "couldn't start a crime check (" + r.status + ")"}, {status: 502});
    return Response.json({ok: true, next_at: now + GAP}, H);
  }
  if (req.method === "PUT" && sub === "config") {
    if (req.headers.get("X-HB-Save") !== "1") return new Response("Missing header", {status: 400});
    let b;
    try { b = await req.json(); } catch (e) { return Response.json({ok: false, error: "body must be JSON"}, {status: 400}); }
    if (!b || !OC_ENVS.has(b.env) || !["disabled", "plan", "opts"].includes(b.k)) return Response.json({ok: false, error: "bad request"}, {status: 400});
    let v = b.v;
    if (b.k === "disabled") {
      if (!Array.isArray(v)) return Response.json({ok: false, error: "disabled must be a list"}, {status: 400});
      v = [...new Set(v.map(x => String(x).slice(0, 80)))].slice(0, 200);
    } else if (b.k === "opts") {
      // Team Builder settings - the gatekeeper's automatic planner uses the same ones (ocAutoPlan)
      const n = (x, lo, hi, d) => { x = Number(x); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
      v = v && typeof v === "object" ? v : {};
      v = {target: n(v.target, 0, 100, 75), minRole: n(v.minRole, 0, 100, 65), cap: n(v.cap, 50, 100, 85), maxAge: n(v.maxAge, 1, 720, 24),
           chains: !!v.chains, includeBusy: !!v.includeBusy};
    } else {
      if (!v || typeof v !== "object" || !Array.isArray(v.teams)) return Response.json({ok: false, error: "plan must have teams"}, {status: 400});
      v = {teams: ocCleanTeams(v.teams)};
    }
    const text = JSON.stringify(v);
    if (text.length > 200000) return Response.json({ok: false, error: "too large"}, {status: 413});
    await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, ts = excluded.ts, by = excluded.by")
      .bind(b.env, b.k, text, Date.now(), `${who.name} [${who.id}]`).run();
    return Response.json({ok: true}, H);
  }
  return new Response("Not found", {status: 404});
}


// =====================================================================================================
// OC DATA FEED (Nov 2026) - project doc claude/oc-optimizer-hub-datafeed-contract.md
// The Hub is the single source of faction-wide OC data for the OC Optimizer script: it pulls from Torn ITSELF
// (this Worker's timer, every 3 minutes, with the faction key HUB_TORN_KEY - a Worker secret copied from the
// site's GitHub secret by tools/deploy_site.sh) and serves it to members; members' own Torn pulls are written
// back so the shared copy is as fresh as the latest member who looked.
//   Datasets (per env; the Hub's pulls go to BOTH test and prod):
//     crimes   faction/crimes?cat=available (recruiting + planning) - every 3 min          -> oc_snap
//     history  faction/crimes?cat=successful, newest first until a known id - every 30 min -> oc_hist (row per crime)
//     roster   faction/members -> {id: name} - hourly                                     -> oc_snap
//     catalog  torn/organizedcrimes, as Torn returns it - weekly                          -> oc_snap
//     prices   torn/items for every reward item id in history -> {id: {name, price = market × 0.95}} - daily after
//              00:10 TCT, plus any newly seen id on the next run                                     -> oc_snap
//   OPEN-SLOT checkpoint_pass_rate and item_requirement.is_available are the PULLING key's own view, so they're
//   blanked (null) on every stored crime - the script fills the member's own rates from /oc/cpr/read.
//   POST /oc/snapshot/read  {key, env, have: {crimes, history, roster, catalog, prices}}  (as_of ms the client has)
//        -> {ok, <dataset>: {as_of, data}, ...} only datasets newer than have (crimes, roster, catalog, prices,
//           summaries). The history row-delta was retired (Nov 2026) - raw history is POST /oc/history on demand.
//   POST /oc/snapshot/write {key, env, as_of, crimes?, history?, roster?, catalog?, prices?}
//        -> each dataset stored only if as_of > the stored as_of (latest wins; as_of in the future = now);
//           history rows are added by id. One write per member per minute ({ok, throttled:true} otherwise).
//           Checks (bad data is dropped, not stored): crime names must be in the catalog, slot members in the
//           roster, sizes capped. -> {ok, stored: [...], dropped: [...]}
//   POST /oc/bundle {key, env, have} -> {ok, snapshot: <as read>, rates: <as /oc/cpr/read>, plan: <as /oc/plan>}
// API: Hub pull ~25 calls/hour on HUB_TORN_KEY (comment=Heart Breakers Hub, key in the Authorization header).
// =====================================================================================================
const FEED_SETS = ["crimes", "roster", "catalog", "prices"];
const FEED_EVERY = {crimes: 0, history: 30 * 60e3, roster: 60 * 60e3, catalog: 7 * 24 * 3600e3, prices: 24 * 3600e3};
const FEED_HIST_MAX = 500;                    // most history rows in one read
const FEED_MAX_BODY = 1500000;                // write-back body limit (bytes)

async function ocFeedRoute(env, ctx, req, p) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: OC_CORS});
  if (!env.OC_DB) return ocErr(503, "OC sharing isn't set up yet");
  if (req.method !== "POST") return ocErr(405, "method not allowed");
  const raw = await req.text();
  if (raw.length > FEED_MAX_BODY) return ocErr(413, "too much data");
  let body;
  try { body = JSON.parse(raw); } catch (e) { return ocErr(400, "body must be JSON"); }
  if (!body || typeof body !== "object" || !OC_ENVS.has(body.env)) return ocErr(400, "env must be test or prod");
  const id = await ocIdentify(env, ctx, ocKey(req, body.key));
  if (id.err) return ocErr(id.status, id.err);
  if (p === "/oc/snapshot/write") return ocFeedWrite(env, body, id);
  if (p === "/oc/history") return ocHistoryPage(env, body);
  const snap = await ocFeedRead(env, body.env, body.have || {});
  if (p === "/oc/snapshot/read") return new Response(snap, {headers: {...OC_CORS, "Content-Type": "application/json"}});
  // bundle: the snapshot (already JSON text - not re-parsed) + rates + plan
  const [rates, plan] = await Promise.all([ocRatesObj(env, body.env), ocPlanObj(env, body.env, id)]);
  return new Response(`{"ok":true,"snapshot":${snap},"rates":${JSON.stringify(rates)},"plan":${JSON.stringify(plan)}}`,
                      {headers: {...OC_CORS, "Content-Type": "application/json"}});
}

// the read answer as JSON TEXT, built from the stored text (big blobs are never parsed here - CPU)
async function ocFeedRead(env, envName, have) {
  const h = k => Number(have[k]) || 0;
  const parts = ['"ok":true'];
  const {results} = await env.OC_DB.prepare("SELECT ds, as_of FROM oc_snap WHERE env = ? AND ds IN ('crimes','roster','catalog','prices','summaries')")
    .bind(envName).all();
  const want = (results || []).filter(r => Number(r.as_of) > h(r.ds)).map(r => r.ds);
  if (want.length) {
    const rows = await env.OC_DB.prepare(`SELECT ds, as_of, data FROM oc_snap WHERE env = ? AND ds IN (${want.map(() => "?").join(",")})`)
      .bind(envName, ...want).all();
    for (const r of rows.results || []) parts.push(`"${r.ds}":{"as_of":${Number(r.as_of)},"data":${r.data}}`);
  }
  // the old `history` row-delta is NO LONGER SENT (Nov 2026, summaries contract rollout: the script reads
  // `summaries` + on-demand POST /oc/history instead). Members can still write history back.
  return "{" + parts.join(",") + "}";
}

// blank what's the PULLING key's own view on open slots (rates + "has the item") - true for nobody else
function ocFeedCleanCrime(c) {
  for (const s of Array.isArray(c.slots) ? c.slots : []) {
    if (s && !s.user) {
      if ("checkpoint_pass_rate" in s) s.checkpoint_pass_rate = null;
      if (s.item_requirement && typeof s.item_requirement === "object") s.item_requirement.is_available = null;
    }
  }
  return c;
}

async function ocSnapGet(env, envName, ds) {
  const r = await env.OC_DB.prepare("SELECT as_of, data FROM oc_snap WHERE env = ? AND ds = ?").bind(envName, ds).first();
  if (!r) return null;
  try { return {as_of: Number(r.as_of), data: JSON.parse(r.data)}; } catch (e) { return null; }
}
// store a dataset only if newer than what's there (latest as_of wins)
function ocSnapPut(env, envName, ds, asOf, data, by) {
  return env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by WHERE excluded.as_of > oc_snap.as_of")
    .bind(envName, ds, asOf, typeof data === "string" ? data : JSON.stringify(data), by);
}
// history rows, 150 crimes per statement through json_each (D1 allows few queries per run - one statement, not one
// per crime); a crime already stored is left alone (completed crimes never change)
function ocHistPut(env, envName, crimes, asOf) {
  const out = [];
  for (let i = 0; i < crimes.length; i += 150)
    out.push(env.OC_DB.prepare("INSERT INTO oc_hist (env, id, executed_at, as_of, data) " +
      "SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.executed_at'), ?, value FROM json_each(?) WHERE true " +
      "ON CONFLICT (env, id) DO NOTHING").bind(envName, asOf, JSON.stringify(crimes.slice(i, i + 150))));
  return out;
}

// ---- member write-back ----
async function ocFeedWrite(env, body, id) {
  const now = Date.now(), envName = body.env, fid = Number(env.FACTION_ID);
  const last = await env.OC_DB.prepare("SELECT ts FROM oc_wb WHERE env = ? AND player_id = ?").bind(envName, id.player_id).first();
  if (last && now - Number(last.ts) < OC_WRITE_GAP_MS) return ocJson({ok: true, throttled: true, stored: []});
  let asOf = Number(body.as_of);
  if (!Number.isFinite(asOf) || asOf <= 0) return ocErr(400, "as_of (epoch ms) is required");
  asOf = Math.min(Math.round(asOf), now);                     // a fast clock can't freeze the feed
  const by = `${String(id.name || "").slice(0, 40)} [${id.player_id}]`;
  const [cat, ros] = await Promise.all([ocSnapGet(env, envName, "catalog"), ocSnapGet(env, envName, "roster")]);
  const names = new Set(((cat && cat.data && cat.data.organizedcrimes) || []).map(c => c && c.name).filter(Boolean));
  const members = ros && ros.data && typeof ros.data === "object" ? ros.data : null;
  const okName = n => typeof n === "string" && n.length <= 60 && (!names.size || names.has(n));
  const okUser = s => !s.user || (s.user && Number(s.user.id) > 0 && (!members || members[String(s.user.id)] != null));
  const okCrime = c => c && typeof c === "object" && Number(c.id) > 0 && okName(c.name) && Array.isArray(c.slots) && c.slots.length <= 10
    && c.slots.every(s => s && typeof s === "object" && okUser(s));
  const stored = [], dropped = [], ops = [];

  if (body.crimes !== undefined) {
    if (Array.isArray(body.crimes) && body.crimes.length <= 200 && body.crimes.every(okCrime))
      { ops.push(ocSnapPut(env, envName, "crimes", asOf, body.crimes.map(ocFeedCleanCrime), by)); stored.push("crimes"); }
    else dropped.push("crimes");
  }
  if (body.history !== undefined) {
    const ok = Array.isArray(body.history) && body.history.length <= FEED_HIST_MAX
      && body.history.every(c => okCrime(c) && Number(c.executed_at) > 0 && c.status === "Successful");
    if (ok) { ops.push(...ocHistPut(env, envName, body.history, asOf)); stored.push("history"); }
    else dropped.push("history");
  }
  if (body.roster !== undefined) {
    const r = body.roster, ks = r && typeof r === "object" && !Array.isArray(r) ? Object.keys(r) : null;
    if (ks && ks.length && ks.length <= 100 && ks.every(k => /^\d+$/.test(k) && typeof r[k] === "string" && r[k].length <= 40))
      { ops.push(ocSnapPut(env, envName, "roster", asOf, r, by)); stored.push("roster"); }
    else dropped.push("roster");
  }
  if (body.catalog !== undefined) {
    const list = body.catalog && body.catalog.organizedcrimes;
    if (Array.isArray(list) && list.length && list.length <= 200 && list.every(c => c && typeof c.name === "string"))
      { ops.push(ocSnapPut(env, envName, "catalog", asOf, body.catalog, by)); stored.push("catalog"); }
    else dropped.push("catalog");
  }
  if (body.prices !== undefined) {
    const r = body.prices, ks = r && typeof r === "object" && !Array.isArray(r) ? Object.keys(r) : null;
    if (ks && ks.length <= 500 && ks.every(k => /^\d+$/.test(k) && r[k] && Number.isFinite(Number(r[k].price)) && Number(r[k].price) >= 0))
      { ops.push(ocSnapPut(env, envName, "prices", asOf, r, by)); stored.push("prices"); }
    else dropped.push("prices");
  }
  ops.push(env.OC_DB.prepare("INSERT INTO oc_wb (env, player_id, ts) VALUES (?, ?, ?) ON CONFLICT (env, player_id) DO UPDATE SET ts = excluded.ts")
    .bind(envName, id.player_id, now));
  await env.OC_DB.batch(ops);
  if (stored.includes("history")) await ocSummariesSave(env, envName).catch(() => {});
  return ocJson({ok: true, stored, dropped});
}

// ---- the Hub's own pull (timer, every 3 min) ----
async function ocTorn(env, path) {
  // API: Heart Breakers Hub - OC data feed (Torn V2). Key in the Authorization header, never in the address.
  const base = env.TORN_API_BASE || "https://api.torn.com";          // TORN_API_BASE: local tests only
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${base}/v2/${path}${sep}comment=${encodeURIComponent(API_COMMENT)}`,
                        {headers: {Authorization: "ApiKey " + String(env.HUB_TORN_KEY).trim(), Accept: "application/json"}});
  const d = await r.json();
  if (d && d.error) throw new Error("torn " + d.error.code);
  return d;
}
async function ocFeedPull(env) {
  if (!env.OC_DB || !env.HUB_TORN_KEY) return;
  const now = Date.now(), ENVS = ["prod", "test"];
  // when the Hub last pulled each dataset (pull:<ds> rows, env 'hub')
  const {results} = await env.OC_DB.prepare("SELECT ds, as_of FROM oc_snap WHERE env = 'hub'").all();
  const lastPull = {};
  (results || []).forEach(r => { lastPull[r.ds.replace(/^pull:/, "")] = Number(r.as_of); });
  const due = ds => now - (lastPull[ds] || 0) >= FEED_EVERY[ds] - 30e3;
  const ops = [], mark = ds => ops.push(env.OC_DB.prepare(
    "INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', ?, ?, '{}', 'hub') ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of")
    .bind("pull:" + ds, now));
  // what went wrong, for the OC check workflow (step + Torn error code / error type - nothing else)
  const errs = [];
  const fail = (step, e) => errs.push(step + ": " + String((e && e.message) || e).slice(0, 60));
  const put = (ds, data) => { const txt = JSON.stringify(data); ENVS.forEach(e => ops.push(ocSnapPut(env, e, ds, now, txt, "hub"))); mark(ds); };

  let newHist = false, crimesNow = null;
  // crimes - every run (1 call)
  try {
    const d = await ocTorn(env, "faction/crimes?cat=available&limit=100&sort=ASC");
    const cl = (d.crimes || []).map(ocFeedCleanCrime);
    put("crimes", cl);
    try { await ocDelayCheck(env, cl, now, ops); } catch (e) { fail("delays", e); }
    crimesNow = cl;
  } catch (e) { fail("crimes", e); }
  // OC pass rates of members who opted in with their stored key (their own keys, ~hourly each)
  try { await ocOptinPull(env, now); } catch (e) { fail("oc-optin", e); }
  // roster - hourly (1 call)
  let newRoster = false;
  if (due("roster")) try {
    const d = await ocTorn(env, "faction/members");
    const out = {};
    (Array.isArray(d.members) ? d.members : Object.values(d.members || {})).forEach(m => { if (m && m.id) out[String(m.id)] = String(m.name || ""); });
    if (Object.keys(out).length) { put("roster", out); newRoster = true; }
  } catch (e) { fail("roster", e); }
  // catalog - weekly (1 call)
  if (due("catalog")) try {
    const d = await ocTorn(env, "torn/organizedcrimes");
    if ((d.organizedcrimes || []).length) put("catalog", d);
  } catch (e) { fail("catalog", e); }
  // history - every 30 min: newest first until a crime we already have (normally 1 call; first time up to 6)
  if (due("history")) try {
    const known = new Set(((await env.OC_DB.prepare("SELECT id FROM oc_hist WHERE env = 'prod' ORDER BY executed_at DESC LIMIT 200").all()).results || [])
      .map(r => Number(r.id)));
    const fresh = [];
    for (let page = 0; page < 6; page++) {
      const d = await ocTorn(env, `faction/crimes?cat=successful&limit=100&offset=${page * 100}&sort=DESC`);
      const list = d.crimes || [];
      let hit = false;
      for (const c of list) { if (known.has(Number(c.id))) { hit = true; continue; } if (c && c.id && c.executed_at) fresh.push(c); }
      if (hit || list.length < 100) break;
    }
    // stored now (not with the rest at the end) so the prices step below already sees new reward items
    const hops = [];
    if (fresh.length) ENVS.forEach(e => hops.push(...ocHistPut(env, e, fresh, now)));
    if (hops.length) { await env.OC_DB.batch(hops); newHist = true; }
    mark("history");
  } catch (e) { fail("history", e); }
  // history BACKFILL (summaries contract §3, one-time): page back until Torn returns an empty page, a few pages a
  // run, then record the probe (earliest completion + count). Stops for the day on any Torn error (code 14 incl.).
  try { if (await ocBackfill(env, now, ENVS)) newHist = true; } catch (e) { fail("backfill", e); }
  // prices (item-reward pricing addendum, Nov 2026): EVERY reward item id in the FULL stored history (all types -
  // armor, weapons, medical, drugs, temporaries), priced at value.market_price × 0.95 (Torn's 5% market fee - the
  // value a member can actually realise), saved as {"<id>": {name, price}}. Item without a market price -> 0.
  //   * the full re-price runs once a day, the first timer run after 00:10 TCT (= UTC), so it's the new market day
  //   * any id that turns up in history and isn't priced yet is priced on the next run (no waiting for tomorrow)
  // 1 call per 100 ids (normally one call).
  try {
    // the ids come out of the stored JSON inside D1 (no parsing of every crime here - Worker CPU)
    const rows = (await env.OC_DB.prepare("SELECT DISTINCT json_extract(j.value, '$.id') AS i FROM oc_hist, " +
      "json_each(oc_hist.data, '$.rewards.items') AS j WHERE oc_hist.env = 'prod'").all()).results || [];
    const all = [...new Set(rows.map(r => Number(r.i)).filter(i => i > 0))];
    const cur = await ocSnapGet(env, "prod", "prices");
    const have = (cur && cur.data && typeof cur.data === "object") ? cur.data : {};
    const dayStart = now - now % 86400e3, slot = dayStart + 10 * 60e3;          // 00:10 TCT today
    // one forced full re-price when the 5% net pricing went live (hub row 'prices-net' marks it done)
    const netDone = await env.OC_DB.prepare("SELECT 1 FROM oc_snap WHERE env = 'hub' AND ds = 'prices-net'").first();
    const daily = !netDone || (now >= slot && (lastPull.prices || 0) < slot);
    const list = daily ? all : all.filter(i => !have[String(i)]);
    if (list.length) {
      const out = daily ? {} : Object.assign({}, have);
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const d = await ocTorn(env, "torn/items?ids=" + chunk.join(","));
        const got = {};
        (Array.isArray(d.items) ? d.items : Object.values(d.items || {})).forEach(it => { if (it && it.id) got[String(it.id)] = it; });
        chunk.forEach(id => {
          const it = got[String(id)];
          out[String(id)] = {name: String((it && it.name) || (have[String(id)] || {}).name || ""),
                             price: Math.round((Number(((it || {}).value || {}).market_price) || 0) * 0.95)};
        });
      }
      if (daily) all.forEach(id => { if (!out[String(id)]) out[String(id)] = {name: "", price: 0}; });
      put("prices", out);                                   // marks pull:prices only on success
      if (daily && !netDone) ops.push(env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'prices-net', ?, '{}', 'hub') " +
        "ON CONFLICT (env, ds) DO NOTHING").bind(now));
    }
  } catch (e) { fail("prices", e); }
  await env.OC_DB.batch(ops);
  // summaries (payout stats + member rates) - AFTER the writes above (they use the new roster + history): whenever
  // history or the roster changed, or none are stored yet
  try {
    const have = await env.OC_DB.prepare("SELECT 1 FROM oc_snap WHERE env = 'prod' AND ds = 'summaries'").first();
    if (newHist || newRoster || !have) for (const e of ENVS) await ocSummariesSave(env, e);
  } catch (e) { fail("summaries", e); }
  // the automatic team plan (live crimes) - after everything above is saved (it reads the new roster / summaries)
  if (crimesNow) try { await ocAutoPlan(env, crimesNow, now); } catch (e) { fail("plan", e); }
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'pull:errors', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(errs)).run();
}


// =====================================================================================================
// OC SUMMARIES FEED (Nov 2026) - project doc claude/oc-optimizer-hub-summaries-contract.md ("Option B")
// The script stops keeping crime history: /oc/bundle (and /oc/snapshot/read) carry `summaries`, worked out HERE from
// the Hub's full history (oc_hist) in SQL - D1 does the JSON work, so the Worker's CPU stays tiny:
//   summaries = {as_of: newest completion (ms), window: 100,
//     payouts: {crime: {samples, moneyAvg, moneyMin, moneyMax, respAvg, respMin, respMax, items: {id: avg count},
//                       itemBased}}           <- the latest `window` completions of each crime (cash PRE-split)
//     memberRates: {crime: {baseRole: [{pid, name, rate}]}}   <- each CURRENT member's latest rate, ALL history
//   POST /oc/history {key, env, crime?, limit? (50, max 200), before? (ms)} -> {ok, rows: [crimes as Torn gave them],
//        next: ms cursor | null} - on-demand raw history (the script doesn't store it)
//   GET  /oc/history/stats -> {ok, count, earliest (ms), done} - the backfill probe (how far back Torn's data goes)
// =====================================================================================================
const SUM_WINDOW = 100;
const SUM_BASE_ROLE = "trim(CASE WHEN instr(label, '#') > 0 THEN substr(label, 1, instr(label, '#') - 1) ELSE label END)";

async function ocSummaries(env, envName) {
  const db = env.OC_DB;
  const top = await db.prepare("SELECT MAX(executed_at) AS t FROM oc_hist WHERE env = ?").bind(envName).first();
  const pay = await db.prepare(
    `WITH c AS (SELECT json_extract(data, '$.name') AS crime, data,
                       ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.name') ORDER BY executed_at DESC) AS n
                FROM oc_hist WHERE env = ?)
     SELECT crime, COUNT(*) AS samples,
            AVG(COALESCE(json_extract(data, '$.rewards.money'), 0)) AS mavg, MIN(COALESCE(json_extract(data, '$.rewards.money'), 0)) AS mmin,
            MAX(COALESCE(json_extract(data, '$.rewards.money'), 0)) AS mmax,
            AVG(json_extract(data, '$.rewards.respect')) AS ravg, MIN(json_extract(data, '$.rewards.respect')) AS rmin,
            MAX(json_extract(data, '$.rewards.respect')) AS rmax
     FROM c WHERE n <= ? AND crime IS NOT NULL GROUP BY crime`).bind(envName, SUM_WINDOW).all();
  const items = await db.prepare(
    `WITH c AS (SELECT json_extract(data, '$.name') AS crime, data,
                       ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.name') ORDER BY executed_at DESC) AS n
                FROM oc_hist WHERE env = ?)
     SELECT c.crime, COALESCE(json_extract(j.value, '$.id'), json_extract(j.value, '$.item_id')) AS item,
            SUM(COALESCE(json_extract(j.value, '$.quantity'), json_extract(j.value, '$.amount'), 1)) AS qty
     FROM c, json_each(c.data, '$.rewards.items') AS j WHERE c.n <= ? GROUP BY c.crime, item`).bind(envName, SUM_WINDOW).all();
  const rates = await db.prepare(
    `WITH s AS (SELECT json_extract(h.data, '$.name') AS crime, h.executed_at AS t,
                       json_extract(j.value, '$.user.id') AS pid, json_extract(j.value, '$.checkpoint_pass_rate') AS rate,
                       COALESCE(json_extract(j.value, '$.position_info.label'), json_extract(j.value, '$.position')) AS label
                FROM oc_hist AS h, json_each(h.data, '$.slots') AS j WHERE h.env = ?),
          b AS (SELECT crime, t, pid, rate, ${SUM_BASE_ROLE} AS role FROM s WHERE pid IS NOT NULL AND rate IS NOT NULL),
          r AS (SELECT crime, role, pid, rate, ROW_NUMBER() OVER (PARTITION BY crime, role, pid ORDER BY t DESC) AS n FROM b)
     SELECT crime, role, pid, rate FROM r WHERE n = 1`).bind(envName).all();
  const ros = await ocSnapGet(env, envName, "roster");
  const roster = (ros && ros.data) || null;
  const payouts = {};
  for (const r of pay.results || []) {
    payouts[r.crime] = {samples: r.samples, moneyAvg: Math.round(r.mavg || 0), moneyMin: r.mmin || 0, moneyMax: r.mmax || 0,
                        respAvg: r.ravg == null ? null : Math.round(r.ravg), respMin: r.rmin ?? null, respMax: r.rmax ?? null,
                        items: {}, itemBased: false};
  }
  for (const r of items.results || []) {
    const p = payouts[r.crime];
    if (p && r.item != null) p.items[String(r.item)] = Math.round(100 * (r.qty || 0) / p.samples) / 100;
  }
  for (const p of Object.values(payouts)) p.itemBased = p.moneyMax === 0 && Object.keys(p.items).length > 0;
  const memberRates = {};
  for (const r of rates.results || []) {
    if (roster && roster[String(r.pid)] == null) continue;                 // members who left aren't suggested
    const byRole = memberRates[r.crime] || (memberRates[r.crime] = {});
    (byRole[r.role] || (byRole[r.role] = [])).push({pid: Number(r.pid), name: roster ? roster[String(r.pid)] : "#" + r.pid,
                                                     rate: Math.round(r.rate)});
  }
  for (const byRole of Object.values(memberRates)) for (const l of Object.values(byRole)) l.sort((a, b) => b.rate - a.rate);
  return {as_of: (Number(top && top.t) || 0) * 1000, window: SUM_WINDOW, payouts, memberRates};
}
async function ocSummariesSave(env, envName) {
  const s = await ocSummaries(env, envName);
  // stored with its own write time as the version, so a recompute (e.g. a member renamed) still reaches clients;
  // the "newest completion" stays in the data as as_of
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES (?, 'summaries', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by")
    .bind(envName, Date.now(), JSON.stringify(s)).run();
}

// on-demand raw history (newest first)
async function ocHistoryPage(env, body) {
  const limit = Math.max(1, Math.min(200, Number(body.limit) || 50));
  const before = Number(body.before) > 0 ? Math.floor(Number(body.before) / 1000) : 4e9;      // ms cursor -> s
  const crime = typeof body.crime === "string" && body.crime ? body.crime.slice(0, 60) : null;
  const q = crime
    ? env.OC_DB.prepare("SELECT executed_at, data FROM oc_hist WHERE env = ? AND executed_at < ? AND json_extract(data, '$.name') = ? ORDER BY executed_at DESC LIMIT ?")
        .bind(body.env, before, crime, limit)
    : env.OC_DB.prepare("SELECT executed_at, data FROM oc_hist WHERE env = ? AND executed_at < ? ORDER BY executed_at DESC LIMIT ?")
        .bind(body.env, before, limit);
  const rows = (await q.all()).results || [];
  const next = rows.length === limit ? Number(rows[rows.length - 1].executed_at) * 1000 : null;
  return new Response(`{"ok":true,"rows":[${rows.map(r => r.data).join(",")}],"next":${next}}`,
                      {headers: {...OC_CORS, "Content-Type": "application/json"}});
}

// the backfill probe - counts + a date only (no key needed: nothing personal)
async function ocHistStats(env) {
  if (!env.OC_DB) return ocErr(503, "OC sharing isn't set up yet");
  const r = await env.OC_DB.prepare("SELECT COUNT(*) AS n, MIN(executed_at) AS e FROM oc_hist WHERE env = 'prod'").first();
  const b = await ocSnapGet(env, "hub", "backfill");
  return ocJson({ok: true, count: r ? r.n : 0, earliest: r && r.e ? r.e * 1000 : null, done: !!(b && b.data && b.data.done)});
}

// one-time backfill: BACKFILL_PAGES pages per timer run (offset kept in oc_snap env 'hub' ds 'backfill'), until an
// empty page. Returns true if it stored anything.
const BACKFILL_PAGES = 5;
async function ocBackfill(env, now, ENVS) {
  const st = (await ocSnapGet(env, "hub", "backfill")) || {data: {}};
  const b = st.data || {};
  if (b.done) return false;
  if (b.paused_day && b.paused_day === Math.floor(now / 86400e3)) return false;     // Torn said stop: tomorrow
  let off = Number(b.offset) || 0, got = [], done = false, err = null;
  for (let i = 0; i < BACKFILL_PAGES; i++) {
    let d;
    try { d = await ocTorn(env, `faction/crimes?cat=successful&limit=100&offset=${off}&sort=DESC`); }
    catch (e) { err = e; break; }
    const list = (d.crimes || []).filter(c => c && c.id && c.executed_at);
    if (!(d.crimes || []).length) { done = true; break; }
    got = got.concat(list);
    off += (d.crimes || []).length;
  }
  if (got.length) { const ops = []; ENVS.forEach(e => ops.push(...ocHistPut(env, e, got, now))); await env.OC_DB.batch(ops); }
  const out = {offset: off, done, pages_total: (b.pages_total || 0) + Math.ceil(got.length / 100)};
  if (err) out.paused_day = Math.floor(now / 86400e3);
  if (done) {
    const r = await env.OC_DB.prepare("SELECT COUNT(*) AS n, MIN(executed_at) AS e FROM oc_hist WHERE env = 'prod'").first();
    Object.assign(out, {count: r.n, earliest: r.e * 1000, finished: now});
  }
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'backfill', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(out)).run();
  if (err) throw err;
  return got.length > 0;
}


// =====================================================================================================
// AUTOMATIC TEAM PLAN (Nov 2026): every timer run (3 min) the deployed plan (prod) is maintained from the crimes
// that exist in Torn right now - gate/oc_planner.js (the same planner as the OC Management page's Auto-build):
// open slots of recruiting crimes are filled (skipped when the crime can't reach the target), leftovers get
// "needs spawn" teams, nothing valid is reshuffled, locked teams are kept. Saved only when something changed
// (by "auto (Hub)"). Inputs, all from D1: feed crimes / roster / catalog / summaries / prices, shared rates
// (oc_cpr), the leaders' settings (oc_config: opts, disabled) - no Torn calls.
// =====================================================================================================
const OC_OPTS_DEFAULT = {target: 75, minRole: 65, cap: 85, maxAge: 24, chains: false, includeBusy: false};
async function ocAutoPlan(env, crimes, now) {
  const cfg = await ocConfig(env, "prod");
  const opts = Object.assign({}, OC_OPTS_DEFAULT, cfg.opts || {});
  const [ros, catS, sumS, priS] = await Promise.all([ocSnapGet(env, "prod", "roster"), ocSnapGet(env, "prod", "catalog"),
                                                     ocSnapGet(env, "prod", "summaries"), ocSnapGet(env, "prod", "prices")]);
  const members = (ros && ros.data) || null;
  if (!members || !catS) return;
  const catalog = {};
  for (const c of (catS.data.organizedcrimes || [])) if (c && c.name)
    catalog[c.name] = {difficulty: c.difficulty ?? null, roles: (c.slots || []).map((sl, i) => (sl.position_info && sl.position_info.label) || sl.position || ("Role " + (i + 1))),
                       prereq: c.prerequisite || null};
  // rates: live shares (oc_cpr, within maxAge) > the member's rate in a crime they're in now > history (summaries)
  const {results} = await env.OC_DB.prepare("SELECT player_id, roles, ts FROM oc_cpr WHERE env = 'prod' AND faction_id = ?").bind(Number(env.FACTION_ID)).all();
  const live = new Map();
  for (const r of results || []) { try { if (now - Number(r.ts) <= opts.maxAge * 3600e3) live.set(String(r.player_id), JSON.parse(r.roles)); } catch (e) {} }
  const inCrime = new Map();
  for (const c of crimes) for (const sl of c.slots || []) if (sl.user && typeof sl.checkpoint_pass_rate === "number")
    inCrime.set(`${sl.user.id}|${c.name}|${ocBaseRole((sl.position_info && sl.position_info.label) || sl.position)}`, Math.round(sl.checkpoint_pass_rate));
  const hist = new Map(), S = (sumS && sumS.data) || {};
  for (const [crime, byRole] of Object.entries(S.memberRates || {})) for (const [role, list] of Object.entries(byRole)) for (const m of list)
    hist.set(`${m.pid}|${crime}|${role}`, m.rate);
  const rateOf = (pid, crime, label) => {
    const b = ocBaseRole(label), lr = live.get(String(pid)), k = ocFb(crime) + "|" + ocFb(b);
    if (lr && lr[k] != null) return {rate: lr[k], src: "live"};
    const ic = inCrime.get(`${pid}|${crime}|${b}`); if (ic != null) return {rate: ic, src: "live"};
    const h = hist.get(`${pid}|${crime}|${b}`); if (h != null) return {rate: h, src: "history"};
    return null;
  };
  // pay per member per day (Nov 2026, the user's formula): max payout recorded (summaries, items at prices) - 20%
  // faction tax, ÷ every participant in the chain (prerequisite seats too), ÷ the chain's days (prerequisite included).
  // pot here = this crime's seats' share, so pot ÷ days ÷ seats = per member per day - the same figure the page and script show
  const prices = (priS && priS.data) || {};
  const gross = n => { const p = (S.payouts || {})[n]; if (!p || (p.samples || 0) < 3) return 0;
    let iv = 0; Object.keys(p.items || {}).forEach(id => { iv += (p.items[id] || 0) * (Number((prices[id] || {}).price) || 0); });
    return (p.moneyMax || 0) + iv; };
  const seats = n => (catalog[n] || {roles: []}).roles.length || 1;
  const payOf = n => {
    const s = seats(n), pre = (catalog[n] || {}).prereq, fin = Object.keys(catalog).find(x => catalog[x].prereq === n);
    if (fin) { const sf = seats(fin); return {pot: gross(fin) * 0.8 * s / (s + sf), days: s + sf}; }
    if (pre) { const sp = seats(pre); return {pot: gross(n) * 0.8 * s / (s + sp), days: s + sp}; }   // the chain's days, both crimes
    return {pot: gross(n) * 0.8, days: s};
  };
  const r = ocPlan({crimes, prev: ((cfg.plan || {}).teams) || [], catalog, members, opts, disabled: new Set(cfg.disabled || []),
                    rateOf, payOf, budgetMs: 0, now});
  if (!r.changed) return;
  await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES ('prod', 'plan', ?, ?, 'auto (Hub)') " +
    "ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, ts = excluded.ts, by = excluded.by")
    .bind(JSON.stringify({teams: ocCleanTeams(r.teams), auto: r.stats}), now).run();
}

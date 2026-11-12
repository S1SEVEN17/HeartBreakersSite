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
//   /rc/push          Torn Recruit Scout script: leaders send scouted recruits (client-reported identity, no key)
//   /l/rc/*           leaders' Recruitment page: the shared recruits - claim, status, notes, remove (pass cookie, leaders)
//   /sx               Heart Breakers Hub userscript (in Torn, members + leaders): client-reported identity -> session - see HUB SCRIPT
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
import {cwRoute, cwStub, CW_DEFAULT_CONFIG, CW_ROLES, CW_MAX_HOURS, CW_MAX_SHIFTS, CW_AHEAD_S, cwShiftRows, cwStatsFor, cwShiftAdd, cwShiftDelete} from "./chainroom.js";   // Faction Chain Watch room (Durable Object)
export {ChainRoom} from "./chainroom.js";   // the Durable Object class (wrangler.toml CHAINROOM binding)

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
    // Faction Chain Watch script (client-reported identity, no key) -> the ChainRoom Durable Object (chainroom.js)
    if (p.startsWith("/cw/")) return cwRoute(req, env, url);
    // Torn Recruit Scout script (client-reported identity, no key; leaders only) -> the Recruitment page (RECRUITMENT below)
    if (p.startsWith("/rc/")) return rcScriptRoute(env, req, p);
    // Heart Breakers Hub userscript (leaders, in Torn): its own session (op "hello") instead of the pass cookie
    if (p === "/sx") return sxRoute(env, ctx, req);
    if (p === "/sx/export") return sxExport(env, req);
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
    // Hub homepage "Right Now" card: its chain reading (read in the member's browser with their own key - the key
    // never comes here) recycled for the Chain Watch queue's timer (chainroom.js /reading, shorten-only)
    if (area === "m" && rest === "cw/reading") return cwReading(env, req, who);
    // Chain Watching Schedule (members sign up for chain watch shifts; leaders can remove anyone's)
    if (area === "m" && (rest === "cw/schedule.json" || rest === "cw/schedule")) return cwSchedule(env, req, url, who);
    if (area === "m" && rest === "cw/live.json") return cwLive(env);
    // Scripts directory (scripts.html): every member reads the listings; leaders add / edit / remove them
    if (area === "m" && (rest === "scripts.json" || rest === "scripts")) return scriptsRoute(env, req, url, who);
    // leaders: OC Management page (oc.html) - settings / deployed plan / shared rates (D1)
    if (area === "l" && rest.startsWith("oc/")) return ocLeaderRoute(env, req, url, who, rest.slice(3));
    // leaders: Chain Watch settings (chainwatch.html) - D1 oc_config 'chainwatch', pushed to every connected script
    if (area === "l" && rest.startsWith("cw/")) return cwLeaderRoute(env, req, who, rest.slice(3));
    // leaders: Recruitment page (recruitment.html) - recruits shared by the Torn Recruit Scout script (D1 rc_recruit)
    if (area === "l" && rest.startsWith("rc/")) return rcLeaderRoute(env, req, who, rest.slice(3));
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
    if (event.cron.startsWith("*/3")) {
      ctx.waitUntil(ocFeedPull(env).catch(() => {}));
      ctx.waitUntil(cwShiftAlerts(env).catch(() => {}));   // Chain Watching Schedule: "your shift is starting" pings
      return;
    }
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const runs = event.cron.startsWith("7,") ? [["chainwatch.yml", {}]]
      : [["crimes.yml", {}]].concat(minute === 0 ? [["banner.yml", {scheduled: "1"}]] : []);
    ctx.waitUntil(Promise.all(runs.map(([wf, inputs]) => dispatch(env, wf, inputs))));
    // Chain timer opt-ins -> the Chain Watch room every 15 minutes (leavers / deleted keys drop out; 1 GitHub read)
    if (!event.cron.startsWith("7,")) ctx.waitUntil(cwOptinSync(env, null));
    // role weights + role names (tornprobability.com) - once a day
    if (!event.cron.startsWith("7,")) ctx.waitUntil(tpWeightsRefresh(env).catch(() => {}));
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

// =====================================================================================================
// HUB SCRIPT - the "Heart Breakers Hub" userscript (in Torn). History: Nov 11 2026 v1 leaders only (user: "a script
// that allows me to interact with certain aspects of the Hub from inside Torn"); same day: sign-in with the member's
// own API key kept on their device (link code REPLACED); then OPENED TO MEMBERS + LEADERS (user: "I want to open
// this to members and leaders ... as much functionality here as I have on the site").
// The Torn page can't use the Hub's pass cookie (other site, SameSite=Lax, and Torn PDA's requests carry no cookies),
// so the script signs in on its own:
// SIGN-IN: the script reads its own Torn profile with the member's key IN THE BROWSER and sends only
//   {pid, faction, name} (op "hello") - the Hub-wide client-reported identity pattern (OC / Chain Watch / Recruit
//   Scout). The key is never sent here. Accepted tradeoff (user chose it knowing): a modified script could claim
//   another member's id (incl. a leader's) - so it could see that member's private figures / leaders' data.
//   POST /sx  {op: "hello", pid, faction, name}   -> {ok, code, exp, me}: session "hbsx2.<pid>.<exp>.<sig>"
//                                                  (HMAC with the pass secret, SX_HOURS hours; the script signs in
//                                                  again by itself with the key kept on its device)
//   POST /sx  {code, op, ...}  (CORS torn.com; POST only, so Torn PDA's PDA_httpPost works too)
//     op "whoami"                               -> {ok, me: {id, name, position, leader}, exp}
//     op "read" {area: "m"|"l", path}           -> a file of the site: members' folder "db/<file>.json" (members);
//                                                  leaders' folder "db/<file>.json" or "payout_data/<file>.json"
//                                                  (LEADERS only)
//     op "mine"                                 -> the caller's OWN private figures (same as /m/mine.json)
//     op "live" {what}                          -> "board" (Chain Watch live board) | "schedule" (chain watch shifts)
//                                                  | "scripts" (Scripts directory) - members; "readiness" (war
//                                                  readiness, opted-in members) - LEADERS. Same handlers as the site.
//     op "gh"   {method: "GET"|"PUT", path, ref?, body?}  -> the leaders' save route - LEADERS (ghProxy: same allowed
//                                                             paths - config.json, data/payouts/, data/panels/)
//     op "share_get" / "share_set" / "share_push" / "share_ping"  -> sharing FROM THE SCRIPT (see SCRIPT SHARING)
// Every call re-checks: session signature + not expired + STILL a current member (the Hub's member list); leader
// rights come from that list's position, never from the script - a demoted leader loses them at once.
// =====================================================================================================
const SX_HOURS = 24;
const SX_CORS = {"Access-Control-Allow-Origin": "https://www.torn.com", "Access-Control-Allow-Methods": "POST, OPTIONS",
                 "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400",
                 "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"};
const sxJson = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {...SX_CORS, "Content-Type": "application/json"}});
// any Response -> the same body with the script's CORS headers
const sxPass = async (r) => new Response(await r.text(), {status: r.status, headers: {...SX_CORS, "Content-Type": "application/json"}});
async function sxSign(env, pid, exp) {
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(`sx2|${pid}|${exp}`)));
}
// is this pid a current member? -> who (leader from the Hub's own list), or {error}
async function sxMember(env, ctx, pid) {
  const members = await currentMembers(env, ctx);
  const mm = members && members.get(Number(pid));
  if (!mm) return {error: "Not a current Heart Breakers member."};
  return {who: {id: Number(pid), name: mm.name, position: mm.position || "", leader: isLeader(env, mm.position)}};
}
async function sxWho(env, ctx, code) {
  const m = /^hbsx2\.(\d+)\.(\d+)\.([\w-]+)$/.exec(String(code || "").trim());
  if (!m) return {error: "Signing in again..."};
  const [, pid, exp, sig] = m;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(sig), enc.encode(`sx2|${pid}|${exp}`)); } catch (e) { ok = false; }
  if (!ok || Number(exp) < Date.now()) return {error: "Signing in again..."};
  const a = await sxMember(env, ctx, pid);
  return a.who ? {who: a.who, exp: Number(exp)} : a;
}
const sxMe = (who) => ({id: who.id, name: who.name, position: who.position, leader: !!who.leader});
async function sxRoute(env, ctx, req) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: SX_CORS});
  if (req.method !== "POST") return sxJson({ok: false, error: "POST only"}, 405);
  let b; try { b = await req.json(); } catch (e) { return sxJson({ok: false, error: "bad request"}, 400); }
  // sign in: client-reported identity (the script read it from Torn with its own key; no key comes here)
  if (b && b.op === "hello") {
    if (String(b.faction) !== String(env.FACTION_ID)) return sxJson({ok: false, error: "Heart Breakers members only."}, 403);
    const l = await sxMember(env, ctx, b.pid);
    if (!l.who) return sxJson({ok: false, error: l.error}, 403);
    const exp = Date.now() + SX_HOURS * 36e5;
    return sxJson({ok: true, code: `hbsx2.${l.who.id}.${exp}.${await sxSign(env, l.who.id, exp)}`, exp, me: sxMe(l.who)});
  }
  const a = await sxWho(env, ctx, b && b.code);
  if (!a.who) return sxJson({ok: false, error: a.error, relink: true}, 401);
  const who = a.who, op = String(b.op || "");
  const leadersOnly = () => sxJson({ok: false, error: "Leaders only."}, 403);
  if (op === "whoami") return sxJson({ok: true, me: sxMe(who), exp: a.exp});
  if (op === "read") {
    const area = b.area === "l" ? "l" : "m", path = String(b.path || "");
    if (area === "l" && !who.leader) return leadersOnly();
    const okPath = area === "l" ? /^(db|payout_data)\/[\w.-]+\.json$/ : /^db\/[\w.-]+\.json$/;
    if (!okPath.test(path)) return sxJson({ok: false, error: "not allowed"}, 403);
    const dir = area === "l" ? env.LEADER_DIR : env.MEMBER_DIR;
    const r = await env.ASSETS.fetch(new Request(`https://assets.local/${await physDir(dir)}/${path}`));
    if (!r.ok) return sxJson({ok: false, error: "not found"}, 404);
    return new Response(r.body, {status: 200, headers: {...SX_CORS, "Content-Type": "application/json"}});
  }
  if (op === "mine") return sxPass(await mine(env, who));
  // sharing from the script (the member's own key stays on their device) - see SCRIPT SHARING below
  if (op === "share_get" || op === "share_set" || op === "share_push" || op === "share_ping") return sxShareOp(env, who, op, b);
  if (op === "live") {
    const what = String(b.what || ""), u = new URL("https://sx.local/"), get = new Request(u.toString());
    if (what === "board") return sxPass(await cwLive(env));
    if (what === "schedule") return sxPass(await cwSchedule(env, get, u, who));
    if (what === "scripts") return sxPass(await scriptsRoute(env, get, u, who));
    if (what === "readiness") return who.leader ? sxPass(await readiness(env, ctx)) : leadersOnly();
    return sxJson({ok: false, error: "unknown"}, 400);
  }
  if (op === "gh") {
    if (!who.leader) return leadersOnly();
    const method = b.method === "PUT" ? "PUT" : "GET", path = String(b.path || "");
    const u = new URL("https://sx.local/" + path); if (b.ref) u.searchParams.set("ref", String(b.ref));
    const inner = new Request(u.toString(), {method, headers: method === "PUT" ? {"X-HB-Save": "1", "Content-Type": "application/json"} : {},
                                             body: method === "PUT" ? JSON.stringify(b.body || {}) : undefined});
    return sxPass(await ghProxy(env, inner, who, path));
  }
  return sxJson({ok: false, error: "unknown op"}, 400);
}

// =====================================================================================================
// SCRIPT SHARING (Nov 11 2026, user: "Allow users to share their same data from the hub, but via the script. This is
// only updated when the script is active and their key is only saved locally to their device, which some users might
// find safer than uploading to the Hub.") - the same three things as My data & sharing, but the Hub never gets a key:
// the member's Heart Breakers Hub script reads Torn with its own key and sends only the readings.
//   battle stats / work stats: "off" | "leaders" | "faction" - read by the script ONCE A DAY (the first time it runs
//                               after 00:00 TCT - user's choice), sent with op "share_push" {bs: [day, str, def, spd, dex],
//                               ws: [day, man, int, end]}; kept as a daily series (SX_SHARE_DAYS) like data/optin_stats.json
//   OC pass rates / chain timer (added Nov 11 2026, user: "share the same stats from the hub script as is allowed from
//                               the HUB site"):
//     oc: the script reads ITS OWN v2 user/organizedcrimes only when the Hub has found a NEW crime (share_ping gives
//         oc_tag = the Hub's crime list signature; a changed tag = read once) - the Hub's rule for stored keys - and
//         sends [[crime, role label, rate], ...] -> oc_cpr (same rows as the OC Optimizer / Hub-key sharing).
//     cw: during a LIVE chain, when this member isn't connected in Chain Watch, share_ping says want_chain; the
//         script then reads v2 faction/chain with its own key every 30 s (<= 2 calls/min, like the Hub's stored-key
//         reads) and sends the reading -> the Chain Watch room (shorten-only, exactly like a script reading).
//   war readiness:             true / false - read by the script ONLY WHILE A LEADER WATCHES (user's choice): the script
//                               asks every 2 min (op "share_ping" -> {want_ready}); want_ready = a leader opened War
//                               Readiness (site page or the script's Ready tab) in the last SX_WATCH_MS; then it reads
//                               and sends every minute (op "share_push" {rd: {...}}).
// Storage: D1 sx_share (one row per member; everything off = row deleted). Used by:
//   - War Readiness (readiness() merges script readings - newest of Hub-key / script reading per member)
//   - the site build: GET /sx/export (header X-HB-Export = sha256(MEMBER_DIR|LEADER_DIR|hb-sx-export) - only the update
//     workflow has those) -> generate.py merges the stats into db/private.json, db/optin_shared.json and Member stats
//   - "View my shared data" (out.script)
// =====================================================================================================
const SX_SHARE_DAYS = 400;                 // daily stats kept (same as the Hub's OPTIN_KEEP_DAYS)
const SX_WATCH_MS = 150000;                // a leader opened War Readiness this recently -> scripts send readiness
const SX_READY_MAX_MS = 10 * 60000;        // script readiness readings older than this aren't shown
let SX_SHARE_READY = false, SX_WATCH_WRITTEN = 0;
const SX_LEVELS = ["off", "leaders", "faction"];
async function sxShareTable(env) {
  if (SX_SHARE_READY || !env.OC_DB) return;
  await env.OC_DB.prepare("CREATE TABLE IF NOT EXISTS sx_share (pid INTEGER PRIMARY KEY, name TEXT, bs TEXT NOT NULL DEFAULT 'off', " +
    "ws TEXT NOT NULL DEFAULT 'off', ready INTEGER NOT NULL DEFAULT 0, bs_s TEXT, ws_s TEXT, rd TEXT, rd_at INTEGER, since INTEGER, updated INTEGER)").run();
  // oc / cw columns (added after the table first existed) - "duplicate column" errors are fine
  await env.OC_DB.prepare("ALTER TABLE sx_share ADD COLUMN oc INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await env.OC_DB.prepare("ALTER TABLE sx_share ADD COLUMN cw INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  SX_SHARE_READY = true;
}
async function sxShareRow(env, pid) {
  await sxShareTable(env);
  return env.OC_DB.prepare("SELECT * FROM sx_share WHERE pid = ?").bind(Number(pid)).first();
}
const sxJ = (t, d) => { try { return t ? JSON.parse(t) : d; } catch (e) { return d; } };
// a leader is looking at War Readiness (site page / script Ready tab): remembered in D1 so every Worker sees it
async function sxReadyWatched(env) {
  if (!env.OC_DB || Date.now() - SX_WATCH_WRITTEN < 30000) return;
  SX_WATCH_WRITTEN = Date.now();
  await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES ('all', 'sx_ready_watch', '1', ?, 'hub') " +
    "ON CONFLICT (env, k) DO UPDATE SET ts = excluded.ts").bind(Date.now()).run().catch(() => {});
}
async function sxShareOp(env, who, op, b) {
  if (!env.OC_DB) return sxJson({ok: false, error: "Hub storage isn't set up yet"}, 503);
  const pid = Number(who.id), now = Date.now();
  let row = await sxShareRow(env, pid);
  const settings = r => ({bs: r ? r.bs : "off", ws: r ? r.ws : "off", ready: !!(r && r.ready), oc: !!(r && r.oc), cw: !!(r && r.cw)});
  if (op === "share_get") {
    const bs = sxJ(row && row.bs_s, []), ws = sxJ(row && row.ws_s, []);
    return sxJson({ok: true, settings: settings(row), since: row ? row.since : null,
                   last: {bs: bs.length ? bs[bs.length - 1][0] : null, ws: ws.length ? ws[ws.length - 1][0] : null, rd_at: row ? row.rd_at : null}});
  }
  if (op === "share_set") {
    const lv = v => SX_LEVELS.includes(v) ? v : "off";
    const bs = lv(b.bs), ws = lv(b.ws), ready = b.ready ? 1 : 0, oc = b.oc ? 1 : 0, cw = b.cw ? 1 : 0;
    // OC pass rates turned off here: their shared rates go too - unless they still share them with a Hub key
    if (row && row.oc && !oc) {
      const {data} = await readOptin(env, false).catch(() => ({data: {members: {}}}));
      if (!((data.members || {})[String(pid)] || {}).oc) await ocCprDrop(env, String(pid)).catch(() => {});
    }
    if (bs === "off" && ws === "off" && !ready && !oc && !cw) {            // everything off = nothing kept
      await env.OC_DB.prepare("DELETE FROM sx_share WHERE pid = ?").bind(pid).run();
      return sxJson({ok: true, settings: {bs, ws, ready: false, oc: false, cw: false}});
    }
    await env.OC_DB.prepare("INSERT INTO sx_share (pid, name, bs, ws, ready, oc, cw, since, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT (pid) DO UPDATE SET name = excluded.name, bs = excluded.bs, ws = excluded.ws, ready = excluded.ready, oc = excluded.oc, cw = excluded.cw, updated = excluded.updated, " +
      // a part turned off: its readings go too
      "bs_s = CASE WHEN excluded.bs = 'off' THEN NULL ELSE sx_share.bs_s END, ws_s = CASE WHEN excluded.ws = 'off' THEN NULL ELSE sx_share.ws_s END, " +
      "rd = CASE WHEN excluded.ready = 0 THEN NULL ELSE sx_share.rd END, rd_at = CASE WHEN excluded.ready = 0 THEN NULL ELSE sx_share.rd_at END")
      .bind(pid, who.name, bs, ws, ready, oc, cw, now, now).run();
    return sxJson({ok: true, settings: {bs, ws, ready: !!ready, oc: !!oc, cw: !!cw}});
  }
  if (op === "share_ping") {
    const out = {ok: true, settings: settings(row), want_ready: false, want_chain: false, oc_tag: null};
    if (row && row.ready) {
      const w = await env.OC_DB.prepare("SELECT ts FROM oc_config WHERE env = 'all' AND k = 'sx_ready_watch'").first().catch(() => null);
      out.want_ready = !!(w && now - Number(w.ts) < SX_WATCH_MS);
    }
    if (row && row.oc) {                     // the Hub's crime list signature - changes when it finds a NEW crime
      const st = ((await ocSnapGet(env, "hub", "oc-optin").catch(() => null)) || {data: {}}).data || {};
      const seen = (Array.isArray(st.seen) ? st.seen : []).map(Number).filter(Boolean);
      out.oc_tag = seen.length ? Math.max(...seen) + ":" + seen.length : "none";
    }
    if (row && row.cw && env.CHAINROOM) {    // a live chain, and this member isn't connected in Chain Watch
      try {
        const bd = await (await cwStub(env).fetch("https://do/board")).json();
        const c = bd && bd.chain, mine = (bd.queue || []).find(q => Number(q.pid) === pid);
        out.want_chain = !!(c && c.current > 0 && c.expires_at > now && !(mine && mine.connected));
      } catch (e) { /* room busy - next ping */ }
    }
    return sxJson(out);
  }
  // share_push: only the parts this member turned on; numbers only
  if (!row) return sxJson({ok: false, error: "Sharing from the script is off."}, 400);
  const day = new Date(now).toISOString().slice(0, 10);
  const cutoff = new Date(now - SX_SHARE_DAYS * 864e5).toISOString().slice(0, 10);
  const nums = (a, n) => Array.isArray(a) && a.length === n ? a.map(x => Math.max(0, Math.round(Number(x) || 0))) : null;
  const sets = [], vals = [];
  const series = (old, vals_) => sxJ(old, []).filter(x => x[0] !== day && x[0] >= cutoff).concat([[day].concat(vals_)]);
  if (row.bs !== "off" && b.bs) { const v = nums(b.bs.slice(1), 4); if (v) { sets.push("bs_s = ?"); vals.push(JSON.stringify(series(row.bs_s, v))); } }
  if (row.ws !== "off" && b.ws) { const v = nums(b.ws.slice(1), 3); if (v) { sets.push("ws_s = ?"); vals.push(JSON.stringify(series(row.ws_s, v))); } }
  if (row.ready && b.rd && typeof b.rd === "object") {
    const bar = x => x && typeof x === "object" ? {cur: num0(x.cur), max: num0(x.max), full: num0(x.full)} : null;
    const cd = b.rd.cd || {}, st = b.rd.status || {};
    const rd = {energy: bar(b.rd.energy), nerve: bar(b.rd.nerve), happy: bar(b.rd.happy), life: bar(b.rd.life),
                cd: {drug: num0(cd.drug), booster: num0(cd.booster), medical: num0(cd.medical)},
                refill: b.rd.refill == null ? null : !!b.rd.refill,
                status: {state: String(st.state || "").slice(0, 20), desc: String(st.desc || "").slice(0, 120), until: num0(st.until)},
                last: num0(b.rd.last)};
    sets.push("rd = ?", "rd_at = ?"); vals.push(JSON.stringify(rd), now);
  }
  let extra = 0;
  if (row.oc && Array.isArray(b.oc)) {
    const roles = {};
    b.oc.slice(0, 200).forEach(x => { if (Array.isArray(x) && x.length === 3 && Number.isFinite(Number(x[2])))
      roles[ocFb(x[0]) + "|" + ocFb(ocBaseRole(x[1]))] = Math.max(0, Math.min(100, Math.round(Number(x[2])))); });
    if (Object.keys(roles).length) { await ocStoreRates(env, pid, who.name, roles, "script"); extra++; }
  }
  if (row.cw && b.chain && typeof b.chain === "object" && env.CHAINROOM) {
    // the same checks + room call as the homepage's chain readings (cwReading): shorten-only in the room
    const r = await cwReading(env, new Request("https://sx.local/", {method: "POST", body: JSON.stringify(b.chain)}), who);
    extra += (await r.json().catch(() => ({}))).used ? 1 : 0;
  }
  if (!sets.length) return sxJson({ok: true, saved: extra});
  await env.OC_DB.prepare(`UPDATE sx_share SET ${sets.join(", ")}, name = ? WHERE pid = ?`).bind(...vals, who.name, pid).run();
  return sxJson({ok: true, saved: sets.length});
}
function num0(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; }
// script readiness rows for War Readiness (fresh readings of current members who share readiness)
async function sxReadyRows(env, members) {
  if (!env.OC_DB) return [];
  await sxShareTable(env).catch(() => {});
  const rows = (await env.OC_DB.prepare("SELECT pid, name, rd, rd_at FROM sx_share WHERE ready = 1 AND rd_at > ?")
    .bind(Date.now() - SX_READY_MAX_MS).all().catch(() => ({results: []}))).results || [];
  return rows.filter(r => !members || members.has(Number(r.pid))).map(r => {
    const m = (members && members.get(Number(r.pid))) || {};
    return Object.assign({id: Number(r.pid), name: m.name || r.name, position: m.position, via: "script", at: Math.floor(Number(r.rd_at) / 1000)}, sxJ(r.rd, {}));
  });
}
// GET /sx/export (the update workflow only) -> {members: {pid: {bs: {share, s}, ws: {share, s}, ready}}} - numbers only
async function sxExport(env, req) {
  const want = [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${env.MEMBER_DIR}|${env.LEADER_DIR}|hb-sx-export`)))]
    .map(x => x.toString(16).padStart(2, "0")).join("");
  if (!env.MEMBER_DIR || req.headers.get("X-HB-Export") !== want) return new Response("Not found", {status: 404});
  const out = {members: {}};
  if (env.OC_DB) {
    await sxShareTable(env).catch(() => {});
    const rows = (await env.OC_DB.prepare("SELECT pid, bs, ws, ready, oc, bs_s, ws_s, since FROM sx_share").all().catch(() => ({results: []}))).results || [];
    rows.forEach(r => {
      const x = {ready: !!r.ready, since: r.since};
      if (r.bs !== "off") x.bs = {share: r.bs, s: sxJ(r.bs_s, [])};
      if (r.ws !== "off") x.ws = {share: r.ws, s: sxJ(r.ws_s, [])};
      out.members[String(r.pid)] = x;
    });
    // SHARING SOURCES for leaders (db/private.json optin.via): everyone sharing anything, any way
    try {
      const {data} = await readOptin(env, false);
      const ocopt = await shareSrcOcopt(env);
      const sxBy = Object.fromEntries(rows.map(r => [String(r.pid), {bs: r.bs, ws: r.ws, ready: !!r.ready, oc: !!r.oc}]));
      const ids = new Set(Object.keys(data.members || {}).concat(Object.keys(sxBy), Object.keys(ocopt)));
      out.via = {};
      ids.forEach(i => { out.via[i] = shareVia((data.members || {})[i], sxBy[i], ocopt[i]).via; });
    } catch (e) { /* leave via out */ }
    // the scripts directory's install links - the site build reads Greasy Fork for them (Greasy Fork blocks Workers)
    const sc = (await env.OC_DB.prepare("SELECT install_url FROM hub_script").all().catch(() => ({results: []}))).results || [];
    out.scripts = sc.map(r => r.install_url).filter(Boolean);
  }
  return Response.json(out, {headers: {"Cache-Control": "no-store"}});
}
// what the member shares from the script, for "View my shared data"
async function sxShareOwn(env, id) {
  const r = await sxShareRow(env, id).catch(() => null);
  if (!r) return null;
  return {bs: r.bs, ws: r.ws, ready: !!r.ready, oc: !!r.oc, cw: !!r.cw, since: r.since, stats: {bs: sxJ(r.bs_s, []), ws: sxJ(r.ws_s, [])},
          rd: r.rd ? Object.assign({at: Math.floor(Number(r.rd_at) / 1000)}, sxJ(r.rd, {})) : null};
}

// =====================================================================================================
// SHARING SOURCES (Nov 11 2026, user: "I want to be able to differentiate which method they're using to share their
// stats. If they're using the HUB Site, HUB Script, OC Script, etc. This can be shown in their 'My stored data' and
// also visible to leadership"). Each shared thing -> the ways it's being shared:
//   "site"   = Hub site, My data & sharing (a key stored on the Hub)            - from data/optin.json
//   "script" = the Heart Breakers Hub script (key stays on the device)          - from D1 sx_share
//   "ocopt"  = the OC Optimizer script (OC pass rates it publishes, /oc/cpr)   - from D1 share_src
// share_src (pid, kind, src, ts) records who WROTE OC pass rates and when (any source; the OC Optimizer has no
// setting to read, so its rates are the only record). Shown: View my shared data (via + who sees it) and to leaders
// (generate.py puts optin.via into db/private.json: Member stats, the Hub script).
// =====================================================================================================
const SHARE_SRC_DAYS = 60;                 // an OC Optimizer share counts as "sharing" for this long after its last write
const SHARE_SRC_NAMES = {site: "Hub site", script: "Hub script", ocopt: "OC Optimizer script"};
let SHARE_SRC_READY = false;
async function shareSrcTable(env) {
  if (SHARE_SRC_READY || !env.OC_DB) return;
  await env.OC_DB.prepare("CREATE TABLE IF NOT EXISTS share_src (pid INTEGER NOT NULL, kind TEXT NOT NULL, src TEXT NOT NULL, ts INTEGER NOT NULL, " +
                          "PRIMARY KEY (pid, kind, src))").run();
  SHARE_SRC_READY = true;
}
async function shareSrcMark(env, pid, kind, src) {
  if (!env.OC_DB) return;
  await shareSrcTable(env);
  await env.OC_DB.prepare("INSERT INTO share_src (pid, kind, src, ts) VALUES (?, ?, ?, ?) ON CONFLICT (pid, kind, src) DO UPDATE SET ts = excluded.ts")
    .bind(Number(pid), kind, src, Date.now()).run();
}
// recent OC Optimizer shares -> {pid: ts}
async function shareSrcOcopt(env) {
  if (!env.OC_DB) return {};
  await shareSrcTable(env).catch(() => {});
  const rows = (await env.OC_DB.prepare("SELECT pid, ts FROM share_src WHERE kind = 'oc' AND src = 'ocopt' AND ts > ?")
    .bind(Date.now() - SHARE_SRC_DAYS * 864e5).all().catch(() => ({results: []}))).results || [];
  return Object.fromEntries(rows.map(r => [String(r.pid), Number(r.ts)]));
}
// one member: {via: {bs: [...], ws, ready, oc, cw}, level: {bs, ws}} from their Hub opt-in (e), script sharing (x) and
// a recent OC Optimizer share (ocTs)
function shareVia(e, x, ocTs) {
  const lv = ["off", "leaders", "faction"], wide = (a, b) => lv[Math.max(lv.indexOf(a || "off"), lv.indexOf(b || "off"))];
  const on = v => v && v !== "off";
  const via = {bs: [], ws: [], ready: [], oc: [], cw: []};
  if (e) { if (on(e.bs)) via.bs.push("site"); if (on(e.ws)) via.ws.push("site"); if (e.ready) via.ready.push("site"); if (e.oc) via.oc.push("site"); if (e.cw) via.cw.push("site"); }
  if (x) { if (on(x.bs)) via.bs.push("script"); if (on(x.ws)) via.ws.push("script"); if (x.ready) via.ready.push("script"); if (x.oc) via.oc.push("script"); }
  if (ocTs) via.oc.push("ocopt");
  return {via, level: {bs: wide(e && e.bs, x && x.bs), ws: wide(e && e.ws, x && x.ws)}};
}

// ---------- a member's own private figures ----------
// db/private.json (leaders' folder, written by generate.py): {members: {"<id>": {...reliability, xanax...}}}.
// Members may only see THEIR entry; leaders read the whole file from /l/db/private.json.
async function mine(env, who) {
  const r = await env.ASSETS.fetch(new Request(`https://assets.local/${await physDir(env.LEADER_DIR)}/db/private.json`));
  const j = r.ok ? await r.json().catch(() => ({})) : {};
  return Response.json(Object.assign({id: who.id}, (j.members || {})[String(who.id)] || {},
                                     {averages: j.averages || {}, weights: j.weights || null, rules: j.rules || null}),
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
const publicEntry = e => e ? {opted: true, bs: e.bs, ws: e.ws, ready: !!e.ready, oc: !!e.oc, cw: !!e.cw, since: e.since, updated: e.updated} : {opted: false};
// CHAIN TIMER OPT-IN (Nov 2026, claude/chainwatch-away-and-optin-addendum.md): members with cw on -> the Chain Watch
// room gets their ENCRYPTED key ({pid: sealed}) and may read faction/chain with it during a live chain, <= 2 calls/min,
// only while their own script isn't connected (chainroom.js readChainWithMemberKey). Sent on every opt-in save and
// re-synced every 15 minutes (so leavers / deleted keys drop out).
async function cwOptinSync(env, data) {
  if (!env.CHAINROOM) return;
  try {
    if (!data) data = (await readOptin(env, false)).data;
    const members = {};
    Object.keys(data.members || {}).forEach(i => { const e = data.members[i]; if (e && e.cw && e.k) members[i] = e.k; });
    await cwStub(env).fetch("https://do/cw-optin", {method: "POST", body: JSON.stringify({members})});
  } catch (e) { /* next sync */ }
}
// OC PASS RATES WITH THE STORED KEY (Nov 2026, My data & sharing "🕵️ OC pass rates"): the member's opt-in key
// (the same encrypted key as their stats) reads THEIR checkpoint pass rates - v2 user/organizedcrimes: only the open
// roles of recruiting crimes carry the key owner's rate - into oc_cpr (prod), exactly like the OC Optimizer script's
// shares, so OC Management's Team Builder and the script's role suggestions use them.
//   WHEN (Nov 2026, the user's rule): only when the Hub's 3-minute crimes read finds a NEW crime (an id it hasn't
//   seen) - then every opted-in member is read once (at most OC_OPTIN_PER_RUN a run, the rest on the next runs).
//   Plus once straight away when a member turns it on (optinRoute). Turned off / deleted -> their row removed.
//   MERGE: rates read are written over the member's stored ones per crime|role; every other stored rate is kept
//   (so a rate only changes when a new one is found for that crime / role). Key deleted / not theirs -> row removed.
const OC_OPTIN_PER_RUN = 10;
const ocBaseRole = l => String(l || "").replace(/#\s*\d+/g, "").replace(/\s+/g, " ").trim();   // "Muscle #2" -> "Muscle"
const ocFb = x => String(x == null ? "" : x).replace(/[.$#\[\]/\x00-\x1f]/g, "_").trim();     // the script's fbKey
async function ocCprDrop(env, id) {
  if (!env.OC_DB) return;
  await env.OC_DB.prepare("DELETE FROM oc_cpr WHERE env = 'prod' AND faction_id = ? AND player_id = ?").bind(Number(env.FACTION_ID), Number(id)).run();
  await env.OC_DB.prepare("DELETE FROM oc_cpr_t WHERE env = 'prod' AND faction_id = ? AND player_id = ?").bind(Number(env.FACTION_ID), Number(id)).run().catch(() => {});
  await env.OC_DB.prepare("DELETE FROM share_src WHERE pid = ? AND kind = 'oc'").bind(Number(id)).run().catch(() => {});
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
  return ocStoreRates(env, id, name, roles, "site");
}
// store a member's pass rates {"Crime|Role": rate} into oc_cpr (shared by the Hub-key read above and the Hub script's
// sharing - SCRIPT SHARING "OC pass rates")
async function ocStoreRates(env, id, name, roles, src) {
  const n = Object.keys(roles).length;
  if (n && src) await shareSrcMark(env, id, "oc", src);
  if (n) {
    // merge over what's stored; only written (and ts moved on) when a rate is new or different
    const cur = await env.OC_DB.prepare("SELECT roles FROM oc_cpr WHERE env = 'prod' AND faction_id = ? AND player_id = ?")
      .bind(Number(env.FACTION_ID), Number(id)).first();
    let old = {}; try { old = cur ? JSON.parse(cur.roles) || {} : {}; } catch (e) {}
    const changed = Object.keys(roles).filter(k => old[k] !== roles[k]).length;
    if (changed) await env.OC_DB.prepare(
      "INSERT INTO oc_cpr (env, faction_id, player_id, name, roles, ts) VALUES ('prod', ?, ?, ?, json(?), ?) " +
      "ON CONFLICT (env, faction_id, player_id) DO UPDATE SET name = excluded.name, roles = excluded.roles, ts = excluded.ts")
      .bind(Number(env.FACTION_ID), Number(id), String(name || "").slice(0, 40), JSON.stringify(Object.assign(old, roles)), Date.now()).run();
    await ocCprTimes(env, "prod", Number(id), Object.keys(roles));    // these roles were read just now
    return {roles: n, changed};
  }
  return {roles: 0, changed: 0};
}
// timer step: when the crimes read found a NEW crime id, queue every member with "OC pass rates" on; read up to
// OC_OPTIN_PER_RUN queued members a run. Also removes shared rows of anyone no longer in the faction (roster).
// State: oc_snap hub 'oc-optin' {seen: [crime ids], pending: [member ids]}
async function ocOptinPull(env, now, crimes) {
  const {data} = await readOptin(env, false);
  const ros = await ocSnapGet(env, "prod", "roster");
  const roster = (ros && ros.data) || null;
  if (roster && Object.keys(roster).length > 10) {
    const ids = Object.keys(roster).map(Number).filter(Boolean);
    await env.OC_DB.prepare(`DELETE FROM oc_cpr WHERE faction_id = ? AND player_id NOT IN (${ids.join(",")})`).bind(Number(env.FACTION_ID)).run();
    await env.OC_DB.prepare(`DELETE FROM oc_cpr_t WHERE faction_id = ? AND player_id NOT IN (${ids.join(",")})`).bind(Number(env.FACTION_ID)).run().catch(() => {});
  }
  const st0 = ((await ocSnapGet(env, "hub", "oc-optin")) || {data: {}}).data || {};
  const st = {seen: Array.isArray(st0.seen) ? st0.seen : [], pending: Array.isArray(st0.pending) ? st0.pending : []};
  let dirty = false;
  if (Array.isArray(crimes)) {                             // null when the crimes read failed - nothing to compare
    const seen = new Set(st.seen.map(String)), ids = crimes.map(c => String(c.id));
    const fresh = ids.filter(id => !seen.has(id));
    if (fresh.length) {                                    // a NEW crime -> everyone with OC rates on is read once
      const add = Object.keys(data.members).filter(i => data.members[i].oc && (!roster || roster[i] != null));
      st.pending = [...new Set(st.pending.concat(add))];
    }
    if (fresh.length || ids.length !== st.seen.length) { st.seen = ids; dirty = true; }
  }
  st.pending = st.pending.filter(i => data.members[i] && data.members[i].oc);
  const due = st.pending.slice(0, OC_OPTIN_PER_RUN);
  for (const i of due) {
    try { await ocPullMember(env, i, roster ? roster[i] : "", await openKey(env, data.members[i].k)); } catch (e) {}
  }
  if (due.length) { st.pending = st.pending.slice(due.length); dirty = true; }
  if (dirty) await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'oc-optin', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(st)).run();
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
//   ready  what leaders last saw on War Readiness (no Torn call here - only read while a leader has the page open)
//   oc     {ts, roles: {"Crime|Role": rate}} their shared OC pass rates (D1 oc_cpr, live)
async function mySharedData(env, who) {
  const H = {headers: {"Cache-Control": "no-store"}};
  const id = String(Number(who.id)), out = {id: Number(id), name: who.name};
  try {
    const {data} = await readOptin(env, true);
    const e = data.members[id];
    out.optin = e ? {bs: e.bs, ws: e.ws, ready: !!e.ready, oc: !!e.oc, cw: !!e.cw, since: e.since, updated: e.updated, key_stored: !!e.k} : null;
    if (e && (e.bs !== "off" || e.ws !== "off")) {
      const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/data/optin_stats.json?ref=main`,
                            {headers: Object.assign(ghHeaders(env), {Accept: "application/vnd.github.raw"})});
      if (r.ok) { const st = await r.json(); out.stats = st[id] || {}; }
    }
    if (e && e.ready) {
      // (Nov 2026) no Torn call here: what leaders last saw on War Readiness (read only while a leader has it open)
      const c = await readinessCached(env).catch(() => ({v: null}));
      const row = c.v && (c.v.members || []).find(m => String(m.id) === id);
      out.ready = !row ? {err: "nothing read yet - War Readiness is only read while a leader has it open"}
        : row.err ? {err: row.err}
        : {energy: row.energy, nerve: row.nerve, happy: row.happy, life: row.life, cd: row.cd || {}, refill: row.refill,
           status: row.status ? row.status.desc : null, at: c.v.at};
    }
  } catch (x) { out.optin_err = "couldn't read your opt-in settings right now"; }
  if (env.OC_DB) out.script = await sxShareOwn(env, id).catch(() => null);     // shared from the Hub script (no key)
  // SHARING SOURCES: how each thing is shared (Hub site / Hub script / OC Optimizer script) + the widest "who sees it"
  {
    const e = out.optin, x = out.script, ocTs = (await shareSrcOcopt(env).catch(() => ({})))[id];
    const v = shareVia(e && {bs: e.bs, ws: e.ws, ready: e.ready, oc: e.oc, cw: e.cw}, x, ocTs);
    out.via = v.via; out.level = v.level; out.ocopt_at = ocTs || null;
    // stats shared only from the script: show the script's readings (same day from both = one row)
    if (x && x.stats) {
      out.stats = out.stats || {};
      for (const k of ["bs", "ws"]) {
        if (!(x.stats[k] || []).length) continue;
        const by = {}; (out.stats[k] || []).forEach(r => { by[r[0]] = r; }); x.stats[k].forEach(r => { by[r[0]] = r; });
        out.stats[k] = Object.keys(by).sort().map(d => by[d]);
      }
    }
    if (x && x.ready && x.rd && (!out.ready || out.ready.err || (out.ready.at || 0) < x.rd.at))
      out.ready = {energy: x.rd.energy, nerve: x.rd.nerve, happy: x.rd.happy, life: x.rd.life, cd: x.rd.cd || {}, refill: x.rd.refill,
                   status: x.rd.status ? x.rd.status.desc || x.rd.status.state : null, at: x.rd.at};
  }
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
      await cwOptinSync(env, null);
      return Response.json({opted: false}, H);
    }
    if (req.method !== "PUT") return new Response("Method not allowed", {status: 405});
    const j = await req.json().catch(() => null);
    if (!j) return new Response("Bad request", {status: 400});
    const bs = SHARE.includes(j.bs) ? j.bs : "off", ws = SHARE.includes(j.ws) ? j.ws : "off", ready = !!j.ready, oc = !!j.oc, cw = !!j.cw;
    if (bs === "off" && ws === "off" && !ready && !oc && !cw) {
      await writeOptin(env, id, () => null, `Opt-in turned off ${tag}`);
      await ocCprDrop(env, id);
      await cwOptinSync(env, null);
      return Response.json({opted: false}, H);
    }
    let sealed = null;
    if (j.key) {
      const key = String(j.key).trim();
      if (!/^[A-Za-z0-9]{16}$/.test(key)) return new Response("That doesn't look like a Torn API key (16 letters/numbers).", {status: 400});
      // API: Heart Breakers Hub - key check only (who owns it); stats are read at 00:00 TCT, OC rates when a new crime
      // appears, war readiness while a leader has the page open (Nov 2026)
      const d = await tornUser(key, "basic");
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
      return {k: sealedNow, bs, ws, ready, oc, cw, since: cur ? cur.since : now, updated: now};
    }, `Opt-in settings saved ${tag}`);
    if (missing) return new Response("Add your Limited API key first.", {status: 400});
    // OC pass rates: read straight away when turned on (Nov 2026: on opting in), then whenever the Hub finds a NEW
    // crime (ocOptinPull); removed when off
    let ocNote = null;
    if (oc) ocNote = await ocPullMember(env, id, who.name, await openKey(env, sealedNow)).catch(() => null);
    else await ocCprDrop(env, id);
    await cwOptinSync(env, (await readOptin(env, false)).data);   // Chain timer on/off reaches the room at once
    return Response.json(Object.assign(publicEntry({bs, ws, ready, oc, cw, since: now, updated: now}), {oc_now: ocNote}), H);
  } catch (e) {
    return new Response(e.message || "Something went wrong", {status: 502});
  }
}
// live war readiness for leaders: every opted-in member with "ready" on, read with their own key
// (Nov 2026) members' keys are read AT MOST ONCE A MINUTE, and only because a leader has the War Readiness page open
// (it asks once a minute while visible). The last read is kept in D1 (oc_snap hub 'readiness') so every Worker
// instance shares that minute - nothing else reads readiness from Torn.
let READY_CACHE = {t: 0, v: null};
async function readinessCached(env) {
  if (READY_CACHE.v) return READY_CACHE;
  const s = env.OC_DB ? await ocSnapGet(env, "hub", "readiness").catch(() => null) : null;
  if (s && s.data) READY_CACHE = {t: Number(s.as_of) || 0, v: s.data};
  return READY_CACHE;
}
// War Readiness = the Hub-key readings (readinessHub) + readings members' scripts sent (SCRIPT SHARING) - per member
// the newest one is shown. Opening it also tells sharing scripts a leader is watching (sxReadyWatched).
async function readiness(env, ctx) {
  await sxReadyWatched(env);
  const base = await (await readinessHub(env, ctx)).json();
  const members = await currentMembers(env, ctx).catch(() => null);
  const sx = await sxReadyRows(env, members).catch(() => []);
  if (!sx.length) return Response.json(base, {headers: {"Cache-Control": "no-store"}});
  const at = Number(base.at) || Math.floor(Date.now() / 1000), rows = (base.members || []).slice();
  for (const r of sx) {
    // cooldowns are "seconds left" at the reading - move them to the page's reading time
    const shift = at - r.at;
    r.cd = Object.fromEntries(Object.entries(r.cd || {}).map(([k, v]) => [k, Math.max(0, v - shift)]));
    const i = rows.findIndex(x => String(x.id) === String(r.id));
    if (i < 0) rows.push(r);
    else if (rows[i].err || r.at >= at) rows[i] = r;           // the script's reading is newer (or the Hub's failed)
  }
  return Response.json(Object.assign({}, base, {members: rows}), {headers: {"Cache-Control": "no-store"}});
}
async function readinessHub(env, ctx) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (env.OC_DB) { const s = await ocSnapGet(env, "hub", "readiness").catch(() => null); if (s && s.data) READY_CACHE = {t: Number(s.as_of) || 0, v: s.data}; }
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
  if (env.OC_DB) await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'readiness', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(READY_CACHE.t, JSON.stringify(READY_CACHE.v)).run().catch(() => {});
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
  if (read) return ocRead(env, ctx, body.env, ocKey(req, body.key), body);
  return ocWrite(env, ctx, req, body, del);
}

// every member's shared rates for one env, keyed by player_id (both read routes)
async function ocRead(env, ctx, envName, key, body) {
    if (!OC_ENVS.has(envName)) return ocErr(400, "env must be test or prod");
    const id = await ocCaller(env, ctx, key, body);
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
  const id = await ocCaller(env, ctx, ocKey(req, body.key), body);
  if (id.err) return ocErr(id.status, id.err);
  const fid = Number(env.FACTION_ID);
  if (del) {
    await env.OC_DB.prepare("DELETE FROM oc_cpr WHERE env = ? AND faction_id = ? AND player_id = ?").bind(body.env, fid, id.player_id).run();
    await env.OC_DB.prepare("DELETE FROM oc_cpr_t WHERE env = ? AND faction_id = ? AND player_id = ?").bind(body.env, fid, id.player_id).run().catch(() => {});
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
  // NEWEST PER ROLE (Nov 2026): merged over what's stored - the roles in this share replace their old values, roles
  // it doesn't include keep theirs (a share only covers the crimes the script could see) - and each shared role's
  // time is recorded (oc_cpr_t), so only the newest rate for each crime/role ever counts.
  const cur = await env.OC_DB.prepare("SELECT roles FROM oc_cpr WHERE env = ? AND faction_id = ? AND player_id = ?")
    .bind(body.env, fid, id.player_id).first();
  let old = {}; try { old = cur ? JSON.parse(cur.roles) || {} : {}; } catch (e) {}
  await env.OC_DB.prepare(
    "INSERT INTO oc_cpr (env, faction_id, player_id, name, roles, ts) VALUES (?, ?, ?, ?, json(?), ?) " +
    "ON CONFLICT (env, faction_id, player_id) DO UPDATE SET name = excluded.name, roles = excluded.roles, ts = excluded.ts")
    .bind(body.env, fid, id.player_id, name, JSON.stringify(Object.assign(old, clean)), now).run();
  await ocCprTimes(env, body.env, id.player_id, Object.keys(clean), now);
  if (body.env === "prod") await shareSrcMark(env, id.player_id, "oc", "ocopt").catch(() => {});   // shared from the OC Optimizer script
  return ocJson({ok: true});
}

// the key: X-API-Key / Authorization: Bearer header first, else the body / query value
function ocKey(req, fallback) {
  const h = req.headers.get("X-API-Key") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return String(h || fallback || "").trim();
}

// key -> {player_id, faction_id, name}, cached 10 min under sha256(key) (the key itself is never stored)
// WHO IS CALLING (Nov 2026, claude/oc-optimizer-hub-identity-addendum.md - the user's decision): the script never
// sends its key. It resolves {pid, faction} from Torn itself and sends them; the Hub TRUSTS that identity, scoped to
// Heart Breakers. Extra (no Torn call): the pid must be on the faction's current roster (the feed's hourly copy) when
// the Hub has one - leader rights etc. always come from the Hub's own member list, never the client. A body without
// pid falls back to the old key check (transition only), and no key is ever logged or stored either way.
async function ocCaller(env, ctx, key, body) {
  if (body && body.pid != null) {
    const pid = Number(body.pid), fac = Number(body.faction);
    if (!Number.isInteger(pid) || pid <= 0) return {status: 400, err: "pid must be your Torn player id"};
    if (String(fac) !== String(env.FACTION_ID)) return {status: 403, err: "Heart Breakers members only"};
    let name = "";
    try {
      const ros = await ocSnapGet(env, "prod", "roster");
      const map = ros && ros.data;
      if (map && Object.keys(map).length) {
        if (map[String(pid)] == null) return {status: 403, err: "not on the Heart Breakers member list"};
        name = String(map[String(pid)] || "");
      }
    } catch (e) {}
    return {player_id: pid, faction_id: fac, name};
  }
  return ocIdentify(env, ctx, key);
}
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
//        -> {ok:true, disabled:[...], assignment: null | {crime, position, team, rate, difficulty, deployed, key, by, ...}, plan_ts}
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
  if (!Array.isArray(out.rotate)) out.rotate = [];
  return out;
}
// ROTATION mix rule (Nov 2026): who was in the latest completed runs of each rotated crime (oc_hist, newest first)
// -> {crime: [[pids of the latest run], [pids of the run before]]}
async function ocLastRuns(env, envName, names) {
  if (!names || !names.length) return {};
  const {results} = await env.OC_DB.prepare(
    `WITH h AS (SELECT json_extract(data, '$.name') AS crime, data,
                       ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.name') ORDER BY executed_at DESC) AS n
                FROM oc_hist WHERE env = ? AND json_extract(data, '$.name') IN (SELECT value FROM json_each(?)))
     SELECT crime, n, json_extract(j.value, '$.user.id') AS pid FROM h, json_each(h.data, '$.slots') AS j WHERE n <= 2`)
    .bind(envName, JSON.stringify(names)).all();
  const out = {};
  for (const r of results || []) { if (r.pid == null) continue;
    const l = out[r.crime] || (out[r.crime] = []); (l[r.n - 1] || (l[r.n - 1] = [])).push(Number(r.pid)); }
  for (const k of Object.keys(out)) out[k] = Array.from(out[k], x => x || []);
  return out;
}

async function ocPlanRoute(env, ctx, req) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: OC_CORS});
  if (!env.OC_DB) return ocErr(503, "OC sharing isn't set up yet");
  if (req.method !== "POST") return ocErr(405, "method not allowed");
  let body;
  try { body = await req.json(); } catch (e) { return ocErr(400, "body must be JSON"); }
  if (!body || !OC_ENVS.has(body.env)) return ocErr(400, "env must be test or prod");
  const id = await ocCaller(env, ctx, ocKey(req, body.key), body);
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
  // BIND TO LIVE INSTANCES (Nov 2026, claude/oc-optimizer-hub-liveteam-crimeid-addendum.md): a deployed team with no
  // crime_id whose crime already has live (Recruiting / Planning) instances is sent BOUND to one of them - 1:1, no two
  // teams share an instance - so the script can mark its seats on the right crime card. Teams left over (more teams
  // than instances) stay spawn with crime_id null. Done when the plan is sent (the stored plan isn't changed, so it
  // also works while Automatic is off). Best fit first: most of the team already seated in the instance, then most of
  // its roles open there, then the lowest instance id.
  const bound = new Map();                                 // team id -> {c: instance, slot: {pid: exact slot label}}
  if (crimes) {
    const live = crimes.filter(c => c && (c.status === "Recruiting" || c.status === "Planning"));
    const used = new Set(teamsCfg.filter(t => t.crime_id).map(t => String(t.crime_id)));
    const lab = sl => (sl.position_info && sl.position_info.label) || sl.position || "";
    const fit = (t, c) => {   // -> {seated, open, slot}
      const slot = {}, taken = new Set(); let seated = 0, open = 0;
      const ms = (t.roles || []).filter(r => r.pid != null);
      for (const r of ms) { const sl = (c.slots || []).find(x => x.user && Number(x.user.id) === Number(r.pid));
        if (sl) { slot[r.pid] = lab(sl); taken.add(lab(sl)); seated++; } }
      for (const r of ms) { if (slot[r.pid]) continue;
        const free = (c.slots || []).filter(x => !x.user && !taken.has(lab(x)) && ocBaseRole(lab(x)) === ocBaseRole(r.position));
        const sl = free.find(x => lab(x) === r.position) || free[0];
        if (sl) { slot[r.pid] = lab(sl); taken.add(lab(sl)); open++; } }
      return {seated, open, slot};
    };
    const byCrime = {};
    teamsCfg.filter(t => !t.crime_id && t.crime).forEach(t => (byCrime[t.crime] = byCrime[t.crime] || []).push(t));
    for (const [crime, ts] of Object.entries(byCrime)) {
      const pool = live.filter(c => c.name === crime && !used.has(String(c.id)));
      const pairs = [];
      ts.forEach(t => pool.forEach(c => { const f = fit(t, c); pairs.push({t, c, f}); }));
      pairs.sort((a, b) => (b.f.seated - a.f.seated) || (b.f.open - a.f.open) || (Number(a.c.id) - Number(b.c.id)));
      for (const p of pairs) {
        if (bound.has(p.t.id) || used.has(String(p.c.id))) continue;
        bound.set(p.t.id, {c: p.c, slot: p.f.slot}); used.add(String(p.c.id));
      }
    }
  }
  let assignment = null;
  for (const t of teamsCfg) {
    for (const r of (t.roles || [])) {
      if (Number(r.pid) === Number(id.player_id)) {
        if (r.existing) continue;                           // already in that crime in Torn - nothing to do
        const b = bound.get(t.id);                          // a spawn team sent bound to a live instance (above)
        if (b && (b.c.slots || []).some(x => x.user && Number(x.user.id) === Number(r.pid))) continue;   // already seated there
        assignment = {crime: t.crime, position: (b && b.slot[r.pid]) || r.position, team: t.id, rate: r.rate ?? null,
                      difficulty: t.difficulty ?? null, deployed: cfg.plan_ts || null,
                      kind: b ? "live" : (t.kind || "spawn"), crime_id: b ? b.c.id : (t.crime_id || null),   // live: join THIS crime id + exact slot
                      queued: !!r.queued, free_at: r.queued ? r.free_at || null : null,
                      replaces: r.replaces || null};   // the slot is still held by this member until they leave   // QUEUE: join after the current crime pays out
      }
    }
  }
  // Spawn state (Nov 2026): teams are planned whether or not the crime is recruiting, so tell the member when
  // there's nothing to join yet. From the feed's crimes (every 3 min):
  //   recruiting   a Recruiting instance of the crime has at least one open slot
  //   role_open    a Recruiting instance has the member's role (base role, "#n" ignored) open
  //   spawn_needed !role_open -> the script warns "this crime needs to be spawned"
  // ASSIGNMENT NOTICES (Nov 10 2026, user: "Tell the user through the script. This can also happen when leadership
  // build teams."): `key` changes whenever the member's assignment changes (crime / exact slot / instance / queued),
  // whoever built it - so the script can show "New OC assignment" / "Your OC assignment changed" once per change.
  // `by` = who built the plan: "Automatic" (the Hub's planner) or the leader who deployed it on OC Management.
  if (assignment) {
    assignment.key = [assignment.crime, assignment.position, assignment.crime_id || "", assignment.queued ? "q" : ""].join("|");
    assignment.by = /^auto/i.test(String(cfg.plan_by || "")) ? "Automatic" : String(cfg.plan_by || "");
  }
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
  // pay per member per day + required items per role, from the planner's latest stats (every 3 min) - Nov 2026
  const ps = await ocSnapGet(env, "hub", "plan:stats").catch(() => null);
  const payDay = (ps && ps.data && ps.data.pay_day) || {}, payMin = (ps && ps.data && ps.data.pay_day_min) || {}, items = (ps && ps.data && ps.data.items) || {};
  const rotSet = new Set(cfg.rotate || []);
  const tpRow = await ocSnapGet(env, "hub", "tp:weights").catch(() => null), tpWts = (tpRow && tpRow.data) || null;
  const tpNames = tpWts ? tpWts.names : null, tpSucc = ((await ocSnapGet(env, "hub", "tp:success").catch(() => null)) || {}).data || null;
  const teams = teamsCfg.length ? teamsCfg.map(t0 => {
    const b = bound.get(t0.id);
    const t = b ? Object.assign({}, t0, {kind: "live", crime_id: b.c.id}) : t0;
    const inst = (crimes || []).filter(c => c && (t.crime_id ? String(c.id) === String(t.crime_id) : c.name === t.crime) && (c.status === "Recruiting" || c.status === "Planning"));
    const open = inst.some(c => c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user));
    return {team: t.id, crime: t.crime, difficulty: t.difficulty ?? null, deployed: cfg.plan_ts || null,
            kind: t.kind || "spawn", crime_id: t.crime_id || null,
            pay_day: payDay[t.crime] ?? null,                 // per member per day (the planner's figure = the best recorded)
            pay_day_min: payMin[t.crime] ?? null,             // ... the worst recorded - shown as a range "min-max"
            pay_day_max: payDay[t.crime] ?? null,
            rotation: rotSet.has(t.crime),                    // a crime leaders rotate
            // ROLE WEIGHTS (Nov 2026): the team's weighted success (role-weighted average of its members' rates) and,
            // when the Hub has a tornprobability.com key, the calculated success chance (null = not available)
            success_weighted: tpWeighted(tpWts, t.crime, (t.roles || []).filter(r => r.pid != null && r.rate != null)),
            success: tpSucc ? tpSuccessOf(tpSucc, tpNames, t.crime, t.roles || []) : null,
            status: crimes == null ? null : !inst.length ? "needs_spawn" : open ? "recruiting" : "spawned",
            members: (t.roles || []).filter(r => r.pid != null).map(r => ({position: ocBaseRole(r.position),
              // bound team: the exact slot in ITS instance (the seat they're in, or the open seat for their role)
              slot: (b && b.slot[r.pid]) || r.position, pid: Number(r.pid),
              name: (members && members.get(Number(r.pid)) || {}).name || r.name || ("#" + r.pid), rate: r.rate ?? null,
              existing: !!r.existing || !!(b && (b.c.slots || []).some(x => x.user && Number(x.user.id) === Number(r.pid))),
              joined: !!r.joined || !!(b && (b.c.slots || []).some(x => x.user && Number(x.user.id) === Number(r.pid))),
              queued: !!r.queued, free_at: r.queued ? r.free_at || null : null,
              replaces: r.replaces || null,
              item: (items[t.crime] || {})[r.position] || null}))};   // required item {id, name} for this role, or null   // replaces {pid, name}: a leader is swapping out the member in this slot
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
  // sharing (Nov 2026): which CURRENT members share their CPR rates with the Hub (oc_cpr - the script's sync or the
  // opt-in key) and when they last did. Visible to every member (the user's choice). Rates themselves aren't sent.
  let sharing = null;
  if (members) {
    const {results} = await env.OC_DB.prepare("SELECT player_id, ts, LENGTH(roles) > 2 AS has FROM oc_cpr WHERE env = ? AND faction_id = ?")
      .bind(envName, Number(env.FACTION_ID)).all();
    const by = new Map((results || []).filter(r => r.has).map(r => [Number(r.player_id), Number(r.ts) || null]));
    sharing = [...members.entries()].map(([pid, m]) => ({pid: Number(pid), name: (m && m.name) || ("#" + pid),
      sharing: by.has(Number(pid)), last: by.get(Number(pid)) || null}))
      .sort((a, b) => (a.sharing - b.sharing) || a.name.localeCompare(b.name));
  }
  return {ok: true, disabled: cfg.disabled, assignment, plan_ts: cfg.plan_ts || null, is_leader, teams, delays, sharing,
          weights_at: tpRow ? Number(tpRow.as_of) || null : null};   // when the role weights were last fetched (null = none yet)
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
      queued: !!r.queued, free_at: r.queued && Number(r.free_at) ? Number(r.free_at) : null,   // QUEUE: still in a Planning crime
      replaces: r.replaces && Number(r.replaces.pid) ? {pid: Number(r.replaces.pid), name: String(r.replaces.name || "").slice(0, 40)} : null}))}));
}

async function ocLeaderRoute(env, req, url, who, sub) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (!env.OC_DB) return Response.json({ok: false, error: "OC storage isn't set up yet"}, {status: 503});
  if (req.method === "GET" && (sub === "config.json" || sub === "rates.json")) {
    const envName = url.searchParams.get("env");
    if (!OC_ENVS.has(envName)) return Response.json({ok: false, error: "env must be test or prod"}, {status: 400});
    if (sub === "config.json") { const c = await ocConfig(env, envName);
      c.last_runs = await ocLastRuns(env, envName, c.rotate).catch(() => ({}));   // for the page's Auto-build (rotation mix rule)
      c.delays = ((await ocSnapGet(env, "hub", "delay-stats").catch(() => null)) || {}).data || {};   // members' delay record
      c.reconfigured = ((await ocSnapGet(env, "hub", "plan:reconfigured").catch(() => null)) || {}).data || null;   // last reconfigure
      c.auto_run = Number(((await ocSnapGet(env, "hub", "plan:stats").catch(() => null)) || {}).as_of) || null;     // last automatic run (ms)
      const tpw = await ocSnapGet(env, "hub", "tp:weights").catch(() => null);
      c.weights = (tpw && tpw.data && tpw.data.weights) || null;                                                     // role weights
      c.tp_names = (tpw && tpw.data && tpw.data.names) || null;                                                      // role order
      c.success = ((await ocSnapGet(env, "hub", "tp:success").catch(() => null)) || {}).data || null;               // team success (CalculateSuccess)
      return Response.json(c, H); }
    const {results} = await env.OC_DB.prepare("SELECT c.player_id, c.name, c.roles, c.ts, t.t AS rt FROM oc_cpr c LEFT JOIN oc_cpr_t t " +
      "ON t.env = c.env AND t.faction_id = c.faction_id AND t.player_id = c.player_id WHERE c.env = ? AND c.faction_id = ?")
      .bind(envName, Number(env.FACTION_ID)).all();
    const out = {};
    for (const r of results || []) { let roles = {}, t = {}; try { roles = JSON.parse(r.roles); } catch (e) {} try { t = r.rt ? JSON.parse(r.rt) : {}; } catch (e) {}
      out[String(r.player_id)] = {name: r.name, ts: r.ts, t, roles}; }   // t: {"Crime|Role": ms} when each role was read
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
    if (!b || !OC_ENVS.has(b.env) || !["disabled", "plan", "opts", "rotate"].includes(b.k)) return Response.json({ok: false, error: "bad request"}, {status: 400});
    let v = b.v;
    if (b.k === "disabled" || b.k === "rotate") {
      // disabled: crimes switched off; rotate (Nov 2026): crimes leaders ROTATE (the page adds their prerequisites)
      if (!Array.isArray(v)) return Response.json({ok: false, error: b.k + " must be a list"}, {status: 400});
      v = [...new Set(v.map(x => String(x).slice(0, 80)))].slice(0, 200);
    } else if (b.k === "opts") {
      // Team Builder settings - the gatekeeper's automatic planner uses the same ones (ocAutoPlan)
      const n = (x, lo, hi, d) => { x = Number(x); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
      v = v && typeof v === "object" ? v : {};
      v = {target: n(v.target, 0, 100, 75), minRole: n(v.minRole, 0, 100, 65),
           // WEIGHT-SCALED MINIMUM (Nov 12 2026): lowest rate for a 0%-weight role, null = off (oc_planner.js floorOf)
           minZero: v.minZero == null || v.minZero === "" ? null : Math.min(n(v.minRole, 0, 100, 65), n(v.minZero, 0, 100, null)),
           cap: n(v.cap, 50, 100, 85), chains: !!v.chains, includeBusy: !!v.includeBusy,
           // members' share of the payout: null = each crime's recorded payout % (default), or a fixed % for every crime
           share: v.share == null || v.share === "" ? null : n(v.share, 0, 100, null),
           queueHours: n(v.queueHours, 0, 168, 12),    // queue members whose current crime is ready within this many hours
           // AUTOMATIC (Nov 2026): the Hub keeps the live plan up to date every 3 minutes (default on); off = the plan
           // only changes when a leader deploys one
           auto: v.auto !== false,
           // AUTOMATIC TIMER (Nov 2026): how often the Hub re-plans, in minutes - 3 (the Worker timer's own beat) to 60
           autoMinutes: Math.round(n(v.autoMinutes, 3, 60, 3))};
    } else {
      if (!v || typeof v !== "object" || !Array.isArray(v.teams)) return Response.json({ok: false, error: "plan must have teams"}, {status: 400});
      v = {teams: ocCleanTeams(v.teams)};
    }
    const text = JSON.stringify(v);
    if (text.length > 200000) return Response.json({ok: false, error: "too large"}, {status: 413});
    const prevShare = b.k === "opts" ? (((await ocConfig(env, b.env)).opts || {}).share ?? null) : null;
    await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, ts = excluded.ts, by = excluded.by")
      .bind(b.env, b.k, text, Date.now(), `${who.name} [${who.id}]`).run();
    // the members' share changed -> the summaries' net values (valueMin/Avg/Max) are worked out again now
    if (b.k === "opts" && prevShare !== (v.share ?? null)) await ocSummariesSave(env, b.env).catch(() => {});
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
  const id = await ocCaller(env, ctx, ocKey(req, body.key), body);
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

  let newHist = false, crimesNow = null, newPrices = false;
  // crimes - every run (1 call)
  try {
    const d = await ocTorn(env, "faction/crimes?cat=available&limit=100&sort=ASC");
    const cl = (d.crimes || []).map(ocFeedCleanCrime);
    put("crimes", cl);
    try { await ocDelayCheck(env, cl, now, ops); } catch (e) { fail("delays", e); }
    crimesNow = cl;
  } catch (e) { fail("crimes", e); }
  // OC pass rates of members who opted in with their stored key - only when a NEW crime was found (Nov 2026)
  try { await ocOptinPull(env, now, crimesNow); } catch (e) { fail("oc-optin", e); }
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
      newPrices = true;                                     // item values in the summaries change with prices
      if (daily && !netDone) ops.push(env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'prices-net', ?, '{}', 'hub') " +
        "ON CONFLICT (env, ds) DO NOTHING").bind(now));
    }
  } catch (e) { fail("prices", e); }
  await env.OC_DB.batch(ops);
  // summaries (payout stats + member rates) - AFTER the writes above (they use the new roster + history): whenever
  // history or the roster changed, or none are stored yet
  try {
    // stored summaries from before the net values (Nov 2026) count as missing, so they're worked out once now
    const have = await env.OC_DB.prepare("SELECT 1 FROM oc_snap WHERE env = 'prod' AND ds = 'summaries' AND instr(data, '\"valueMax\"') > 0").first();
    if (newHist || newRoster || newPrices || !have) for (const e of ENVS) await ocSummariesSave(env, e);
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
            MAX(json_extract(data, '$.rewards.respect')) AS rmax,
            AVG(json_extract(data, '$.rewards.payout.percentage')) AS ppavg
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
          r AS (SELECT crime, role, pid, rate, t, ROW_NUMBER() OVER (PARTITION BY crime, role, pid ORDER BY t DESC) AS n FROM b)
     SELECT crime, role, pid, rate, t FROM r WHERE n = 1`).bind(envName).all();
  // NET VALUE per completion (Nov 2026, project doc claude/oc-optimizer-hub-netpayout-addendum.md): each of the
  // latest `window` completions' cash + reward items at today's prices (net of the 5% fee), x the members' share
  // (the leaders' fixed % if set, else that crime's average recorded payout %, else 80%) -> valueMin / Avg / Max.
  // Every crime with >= 1 successful completion is included (no minimum).
  const rowsQ = await db.prepare(
    `WITH c AS (SELECT json_extract(data, '$.name') AS crime, data,
                       ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.name') ORDER BY executed_at DESC) AS n
                FROM oc_hist WHERE env = ?)
     SELECT crime, n, COALESCE(json_extract(data, '$.rewards.money'), 0) AS money FROM c WHERE n <= ? AND crime IS NOT NULL`)
    .bind(envName, SUM_WINDOW).all();
  const rowItems = await db.prepare(
    `WITH c AS (SELECT json_extract(data, '$.name') AS crime, data,
                       ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.name') ORDER BY executed_at DESC) AS n
                FROM oc_hist WHERE env = ?)
     SELECT c.crime, c.n, COALESCE(json_extract(j.value, '$.id'), json_extract(j.value, '$.item_id')) AS item,
            COALESCE(json_extract(j.value, '$.quantity'), json_extract(j.value, '$.amount'), 1) AS qty
     FROM c, json_each(c.data, '$.rewards.items') AS j WHERE c.n <= ?`).bind(envName, SUM_WINDOW).all();
  const priS = (await ocSnapGet(env, envName, "prices")) || (await ocSnapGet(env, "prod", "prices"));
  const prices = (priS && priS.data) || {};
  const cfgO = await ocConfig(env, envName).catch(() => ({}));
  const fixedShare = cfgO.opts && cfgO.opts.share != null ? Number(cfgO.opts.share) : null;
  const ros = await ocSnapGet(env, envName, "roster");
  const roster = (ros && ros.data) || null;
  const payouts = {};
  for (const r of pay.results || []) {
    payouts[r.crime] = {samples: r.samples, moneyAvg: Math.round(r.mavg || 0), moneyMin: r.mmin || 0, moneyMax: r.mmax || 0,
                        respAvg: r.ravg == null ? null : Math.round(r.ravg), respMin: r.rmin ?? null, respMax: r.rmax ?? null,
                        items: {}, itemBased: false,
                        ppAvg: r.ppavg == null ? null : Math.round(r.ppavg)};   // average payout % to members (Nov 2026)
  }
  for (const r of items.results || []) {
    const p = payouts[r.crime];
    if (p && r.item != null) p.items[String(r.item)] = Math.round(100 * (r.qty || 0) / p.samples) / 100;
  }
  for (const p of Object.values(payouts)) p.itemBased = p.moneyMax === 0 && Object.keys(p.items).length > 0;
  {
    const rowVal = {};                                     // "crime|n" -> cash + items at today's price
    for (const r of rowsQ.results || []) rowVal[r.crime + "|" + r.n] = Number(r.money) || 0;
    for (const r of rowItems.results || []) { const k = r.crime + "|" + r.n;
      if (k in rowVal && r.item != null) rowVal[k] += (Number(r.qty) || 0) * (Number((prices[String(r.item)] || {}).price) || 0); }
    const by = {};
    for (const [k, v] of Object.entries(rowVal)) { const c = k.slice(0, k.lastIndexOf("|")); (by[c] || (by[c] = [])).push(v); }
    for (const [c, vals] of Object.entries(by)) {
      const p = payouts[c]; if (!p || !vals.length) continue;
      const share = (fixedShare != null ? fixedShare : (p.ppAvg ?? 80)) / 100;
      p.valueMin = Math.round(Math.min(...vals) * share);
      p.valueAvg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * share);
      p.valueMax = Math.round(Math.max(...vals) * share);
      p.share = Math.round(share * 100);                   // the members' share used (%)
    }
  }
  const memberRates = {};
  for (const r of rates.results || []) {
    if (roster && roster[String(r.pid)] == null) continue;                 // members who left aren't suggested
    const byRole = memberRates[r.crime] || (memberRates[r.crime] = {});
    (byRole[r.role] || (byRole[r.role] = [])).push({pid: Number(r.pid), name: roster ? roster[String(r.pid)] : "#" + r.pid,
                                                     rate: Math.round(r.rate), t: (Number(r.t) || 0) * 1000});   // t: when (ms) - newest rate wins
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
const OC_OPTS_DEFAULT = {target: 75, minRole: 65, minZero: null, cap: 85, chains: false, includeBusy: false, share: null, queueHours: 12, auto: true, autoMinutes: 3};
// DELAY RECORD for placement (Nov 2026): each member's crime delays in the last 30 days (data/crime_delays.json - the
// same log behind the Discord delay posts and the reliability score's "Crimes" part) and how many crimes they took
// part in (oc_hist), refreshed HOURLY into oc_snap hub 'delay-stats':
//   {pid: {n: crimes delayed, long: delayed 2 h+, hrs: total hours they held crimes up, runs: crimes completed}}
// The planner turns that into the hours of delay they're likely to cause per crime (hrs / runs) and charges it
// against the crime's pay (a crime held up h hours pays everyone in it h hours later).
const DELAY_DAYS = 30;
async function ocDelayStats(env, now) {
  const cur = await ocSnapGet(env, "hub", "delay-stats").catch(() => null);
  if (cur && now - Number(cur.as_of) < 3600e3) return cur.data || {};
  const out = {};
  try {
    const r = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/data/crime_delays.json?ref=main`,
                          {headers: Object.assign(ghHeaders(env), {Accept: "application/vnd.github.raw"})});
    if (!r.ok) return (cur && cur.data) || {};
    const log = await r.json(), t0 = now / 1000 - DELAY_DAYS * 86400, seen = {};
    for (const e of log.delays || []) {
      if (!e || Number(e.start) < t0) continue;
      const pid = String(e.member), mins = e.minutes != null ? Number(e.minutes) : Math.max(0, (now / 1000 - Number(e.start)) / 60);
      const o = out[pid] || (out[pid] = {n: 0, long: 0, hrs: 0, runs: 0});
      const k = pid + "|" + e.crime;                       // one crime counts once, however many reasons
      if (!seen[k]) { seen[k] = mins; o.n++; o.hrs += mins / 60; if (mins >= 120) o.long++; }
      else if (mins > seen[k]) { o.hrs += (mins - seen[k]) / 60; if (seen[k] < 120 && mins >= 120) o.long++; seen[k] = mins; }
    }
    const {results} = await env.OC_DB.prepare(
      `SELECT json_extract(j.value, '$.user.id') AS pid, COUNT(*) AS runs FROM oc_hist AS h, json_each(h.data, '$.slots') AS j
       WHERE h.env = 'prod' AND h.executed_at >= ? AND json_extract(j.value, '$.user.id') IS NOT NULL GROUP BY pid`)
      .bind(Math.floor(now / 1000 - DELAY_DAYS * 86400)).all();
    for (const x of results || []) { const pid = String(x.pid); if (out[pid]) out[pid].runs = Number(x.runs) || 0; }
    for (const o of Object.values(out)) o.hrs = Math.round(o.hrs * 10) / 10;
  } catch (e) { return (cur && cur.data) || {}; }
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'delay-stats', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data").bind(now, JSON.stringify(out)).run();
  return out;
}

async function ocAutoPlan(env, crimes, now) {
  const cfg = await ocConfig(env, "prod");
  const opts = Object.assign({}, OC_OPTS_DEFAULT, cfg.opts || {});
  // RESERVATIONS RULE (Nov 2026, the user): the live plan only reserves slots for members who haven't joined a crime,
  // or who meet the QUEUE criteria (their Planning crime is ready within opts.queueHours, or a rotated crime's
  // join-order deadline). "Include members already in a crime" is for leaders' drafts on the page only - never here.
  // Members already in a crime are never moved by a reconfigure either (they're `existing` in their crime).
  opts.includeBusy = false;
  // AUTOMATIC off (OC Management setting): the Hub leaves the deployed plan exactly as leaders deployed it
  // (the last stats - pay per day, items - stay as they were, so the script keeps showing them)
  if (opts.auto === false) return;
  // AUTOMATIC TIMER: the Worker's timer beats every 3 minutes (the crimes feed is still read every beat); the plan is
  // only rebuilt when opts.autoMinutes have passed since the last automatic run (plan:stats is written every run)
  const every = Math.max(3, Math.min(60, Number(opts.autoMinutes) || 3)) * 60000;
  if (every > 180000) {
    const last = await ocSnapGet(env, "hub", "plan:stats").catch(() => null);
    if (last && now - Number(last.as_of) < every - 30000) return;
  }
  const [ros, catS, sumS, priS] = await Promise.all([ocSnapGet(env, "prod", "roster"), ocSnapGet(env, "prod", "catalog"),
                                                     ocSnapGet(env, "prod", "summaries"), ocSnapGet(env, "prod", "prices")]);
  const members = (ros && ros.data) || null;
  if (!members || !catS) return;
  const catalog = {};
  for (const c of (catS.data.organizedcrimes || [])) if (c && c.name)
    catalog[c.name] = {difficulty: c.difficulty ?? null, roles: (c.slots || []).map((sl, i) => (sl.position_info && sl.position_info.label) || sl.position || ("Role " + (i + 1))),
                       prereq: c.prerequisite || null};
  // rates (Nov 2026): the member's rate in a crime they're in NOW, else the NEWEST of their shared rates (oc_cpr, any
  // age - ts) and their history rate (summaries, the completion time t). No age limit.
  const {results} = await env.OC_DB.prepare("SELECT c.player_id, c.roles, c.ts, t.t AS rt FROM oc_cpr c LEFT JOIN oc_cpr_t t " +
    "ON t.env = c.env AND t.faction_id = c.faction_id AND t.player_id = c.player_id WHERE c.env = 'prod' AND c.faction_id = ?").bind(Number(env.FACTION_ID)).all();
  const live = new Map();
  for (const r of results || []) { try { let rt = {}; try { rt = r.rt ? JSON.parse(r.rt) : {}; } catch (e) {}
    live.set(String(r.player_id), {ts: Number(r.ts) || 0, t: rt, roles: JSON.parse(r.roles)}); } catch (e) {} }
  const inCrime = new Map();
  for (const c of crimes) for (const sl of c.slots || []) if (sl.user && typeof sl.checkpoint_pass_rate === "number")
    inCrime.set(`${sl.user.id}|${c.name}|${ocBaseRole((sl.position_info && sl.position_info.label) || sl.position)}`, Math.round(sl.checkpoint_pass_rate));
  const hist = new Map(), S = (sumS && sumS.data) || {};
  for (const [crime, byRole] of Object.entries(S.memberRates || {})) for (const [role, list] of Object.entries(byRole)) for (const m of list)
    hist.set(`${m.pid}|${crime}|${role}`, m);
  const rateOf = (pid, crime, label) => {
    const b = ocBaseRole(label), lr = live.get(String(pid)), k = ocFb(crime) + "|" + ocFb(b);
    const ic = inCrime.get(`${pid}|${crime}|${b}`); if (ic != null) return {rate: ic, src: "live"};
    // the time THIS role's rate was read (oc_cpr_t), else the member's last share (older rows)
    const sh = lr && lr.roles && lr.roles[k] != null ? {rate: lr.roles[k], src: "live", t: (lr.t && lr.t[k]) || lr.ts} : null;
    const hm = hist.get(`${pid}|${crime}|${b}`), h = hm ? {rate: hm.rate, src: "history", t: hm.t || 0} : null;
    if (sh && h) return sh.t >= h.t ? sh : h;                 // the newest wins
    return sh || h;
  };
  // pay per member per day (Nov 2026, the user's formula): max payout recorded (summaries, items at prices) x the
  // members' share (opts.share if a leader set one, else that crime's recorded payout %, else 80%), ÷ every participant in the chain (prerequisite seats too), ÷ the chain's days (prerequisite included).
  // pot here = this crime's seats' share, so pot ÷ days ÷ seats = per member per day - the same figure the page and script show
  const prices = (priS && priS.data) || {};
  const gross = (n, low) => { const p = (S.payouts || {})[n]; if (!p || !(p.samples > 0)) return 0;
    if (p.valueMax != null) return low ? (p.valueMin ?? p.valueMax) : p.valueMax;   // net + items (summaries, Nov 2026); low = the worst result
    let iv = 0; Object.keys(p.items || {}).forEach(id => { iv += (p.items[id] || 0) * (Number((prices[id] || {}).price) || 0); });
    return ((p.moneyMax || 0) + iv) * (opts.share != null ? opts.share : (p.ppAvg ?? 80)) / 100; };
  const seats = n => (catalog[n] || {roles: []}).roles.length || 1;
  const payOf = (n, low) => {
    const s = seats(n), pre = (catalog[n] || {}).prereq, fin = Object.keys(catalog).find(x => catalog[x].prereq === n);
    if (fin) { const sf = seats(fin); return {pot: gross(fin, low) * s / (s + sf), days: s + sf}; }
    if (pre) { const sp = seats(pre); return {pot: gross(n, low) * s / (s + sp), days: s + sp}; }   // the chain's days, both crimes
    return {pot: gross(n, low), days: s};
  };
  const delays = await ocDelayStats(env, now).catch(() => ({}));
  const lastRuns = {};
  for (const [k, v] of Object.entries(await ocLastRuns(env, "prod", cfg.rotate || []).catch(() => ({})))) lastRuns[k] = v.map(l => new Set(l));
  // RECONFIGURE (Nov 2026, the user's rule): a slot reserved for one member was taken by SOMEONE ELSE -> every
  // reservation is planned again (ocPlan reshuffle), so the bumped member gets a new spot and everyone queued is in
  // the most efficient place. (A leader's replacement - the old member still sitting in the slot - doesn't count.)
  const prevTeams = ((cfg.plan || {}).teams) || [];
  const byId = new Map(crimes.map(c => [String(c.id), c]));
  const moves = [];
  for (const t of prevTeams) {
    if (!t || !t.crime_id) continue;
    const c = byId.get(String(t.crime_id)); if (!c) continue;
    const slotUser = new Map((c.slots || []).map(sl => [(sl.position_info && sl.position_info.label) || sl.position || "", sl.user ? Number(sl.user.id) : null]));
    for (const r0 of t.roles || []) {
      if (r0.pid == null || r0.existing) continue;                              // only RESERVATIONS (not yet joined)
      const took = slotUser.get(r0.position);
      if (took == null || took === Number(r0.pid)) continue;                   // still open, or the right member joined
      if (r0.replaces && Number(r0.replaces.pid) === took) continue;           // the member a leader is replacing
      moves.push({crime: c.name, crime_id: c.id, position: r0.position, planned: {pid: Number(r0.pid), name: r0.name || members[String(r0.pid)] || ""},
                  took: {pid: took, name: members[String(took)] || ""}});
    }
  }
  let tpW = await ocSnapGet(env, "hub", "tp:weights").catch(() => null);   // role weights (tornprobability.com)
  if (!tpW) { await tpWeightsRefresh(env, true).catch(() => {}); tpW = await ocSnapGet(env, "hub", "tp:weights").catch(() => null); }   // first run
  const r = ocPlan({crimes, prev: prevTeams, catalog, members, opts, disabled: new Set(cfg.disabled || []), weights: (tpW && tpW.data && tpW.data.weights) || null,
                    rotate: new Set(cfg.rotate || []), lastRuns, delays, rateOf, payOf: n => payOf(n), budgetMs: 0, now,
                    reshuffle: moves.length > 0});
  if (moves.length) {
    r.stats.reconfigured = {at: now, moves};
    // kept for OC Management's Deployed tab ("Reconfigured ... - X took Y's spot") until the next one
    await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'plan:reconfigured', ?, ?, 'hub') " +
      "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by")
      .bind(now, JSON.stringify({at: now, moves})).run().catch(() => {});
  }
  // for the script (Nov 2026): pay per member per day of every planned crime + each catalog role's required item
  r.stats.pay_day = {}; r.stats.pay_day_min = {}; r.stats.items = {};
  for (const t of r.teams) { const p = payOf(t.crime), q = payOf(t.crime, true);
    r.stats.pay_day[t.crime] = p.days ? Math.round(p.pot / p.days / seats(t.crime)) : 0;            // best recorded
    r.stats.pay_day_min[t.crime] = q.days ? Math.round(q.pot / q.days / seats(t.crime)) : 0; }      // worst recorded
  for (const c of (catS.data.organizedcrimes || [])) if (c && c.name && r.teams.some(t => t.crime === c.name)) {
    const m = {}; (c.slots || []).forEach((sl, i) => { const it = sl.required_item; if (it && it.id)
      m[(sl.position_info && sl.position_info.label) || sl.position || ("Role " + (i + 1))] = {id: it.id, name: it.name || null}; });
    r.stats.items[c.name] = m; }
  // the planner's stats every run (incl. why recruiting crimes were left open) - read by the oc_check workflow
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'plan:stats', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by")
    .bind(now, JSON.stringify(r.stats)).run().catch(() => {});
  await tpSuccessForTeams(env, r.teams).catch(() => {});   // exact success chance for every full team (cached per combination)
  if (!r.changed) return;
  await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES ('prod', 'plan', ?, ?, 'auto (Hub)') " +
    "ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, ts = excluded.ts, by = excluded.by")
    .bind(JSON.stringify({teams: ocCleanTeams(r.teams), auto: r.stats}), now).run();
}

// ======================================================================================================
// FACTION CHAIN WATCH - Leaders Hub settings (Nov 2026, project doc claude/chainwatch-hub-contract.md §7)
//   GET  /l/cw/config.json -> {config, status}   status = counts from the ChainRoom (connected, queued, mode...) +
//                             status.queue: the queue in order with each member's reported energy / cooldowns / refill
//   POST /l/cw/config      {topAlertSeconds, restAlertSeconds, thirdAlertSeconds, firstAlertPrimaryOnly, minChain,
//                           bonusWarnHits}
//        -> saved to D1 oc_config (env 'prod', k 'chainwatch', by = the signed-in leader) and pushed to every script
// The script shows these view-only; leaders change them here. No Torn call.
// ======================================================================================================
async function cwLeaderRoute(env, req, who, sub) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (!env.OC_DB) return Response.json({ok: false, error: "Hub storage isn't set up yet"}, {status: 503});
  const room = env.CHAINROOM ? cwStub(env) : null;
  if (req.method === "GET" && sub === "config.json") {
    const row = await env.OC_DB.prepare("SELECT v, by, ts FROM oc_config WHERE env = 'prod' AND k = 'chainwatch'").first();
    let v = {}; try { v = row ? JSON.parse(row.v) : {}; } catch (e) {}
    const config = Object.assign({}, CW_DEFAULT_CONFIG, v, row ? {set_by: row.by || "", set_at: Number(row.ts) || 0} : {});
    let status = null;
    try { if (room) status = await (await room.fetch("https://do/status?detail=1")).json(); } catch (e) {}
    return Response.json({ok: true, config, defaults: CW_DEFAULT_CONFIG, status}, H);
  }
  if (req.method === "POST" && sub === "config") {
    let b; try { b = await req.json(); } catch (e) { return Response.json({ok: false, error: "bad request"}, {status: 400}); }
    const sec = (x, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    const v = {topAlertSeconds: sec(b.topAlertSeconds, 10, 300), restAlertSeconds: sec(b.restAlertSeconds, 5, 300),
               thirdAlertSeconds: sec(b.thirdAlertSeconds, 5, 300), minChain: sec(b.minChain, 0, 100000),
               firstAlertPrimaryOnly: !!b.firstAlertPrimaryOnly,
               // Nov 2026: backup alert (#2 if #1 hasn't hit within N s of being up) + bonus heads-up (N hits before)
               bonusWarnHits: sec(b.bonusWarnHits, 0, 50)};   // (backup alert / handoffSeconds removed Nov 10 2026)
    if (v.bonusWarnHits == null) return Response.json({ok: false, error: "bonus heads-up must be 0-50 hits before"}, {status: 400});
    if (v.topAlertSeconds == null || v.restAlertSeconds == null || v.thirdAlertSeconds == null)
      return Response.json({ok: false, error: "alert times must be 5-300 seconds (1st alert at least 10)"}, {status: 400});
    if (!(v.topAlertSeconds > v.restAlertSeconds && v.restAlertSeconds > v.thirdAlertSeconds))
      return Response.json({ok: false, error: "alerts must go down: 1st > 2nd > 3rd"}, {status: 400});
    if (v.minChain == null) return Response.json({ok: false, error: "minimum chain must be 0-100000"}, {status: 400});
    const by = `${who.name} [${who.id}]`, ts = Date.now();
    await env.OC_DB.prepare("INSERT INTO oc_config (env, k, v, ts, by) VALUES ('prod', 'chainwatch', ?, ?, ?) " +
      "ON CONFLICT (env, k) DO UPDATE SET v = excluded.v, ts = excluded.ts, by = excluded.by").bind(JSON.stringify(v), ts, by).run();
    let pushed = false;
    try { if (room) pushed = (await (await room.fetch("https://do/config", {method: "POST"})).json()).ok === true; } catch (e) {}
    return Response.json({ok: true, config: Object.assign({}, v, {set_by: by, set_at: ts}), pushed}, H);
  }
  return Response.json({ok: false, error: "not found"}, {status: 404});
}

// POST /m/cw/reading {current, max, end, timeout, cooldown, modifier} - signed-in members only (pid from the sign-in).
// Torn V2 faction/chain as the homepage read it; numbers only. No Torn call here.
async function cwReading(env, req, who) {
  if (req.method !== "POST") return Response.json({ok: false, error: "POST only"}, {status: 405});
  if (!env.CHAINROOM) return Response.json({ok: false, error: "chain watch isn't set up"}, {status: 503});
  let b; try { b = await req.json(); } catch (e) { return Response.json({ok: false, error: "bad request"}, {status: 400}); }
  const n = x => (Number.isFinite(Number(x)) ? Number(x) : 0);
  // `end` = Torn's absolute expiry (epoch s) - exact even from Torn's cache; `timeout` is the fallback (Nov 10 2026)
  const reading = {pid: Number(who.id), current: n(b.current), max: n(b.max), timeout: n(b.timeout), end: n(b.end), cooldown: n(b.cooldown),
                   modifier: b.modifier == null ? null : n(b.modifier)};
  if (!(reading.current > 0 && ((reading.timeout > 0 && reading.timeout <= 300) || (reading.end > 1e9 && reading.end * 1000 <= Date.now() + 303000)))) return Response.json({ok: true, used: false});
  const r = await cwStub(env).fetch("https://do/reading", {method: "POST", body: JSON.stringify(reading)});
  return Response.json(await r.json(), {headers: {"Cache-Control": "no-store"}});
}

// ======================================================================================================
// SCRIPTS DIRECTORY (Nov 10 2026, user: "a section in the hub for users to navigate through to find the scripts.
// Leaders should be able to add/remove scripts and create listings/descriptions for them.")
//   GET    /m/scripts.json  -> {scripts: [...] (A-Z), me: {leader}}            every signed-in member
//   POST   /m/scripts {id?, name, summary, description, install_url, version}  leaders: add (no id) / edit (id)
//   DELETE /m/scripts?id=                                                       leaders: remove
// D1 hub_script. Listing text + links only (no code hosted). Links must be https://. No Torn call.
const SCRIPT_LIMITS = {name: 80, summary: 200, description: 6000, install_url: 500, version: 30, count: 200};
// Greasy Fork script info from an install link (greasyfork.org/scripts/<id>-... or update.greasyfork.org/scripts/<id>/...)
// -> {id, name, version, description, updated (ms), code_url, url, installs, daily} or null.
// Greasy Fork answers Cloudflare Workers with 403, so the SITE BUILD reads it (generate.py write_greasyfork, every
// deploying run) into the members' db/greasyfork.json {id: {...}}; this reads that copy (kept in memory 10 min).
let GF_CACHE = {t: 0, v: null};
async function gfInfo(env, u) {
  const m = /^https:\/\/(?:update\.)?(?:greasyfork|sleazyfork)\.org\/(?:[a-z-]+\/)?scripts\/(\d+)/i.exec(String(u || ""));
  if (!m) return null;
  if (!GF_CACHE.v || Date.now() - GF_CACHE.t > 600000) {
    try {
      const r = await env.ASSETS.fetch(new Request(`https://assets.local/${await physDir(env.MEMBER_DIR)}/db/greasyfork.json`));
      GF_CACHE = {t: Date.now(), v: r.ok ? (await r.json()).scripts || {} : {}};
    } catch (e) { GF_CACHE = {t: Date.now(), v: {}}; }
  }
  const g = GF_CACHE.v[m[1]];
  return g ? Object.assign({id: Number(m[1])}, g) : {err: "not read yet (next site update)"};
}
async function scriptsRoute(env, req, url, who) {
  const H = {headers: {"Cache-Control": "no-store"}};
  const bad = (error, status) => Response.json({ok: false, error}, {status: status || 400});
  if (!env.OC_DB) return bad("Hub storage isn't set up yet", 503);
  if (req.method === "GET") {
    let rows = [];
    try {
      rows = (await env.OC_DB.prepare("SELECT id, name, summary, description, install_url, version, updated, updated_by FROM hub_script " +
        "ORDER BY name COLLATE NOCASE").all()).results || [];
    } catch (e) { rows = []; }                                // table not there yet (first deploy)
    // GREASY FORK (Nov 11 2026, user: "Scripts should pull the greasyfork information for their name, version numbers,
    // etc. These should stay updated even when an update is made."): a listing whose install link is on Greasy Fork
    // shows Greasy Fork's current name / version / description / last update / install link (read through
    // Cloudflare's cache, at most once an hour per script). The leader's own summary is kept when there is one.
    rows = await Promise.all(rows.map(async r => {
      const g = await gfInfo(env, r.install_url);
      if (!g) return r;
      if (g.err) return Object.assign({}, r, {gf_err: g.err});      // shown to nobody - lets the Hub's check see why
      return Object.assign({}, r, {name: g.name || r.name, version: g.version || r.version, summary: r.summary || g.description,
        install_url: g.code_url || r.install_url, updated: g.updated || r.updated, updated_by: g.updated ? "Greasy Fork" : r.updated_by,
        gf: {id: g.id, url: g.url, installs: g.installs, daily: g.daily}});
    }));
    return Response.json({ok: true, scripts: rows, me: {leader: !!who.leader}}, H);
  }
  if (!who.leader) return bad("Only leaders can change the scripts list.", 403);
  if (req.method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    if (!(id > 0)) return bad("Which script?");
    const r = await env.OC_DB.prepare("DELETE FROM hub_script WHERE id = ?").bind(id).run();
    if (!(r && r.meta && r.meta.changes)) return bad("That script isn't listed any more.", 404);
    return Response.json({ok: true}, H);
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch (e) { return bad("bad request"); }
    const txt = (k) => String(b[k] == null ? "" : b[k]).replace(/\r\n?/g, "\n").trim();
    const v = {name: txt("name"), summary: txt("summary").replace(/\s*\n\s*/g, " "), description: txt("description"),
               install_url: txt("install_url"), version: txt("version")};
    if (!v.name) return bad("Give the script a name.");
    for (const k of Object.keys(v)) if (v[k].length > SCRIPT_LIMITS[k]) return bad(`${k.replace("_", " ")} is too long (max ${SCRIPT_LIMITS[k]} characters).`);
    if (v.install_url) {
      let u = null; try { u = new URL(v.install_url); } catch (e) { u = null; }
      if (!u || u.protocol !== "https:") return bad("The install link must be a full https:// address.");
      v.install_url = u.toString();
    }
    const now = Date.now(), id = Number(b.id) || 0;
    if (id) {
      const r = await env.OC_DB.prepare("UPDATE hub_script SET name = ?, summary = ?, description = ?, install_url = ?, version = ?, updated = ?, updated_by = ? WHERE id = ?")
        .bind(v.name, v.summary, v.description, v.install_url, v.version, now, String(who.name || ""), id).run();
      if (!(r && r.meta && r.meta.changes)) return bad("That script isn't listed any more.", 404);
      return Response.json({ok: true, id}, H);
    }
    const n = await env.OC_DB.prepare("SELECT COUNT(*) AS n FROM hub_script").first();
    if (n && Number(n.n) >= SCRIPT_LIMITS.count) return bad(`The list is full (${SCRIPT_LIMITS.count} scripts).`);
    const r = await env.OC_DB.prepare("INSERT INTO hub_script (name, summary, description, install_url, version, created, updated, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(v.name, v.summary, v.description, v.install_url, v.version, now, now, String(who.name || "")).run();
    return Response.json({ok: true, id: r && r.meta ? r.meta.last_row_id : null}, H);
  }
  return bad("not allowed", 405);
}

// ======================================================================================================
// RECRUITMENT (Nov 11 2026, user; project doc claude/recruitment-hub-contract.md). The Torn Recruit Scout userscript
// scouts players on torn.com with the leader's OWN key (never sent here) and shares promising recruits with the Leaders
// Hub's Recruitment page (recruitment.html), where every leader sees them and can claim, set a status, keep a shared
// note, or remove them.
//   Script (runs on torn.com; identity is client-reported like /oc/* and /cw/* - the Hub trusts {pid, faction}):
//     POST /rc/push {pid, faction, recruits: [{pid, name, data, manual}]}   at most RC_MAX_PUSH per call
//       - LEADERS ONLY (the user's rule): pid must be a current member whose position (the Hub's own db/members.json,
//         never the client) is a leader position. Else 403.
//       - Upsert per recruit: the scouting snapshot (data, cleaned by rcClean) + who sent it. A push never touches the
//         claim / status / note leaders set on the Hub.
//       - A recruit a leader REMOVED stays removed when the script auto-sends (manual: false); a MANUAL send from the
//         script ("Send to Hub" on the card) brings it back as 'new'.
//       -> {ok, added, updated, removed: [pids skipped because a leader removed them], full: n skipped (list full)}
//   Leaders (pass cookie, /l/rc/...):
//     GET  /l/rc/list.json  -> {ok, recruits: [...], me: {id, name}}   (removed ones left out)
//     POST /l/rc/update (X-HB-Save: 1) {pid, action, status?, note?}
//          action: claim (take it - also takes it over from another leader) | unclaim | status (new|contacted|joined|declined)
//                  | note (shared, max RC_NOTE_MAX characters) | remove
// No Torn call anywhere here. Storage: D1 rc_recruit (gate/oc_schema.sql).
// ======================================================================================================
const RC_STATUS = ["new", "contacted", "joined", "declined"];
const RC_MAX_PUSH = 100, RC_MAX_ROWS = 2000, RC_NOTE_MAX = 500;
const RC_PURGE_MS = 180 * 864e5;         // removed recruits are deleted for good after 180 days

// Only the fields the Recruitment page shows, with sane types and lengths - nothing else from the client is stored.
function rcClean(d) {
  d = d && typeof d === "object" ? d : {};
  const n = v => (v == null || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
  const s = (v, max) => v == null ? "" : String(v).slice(0, max);
  const arr = (a, len) => Array.isArray(a) ? a.slice(0, len).map(n) : [];
  const a = d.activity && typeof d.activity === "object" ? d.activity : null;
  const f = d.fit && typeof d.fit === "object" ? d.fit : {};
  const STATES = ["pass", "near", "fail", "unknown"];
  return {
    level: n(d.level), age: n(d.age), factionId: n(d.factionId), factionName: s(d.factionName, 60),
    lastActionTs: n(d.lastActionTs), rwHits: n(d.rwHits), xan: n(d.xan), refills: n(d.refills), attacksWon: n(d.attacksWon),
    streak: n(d.streak), bestStreak: n(d.bestStreak), lifeAvgSec: n(d.lifeAvgSec),
    bs: n(d.bs), bsHuman: s(d.bsHuman, 20), ff: n(d.ff),
    activity: a ? {daily: arr(a.daily, 7), weekly: arr(a.weekly, 4), activeDays: n(a.activeDays), sampled: n(a.sampled),
                   avgSec: n(a.avgSec), longestIdle: n(a.longestIdle), weakWeeks: n(a.weakWeeks), at: n(a.at)} : null,
    fit: {pass: n(f.pass), total: n(f.total), pct: n(f.pct),
          checks: (Array.isArray(f.checks) ? f.checks : []).slice(0, 12).map(c => ({
            key: s(c && c.key, 12), label: s(c && c.label, 20), value: s(c && c.value, 40),
            state: STATES.includes(c && c.state) ? c.state : "unknown"}))},
    checkedAt: n(d.checkedAt), ver: s(d.ver, 12),
  };
}

async function rcScriptRoute(env, req, p) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: OC_CORS});
  if (p !== "/rc/push") return ocErr(404, "not found");
  if (req.method !== "POST") return ocErr(405, "method not allowed");
  if (!env.OC_DB) return ocErr(503, "Hub storage isn't set up yet");
  let b; try { b = await req.json(); } catch (e) { return ocErr(400, "body must be JSON"); }
  if (!b || typeof b !== "object") return ocErr(400, "body must be JSON");
  const pid = Number(b.pid);
  if (!Number.isInteger(pid) || pid <= 0) return ocErr(400, "pid must be your Torn player id");
  if (String(b.faction) !== String(env.FACTION_ID)) return ocErr(403, "Heart Breakers members only");
  // leader rights from the Hub's own member list - never from the client
  const members = await currentMembers(env).catch(() => null);
  if (!members) return ocErr(503, "the member list isn't available right now - try again shortly");
  const me = members.get(pid) || members.get(String(pid));
  if (!me) return ocErr(403, "not on the Heart Breakers member list");
  if (!isLeader(env, me.position)) return ocErr(403, "only leaders can send recruits to the Hub");
  const list = Array.isArray(b.recruits) ? b.recruits : [];
  if (list.length > RC_MAX_PUSH) return ocErr(400, `send at most ${RC_MAX_PUSH} recruits at a time`);
  const now = Date.now(), by = `${me.name} [${pid}]`;
  await env.OC_DB.prepare("DELETE FROM rc_recruit WHERE removed_at IS NOT NULL AND removed_at < ?").bind(now - RC_PURGE_MS).run().catch(() => {});
  const items = [];
  const seen = new Set();
  for (const r of list) {
    const rid = Number(r && r.pid);
    if (!Number.isInteger(rid) || rid <= 0 || seen.has(rid)) continue;
    seen.add(rid);
    items.push({pid: rid, name: String((r && r.name) || "").slice(0, 40), data: JSON.stringify(rcClean(r && r.data)), manual: !!(r && r.manual)});
  }
  if (!items.length) return ocJson({ok: true, added: 0, updated: 0, removed: [], full: 0});
  const {results} = await env.OC_DB.prepare(`SELECT pid, removed_at FROM rc_recruit WHERE pid IN (${items.map(() => "?").join(",")})`)
    .bind(...items.map(x => x.pid)).all();
  const have = new Map((results || []).map(r => [Number(r.pid), r]));
  const cnt = await env.OC_DB.prepare("SELECT COUNT(*) AS n FROM rc_recruit").first();
  let room = RC_MAX_ROWS - Number((cnt && cnt.n) || 0);
  const ops = [], removed = [];
  let added = 0, updated = 0, full = 0;
  for (const x of items) {
    const cur = have.get(x.pid);
    if (cur && cur.removed_at != null && !x.manual) { removed.push(x.pid); continue; }   // a leader removed it
    if (!cur) {
      if (room <= 0) { full++; continue; }
      room--; added++;
      ops.push(env.OC_DB.prepare("INSERT INTO rc_recruit (pid, name, data, sent_by, first_sent, updated, status) VALUES (?, ?, json(?), ?, ?, ?, 'new')")
        .bind(x.pid, x.name, x.data, by, now, now));
    } else if (cur.removed_at != null) {                    // manual re-send of a removed recruit: back as new
      updated++;
      ops.push(env.OC_DB.prepare("UPDATE rc_recruit SET name = ?, data = json(?), sent_by = ?, updated = ?, removed_at = NULL, removed_by = NULL, " +
        "status = 'new', status_by = ?, status_at = ?, claim_pid = NULL, claim_name = NULL, claim_at = NULL WHERE pid = ?")
        .bind(x.name, x.data, by, now, by, now, x.pid));
    } else {                                                // scouting data only - claim / status / note untouched
      updated++;
      ops.push(env.OC_DB.prepare("UPDATE rc_recruit SET name = ?, data = json(?), sent_by = ?, updated = ? WHERE pid = ?")
        .bind(x.name, x.data, by, now, x.pid));
    }
  }
  if (ops.length) await env.OC_DB.batch(ops);
  return ocJson({ok: true, added, updated, removed, full});
}

async function rcLeaderRoute(env, req, who, sub) {
  const H = {headers: {"Cache-Control": "no-store"}};
  const bad = (error, status) => Response.json({ok: false, error}, {status: status || 400});
  if (!env.OC_DB) return bad("Hub storage isn't set up yet", 503);
  if (req.method === "GET" && sub === "list.json") {
    let rows = [];
    try {
      rows = (await env.OC_DB.prepare("SELECT pid, name, data, sent_by, first_sent, updated, status, status_by, status_at, " +
        "claim_pid, claim_name, claim_at, note, note_by, note_at FROM rc_recruit WHERE removed_at IS NULL ORDER BY updated DESC LIMIT ?")
        .bind(RC_MAX_ROWS).all()).results || [];
    } catch (e) { rows = []; }                                // table not there yet (first deploy)
    const recruits = rows.map(r => { let d = {}; try { d = JSON.parse(r.data); } catch (e) {} return Object.assign({}, r, {data: d}); });
    return Response.json({ok: true, recruits, me: {id: who.id, name: who.name}}, H);
  }
  if (req.method === "POST" && sub === "update") {
    // a custom header can't be sent cross-site without CORS approval -> blocks other sites posting with the cookie
    if (req.headers.get("X-HB-Save") !== "1") return bad("Missing header");
    let b; try { b = await req.json(); } catch (e) { return bad("bad request"); }
    const pid = Number(b && b.pid);
    if (!Number.isInteger(pid) || pid <= 0) return bad("Which recruit?");
    const now = Date.now(), by = `${who.name} [${who.id}]`;
    let st;
    switch (b.action) {
      case "claim":
        st = env.OC_DB.prepare("UPDATE rc_recruit SET claim_pid = ?, claim_name = ?, claim_at = ? WHERE pid = ? AND removed_at IS NULL")
          .bind(Number(who.id), String(who.name || ""), now, pid); break;
      case "unclaim":
        st = env.OC_DB.prepare("UPDATE rc_recruit SET claim_pid = NULL, claim_name = NULL, claim_at = NULL WHERE pid = ? AND removed_at IS NULL").bind(pid); break;
      case "status":
        if (!RC_STATUS.includes(b.status)) return bad("Status must be new, contacted, joined or declined.");
        st = env.OC_DB.prepare("UPDATE rc_recruit SET status = ?, status_by = ?, status_at = ? WHERE pid = ? AND removed_at IS NULL")
          .bind(b.status, by, now, pid); break;
      case "note": {
        const note = String(b.note == null ? "" : b.note).replace(/\r\n?/g, "\n").trim();
        if (note.length > RC_NOTE_MAX) return bad(`Notes can be at most ${RC_NOTE_MAX} characters.`);
        st = env.OC_DB.prepare("UPDATE rc_recruit SET note = ?, note_by = ?, note_at = ? WHERE pid = ? AND removed_at IS NULL")
          .bind(note, note ? by : null, note ? now : null, pid); break;
      }
      case "remove":
        st = env.OC_DB.prepare("UPDATE rc_recruit SET removed_at = ?, removed_by = ? WHERE pid = ? AND removed_at IS NULL").bind(now, by, pid); break;
      default:
        return bad("Unknown action.");
    }
    const r = await st.run();
    if (!(r && r.meta && r.meta.changes)) return bad("That recruit isn't on the list any more.", 404);
    return Response.json({ok: true}, H);
  }
  return bad("not allowed", 405);
}

// ======================================================================================================
// CHAIN WATCHING SCHEDULE (Nov 2026, user; contract §10). Members Hub page chainwatch-schedule.html.
//   GET    /m/cw/schedule.json -> {now, slot_s 1800, ahead_s 48 h, shifts: [...] (now -> 48 h), me: {pid, name, leader, mine, stats}}
//   POST   /m/cw/schedule {start (epoch s, on :00/:30), minutes 30-360 (or hours 0.5-6), role primary|backup|backup2}
//   GET    /m/cw/live.json -> the room's live board (chain, turn, bonus, runway, queue)
//   DELETE /m/cw/schedule?id=  (your own; leaders: anyone's)
// Rules: 30-minute slots (TCT), 30 min - 6 h; up to 48 hours ahead; each role once per slot; up to 2 shifts per member, never two roles in the same slot.
// The energy check (cwEnergyCover) uses the member's last Chain Watch script report, else their war-readiness reading
// (opt-in) - stored with the shift as est_hits / need_hits. No Torn call here.
// ======================================================================================================
// Rules live in chainroom.js (cwShiftAdd / cwShiftDelete) - shared with the script's WebSocket shift_* messages.
async function cwMyStats(env, pid) {
  let st = null;
  try { if (env.CHAINROOM) st = (await (await cwStub(env).fetch(`https://do/laststats?pid=${pid}`)).json()).stats || null; } catch (e) {}
  return cwStatsFor(env, pid, st);
}
// GET /m/cw/live.json (signed-in members): the room's live board for the schedule page - chain count / timer /
// cooldown, who's up, bonus, runway and the queue. No Torn call (the room's own reading); polled every 30 s.
async function cwLive(env) {
  if (!env.CHAINROOM) return Response.json({ok: false, error: "Chain Watch isn't set up yet"}, {status: 503});
  try {
    const d = await (await cwStub(env).fetch("https://do/board")).json();
    return Response.json(d, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return Response.json({ok: false, error: "Chain Watch room unavailable"}, {status: 502}); }
}
async function cwPokeRoom(env) {   // tell every connected script about the change
  try { if (env.CHAINROOM) await cwStub(env).fetch("https://do/schedule-changed", {method: "POST"}); } catch (e) {}
}
// SHIFT ATTENDANCE (Nov 10 2026, user) - ended shifts of the last 30 days with what the ChainRoom recorded (D1 cw_att):
//   kept   = in the queue (not away) for at least half the shift
//   partly = in the queue for some of it
//   missed = never in the queue (no cw_att row = the room never saw them queued)
// -> {days: 30, members: [{pid, name, shifts, kept, partly, missed, hits, queue_s, shift_s}] (most shifts first),
//     recent: [{id, pid, name, role, start, end, in_queue_s, hits, status}] (newest 25)}
async function cwAttendance(env, nowS) {
  let rows = [];
  try {
    rows = (await env.OC_DB.prepare("SELECT s.id, s.pid, s.name, s.role, s.start_at, s.end_at, a.in_queue_s, a.hits FROM cw_shift s " +
      "LEFT JOIN cw_att a ON a.shift_id = s.id WHERE s.end_at <= ? AND s.end_at > ? ORDER BY s.end_at DESC LIMIT 500")
      .bind(nowS, nowS - 30 * 86400).all()).results || [];
  } catch (e) { return {days: 30, members: [], recent: []}; }   // cw_att not there yet (first deploy)
  const by = {}, recent = [];
  for (const r of rows) {
    const len = Math.max(1, r.end_at - r.start_at), q = Number(r.in_queue_s) || 0;
    const status = q >= len / 2 ? "kept" : q > 0 ? "partly" : "missed";
    const m = by[r.pid] || (by[r.pid] = {pid: Number(r.pid), name: r.name, shifts: 0, kept: 0, partly: 0, missed: 0, hits: 0, queue_s: 0, shift_s: 0});
    m.shifts++; m[status]++; m.hits += Number(r.hits) || 0; m.queue_s += Math.min(q, len); m.shift_s += len;
    if (recent.length < 25) recent.push({id: r.id, pid: Number(r.pid), name: r.name, role: r.role, start: r.start_at, end: r.end_at,
                                         in_queue_s: q, hits: Number(r.hits) || 0, status});
  }
  return {days: 30, members: Object.values(by).sort((a, b) => b.shifts - a.shifts || b.kept - a.kept), recent};
}
async function cwSchedule(env, req, url, who) {
  const H = {headers: {"Cache-Control": "no-store"}};
  if (!env.OC_DB) return Response.json({ok: false, error: "Hub storage isn't set up yet"}, {status: 503});
  const nowS = Math.floor(Date.now() / 1000), pid = Number(who.id);
  if (req.method === "GET") {
    const shifts = await cwShiftRows(env);
    return Response.json({ok: true, now: nowS, roles: CW_ROLES, max_hours: CW_MAX_HOURS, ahead_s: CW_AHEAD_S, slot_s: 1800, shifts,
      max_shifts: CW_MAX_SHIFTS,
      me: {pid, name: who.name, leader: !!who.leader, mine: shifts.find(x => Number(x.pid) === pid) || null,
           mine_all: shifts.filter(x => Number(x.pid) === pid), stats: await cwMyStats(env, pid)},
      attendance: await cwAttendance(env, nowS)}, H);
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch (e) { return Response.json({ok: false, error: "bad request"}, {status: 400}); }
    const r = await cwShiftAdd(env, pid, who.name, b.start, b.hours, b.role, await cwMyStats(env, pid), b.minutes);
    if (!r.ok) return Response.json({ok: false, error: r.error}, {status: r.status || 400});
    await cwPokeRoom(env);
    return Response.json({ok: true, cover: r.cover}, H);
  }
  if (req.method === "DELETE") {
    const r = await cwShiftDelete(env, Number(url.searchParams.get("id")) || null, pid, !!who.leader);
    if (!r.ok) return Response.json({ok: false, error: r.error}, {status: r.status || 400});
    await cwPokeRoom(env);
    return Response.json({ok: true}, H);
  }
  return Response.json({ok: false, error: "not allowed"}, {status: 405});
}

// Discord "your chain watch shift is starting" (Worker timer, every 3 min): every shift starting within the next
// 3 minutes (or that started in the last 10 and wasn't pinged) - one message per start time, chains channel webhook
// (Worker secret CW_DISCORD_WEBHOOK, copied from the DISCORD_WEBHOOK_CHAINS GitHub secret; never logged).
// Mentions: the member's linked Discord account (Torn /v2/user/{id}/discord on the Hub key, 1 call each, not
// saved), else "Name [ID]" (the user's rule for unknown Discord users).
// The chains webhook URL (secret, never logged) + an optional suffix ("?wait=true", "/messages/{id}").
function cwHookUrl(env, suffix) {
  const u = new URL(String(env.CW_DISCORD_WEBHOOK).trim());
  const extra = suffix || "";
  if (extra.startsWith("?")) { new URLSearchParams(extra.slice(1)).forEach((v, k) => u.searchParams.set(k, v)); return u.toString(); }
  u.pathname = u.pathname.replace(/\/$/, "") + extra;
  return u.toString();
}
// SELF-DELETING SHIFT PINGS (Nov 10 2026, user): once a ping's time slot has ended (the latest end among the shifts
// in that message), delete the Discord message with the same webhook (DELETE /webhooks/{id}/{token}/messages/{msg}).
// Runs with cwShiftAlerts on the 3-minute timer, so a message goes within ~3 min of its slot ending. Already gone
// (404) counts as done; other failures retry on the next run, up to 20 tries. Counts only - nothing logged.
async function cwPingCleanup(env, nowS) {
  let rows = [];
  try {
    rows = (await env.OC_DB.prepare("SELECT msg_id, tries FROM cw_ping WHERE end_at <= ? ORDER BY end_at LIMIT 10").bind(nowS).all()).results || [];
  } catch (e) { return; }                                  // table not there yet (first deploy)
  for (const r of rows) {
    let done = false;
    try {
      const res = await fetch(cwHookUrl(env, `/messages/${encodeURIComponent(r.msg_id)}`), {method: "DELETE"});
      done = res.ok || res.status === 404;
    } catch (e) { done = false; }
    if (done || Number(r.tries) >= 19) await env.OC_DB.prepare("DELETE FROM cw_ping WHERE msg_id = ?").bind(r.msg_id).run().catch(() => {});
    else await env.OC_DB.prepare("UPDATE cw_ping SET tries = tries + 1 WHERE msg_id = ?").bind(r.msg_id).run().catch(() => {});
  }
}
async function cwShiftAlerts(env) {
  if (!env.OC_DB || !env.CW_DISCORD_WEBHOOK) return;
  const nowS = Math.floor(Date.now() / 1000);
  await cwPingCleanup(env, nowS);                          // delete pings whose time slot has ended
  const {results} = await env.OC_DB.prepare("SELECT id, pid, name, role, start_at, end_at FROM cw_shift " +
    "WHERE notified = 0 AND start_at <= ? AND start_at > ? AND end_at > ? ORDER BY start_at").bind(nowS + 180, nowS - 600, nowS).all();
  if (!results || !results.length) return;
  const byStart = {};
  results.forEach(r => (byStart[r.start_at] = byStart[r.start_at] || []).push(r));
  for (const st of Object.keys(byStart)) {
    const rows = byStart[st].sort((a, b) => Object.keys(CW_ROLES).indexOf(a.role) - Object.keys(CW_ROLES).indexOf(b.role));
    const users = [], lines = [];
    for (const r of rows) {
      let did = null;
      try {
        // API: Heart Breakers Hub - Chain Watch schedule ping (Discord link, Torn V2, key in the header)
        const d = await ocTorn(env, `user/${Number(r.pid)}/discord`);
        const x = d && (d.discord || d);
        did = x && (x.discord_id || x.discordId || x.discordID);
        did = did && /^\d+$/.test(String(did)) ? String(did) : null;
      } catch (e) { did = null; }
      if (did) users.push(did);
      lines.push(`**${CW_ROLES[r.role] || r.role}:** ${did ? `<@${did}>` : `${r.name} [${r.pid}]`} · until <t:${r.end_at}:t>`);
    }
    const body = {content: `⛓️ **Chain watch shift ${Number(st) > nowS ? "starting" : "started"} <t:${st}:R>** (<t:${st}:t>)\n${lines.join("\n")}`,
                  allowed_mentions: {users}};
    try {
      // ?wait=true -> Discord returns the message (its id), so it can be deleted when the slot ends
      const res = await fetch(cwHookUrl(env, "?wait=true"), {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      if (!res.ok) continue;                               // try again on the next run
      let msgId = null;
      try { const m = await res.json(); msgId = m && /^\d+$/.test(String(m.id)) ? String(m.id) : null; } catch (e) { msgId = null; }
      if (msgId) {
        const endAt = Math.max(...rows.map(r => Number(r.end_at)));
        await env.OC_DB.prepare("INSERT OR REPLACE INTO cw_ping (msg_id, end_at, created, tries) VALUES (?, ?, ?, 0)")
          .bind(msgId, endAt, Date.now()).run().catch(() => {});
      }
    } catch (e) { continue; }
    await env.OC_DB.prepare(`UPDATE cw_shift SET notified = 1 WHERE id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map(r => r.id)).run();
  }
}

// NEWEST RATE PER CRIME/ROLE (Nov 2026): record when each of a member's roles was last read (oc_cpr_t, JSON
// {"Crime|Role": ms}) - by script shares and opt-in OC reads. The planner / OC Management compare THAT time with the
// history rate's completion time, so the newest rate for each crime/role wins and older ones never count.
async function ocCprTimes(env, envName, pid, keys, now) {
  if (!keys || !keys.length) return;
  now = now || Date.now();
  try {
    const row = await env.OC_DB.prepare("SELECT t FROM oc_cpr_t WHERE env = ? AND faction_id = ? AND player_id = ?")
      .bind(envName, Number(env.FACTION_ID), Number(pid)).first();
    let t = {}; try { t = row ? JSON.parse(row.t) || {} : {}; } catch (e) {}
    keys.forEach(k => { t[k] = now; });
    await env.OC_DB.prepare("INSERT INTO oc_cpr_t (env, faction_id, player_id, t) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (env, faction_id, player_id) DO UPDATE SET t = excluded.t").bind(envName, Number(env.FACTION_ID), Number(pid), JSON.stringify(t)).run();
  } catch (e) { /* the member's last-share time is the fallback */ }
}


// ======================================================================================================
// ROLE WEIGHTS + SUCCESS (Nov 2026, the user: tornprobability.com). Free endpoints, once a day:
//   GetRoleWeights {CrimeKey: {RoleKey: weight}} - how much each role moves the crime's success (the planner's
//   weighted team success), GetRoleNames {"Crime": {P1: "Role 1", ...}} - the role order CalculateSuccess expects.
// CalculateSuccess (POST {scenario, parameters: [rate per role, P1..Pn]}) answers WITHOUT a key (the user's test,
// Nov 10 2026). The scenario name is case-sensitive ("Break the Bank", not "Break The Bank") - we always send the
// name exactly as GetRoleNames gives it. If a key is ever needed: GitHub secret TP_API_KEY -> Worker secret, sent as
// the X-API-KEY header (never in the address).
// Stored in oc_snap hub 'tp:weights' {weights, names} and 'tp:success' {"Crime|r1,r2,...": {s, f, at}}.
// ======================================================================================================
const TP_BASE = "https://tornprobability.com:3000/api";
const tpKey = v => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
async function tpWeightsRefresh(env, force) {
  if (!env.OC_DB) return;
  const cur = await ocSnapGet(env, "hub", "tp:weights").catch(() => null);
  if (!force && cur && Date.now() - Number(cur.as_of) < 24 * 3600e3) return;
  const [w, n] = await Promise.all([fetch(TP_BASE + "/GetRoleWeights", {headers: {Accept: "application/json"}}).then(r => r.json()),
                                    fetch(TP_BASE + "/GetRoleNames", {headers: {Accept: "application/json"}}).then(r => r.json())]);
  if (!w || typeof w !== "object" || !Object.keys(w).length) return;
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'tp:weights', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by")
    .bind(Date.now(), JSON.stringify({weights: w, names: n && typeof n === "object" ? n : null})).run();
}
// weighted success of the filled roles (%, 1 decimal) - same normalisation as the planner (mean role weight = 1)
function tpWeighted(tp, crime, roles) {
  if (!roles.length) return null;
  const m = tp && tp.weights ? Object.entries(tp.weights).find(([k]) => tpKey(k) === tpKey(crime)) : null;
  const wm = {}; if (m) Object.entries(m[1] || {}).forEach(([r, v]) => { wm[tpKey(r)] = Math.max(0, Number(v) || 0); });
  let a = 0, ws = 0;
  const look = l => { const k = tpKey(l); return wm[k] ?? (/\d+$/.test(k) ? wm[k.replace(/\d+$/, "")] : undefined); };
  roles.forEach(r => { const w = m ? (look(r.position) ?? 1) : 1; a += w * r.rate; ws += w; });
  return ws > 0 ? Math.round(a / ws * 10) / 10 : null;
}
// the parameter order for CalculateSuccess: the crime's roles P1..Pn (GetRoleNames) matched to our slot labels
function tpOrder(names, crime, roles) {
  const e = names ? Object.entries(names).find(([k]) => tpKey(k) === tpKey(crime)) : null;
  if (!e) return null;
  const ps = Object.keys(e[1]).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map(p => tpKey(e[1][p]));
  const same = (pos, k) => { const q = tpKey(pos); return q === k || q.replace(/\d+$/, "") === k; };   // "Enforcer #1" = "Enforcer"
  const out = ps.map(k => { const r = roles.find(x => same(x.position, k)); return r && r.pid != null && r.rate != null ? Math.round(r.rate) : null; });
  return out.every(v => v != null) ? {scenario: e[0], params: out} : null;
}
function tpSuccessOf(succ, names, crime, roles) {
  const o = tpOrder(names, crime, roles); if (!o) return null;
  const h = succ[o.scenario + "|" + o.params.join(",")];
  return h ? {chance: Math.round(h.s * 1000) / 10, fail: h.f != null ? Math.round(h.f * 1000) / 10 : null} : null;
}
// exact success for every FULL team in the plan (one call per new crime + rates combination, at most 20 a run)
async function tpSuccessForTeams(env, teams) {
  if (!env.OC_DB) return;
  const tp = ((await ocSnapGet(env, "hub", "tp:weights").catch(() => null)) || {}).data;
  if (!tp || !tp.names) return;
  const cur = ((await ocSnapGet(env, "hub", "tp:success").catch(() => null)) || {}).data || {};
  let calls = 0, added = 0;
  for (const t of teams || []) {
    const o = tpOrder(tp.names, t.crime, t.roles || []); if (!o) continue;
    const k = o.scenario + "|" + o.params.join(",");
    if (cur[k] || calls >= 20) continue;
    calls++;
    try {
      // tornprobability.com CalculateSuccess - the Hub's key in the header (never in the address)
      const h = {"Content-Type": "application/json", Accept: "application/json"};
      if (env.TP_API_KEY) h["X-API-KEY"] = String(env.TP_API_KEY).trim();   // only if one is ever required
      // API: Heart Breakers Hub - OC team success (tornprobability.com CalculateSuccess)
      const r = await fetch(TP_BASE + "/CalculateSuccess", {method: "POST", headers: h,
        body: JSON.stringify({scenario: o.scenario, parameters: o.params})});
      if (!r.ok) continue;
      const d = await r.json();
      if (typeof d.successChance === "number") { cur[k] = {s: d.successChance, f: d.failureChance ?? null, at: Date.now()}; added++; }
    } catch (e) { /* next run */ }
  }
  if (!added) return;
  // keep the newest 2000 combinations
  const keys = Object.keys(cur).sort((a, b) => cur[b].at - cur[a].at).slice(0, 2000), keep = {};
  keys.forEach(k => { keep[k] = cur[k]; });
  await env.OC_DB.prepare("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', 'tp:success', ?, ?, 'hub') " +
    "ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, data = excluded.data, by = excluded.by")
    .bind(Date.now(), JSON.stringify(keep)).run();
}

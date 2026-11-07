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
  // "7,22,37,52 * * * *" -> Chain watch. Needs the GH_DISPATCH secret (token with Actions: write on CODE_REPO).
  async scheduled(event, env, ctx) {
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
const publicEntry = e => e ? {opted: true, bs: e.bs, ws: e.ws, ready: !!e.ready, since: e.since, updated: e.updated} : {opted: false};
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
      return Response.json({opted: false}, H);
    }
    if (req.method !== "PUT") return new Response("Method not allowed", {status: 405});
    const j = await req.json().catch(() => null);
    if (!j) return new Response("Bad request", {status: 400});
    const bs = SHARE.includes(j.bs) ? j.bs : "off", ws = SHARE.includes(j.ws) ? j.ws : "off", ready = !!j.ready;
    if (bs === "off" && ws === "off" && !ready) {
      await writeOptin(env, id, () => null, `Opt-in turned off ${tag}`);
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
    let missing = false;
    await writeOptin(env, id, cur => {
      if (!cur && !sealed) { missing = true; return null; }
      return {k: sealed || cur.k, bs, ws, ready, since: cur ? cur.since : now, updated: now};
    }, `Opt-in settings saved ${tag}`);
    if (missing) return new Response("Add your Limited API key first.", {status: 400});
    return Response.json(publicEntry({bs, ws, ready, since: now, updated: now}), H);
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
// the old GET read with ?key= in the address: kept ONLY until the OC Optimizer (test fork) reads through
// POST /oc/cpr/read - then set to false (GET answers 410 "use POST /oc/cpr/read")
const OC_GET_KEY_IN_URL = true;
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
    const fid = Number(env.FACTION_ID);
    const {results} = await env.OC_DB.prepare("SELECT player_id, name, roles, ts FROM oc_cpr WHERE env = ? AND faction_id = ?")
      .bind(envName, fid).all();
    const out = {};
    for (const r of results || []) {
      let roles = {};
      try { roles = JSON.parse(r.roles); } catch (e) {}
      out[String(r.player_id)] = {name: r.name, ts: r.ts, roles};
    }
    return ocJson(out);
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
  const cfg = await ocConfig(env, body.env);
  let assignment = null;
  for (const t of ((cfg.plan || {}).teams || [])) {
    for (const r of (t.roles || [])) {
      if (Number(r.pid) === Number(id.player_id)) {
        assignment = {crime: t.crime, position: r.position, team: t.id, rate: r.rate ?? null,
                      difficulty: t.difficulty ?? null, deployed: cfg.plan_ts || null};
      }
    }
  }
  return ocJson({ok: true, disabled: cfg.disabled, assignment, plan_ts: cfg.plan_ts || null});
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
    if (!b || !OC_ENVS.has(b.env) || !["disabled", "plan"].includes(b.k)) return Response.json({ok: false, error: "bad request"}, {status: 400});
    let v = b.v;
    if (b.k === "disabled") {
      if (!Array.isArray(v)) return Response.json({ok: false, error: "disabled must be a list"}, {status: 400});
      v = [...new Set(v.map(x => String(x).slice(0, 80)))].slice(0, 200);
    } else {
      if (!v || typeof v !== "object" || !Array.isArray(v.teams)) return Response.json({ok: false, error: "plan must have teams"}, {status: 400});
      v = {teams: v.teams.slice(0, 100).map(t => ({id: String(t.id || "").slice(0, 40), crime: String(t.crime || "").slice(0, 80),
        difficulty: Number(t.difficulty) || null, avg: Number(t.avg) || null,
        roles: (Array.isArray(t.roles) ? t.roles : []).slice(0, 8).map(r => ({position: String(r.position || "").slice(0, 40),
          pid: r.pid == null ? null : Number(r.pid) || null, name: String(r.name || "").slice(0, 40),
          rate: r.rate == null ? null : Math.round(Number(r.rate)) || 0}))}))};
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

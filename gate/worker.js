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
async function ghProxy(env, req, who, path) {
  path = decodeURIComponent(path.split("?")[0]);
  if (!GH_PATHS.some(rx => rx.test(path))) return new Response("Not allowed", {status: 403});
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

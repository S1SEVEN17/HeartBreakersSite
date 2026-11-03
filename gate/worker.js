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
//   /m/whoami.json    JSON {id, name, position, leader, since, until} for the signed-in member (My Account, menus, scripts)
//   /m/...            members' pages  (pass + still in the faction)
//   /m/me             -> their own profile (member.html?id=<their id>)
//   /l/...            leaders' pages  (pass + position in LEADER_POSITIONS)
//   /                 -> /m/ (Members Hub)
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
// =====================================================================================================

const COOKIE = "hb_s";
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
<label>Torn API key (a <b>Public</b> key is enough)</label><input name="key" type="password" autocomplete="off" required minlength="16" maxlength="16" placeholder="16 characters">
<button type="submit">Sign in</button></form>
<div class="tos">Need a key? Torn → <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener">Settings → API Keys</a> → create one with <b>Public</b> access.
<table><tr><td>Used for</td><td>Checking once that you're in Heart Breakers (your Torn ID, name and faction)</td></tr>
<tr><td>Key stored</td><td>No - it's used for that one check and thrown away</td></tr>
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
    const r = await fetch(`https://api.torn.com/user/?selections=profile&key=${encodeURIComponent(key)}&comment=HBGate`);
    d = await r.json();
  } catch (e) { return loginPage(next, "Couldn't reach Torn just now - try again in a minute."); }
  if (d.error) return loginPage(next, `Torn said: ${d.error.error || "error " + d.error.code}`);
  const fid = String((d.faction || {}).faction_id || "");
  if (fid !== String(env.FACTION_ID)) return page("Not a member", `<h1>Members only</h1><p class="sub">${esc(d.name)} [${esc(d.player_id)}] isn't in Heart Breakers,
so these pages aren't available. If you've just joined, try again after the next site update (up to 3 hours).</p>`, 403);
  const pass = await makePass(env, {i: d.player_id, n: d.name, p: (d.faction || {}).position || ""});
  return new Response(null, {status: 302, headers: {Location: next, "Set-Cookie": cookie(pass, PASS_DAYS * 86400), "Cache-Control": "no-store"}});
}
const safeNext = n => { n = String(n || "/m/"); return /^\/[ml]\//.test(n) || n === "/" ? n : "/m/"; };

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
    if (p === "/" ) return Response.redirect(url.origin + "/m/", 302);
    if (p === "/login") return req.method === "POST" ? doLogin(env, req) : loginPage(safeNext(url.searchParams.get("next")));
    if (p === "/logout") return new Response(null, {status: 302, headers: {Location: "/login", "Set-Cookie": cookie("", 0)}});
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
    return proxy(env, dir, rest, req, true);
  },
};

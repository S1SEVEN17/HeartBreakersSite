// =====================================================================================================
// OC TEAM PLANNER (Nov 2026) - shared by the gatekeeper (gate/worker.js: ocAutoPlan, every 3 minutes) and the
// leaders' OC Management page (tools/oc_management.html: Auto-build; generate.py inlines this file there with the
// "export" keywords removed). ONE copy of the logic, so the page and the live plan always agree.
//
// Teams come from the crimes that EXIST in Torn right now (the OC data feed's crimes, every 3 min):
//   * Recruiting crimes: every OPEN slot is a role to fill. Crimes already BUILT (members in them) go first, the
//     most-filled first; members are picked by their own pay per day there vs their best crime elsewhere. Members already in the crime stay and their real
//     pass rates count. A crime is only filled when the whole crime (existing + new members) reaches the
//     target average success (each new member >= the lowest-role %, role cap applies) - otherwise it's
//     SKIPPED (left open, members go elsewhere). Best pay per day first.
//   * Planning crimes: full - their members are busy until the crime pays out.
//   * Members left over: "needs spawn" teams for crime TYPES (the pay-per-day optimizer: multi-start greedy +
//     steal/backfill + upgrades, role cap) - the script and the Hub warn the crime needs to be spawned.
//   QUEUE (Nov 2026): a member in a PLANNING crime that's ready within opts.queueHours (default 12, leaders can change it; 0 = off) can be QUEUED for their
//     next crime - they join it when their current crime pays out. Queued roles carry queued: true + free_at (ms).
//     Live open slots: only when no free member can fill the crime to the target (fewest queued members, and only
//     if they're free before the crime expires). Spawn teams: allowed, free members preferred. One slot each.
//     When their crime completes the next run drops the flag and it's a normal assignment (Join in the script).
//   STABILITY (fully automatic, re-run every 3 min): an assignment only changes when it stops being valid -
//     the member joined something else / left the faction, someone else took the slot, or the crime is gone.
//     New open slots are filled; nothing valid is reshuffled. A spawn team whose crime starts recruiting is
//     moved into that crime's open slots. Members in spawn teams may be moved into REAL open slots (a real
//     crime beats a hypothetical one). Locked teams (leaders' 🔒) are never changed.
//
// Team shape (the deployed plan, oc_config 'plan'):
//   {id, crime, difficulty, kind: "live"|"spawn", crime_id (Torn crime id for live, null for spawn), lock,
//    roles: [{position: exact slot label ("Picklock #2"), pid|null, name, rate, src, existing (already in the
//             crime in Torn), joined (a planned member who has now joined)}]}
//
// ocPlan(X) -> {teams, changed, stats}. X:
//   crimes   feed crimes (Torn v2 shape)          prev     the current plan's teams (or [])
//   catalog  {name: {difficulty, roles: [labels], prereq}}           members  {pid: name} (current roster)
//   opts     {target, minRole, cap, chains, includeBusy}            disabled Set of crime names switched off
//   rateOf(pid, crime, label) -> {rate, src} | null                  payOf(crime) -> {pot, days} (team, max)
//   budgetMs  time for the spawn optimizer's extra passes (page ~900, gatekeeper 0 = one pass)
//   now       ms (default Date.now()) - for the queue window
//   fresh     true = ignore prev (except locked teams) - the page's "Auto-build" from scratch
// =====================================================================================================
export const baseRole = l => String(l || "").replace(/#\s*\d+/g, "").replace(/\s+/g, " ").trim();
const slotLabel = sl => (sl.position_info && sl.position_info.label) || sl.position || "";
let UID = 0;
const uid = () => "t" + Date.now().toString(36) + (UID++).toString(36) + Math.random().toString(36).slice(2, 5);

export function ocPlan(X) {
  const O = X.opts, cat = X.catalog || {}, roster = X.members || {};
  const nameOf = pid => roster[String(pid)] || ("[" + pid + "]");
  const rolesOf = n => (cat[n] || {}).roles || [];
  const diffOf = n => (cat[n] || {}).difficulty ?? null;
  const rateOf = (pid, crime, label) => X.rateOf(pid, crime, label);
  const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t0 = clock();

  // ---- Torn's crimes right now ----
  const inst = new Map(), busy = new Map();
  for (const c of X.crimes || []) {
    if (!c || c.id == null || (c.status !== "Recruiting" && c.status !== "Planning")) continue;
    inst.set(String(c.id), c);
    for (const sl of c.slots || []) if (sl.user) busy.set(Number(sl.user.id), {cid: String(c.id), label: slotLabel(sl)});
  }
  // ---- queue: members in a Planning crime that's ready within the window ----
  const NOW = X.now || Date.now(), QWIN = (O.queueHours ?? 12) * 3600e3;
  const freeAt = new Map();                                // pid -> ms their current (Planning) crime is ready
  for (const c of inst.values()) if (c.status === "Planning" && c.ready_at)
    for (const sl of c.slots || []) if (sl.user) freeAt.set(Number(sl.user.id), c.ready_at * 1000);
  const queueable = pid => QWIN > 0 && freeAt.has(Number(pid)) && freeAt.get(Number(pid)) <= NOW + QWIN;   // 0 h = queue off
  const beforeExpiry = (pid, c) => !c || !c.expired_at || freeAt.get(Number(pid)) < c.expired_at * 1000;
  // can this member be planned here? free now, or queueable (and free before the live crime `c` expires)
  const usable = (pid, c) => !busy.has(Number(pid)) || (queueable(pid) && beforeExpiry(pid, c));
  const crimeOk = n => !X.disabled.has(n) && rolesOf(n).length && (O.chains || !(cat[n] || {}).prereq);

  // ---- role cap (as before): above OPT.cap in a crime -> held for a harder crime they pass (spawn + live fills) ----
  const capUp = {};
  Object.keys(roster).forEach(pid => Object.keys(cat).forEach(c => {
    if (!crimeOk(c) || (diffOf(c) || 0) <= (capUp[pid] || 0)) return;
    if (rolesOf(c).some(pos => { const r = rateOf(pid, c, pos); return r && r.rate >= O.minRole; })) capUp[pid] = diffOf(c) || 0;
  }));
  let capOn = true;
  const capped = (pid, crime, rate) => capOn && O.cap < 100 && rate > O.cap && (capUp[pid] || 0) > (diffOf(crime) || 0);

  // ---- pay ----
  const payDay = crime => { const v = X.payOf(crime); return v && v.days ? v.pot / v.days : 0; };          // team, max
  const avgOf = roles => { const r = roles.filter(x => x.pid != null && x.rate != null); return r.length ? r.reduce((a, x) => a + x.rate, 0) / r.length : null; };
  const expPay = t => { const a = avgOf(t.roles); return a == null ? 0 : payDay(t.crime) * a / 100; };

  // ---- 1. keep what's still valid ----
  const teams = [], assigned = new Set();                  // pids planned somewhere (not counting `existing`)
  const claimed = new Set();                               // crime ids already covered by a live team
  const take = pid => { assigned.add(Number(pid)); };
  const prev = (X.prev || []).filter(t => t && (t.lock || !X.fresh));
  for (const t0_ of prev) {
    const t = JSON.parse(JSON.stringify(t0_));
    if (t.kind === "live" || t.crime_id) {
      const c = inst.get(String(t.crime_id));
      if (!c) continue;                                    // crime finished / expired: the team is done
      const old = new Map((t.roles || []).map(r => [r.position, r]));
      t.roles = (c.slots || []).map(sl => {
        const label = slotLabel(sl), o = old.get(label) || {};
        if (sl.user) {
          const pid = Number(sl.user.id);
          return {position: label, pid, name: nameOf(pid), existing: true, joined: o.pid != null && Number(o.pid) === pid && (!o.existing || !!o.joined),   // planned, then joined
                  rate: typeof sl.checkpoint_pass_rate === "number" ? Math.round(sl.checkpoint_pass_rate) : ((rateOf(pid, c.name, label) || {}).rate ?? null), src: "in crime"};
        }
        // open slot: keep the planned member while they're still free, still here and not planned elsewhere
        if (o.pid != null && !o.existing && roster[String(o.pid)] != null && usable(o.pid, c) && !assigned.has(Number(o.pid)))
          return Object.assign({}, o, {joined: false});
        return {position: label, pid: null, name: "", rate: null};
      });
      t.kind = "live"; t.crime = c.name; t.difficulty = c.difficulty ?? t.difficulty;
      t.roles.forEach(r => { if (r.pid != null && !r.existing) take(r.pid); });
      claimed.add(String(c.id));
      teams.push(t);
    } else {
      t.kind = "spawn"; t.crime_id = null;
      t.roles = (t.roles || []).map(r => (r.pid != null && (roster[String(r.pid)] == null || (!usable(r.pid) && !O.includeBusy) || assigned.has(Number(r.pid))))
        ? Object.assign({}, r, {pid: null, name: "", rate: null, src: null}) : r);
      t.roles.forEach(r => { if (r.pid != null) take(r.pid); });
      teams.push(t);
    }
  }

  // ---- 2. spawn teams whose crime is now recruiting -> into that crime's open slots ----
  for (let ti = 0; ti < teams.length; ti++) {
    const t = teams[ti];
    if (t.kind !== "spawn" || t.lock) continue;
    const c = [...inst.values()].find(x => x.name === t.crime && x.status === "Recruiting" && !claimed.has(String(x.id)) && (x.slots || []).some(sl => !sl.user));
    if (!c) continue;
    const want = t.roles.filter(r => r.pid != null && usable(r.pid, c));
    const roles = (c.slots || []).map(sl => {
      const label = slotLabel(sl);
      if (sl.user) { const pid = Number(sl.user.id);
        return {position: label, pid, name: nameOf(pid), existing: true, rate: typeof sl.checkpoint_pass_rate === "number" ? Math.round(sl.checkpoint_pass_rate) : null, src: "in crime"}; }
      const i = want.findIndex(r => baseRole(r.position) === baseRole(label));
      if (i < 0) return {position: label, pid: null, name: "", rate: null};
      const r = want.splice(i, 1)[0];
      const rr = rateOf(r.pid, c.name, label) || {rate: r.rate, src: r.src};
      return {position: label, pid: Number(r.pid), name: nameOf(r.pid), rate: rr.rate, src: rr.src};
    });
    want.forEach(r => assigned.delete(Number(r.pid)));       // members with no matching open role go back to the pool
    teams[ti] = {id: t.id, crime: c.name, difficulty: c.difficulty ?? t.difficulty, kind: "live", crime_id: c.id, lock: false, roles};
    claimed.add(String(c.id));
  }

  // ---- B&B: best members for some open slots of one crime ----
  //   slots [{label}], fixedSum / n = the rates already in the crime; pool = [{pid, soft}] (soft = in a spawn team)
  //   maximise sum(score) with (fixedSum + sum rates) / n >= target; each rate >= minRole, not capped
  function fillSlots(crime, slots, fixedSum, n, pool, scoreOf, nodeCap) {
    const need = O.target * n - fixedSum - 1e-9;
    const cands = slots.map(s => {
      const all = [];
      pool.forEach(p => { const r = rateOf(p.pid, crime, s.label); if (r && r.rate >= O.minRole && !capped(p.pid, crime, r.rate))
        all.push({pid: p.pid, rate: r.rate, src: r.src, sc: scoreOf(p, r.rate)}); });
      const bySc = all.slice().sort((a, b) => b.sc - a.sc), byRt = all.slice().sort((a, b) => b.rate - a.rate);
      const lim = slots.length >= 5 ? 7 : 10, out = [], seen = new Set();
      for (const x of bySc.slice(0, lim).concat(byRt.slice(0, lim))) if (!seen.has(x.pid)) { seen.add(x.pid); out.push(x); }
      return out.sort((a, b) => b.sc - a.sc);
    });
    if (cands.some(c => !c.length)) return null;
    const order = slots.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length);
    const maxSc = order.map((_, j) => order.slice(j).reduce((s, i) => s + cands[i][0].sc, 0));
    const maxRt = order.map((_, j) => order.slice(j).reduce((s, i) => s + Math.max(...cands[i].map(c => c.rate)), 0));
    let best = null, bestSc = -Infinity, nodes = 0;
    const pick = new Array(slots.length), used = new Set();
    (function dfs(j, sc, rt) {
      if (++nodes > nodeCap) return;
      if (sc + (maxSc[j] || 0) <= bestSc || rt + (maxRt[j] || 0) < need) return;
      if (j === order.length) { bestSc = sc; best = pick.slice(); return; }
      const i = order[j];
      for (const c of cands[i]) { if (used.has(c.pid)) continue; used.add(c.pid); pick[i] = c; dfs(j + 1, sc + c.sc, rt + c.rate); used.delete(c.pid); }
    })(0, 0, 0);
    return best;
  }

  // free = current members not busy in Torn and not planned anywhere; soft = members in (unlocked) spawn teams
  const freePool = () => Object.keys(roster).map(Number).filter(p => !busy.has(p) && !assigned.has(p)).map(pid => ({pid, soft: false}));
  const softPool = () => {
    const out = [];
    teams.forEach(t => { if (t.kind === "spawn" && !t.lock) t.roles.forEach(r => { if (r.pid != null && !busy.has(Number(r.pid))) out.push({pid: Number(r.pid), soft: true}); }); });   // queued spawn members aren't moved to live slots
    return out;
  };

  // ---- 3. fill open slots of recruiting crimes; skip crimes that can't reach the target ----
  // ORDER (Nov 2026): crimes that are already BUILT (members in them) come first, the most-filled first - finishing a
  // crime gets everyone in it paid, and an abandoned half-built crime pays nobody. Then the rest; ties by pay per
  // member per day.
  const filled = c => { const sl = c.slots || []; return sl.length ? sl.filter(x => x.user).length / sl.length : 0; };
  const recruiting = [...inst.values()].filter(c => c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user))
    .sort((a, b) => (filled(b) > 0) - (filled(a) > 0) || filled(b) - filled(a)
      || payDay(b.name) / ((b.slots || []).length || 1) - payDay(a.name) / ((a.slots || []).length || 1) || (b.difficulty || 0) - (a.difficulty || 0));
  // WHO fills a slot: each member's own pay per day there (crime pay/day per slot x their pass rate), minus half of
  // what they'd earn per day in their best crime anywhere - so strong members aren't spent on a low-paying crime a
  // weaker member can pass, and are left for the crimes where they earn the most. The slots still get filled
  // whenever the crime can reach the target (the score only decides who, not whether).
  const bestDay = {};
  Object.keys(roster).forEach(pid => { let b = 0;
    Object.keys(cat).forEach(c => { if (!crimeOk(c)) return; const n = rolesOf(c).length || 1, pd = payDay(c);
      rolesOf(c).forEach(pos => { const r = rateOf(pid, c, pos); if (r && r.rate >= O.minRole && !capped(pid, c, r.rate)) b = Math.max(b, pd * r.rate / 100 / n); }); });
    bestDay[pid] = b; });
  // why recruiting crimes were left open (stats.skipped, counts per reason + the gap) - diagnostics only
  const skipped = [];
  const skip = (c, reason, x) => skipped.push(Object.assign({crime: c.name, crime_id: c.id,
    filled: (c.slots || []).filter(sl => sl.user).length + "/" + (c.slots || []).length, reason}, x || {}));
  for (const c of recruiting) {
    let t = teams.find(x => x.kind === "live" && String(x.crime_id) === String(c.id));
    if (t && t.lock) { skip(c, "locked"); continue; }
    if (!t && (X.disabled.has(c.name) || (!O.chains && (cat[c.name] || {}).prereq))) { skip(c, X.disabled.has(c.name) ? "switched off" : "chain final"); continue; }   // switched off (an existing team is kept)
    const roles = t ? t.roles : (c.slots || []).map(sl => {
      const label = slotLabel(sl);
      if (!sl.user) return {position: label, pid: null, name: "", rate: null};
      const pid = Number(sl.user.id);
      return {position: label, pid, name: nameOf(pid), existing: true, src: "in crime",
              rate: typeof sl.checkpoint_pass_rate === "number" ? Math.round(sl.checkpoint_pass_rate) : ((rateOf(pid, c.name, label) || {}).rate ?? null)};
    });
    const open = roles.map((r, i) => r.pid == null ? i : -1).filter(i => i >= 0);
    if (!open.length) continue;
    const fixed = roles.filter(r => r.pid != null);
    if (fixed.some(r => r.rate == null)) { skip(c, "a member in it has no known rate"); continue; }         // someone in it has no known rate - can't judge the success
    const fixedSum = fixed.reduce((a, r) => a + r.rate, 0);
    const pool = freePool().concat(softPool());
    const k = payDay(c.name) / roles.length / 100;     // a member's pay per day here = k x their rate
    let best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool,
                           (p, rate) => k * (rate - (p.soft ? 3 : 0)) - 0.5 * (bestDay[p.pid] || 0) + rate * 1e-6, 20000);
    // QUEUE: nobody free can fill it to the target -> let members finishing their crime soon in, as few as possible
    if (!best) {
      const qpool = Object.keys(roster).map(Number).filter(p => busy.has(p) && !assigned.has(p) && queueable(p) && beforeExpiry(p, c))
        .map(pid => ({pid, soft: false, q: true}));
      if (qpool.length) best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool.concat(qpool),
                           (p, rate) => k * (rate - (p.soft ? 3 : 0)) - 0.5 * (bestDay[p.pid] || 0) + rate * 1e-6 - (p.q ? 1e12 : 0), 20000);
    }
    if (!best) {                                           // can't reach the target: SKIPPED (left open)
      // the gap: the average the new members would need vs the best possible (each open slot's best candidate,
      // free or queued, ignoring that one member can only take one slot); roles nobody can fill at all
      const cand = Object.keys(roster).map(Number).filter(p => !assigned.has(p) && usable(p, c));
      const per = open.map(i => { let b = null;
        cand.forEach(p => { const r = rateOf(p, c.name, roles[i].position); if (r && r.rate >= O.minRole && !capped(p, c.name, r.rate) && (b == null || r.rate > b)) b = r.rate; });
        return {role: roles[i].position, best: b}; });
      skip(c, per.some(x => x.best == null) ? "no available member can take a role" : "can't reach the target", {
        need: Math.round((O.target * roles.length - fixedSum) / open.length), inCrime: fixed.map(r => r.rate),
        best: per.map(x => x.role + ":" + (x.best ?? "-")).join(" "), candidates: cand.length});
      continue;
    }
    best.forEach((b, k) => {
      const i = open[k];
      roles[i] = {position: roles[i].position, pid: b.pid, name: nameOf(b.pid), rate: b.rate, src: b.src};
      // a member taken from a spawn team: empty their old spawn role
      teams.forEach(x => { if (x.kind === "spawn") x.roles.forEach(r => { if (Number(r.pid) === b.pid) Object.assign(r, {pid: null, name: "", rate: null, src: null}); }); });
      take(b.pid);
    });
    if (!t) { t = {id: uid(), crime: c.name, difficulty: c.difficulty ?? diffOf(c.name), kind: "live", crime_id: c.id, lock: false, roles}; teams.push(t); claimed.add(String(c.id)); }
    else t.roles = roles;
  }

  // ---- 4. spawn teams for members left over ----
  // existing spawn teams: refill their empty roles (only if the team then reaches the target), else drop the empties
  const openRecruitingNames = new Set(recruiting.filter(c => (c.slots || []).some(sl => !sl.user)).map(c => c.name));
  for (const t of teams) {
    if (t.kind !== "spawn" || t.lock) continue;
    const open = t.roles.map((r, i) => r.pid == null ? i : -1).filter(i => i >= 0);
    if (!open.length) continue;
    const fixed = t.roles.filter(r => r.pid != null), fixedSum = fixed.reduce((a, r) => a + (r.rate || 0), 0);
    const pool = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p)).map(pid => ({pid, soft: false}));
    const best = fillSlots(t.crime, open.map(i => ({label: t.roles[i].position})), fixedSum, t.roles.length, pool, (p, rate) => rate - (busy.has(p.pid) ? 3 : 0), 20000);
    if (best) best.forEach((b, k) => { const i = open[k]; t.roles[i] = {position: t.roles[i].position, pid: b.pid, name: nameOf(b.pid), rate: b.rate, src: b.src}; take(b.pid); });
  }
  // spawn teams that are now short of members or below the target are dissolved (members back to the pool)
  for (let i = teams.length - 1; i >= 0; i--) {
    const t = teams[i];
    if (t.kind !== "spawn" || t.lock) continue;
    const a = avgOf(t.roles);
    if (t.roles.some(r => r.pid == null) || a == null || a < O.target) { t.roles.forEach(r => { if (r.pid != null) assigned.delete(Number(r.pid)); }); teams.splice(i, 1); }
  }
  // new spawn teams: the pay-per-day optimizer (as the page's Auto-build did) over crime TYPES not recruiting now
  const spawnCrimes = Object.keys(cat).filter(n => crimeOk(n) && !openRecruitingNames.has(n));
  const pool0 = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p));   // free + queueable
  const opp = {};
  pool0.forEach(pid => { let b = 0;
    spawnCrimes.forEach(c => { const n = rolesOf(c).length || 1, pd = payDay(c);
      rolesOf(c).forEach(pos => { const r = rateOf(pid, c, pos); if (r && r.rate >= O.minRole) b = Math.max(b, pd * r.rate / 100 / n); }); });
    opp[pid] = b; });
  // one spawn team for a crime type: maximise team pay - alpha x (what these members earn in their best crime) - cost
  //   (alpha 0..1 saves strong members for better crimes; cost = steal step: the pay their current team loses)
  function teamFor2(crime, pool, alpha, cost) {
    const roles = rolesOf(crime); if (!roles.length) return null;
    const k = payDay(crime) / roles.length / 100;
    const best = fillSlots(crime, roles.map(l => ({label: l})), 0, roles.length, [...pool].map(pid => ({pid: Number(pid)})),
      (p, rate) => k * rate - alpha * (opp[p.pid] || 0) - (cost ? cost(p.pid) : 0) - (busy.has(p.pid) ? k * 3 : 0), 40000);   // free members preferred over queued
    if (!best) return null;
    return {id: uid(), crime, difficulty: diffOf(crime), kind: "spawn", crime_id: null, lock: false,
            roles: roles.map((pos, i) => ({position: pos, pid: best[i].pid, name: nameOf(best[i].pid), rate: best[i].rate, src: best[i].src}))};
  }
  const density = c => payDay(c) / (rolesOf(c).length || 1);
  const planScore = ts => ts.reduce((s, t) => s + expPay(t) + 1 + (t.difficulty || 0) * 0.1, 0);
  let best = [], bestScore = -1, runs = 0;
  const alphas = [0, 0.5, 1, 0.25, 0.75];
  while (runs < (X.budgetMs ? 5 : 1) || (X.budgetMs && clock() - t0 < X.budgetMs && runs < 60)) {
    const alpha = runs < alphas.length ? alphas[runs] : Math.random();
    const noise = runs < alphas.length ? 0 : 0.35;
    const order = spawnCrimes.slice().sort((a, b) => density(b) * (1 + noise * Math.random()) - density(a) * (1 + noise * Math.random()) || (diffOf(b) || 0) - (diffOf(a) || 0));
    const free = new Set(pool0), made = [];
    const fill = () => { for (const c of order) for (let g = 0; g < 20; g++) {
      const t = teamFor2(c, free, alpha); if (!t) break;
      t.roles.forEach(r => free.delete(r.pid)); made.push(t); } };
    fill();
    improve(made, free, order);
    fill();
    capOn = false; fill(); capOn = true;                 // members the cap held back that no harder team could use
    const sc = planScore(made);
    if (sc > bestScore) { bestScore = sc; best = made; }
    runs++;
  }
  // step 2 of the spawn optimizer (changes made + free in place): steal / backfill, then upgrades
  function improve(made, free, order) {
    const where = () => { const m = new Map(); made.forEach((t, ti) => t.roles.forEach((r, ri) => m.set(r.pid, [ti, ri]))); return m; };
    const teamPayWith = (t, ri, rate) => { const rr = t.roles.map((x, i) => i === ri ? {pid: 1, rate} : x); return {crime: t.crime, roles: rr}; };
    const backfill = (t, ri, not) => {
      let b = null;
      free.forEach(pid => { if (not && not.has(pid)) return;
        const r = rateOf(pid, t.crime, t.roles[ri].position); if (!r || r.rate < O.minRole || capped(pid, t.crime, r.rate)) return;
        const tt = teamPayWith(t, ri, r.rate); if (avgOf(tt.roles) < O.target) return;
        const pay = expPay(tt); if (!b || pay > b.pay) b = {c: {pid, name: nameOf(pid), rate: r.rate, src: r.src}, pay}; });
      return b;
    };
    for (let round = 0; round < 6; round++) {
      let changed = false;
      for (const crime of order) {
        const pos = where(), lossOf = new Map();
        const cost = pid => { if (free.has(pid)) return 0; if (lossOf.has(pid)) return lossOf.get(pid);
          const [ti, ri] = pos.get(pid), t = made[ti], bf = backfill(t, ri);
          const l = bf ? expPay(t) - bf.pay : Infinity; lossOf.set(pid, l); return l; };
        const pool = new Set([...free, ...pos.keys()]);
        const nt = teamFor2(crime, pool, 0, cost);
        if (!nt || !nt.roles.some(r => !free.has(r.pid))) continue;
        const snap = made.map(t => t.roles.map(r => Object.assign({}, r))), freeSnap = new Set(free);
        const takeSet = new Set(nt.roles.map(r => r.pid));
        let ok = true;
        nt.roles.forEach(r => free.delete(r.pid));
        for (const r of nt.roles) {
          if (!pos.has(r.pid)) continue;
          const [ti, ri] = pos.get(r.pid), bf = backfill(made[ti], ri, takeSet);
          if (!bf) { ok = false; break; }
          made[ti].roles[ri] = Object.assign({}, made[ti].roles[ri], bf.c); free.delete(bf.c.pid);
        }
        const before = snap.reduce((s, roles, i) => s + expPay({crime: made[i].crime, roles}), 0);
        const after = made.reduce((s, t) => s + expPay(t), 0) + expPay(nt);
        if (ok && made.every(t => avgOf(t.roles) >= O.target) && after + 1 > before) { made.push(nt); changed = true; }
        else { made.forEach((t, i) => t.roles = snap[i]); free.clear(); freeSnap.forEach(p => free.add(p)); }
      }
      made.forEach(t => t.roles.forEach((r, ri) => {
        const bf = backfill(t, ri);
        if (bf && bf.c.rate > r.rate) { free.add(r.pid); t.roles[ri] = Object.assign({}, r, bf.c); free.delete(bf.c.pid); changed = true; }
      }));
      if (!changed) break;
    }
  }
  best.forEach(t => { t.roles.forEach(r => take(r.pid)); teams.push(t); });

  // ---- result ----
  // queued flag, recomputed every run: planned (not already in this crime) but still busy in their current crime
  teams.forEach(t => t.roles.forEach(r => {
    const q = r.pid != null && !r.existing && busy.has(Number(r.pid)) && freeAt.has(Number(r.pid));
    if (q) { r.queued = true; r.free_at = freeAt.get(Number(r.pid)); } else { delete r.queued; delete r.free_at; }
  }));
  teams.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "live" ? -1 : 1) || payDay(b.crime) - payDay(a.crime) || (b.difficulty || 0) - (a.difficulty || 0));
  const sig = ts => JSON.stringify(ts.map(t => [t.id, t.crime_id, t.lock, t.roles.map(r => [r.position, r.pid, r.joined ? 1 : 0, r.queued ? 1 : 0])]));
  const changed = sig(teams) !== sig(X.prev || []);
  return {teams, changed, stats: {live: teams.filter(t => t.kind === "live").length, spawn: teams.filter(t => t.kind === "spawn").length,
    pay: teams.reduce((s, t) => s + (avgOf(t.roles) == null ? 0 : payDay(t.crime)), 0), ms: Math.round(clock() - t0), skipped}};
}

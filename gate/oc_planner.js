// =====================================================================================================
// OC TEAM PLANNER (Nov 2026) - shared by the gatekeeper (gate/worker.js: ocAutoPlan, every 3 minutes) and the
// leaders' OC Management page (tools/oc_management.html: Auto-build; generate.py inlines this file there with the
// "export" keywords removed). ONE copy of the logic, so the page and the live plan always agree.
//
// Teams come from the crimes that EXIST in Torn right now (the OC data feed's crimes, every 3 min):
//   * Recruiting crimes: every OPEN slot is a role to fill. Highest pay per member per day first, a BUILT crime (members
//     in it) ahead of an empty copy of the same crime; members are picked by their own pay per day there vs their best crime elsewhere. Members already in the crime stay and their real
//     pass rates count. A crime is only filled when the whole crime (existing + new members) reaches the
//     target average success (each new member >= the lowest-role %, role cap applies) - otherwise it's
//     SKIPPED (left open, members go elsewhere). Best pay per day first.
//   * Planning crimes: full - their members are busy until the crime pays out.
//   * FILLED crimes leave the plan (Nov 11 2026, the user): once the last slot is taken in Torn the team is dropped
//     (nothing left to plan); if a member then leaves, the open slot is filled again like any recruiting crime.
//   * Members left over: "needs spawn" teams for crime TYPES (the pay-per-day optimizer: multi-start greedy +
//     steal/backfill + upgrades, role cap) - the script and the Hub warn the crime needs to be spawned.
//     PRIORITY (Nov 11 2026, the user): the plan kept is the one that seats the most members in the crime with the
//     highest recorded MAX pay per member per day, then the next crime, and so on (better()); total max pay only
//     breaks exact ties.
//   QUEUE (Nov 2026): a member in a PLANNING crime that's ready within opts.queueHours (default 12, leaders can change it; 0 = off) can be QUEUED for their
//     next crime - they join it when their current crime pays out. Queued roles carry queued: true + free_at (ms).
//     Live open slots: only when no free member can fill the crime to the target (fewest queued members, and only
//     if they're free before the crime expires). Spawn teams: allowed, free members preferred. One slot each.
//     When their crime completes the next run drops the flag and it's a normal assignment (Join in the script).
//   RESERVATIONS (Nov 2026, the user's rule): slots are only reserved for members who haven't joined a crime, or who
//     meet the queue criteria above (or a rotated crime's join-order deadline). The live plan (gate/worker.js
//     ocAutoPlan) always runs with includeBusy off; includeBusy is only for leaders' drafts on the page.
//     A reconfigure (X.reshuffle) only moves those reservations - members in a crime stay where they are.
//   STABILITY (fully automatic, re-run every 3 min): an assignment only changes when it stops being valid -
//     the member joined something else / left the faction, someone else took the slot, or the crime is gone.
//     New open slots are filled; nothing valid is reshuffled. A spawn team whose crime starts recruiting is
//     moved into that crime's open slots. Members in spawn teams may be moved into REAL open slots (a real
//     crime beats a hypothetical one). Locked teams (leaders' 🔒) are never changed.
//
// Team shape (the deployed plan, oc_config 'plan'):
//   {id, crime, difficulty, kind: "live"|"spawn", crime_id (Torn crime id for live, null for spawn), lock,
//    roles: [{position: exact slot label ("Picklock #2"), pid|null, name, rate, src, existing (already in the
//             crime in Torn), joined (a planned member who has now joined),
//             replaces {pid, name} (a leader chose to replace the member in this slot - kept until they leave)}]}
//
// ocPlan(X) -> {teams, changed, stats}. X:
//   crimes   feed crimes (Torn v2 shape)          prev     the current plan's teams (or [])
//   catalog  {name: {difficulty, roles: [labels], prereq}}           members  {pid: name} (current roster)
//   opts     {target, minRole, minZero, cap, includeBusy}          disabled Set of crime names switched off
//            (CHAIN FINALS, Nov 12 2026, the user: the "Chain finals" option is gone - a crime with a prerequisite is
//             planned like any other; leaders switch crimes off in the Crimes tab instead. opts.chains is ignored.)
//   rateOf(pid, crime, label) -> {rate, src} | null                  payOf(crime) -> {pot, days} (team, max)
//   budgetMs  time for the spawn optimizer's extra passes (page ~900, gatekeeper 0 = one pass)
//   now       ms (default Date.now()) - for the queue window
//   rotate    Set of crime names leaders ROTATE (oc_config 'rotate'; prerequisites are added by the page)
//   lastRuns  {crime: [[pids of the latest completed run], [the run before], ...]} - for the rotation's mix rule
//   delays    {pid: {n, long, hrs, runs}} - members' crime delays in the last 30 days (placement cost, see delayCost)
//   holdLog   {crime: ms} SPAWN HOLD cooldowns from the last run (stats.hold_log) - see SPAWN HOLDS below
//   scriptUsers  Set of pids who use the OC Optimizer script (asked for their assignment in the last few days), or
//             null = unknown (no preference). See SCRIPT USERS below.
// SPAWN HOLDS (Nov 12 2026, the user: "Give alerts to spawn higher paying jobs when members who qualify are available
//   or becoming available ... alert leadership to try spawning it" + "Hold for a time limit"): after the recruiting
//   crimes are filled, each crime TYPE that isn't recruiting (no open slot anywhere) is checked, best pay per member
//   per day first: can a team that reaches the target be made from members who are free / queueable and not planned,
//   plus members RESERVED (not joined) in a lower-paying recruiting crime - and would it pay more than what those
//   members are planned for now? Then those members are taken out of their reservations and HELD in a spawn team for
//   that crime (team.hold {since, until}) for opts.holdHours (default 2, 0 = off: no holds, the plan's normal spawn
//   teams are still the alerts). Leaders see it as a spawn alert (OC Management, Hub script). The freed live slots
//   are filled again from everyone else. If the crime is spawned in time the held team moves into it (step 2); if not,
//   the hold ends, the members are normal again and that crime can't be held again for another opts.holdHours
//   (stats.hold_log, so the same members aren't pulled back and forth).
// NO-SHOWS (Nov 12 2026, the user: "No-show release"): every reservation in a recruiting crime carries since (ms, when
//   it was made). A member who hasn't joined opts.noShowHours (default 6, 0 = off) after since - or after their
//   current crime is ready, for queued members - loses the slot; it's filled again by the next best member and they
//   aren't put back into that crime instance (team.noshow {pid: ms}). Locked teams are left alone.
// SCRIPT USERS (Nov 12 2026, the user): members who don't use the script never see their assignment. RECRUITING
//   crimes: non-script members are secondary - only placed when no script user can fill the slot (NS_LAST).
//   Nov 13 2026 (user: "Prioritize member placement for those who have the script enabled"): the same now applies
//   EVERYWHERE - spawn teams, spawn holds, refills and the improve/swap pass: a member without the script is only
//   placed where no script user can take the seat at the targets (never in the success maths).
// ROTATION (Nov 2026): planning runs one member at a time in JOIN order, 24 h each (confirmed from the feed:
//   slot user.progress follows joined_at). So a member only has to JOIN before the members ahead of them finish
//   planning. For a rotated crime that's recruiting, a member still in a Planning crime can be queued into it when
//   they free up before their turn: the i-th new joiner (soonest free first) must be free by
//   now + (planning left for the members already in it) + 24 h x i. Rotated crimes go first,
//   and at most floor(pool / seats) recruiting instances get rotation at once (pool = members with a rate >= lowest role in one of its roles).
//   MIX: best rates win, but a pool member who sat out the latest completed run gets priority, so nobody who
//   qualifies sits out two runs in a row. While no instance is recruiting, pool members get normal crimes.
//   fresh     true = ignore prev (except locked teams) - the page's "Auto-build" from scratch
//   weights   ROLE WEIGHTS (Nov 2026, tornprobability.com GetRoleWeights): {CrimeKey: {RoleKey: weight}} - how much each
//             role's pass rate moves the crime's success. Team success = the WEIGHTED average of its members' rates
//             (each role's weight / the crime's mean weight), used for the target and every fill.
//             Keys are matched letters-and-digits only, case-insensitive ("Stage Fright"/"StageFright",
//             "Muscle #1"/"Muscle1"). A crime with no weights falls back to the plain average.
//   succOf    CALCULATED SUCCESS (Nov 12 2026, the user: "Target + pay"): (crime, roles) -> tornprobability.com's
//             calculated success chance (%) for that exact FULL team, or null when it isn't known (not checked yet -
//             the Hub checks the planned full teams after each run and caches them; partial teams can't be checked).
//             When known it REPLACES the weighted average: the success target applies to it (a full team below the
//             target is rejected - the search moves on to the next-best team, and a kept team below it is broken up
//             and refilled). Pay is never multiplied by success (no expected pay). The weighted average still shortlists (the search can't ask
//             tornprobability about every team) and decides for partial teams.
//   reshuffle true = RECONFIGURE (Nov 2026, the user's rule): someone took a slot that was reserved for another member,
//             so every RESERVATION is planned again from scratch for the most efficient placement - members already
//             in crimes, leaders' replacements and 🔒 locked teams stay; open-slot reservations, queued members and
//             (unlocked) spawn teams are dropped and filled again by the steps below. (gate/worker.js ocAutoPlan)
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
  // ---- role weights (normalised so a crime's mean role weight = 1; missing = 1 = plain average) ----
  const wkey = v => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const WT = {};
  Object.keys(X.weights || {}).forEach(c => { const m = {}; Object.keys(X.weights[c] || {}).forEach(r => { m[wkey(r)] = Number(X.weights[c][r]) || 0; }); WT[wkey(c)] = m; });
  const wCache = new Map();
  const wOf = (crime, label) => {
    const k = crime + "|" + label; if (wCache.has(k)) return wCache.get(k);
    const m = WT[wkey(crime)], roles = rolesOf(crime);
    let w = 1;
    if (m && roles.length) {
      // exact role name, else without a trailing number ("Enforcer #1" -> "Enforcer")
      const raw = l => { const k = wkey(l); let v = m[k]; if (v == null && /\d+$/.test(k)) v = m[k.replace(/\d+$/, "")]; return v == null ? null : Math.max(0, v); };
      const all = roles.map(raw);
      if (all.every(v => v != null)) { const mean = all.reduce((a, v) => a + v, 0) / all.length; w = mean > 0 ? (raw(label) ?? mean) / mean : 1; }
    }
    wCache.set(k, w); return w;
  };
  const wSum = (crime, roles) => roles.reduce((a, r) => a + (r.rate || 0) * wOf(crime, r.position), 0);
  // WEIGHT-SCALED MINIMUM (Nov 12 2026, user): opts.minZero = the lowest rate for a 0%-weight role (null = off: every
  // role uses opts.minRole). A role at or above the crime's AVERAGE weight (wOf >= 1) keeps minRole; a lighter role's
  // minimum slides down in proportion to its weight: minZero + (minRole - minZero) x wOf. The team target still applies.
  // e.g. Gaslight the Way, minRole 65 / minZero 50: Imitator #3 41% -> 65, Looter #3 12% -> 61, Looter #1 9% -> 58,
  // Looter #2 0% -> 50.
  const floorOf = (crime, label) => {
    if (O.minZero == null || !(O.minZero < O.minRole)) return O.minRole;
    return O.minZero + (O.minRole - O.minZero) * Math.min(1, wOf(crime, label));
  };
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
  const usable = (pid, c) => !busy.has(Number(pid)) || (queueable(pid) && beforeExpiry(pid, c)) || rotOk(pid, c);
  const ROT = X.rotate instanceof Set ? X.rotate : new Set(X.rotate || []);
  const rotated = n => ROT.has(n) && !X.disabled.has(n);
  const crimeOk = n => !X.disabled.has(n) && rolesOf(n).length;   // chain finals allowed (Nov 12 2026) - switched-off crimes only
  // ---- rotation: join-order planning deadlines ----
  const PLAN_MS = 24 * 3600e3;
  const planLeft = c => (c.slots || []).reduce((a, sl) => a + (sl.user ? Math.max(0, 100 - (Number(sl.user.progress) || 0)) / 100 * PLAN_MS : 0), 0);
  const ROT_ON = new Set();                                 // crime ids where rotation queueing applies (filled below)
  // latest a member may free up and still join this crime without delaying it (the last open slot's turn)
  const rotLimit = c => NOW + planLeft(c) + PLAN_MS * Math.max(0, (c.slots || []).filter(sl => !sl.user).length - 1);
  const rotOk = (pid, c) => !!c && ROT_ON.has(String(c.id)) && freeAt.has(Number(pid)) && freeAt.get(Number(pid)) <= rotLimit(c) && beforeExpiry(pid, c);

  // ---- role cap (as before): above OPT.cap in a crime -> held for a harder crime they pass (spawn + live fills) ----
  const capUp = {};
  Object.keys(roster).forEach(pid => Object.keys(cat).forEach(c => {
    if (!crimeOk(c) || (diffOf(c) || 0) <= (capUp[pid] || 0)) return;
    if (rolesOf(c).some(pos => { const r = rateOf(pid, c, pos); return r && r.rate >= floorOf(c, pos); })) capUp[pid] = diffOf(c) || 0;
  }));
  let capOn = true;
  const capped = (pid, crime, rate) => capOn && O.cap < 100 && rate > O.cap && (capUp[pid] || 0) > (diffOf(crime) || 0);
  // rotation pools + how many RECRUITING instances of each rotated crime get rotation queueing at once:
  // floor(pool / seats), at least 1, most-filled first. (The join-order deadlines decide who can actually make it.)
  const poolOf = {};
  for (const n of ROT) { if (!rotated(n) || !rolesOf(n).length) continue;
    poolOf[n] = new Set(Object.keys(roster).map(Number).filter(p => rolesOf(n).some(pos => { const r = rateOf(p, n, pos); return r && r.rate >= floorOf(n, pos); }))); }
  for (const n of Object.keys(poolOf)) {
    const seats = rolesOf(n).length || 1, max = Math.max(1, Math.floor(poolOf[n].size / seats));
    const mine = [...inst.values()].filter(c => c.name === n);
    let used = 0;   // Planning instances don't count: their members free up and can be queued into the next run
    mine.filter(c => c.status === "Recruiting").sort((a, b) => (b.slots || []).filter(x => x.user).length - (a.slots || []).filter(x => x.user).length)
      .forEach(c => { if (used < max) { ROT_ON.add(String(c.id)); used++; } });
  }
  const lastOf = n => ((X.lastRuns || {})[n] || [])[0] || null;    // pids in the latest completed run of n

  // ---- spawn holds / no-shows / script users (see the header) ----
  const HOLD = Math.max(0, Number(O.holdHours ?? 2) || 0) * 3600e3, NS = Math.max(0, Number(O.noShowHours ?? 6) || 0) * 3600e3;
  const holdLog = {};
  Object.entries(X.holdLog || {}).forEach(([c, v]) => { if (Number(v) > NOW) holdLog[c] = Number(v); });
  const SU = X.scriptUsers instanceof Set ? X.scriptUsers : null;
  const noScr = pid => !!SU && !SU.has(Number(pid));
  // RECRUITING SLOTS (Nov 12 2026, user: "Non Script members should be secondary"): in a recruiting crime's open
  // slots a member who doesn't use the script only gets a slot when no script user can fill it at the targets - a
  // penalty bigger than any pay difference, so the fewest possible non-script members are used (spawn teams keep the
  // small 2-point preference - Nov 13 2026: no longer, NS_LAST is used everywhere). Queued members (1e12) still come
  // after free ones of either kind.
  const NS_LAST = 1e9;
  // ---- pay ----
  const payDay = crime => { const v = X.payOf(crime); return v && v.days ? v.pot / v.days : 0; };          // team, max
  // TIME IN THE CRIME (Nov 12 2026, user: "Pay per day can be altered based on the actual time a member is in a crime
  // ... if someone joins on the last day and begins planning, realistically their pay per day would only encompass
  // 1 day ... This should significantly favor jobs that are already partially planned"): roles plan one after another,
  // 24 h each, so a member who joins a RECRUITING crime now is tied up until it's ready = the planning still left for
  // the members in it + 24 h for every open slot (theirs included) + any later crimes in its chain (full days),
  // never under 1 day. Their pay per day there = their cut / those days. User's choices: open slots count a full
  // 24 h each (no average fill time), no delay estimate, and crime TYPES (spawn teams, holds' targets, PRIO) keep
  // their full days.
  const instDays = c => { const v = X.payOf(c.name), own = rolesOf(c.name).length || (c.slots || []).length || 1;
    const down = v && v.days ? Math.max(0, v.days - own) : 0, open = (c.slots || []).filter(sl => !sl.user).length;
    return Math.max(1, (planLeft(c) + PLAN_MS * open) / 864e5 + down); };
  const payDayInst = c => { const v = X.payOf(c.name); return v && v.pot ? v.pot / instDays(c) : 0; };   // team, max, this instance
  // DELAYS (Nov 2026): X.delays {pid: {n, long, hrs, runs}} - a member's crime delays over the last 30 days. The hours
  // of delay they're likely to cause per crime (hrs / crimes they took part in) hold up EVERYONE's payout, so the
  // cost charged against them = the team's pay per day x those hours / (24 x the crime's days) - a member who often
  // holds crimes up drops behind an equally good reliable one, most of all in the big, short crimes.
  const delayHrs = pid => { const d = (X.delays || {})[String(pid)]; return d && d.hrs ? d.hrs / Math.max(1, d.runs || 0, d.n || 0) : 0; };
  const delayCost = (pid, crime) => { const h = delayHrs(pid); if (!h) return 0; const v = X.payOf(crime);
    return v && v.days ? (v.pot / v.days) * h / (24 * v.days) : 0; };
  // team success = the WEIGHTED average of the members' rates (role weights above)
  const avgOf = (roles, crime) => { const r = roles.filter(x => x.pid != null && x.rate != null); if (!r.length) return null;
    const ws = r.reduce((a, x) => a + wOf(crime, x.position), 0); return ws > 0 ? wSum(crime, r) / ws : null; };
  // CALCULATED SUCCESS (see succOf in the header): only for a FULL team (every role of the crime has a member + rate)
  let calcChecked = 0, calcRejected = 0;
  const calcOf = (roles, crime) => {
    if (typeof X.succOf !== "function" || !roles.length || roles.some(x => x.pid == null || x.rate == null)) return null;
    if (roles.length !== (rolesOf(crime).length || roles.length)) return null;
    const v = X.succOf(crime, roles); return typeof v === "number" ? v : null; };
  const succ = (roles, crime) => { const c = calcOf(roles, crime); return c != null ? c : avgOf(roles, crime); };
  // does this team reach the target? the calculated chance when known, else the weighted average
  const meets = (roles, crime) => { const c = calcOf(roles, crime); if (c != null) { calcChecked++; return c >= O.target; }
    const a = avgOf(roles, crime); return a != null && a >= O.target; };
  // a full team the search found: rejected only when its calculated chance is KNOWN and below the target
  const calcBad = (roles, crime) => { const c = calcOf(roles, crime); if (c != null && c < O.target) { calcRejected++; return true; } return false; };
  // NO EXPECTED PAY (Nov 12 2026, the user: "Remove expected pay per day. This isn't needed."): a team's value is its
  // crime's MAX pay per day - success is NOT multiplied in; it only decides whether a team may be formed (the target,
  // calculated chance when known). The tiny success term only breaks exact ties (stable picks), never outweighs pay.
  const expPay = t => { const a = succ(t.roles, t.crime); return a == null ? 0 : payDay(t.crime) + a * 1e-6; };

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
          // REPLACEMENT (Nov 2026): a leader swapped out the member in this slot (their planning is lost) - keep the
          // replacement while the old member is still in the slot and the replacement is still usable
          if (o.replaces && Number(o.replaces.pid) === pid && o.pid != null && Number(o.pid) !== pid && roster[String(o.pid)] != null
              && usable(o.pid, c) && !assigned.has(Number(o.pid)))
            return Object.assign({}, o, {existing: false, joined: false});
          return {position: label, pid, name: nameOf(pid), existing: true, joined: o.pid != null && Number(o.pid) === pid && (!o.existing || !!o.joined),   // planned, then joined
                  rate: typeof sl.checkpoint_pass_rate === "number" ? Math.round(sl.checkpoint_pass_rate) : ((rateOf(pid, c.name, label) || {}).rate ?? null), src: "in crime"};
        }
        // open slot: keep the planned member while they're still free, still here and not planned elsewhere
        // (RECONFIGURE: dropped - planned again below; locked teams keep theirs)
        // NO-SHOW: reserved too long without joining -> the slot is opened again and they're kept out of this crime
        if (o.pid != null && !o.existing && !t.lock && NS > 0 && o.since && NOW - Math.max(Number(o.since), busy.has(Number(o.pid)) ? (freeAt.get(Number(o.pid)) || NOW) : 0) > NS) {
          (t.noshow || (t.noshow = {}))[String(o.pid)] = NOW;
          return {position: label, pid: null, name: "", rate: null};
        }
        if (o.pid != null && !o.existing && (!X.reshuffle || t.lock) && roster[String(o.pid)] != null && usable(o.pid, c) && !assigned.has(Number(o.pid))) {
          const k = Object.assign({}, o, {joined: false}); delete k.replaces; return k;   // the old member has left: a normal open slot now
        }
        return {position: label, pid: null, name: "", rate: null};
      });
      t.kind = "live"; t.crime = c.name; t.difficulty = c.difficulty ?? t.difficulty;
      // FILLED (Nov 11 2026, user: "This should NOT show crimes that are already filled. Once a member joins the last
      // slot, they should no longer appear in the OC Management Deployed area. If a member leaves, it returns to find
      // the next best member."): every slot taken in Torn (and no leader replacement pending) -> the team leaves the
      // plan. A member leaving opens a slot -> the crime is Recruiting with an open slot again and step 3 fills it.
      if (t.roles.length && t.roles.every(r => r.existing) && !t.roles.some(r => r.replaces)) continue;
      // CALCULATED SUCCESS: the planned full team is known to be below the target -> its reservations are dropped and
      // step 3 refills the slots with the next-best team (members already in the crime stay; locked teams are kept)
      if (!t.lock && t.roles.some(r => r.pid != null && !r.existing) && calcBad(t.roles, c.name))
        t.roles = t.roles.map(r => r.pid != null && !r.existing ? {position: r.position, pid: null, name: "", rate: null} : r);
      t.roles.forEach(r => { if (r.pid != null && !r.existing) take(r.pid); });
      claimed.add(String(c.id));
      teams.push(t);
    } else {
      // SPAWN HOLD over: the members are normal again; that crime can't be held again for another holdHours
      if (t.hold && !(NOW < Number(t.hold.until))) { holdLog[t.crime] = NOW + HOLD; delete t.hold; }
      if (X.reshuffle && !t.lock && !t.hold) continue;     // RECONFIGURE: unlocked spawn teams are planned again (holds stay)
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
  //   maximise sum(score) with (fixedSum + sum WEIGHTED rates) / n >= target; each rate >= minRole, not capped
  //   (fixedSum = the weighted sum of the rates already in it; scores get the weighted rate - a member's share of
  //   the team's success, so a strong member counts for more in a heavy role)
  // leafOk(pick) (optional): false = this combination is rejected (CALCULATED SUCCESS below the target) - the search
  // carries on to the next-best one
  function fillSlots(crime, slots, fixedSum, n, pool, scoreOf, nodeCap, leafOk) {
    const need = O.target * n - fixedSum - 1e-9;
    const cands = slots.map(s => {
      const all = [], w = wOf(crime, s.label);
      pool.forEach(p => { const r = rateOf(p.pid, crime, s.label); if (r && r.rate >= floorOf(crime, s.label) && !capped(p.pid, crime, r.rate))
        all.push({pid: p.pid, rate: r.rate, wr: r.rate * w, src: r.src, sc: scoreOf(p, r.rate * w)}); });
      const bySc = all.slice().sort((a, b) => b.sc - a.sc), byRt = all.slice().sort((a, b) => b.wr - a.wr);
      const lim = slots.length >= 5 ? 7 : 10, out = [], seen = new Set();
      for (const x of bySc.slice(0, lim).concat(byRt.slice(0, lim))) if (!seen.has(x.pid)) { seen.add(x.pid); out.push(x); }
      return out.sort((a, b) => b.sc - a.sc);
    });
    if (cands.some(c => !c.length)) return null;
    const order = slots.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length);
    const maxSc = order.map((_, j) => order.slice(j).reduce((s, i) => s + cands[i][0].sc, 0));
    const maxRt = order.map((_, j) => order.slice(j).reduce((s, i) => s + Math.max(...cands[i].map(c => c.wr)), 0));
    let best = null, bestSc = -Infinity, nodes = 0;
    const pick = new Array(slots.length), used = new Set();
    (function dfs(j, sc, rt) {
      if (++nodes > nodeCap) return;
      if (sc + (maxSc[j] || 0) <= bestSc || rt + (maxRt[j] || 0) < need) return;
      if (j === order.length) { if (leafOk && !leafOk(pick)) return; bestSc = sc; best = pick.slice(); return; }
      const i = order[j];
      for (const c of cands[i]) { if (used.has(c.pid)) continue; used.add(c.pid); pick[i] = c; dfs(j + 1, sc + c.sc, rt + c.wr); used.delete(c.pid); }
    })(0, 0, 0);
    return best;
  }

  // free = current members not busy in Torn and not planned anywhere; soft = members in (unlocked) spawn teams
  const freePool = () => Object.keys(roster).map(Number).filter(p => !busy.has(p) && !assigned.has(p)).map(pid => ({pid, soft: false}));
  const softPool = () => {
    const out = [];
    teams.forEach(t => { if (t.kind === "spawn" && !t.lock && !t.hold) t.roles.forEach(r => { if (r.pid != null && !busy.has(Number(r.pid))) out.push({pid: Number(r.pid), soft: true}); }); });   // queued spawn members aren't moved to live slots
    return out;
  };

  // ---- 2b. SCRIPT-USER TAKEOVER (Nov 13 2026, user: "If a non-script member is already placed in a crime, if a
  // qualifying script-using member becomes available, prioritize the script user.") ----
  // A seat RESERVED (planned, not joined - members already in Torn's crime are never moved) for a member without the
  // script goes to a FREE script user who isn't planned anywhere, when they qualify for it: rate at the role's floor,
  // not held back by the cap, and the team still reaches the target with them (calculated chance when known). The
  // best-rated such script user takes it; the non-script member goes back to the pool (step 3 / 4 may place them
  // elsewhere). Locked teams are left alone.
  if (SU) {
    const freeSU = () => Object.keys(roster).map(Number).filter(p => !noScr(p) && !busy.has(p) && !assigned.has(p));
    for (const t of teams) {
      if (t.lock) continue;
      const c = t.kind === "live" ? inst.get(String(t.crime_id)) : null;
      t.roles.forEach((r, ri) => {
        if (r.pid == null || r.existing || !noScr(r.pid)) return;
        let b = null;
        for (const p of freeSU()) {
          if (c && (t.noshow || {})[String(p)]) continue;                 // a no-show isn't put back into this crime
          const rr = rateOf(p, t.crime, r.position);
          if (!rr || rr.rate < floorOf(t.crime, r.position) || capped(p, t.crime, rr.rate)) continue;
          const roles = t.roles.map((x, i) => i === ri ? {position: x.position, pid: p, rate: rr.rate} : x);
          if (t.roles.every((x, i) => i === ri || x.pid != null) && !meets(roles, t.crime)) continue;   // full team: must reach the target
          if (!b || rr.rate > b.rate) b = {pid: p, rate: rr.rate, src: rr.src};
        }
        if (!b) return;
        assigned.delete(Number(r.pid)); take(b.pid);
        const k = Object.assign({}, r, {pid: b.pid, name: nameOf(b.pid), rate: b.rate, src: b.src, joined: false});
        delete k.since; delete k.queued; delete k.free_at; delete k.replaces;
        t.roles[ri] = k;
      });
    }
  }

  // ---- 3. fill open slots of recruiting crimes; skip crimes that can't reach the target ----
  // ORDER (Nov 2026, revised): highest pay per MEMBER per day first; among crimes that pay the same (e.g. several
  // instances of one crime) the one already BUILT (members in it), most-filled first, goes first - so a half-built
  // crime is finished before a fresh copy of it, but never ahead of a better-paying crime.
  const filled = c => { const sl = c.slots || []; return sl.length ? sl.filter(x => x.user).length / sl.length : 0; };
  const each = c => payDayInst(c) / ((c.slots || []).length || 1);   // TIME IN THE CRIME: this instance's days
  const recruiting = [...inst.values()].filter(c => c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user))
    .sort((a, b) => ROT_ON.has(String(b.id)) - ROT_ON.has(String(a.id)) || each(b) - each(a) || filled(b) - filled(a) || (b.difficulty || 0) - (a.difficulty || 0));   // rotated first
  // WHO fills a slot: each member's own pay per day there (crime pay/day per slot x their pass rate), minus half of
  // what they'd earn per day in their best crime anywhere - so strong members aren't spent on a low-paying crime a
  // weaker member can pass, and are left for the crimes where they earn the most. The slots still get filled
  // whenever the crime can reach the target (the score only decides who, not whether).
  const bestDay = {};
  Object.keys(roster).forEach(pid => { let b = 0;
    Object.keys(cat).forEach(c => { if (!crimeOk(c)) return; const n = rolesOf(c).length || 1, pd = payDay(c);
      rolesOf(c).forEach(pos => { const r = rateOf(pid, c, pos); if (r && r.rate >= floorOf(c, pos) && !capped(pid, c, r.rate)) b = Math.max(b, pd * r.rate / 100 / n); }); });
    bestDay[pid] = b; });
  // why recruiting crimes were left open (stats.skipped, counts per reason + the gap) - diagnostics only
  const skipped = [];
  const skip = (c, reason, x) => skipped.push(Object.assign({crime: c.name, crime_id: c.id,
    filled: (c.slots || []).filter(sl => sl.user).length + "/" + (c.slots || []).length, reason}, x || {}));
  // ROTATION fill: free + spawn-team members + pool members still in a Planning crime who free up before their
  // join-order turn. Score = pay per day there - half their best elsewhere, + a large MIX bonus for pool members who
  // sat out the latest run, - a little per day of waiting (free members first when it's otherwise equal). The
  // picked members are then checked in join order (soonest free first): the i-th must be free by
  // now + planning left + 24 h x i; a member who isn't is left out and the fill retried.
  function rotFill(c, roles, open, fixedSum, pool, k, nsBan, leafOk) {
    const last = lastOf(c.name), pl = poolOf[c.name] || new Set(), inNow = new Set();
    [...inst.values()].forEach(x => { if (x.name === c.name && String(x.id) !== String(c.id)) (x.slots || []).forEach(sl => { if (sl.user) inNow.add(Number(sl.user.id)); }); });
    const base = planLeft(c), ban = new Set();
    const fOf = pid => busy.has(Number(pid)) ? freeAt.get(Number(pid)) : NOW;
    for (let tries = 0; tries < 6; tries++) {
      const q = Object.keys(roster).map(Number).filter(p => busy.has(p) && !assigned.has(p) && rotOk(p, c) && !nsBan.has(p)).map(pid => ({pid, soft: false, q: true}));
      const all = pool.concat(q).filter(p => !ban.has(p.pid));
      const best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, all, (p, rate) =>
        k * (rate - (p.soft ? 3 : 0)) - 0.5 * (bestDay[p.pid] || 0) + rate * 1e-6
        + (last && pl.has(p.pid) && !last.has(p.pid) && !inNow.has(p.pid) ? 1e9 : 0)       // MIX: sat out the last run
        - (p.q ? k * Math.max(0, fOf(p.pid) - NOW) / 3600e3 : 0) - delayCost(p.pid, c.name) - (noScr(p.pid) ? NS_LAST : 0), 20000, leafOk);
      if (!best) return null;
      const order = best.slice().sort((a, b) => fOf(a.pid) - fOf(b.pid));
      const late = order.find((b, i) => fOf(b.pid) > NOW + base + PLAN_MS * i + 600e3);   // 10 min slack
      if (!late) return best;
      ban.add(late.pid);
    }
    return null;
  }
  const fillRecruiting = () => { for (const c of recruiting) {
    let t = teams.find(x => x.kind === "live" && String(x.crime_id) === String(c.id));
    if (t && t.lock) { skip(c, "locked"); continue; }
    if (!t && X.disabled.has(c.name)) { skip(c, "switched off"); continue; }   // switched off (an existing team is kept)
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
    const fixedSum = wSum(c.name, fixed);                   // weighted (role weights)
    const nsBan = new Set(Object.keys((t && t.noshow) || {}).map(Number));   // NO-SHOWS: not back into this crime
    const pool = freePool().concat(softPool()).filter(p => !nsBan.has(p.pid));
    const k = payDayInst(c) / roles.length / 100;      // a member's pay per day here = k x their rate (TIME IN THE CRIME)
    // CALCULATED SUCCESS: the whole crime with these new members (always full - every open slot is filled)
    const leafOk = pick => !calcBad(roles.map((r, i) => { const j = open.indexOf(i); return j < 0 ? r : {position: r.position, pid: pick[j].pid, rate: pick[j].rate}; }), c.name);
    let best = null;
    if (ROT_ON.has(String(c.id))) best = rotFill(c, roles, open, fixedSum, pool, k, nsBan, leafOk);
    if (!best) best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool,
                           (p, rate) => k * (rate - (p.soft ? 3 : 0)) - (noScr(p.pid) ? NS_LAST : 0) - 0.5 * (bestDay[p.pid] || 0) + rate * 1e-6 - delayCost(p.pid, c.name), 20000, leafOk);
    // QUEUE: nobody free can fill it to the target -> let members finishing their crime soon in, as few as possible
    if (!best && !ROT_ON.has(String(c.id))) {
      const qpool = Object.keys(roster).map(Number).filter(p => busy.has(p) && !assigned.has(p) && queueable(p) && beforeExpiry(p, c) && !nsBan.has(p))
        .map(pid => ({pid, soft: false, q: true}));
      if (qpool.length) best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool.concat(qpool),
                           (p, rate) => k * (rate - (p.soft ? 3 : 0)) - (noScr(p.pid) ? NS_LAST : 0) - 0.5 * (bestDay[p.pid] || 0) + rate * 1e-6 - (p.q ? 1e12 : 0) - delayCost(p.pid, c.name), 20000, leafOk);
    }
    if (!best) {                                           // can't reach the target: SKIPPED (left open)
      // the gap: the average the new members would need vs the best possible (each open slot's best candidate,
      // free or queued, ignoring that one member can only take one slot); roles nobody can fill at all
      const cand = Object.keys(roster).map(Number).filter(p => !assigned.has(p) && usable(p, c));
      const per = open.map(i => { let b = null;
        cand.forEach(p => { const r = rateOf(p, c.name, roles[i].position); if (r && r.rate >= floorOf(c.name, roles[i].position) && !capped(p, c.name, r.rate) && (b == null || r.rate > b)) b = r.rate; });
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
  } };
  fillRecruiting();

  // ---- 3b. SPAWN HOLDS (see the header) ----
  const density = c => payDay(c) / (rolesOf(c).length || 1);
  const openRecruitingNames = new Set(recruiting.filter(c => (c.slots || []).some(sl => !sl.user)).map(c => c.name));
  if (HOLD > 0) {
    const resv = new Map();                                // pid -> the live role they're reserved in (not joined)
    teams.forEach(t => { if (t.kind === "live" && !t.lock) t.roles.forEach(r => { if (r.pid != null && !r.existing && !r.replaces) resv.set(Number(r.pid), {t, r}); }); });
    const liveDen = t => { const c = inst.get(String(t.crime_id)); return c ? payDayInst(c) / (t.roles.length || 1) : density(t.crime); };   // TIME IN THE CRIME
    // what a pulled member is planned for now: their reserved crime's MAX pay per member per day (no expected pay)
    const curPay = pid => { const x = resv.get(pid); return x ? liveDen(x.t) : 0.5 * (bestDay[pid] || 0); };
    const cands = Object.keys(cat).filter(n => crimeOk(n) && !openRecruitingNames.has(n) && !(holdLog[n] > NOW)
      && !teams.some(t => t.kind === "spawn" && t.hold && t.crime === n)).sort((a, b) => density(b) - density(a));
    let pulled = false;
    for (const C of cands) {
      const roles = rolesOf(C), n = roles.length || 1, k = payDay(C) / n / 100;
      const pool = Object.keys(roster).map(Number).filter(p => resv.has(p) ? liveDen(resv.get(p).t) < density(C) : (!assigned.has(p) && usable(p)));
      if (pool.length < n) continue;
      const best = fillSlots(C, roles.map(l => ({label: l})), 0, n, pool.map(pid => ({pid})),
        (p, rate) => k * (rate - (busy.has(p.pid) ? 3 : 0)) - curPay(p.pid) - delayCost(p.pid, C) - (noScr(p.pid) ? NS_LAST : 0), 40000,   // script users first
        pick => !calcBad(roles.map((pos, i) => ({position: pos, pid: pick[i].pid, rate: pick[i].rate})), C));
      if (!best || !best.some(b => resv.has(b.pid))) continue;          // nobody to pull: step 4 handles free members
      const nt = {id: uid(), crime: C, difficulty: diffOf(C), kind: "spawn", crime_id: null, lock: false, hold: {since: NOW, until: NOW + HOLD},
                  roles: roles.map((pos, i) => ({position: pos, pid: best[i].pid, name: nameOf(best[i].pid), rate: best[i].rate, src: best[i].src}))};
      if (expPay(nt) - best.reduce((a, b) => a + curPay(b.pid), 0) <= 0) continue;   // must pay more than what they're planned for
      best.forEach(b => { const x = resv.get(b.pid);
        if (x) { Object.assign(x.r, {pid: null, name: "", rate: null, src: null}); delete x.r.since; resv.delete(b.pid); }
        take(b.pid); });
      teams.push(nt); pulled = true;
    }
    if (pulled) { skipped.length = 0; fillRecruiting(); }  // the slots they left are filled again from everyone else
  }

  // ---- 4. spawn teams for members left over ----
  // existing spawn teams: refill their empty roles (only if the team then reaches the target), else drop the empties
  for (const t of teams) {
    if (t.kind !== "spawn" || t.lock) continue;
    const open = t.roles.map((r, i) => r.pid == null ? i : -1).filter(i => i >= 0);
    if (!open.length) continue;
    const fixed = t.roles.filter(r => r.pid != null), fixedSum = wSum(t.crime, fixed);
    const pool = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p)).map(pid => ({pid, soft: false}));
    const best = fillSlots(t.crime, open.map(i => ({label: t.roles[i].position})), fixedSum, t.roles.length, pool, (p, rate) => rate - (busy.has(p.pid) ? 3 : 0) - delayCost(p.pid, t.crime) / Math.max(1e-9, payDay(t.crime) / t.roles.length / 100) - (noScr(p.pid) ? NS_LAST : 0), 20000,   // delay cost in rate points; script users first
      pick => !calcBad(t.roles.map((r, i) => { const j = open.indexOf(i); return j < 0 ? r : {position: r.position, pid: pick[j].pid, rate: pick[j].rate}; }), t.crime));
    if (best) best.forEach((b, k) => { const i = open[k]; t.roles[i] = {position: t.roles[i].position, pid: b.pid, name: nameOf(b.pid), rate: b.rate, src: b.src}; take(b.pid); });
  }
  // spawn teams that are now short of members or below the target are dissolved (members back to the pool)
  for (let i = teams.length - 1; i >= 0; i--) {
    const t = teams[i];
    if (t.kind !== "spawn" || t.lock) continue;
    // CALCULATED SUCCESS when known (meets)
    if (t.roles.some(r => r.pid == null) || !meets(t.roles, t.crime)) { t.roles.forEach(r => { if (r.pid != null) assigned.delete(Number(r.pid)); }); teams.splice(i, 1); }
  }
  // new spawn teams: the pay-per-day optimizer (as the page's Auto-build did) over crime TYPES not recruiting now
  const spawnCrimes = Object.keys(cat).filter(n => crimeOk(n) && !openRecruitingNames.has(n));
  const pool0 = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p));   // free + queueable
  const opp = {};
  pool0.forEach(pid => { let b = 0;
    spawnCrimes.forEach(c => { const n = rolesOf(c).length || 1, pd = payDay(c);
      rolesOf(c).forEach(pos => { const r = rateOf(pid, c, pos); if (r && r.rate >= floorOf(c, pos)) b = Math.max(b, pd * r.rate / 100 / n); }); });
    opp[pid] = b; });
  // one spawn team for a crime type: maximise team pay - alpha x (what these members earn in their best crime) - cost
  //   (alpha 0..1 saves strong members for better crimes; cost = steal step: the pay their current team loses)
  function teamFor2(crime, pool, alpha, cost) {
    const roles = rolesOf(crime); if (!roles.length) return null;
    const k = payDay(crime) / roles.length / 100;
    const best = fillSlots(crime, roles.map(l => ({label: l})), 0, roles.length, [...pool].map(pid => ({pid: Number(pid)})),
      (p, rate) => k * rate - alpha * (opp[p.pid] || 0) - (cost ? cost(p.pid) : 0) - (busy.has(p.pid) ? k * 3 : 0) - (noScr(p.pid) ? NS_LAST : 0) - delayCost(p.pid, crime), 40000,   // free members preferred over queued; script users first
      pick => !calcBad(roles.map((pos, i) => ({position: pos, pid: pick[i].pid, rate: pick[i].rate})), crime));
    if (!best) return null;
    return {id: uid(), crime, difficulty: diffOf(crime), kind: "spawn", crime_id: null, lock: false,
            roles: roles.map((pos, i) => ({position: pos, pid: best[i].pid, name: nameOf(best[i].pid), rate: best[i].rate, src: best[i].src}))};
  }
  const planScore = ts => ts.reduce((s, t) => s + expPay(t) + 1 + (t.difficulty || 0) * 0.1, 0);
  // PRIORITY (Nov 11 2026, user: "Prioritize crimes by highest recorded maximum income per day"): plans are compared
  // crime by crime from the highest recorded MAX pay per member per day down - the plan that seats more members in
  // the better-paying crime wins, whatever happens further down; only an exact tie falls back to the total expected
  // pay (planScore). The success target / lowest role / cap still decide who CAN be placed.
  const PRIO = spawnCrimes.slice().sort((a, b) => density(b) - density(a) || (diffOf(b) || 0) - (diffOf(a) || 0));
  const planKey = ts => { const n = new Map(); ts.forEach(t => n.set(t.crime, (n.get(t.crime) || 0) + t.roles.length)); return PRIO.map(c => n.get(c) || 0); };
  const better = (a, b) => { const ka = planKey(a), kb = planKey(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] > kb[i];
    return planScore(a) > planScore(b); };
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
    if (bestScore < 0 || better(made, best)) { bestScore = planScore(made); best = made; }
    runs++;
  }
  // step 2 of the spawn optimizer (changes made + free in place): steal / backfill, then upgrades
  function improve(made, free, order) {
    const where = () => { const m = new Map(); made.forEach((t, ti) => t.roles.forEach((r, ri) => m.set(r.pid, [ti, ri]))); return m; };
    const teamPayWith = (t, ri, rate) => { const rr = t.roles.map((x, i) => i === ri ? {position: x.position, pid: 1, rate} : x); return {crime: t.crime, roles: rr}; };
    const backfill = (t, ri, not) => {
      let b = null;
      free.forEach(pid => { if (not && not.has(pid)) return;
        const r = rateOf(pid, t.crime, t.roles[ri].position); if (!r || r.rate < floorOf(t.crime, t.roles[ri].position) || capped(pid, t.crime, r.rate)) return;
        const tt = teamPayWith(t, ri, r.rate); if (!meets(tt.roles, tt.crime)) return;   // CALCULATED SUCCESS when known
        // script users first (Nov 13 2026), then the best pay
        const pay = expPay(tt), ns = noScr(pid);
        if (!b || (b.ns && !ns) || (b.ns === ns && pay > b.pay)) b = {c: {pid, name: nameOf(pid), rate: r.rate, src: r.src}, pay, ns}; });
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
        if (ok && made.every(t => meets(t.roles, t.crime)) && after + 1 > before) { made.push(nt); changed = true; }
        else { made.forEach((t, i) => t.roles = snap[i]); free.clear(); freeSnap.forEach(p => free.add(p)); }
      }
      made.forEach(t => t.roles.forEach((r, ri) => {
        const bf = backfill(t, ri);
        // upgrade a seat: a script user replaces a non-script member (rates allowing); otherwise a higher rate of the
        // same kind - never a non-script member for a script user (Nov 13 2026)
        if (bf && ((noScr(r.pid) && !bf.ns) || (noScr(r.pid) === bf.ns && bf.c.rate > r.rate))) { free.add(r.pid); t.roles[ri] = Object.assign({}, r, bf.c); free.delete(bf.c.pid); changed = true; }
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
  // NO-SHOW clock: every reservation in a recruiting crime gets since = when it was made (kept while it stays)
  teams.forEach(t => t.roles.forEach(r => {
    if (t.kind === "live" && r.pid != null && !r.existing) { if (!r.since) r.since = NOW; } else delete r.since; }));
  teams.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "live" ? -1 : 1) || payDay(b.crime) - payDay(a.crime) || (b.difficulty || 0) - (a.difficulty || 0));
  const sig = ts => JSON.stringify(ts.map(t => [t.id, t.crime_id, t.lock, t.hold ? 1 : 0, Object.keys(t.noshow || {}).length, t.roles.map(r => [r.position, r.pid, r.joined ? 1 : 0, r.queued ? 1 : 0])]));
  const changed = sig(teams) !== sig(X.prev || []);
  return {teams, changed, stats: {live: teams.filter(t => t.kind === "live").length, spawn: teams.filter(t => t.kind === "spawn").length,
    pay: teams.reduce((s, t) => s + (avgOf(t.roles, t.crime) == null ? 0 : payDay(t.crime)), 0), ms: Math.round(clock() - t0), skipped,
    holds: teams.filter(t => t.hold).length, hold_log: holdLog,
    // CALCULATED SUCCESS: how many team checks used a known calculated chance / full teams rejected for being below the target
    calc_checked: calcChecked, calc_rejected: calcRejected,
    // TIME IN THE CRIME: {crime_id: crime type's days / days for whoever joins now} - scales a live team's pay per day
    inst_mult: Object.fromEntries([...inst.values()].filter(c => c.status === "Recruiting").map(c => {
      const v = X.payOf(c.name); return [String(c.id), v && v.days ? +(v.days / instDays(c)).toFixed(3) : 1]; })),
    // JOIN NOW (Nov 12 2026): {crime_id: days to payout for whoever joins now} - every recruiting crime
    inst_days: Object.fromEntries([...inst.values()].filter(c => c.status === "Recruiting").map(c => [String(c.id), +instDays(c).toFixed(3)])),
    rotation: Object.keys(poolOf).map(n => ({crime: n, pool: poolOf[n].size, seats: rolesOf(n).length,
      max: Math.max(1, Math.floor(poolOf[n].size / (rolesOf(n).length || 1))),
      live: [...ROT_ON].filter(id => (inst.get(id) || {}).name === n).length}))}};
}

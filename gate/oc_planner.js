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
//   *** Nov 13 2026 (user): QUEUE and SPAWN HOLDS are REMOVED (QWIN / HOLD forced to 0 below); spawn teams are made
//   *** only for members whose rates are too high (role cap) for every open crime (step 4); a member who has started
//   *** planning is never moved (a leader replacement is dropped once progress > 0). Notes below kept for history.
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
  // =====================================================================================================
  // V2 RULES - SHADOW MODE ONLY (Nov 15 2026, user: crimes "too spread out", members "in the wrong crimes"; then
  // "Enable this in Shadow Mode. I want to see how things would work with the new system compared to our current
  // system."). Everything below marked V2 runs ONLY when X.v2 is set - the live plan (gate/worker.js ocAutoPlan)
  // never sets it, so live team building is exactly as before. X.v2 = {pauseHours, slack, moveHours}:
  //   1. ORDER: recruiting crimes are filled PAUSED first (everyone in it has finished planning, seats still open),
  //      then ABOUT TO PAUSE (its members finish within pauseHours - Torn's ready_at on a recruiting crime), then the
  //      FULLEST, then by join-now pay as before. ("Strong preference for the fullest crimes. Primarily any crimes
  //      that are paused ... or ones that will become paused soon." / "within 12 hours")
  //   2. BELOW THE FLOOR: a paused / about-to-pause crime that can't be filled by the normal rules is tried again
  //      with the team target and every role minimum `slack` points lower ("Fill below the floor, -5% max floor").
  //      The team carries slack: N. The role cap ("max ceiling CPR") is NOT relaxed any further than today.
  //   3. MOVES: a member sitting in a crime that is NOT full may be asked to move while their own planning is under
  //      moveHours (24 h per member -> under moveHours/24 of their progress), not only at 0% - and still only when
  //      the other crime pays them more per day if they join now ("under 12 hours ... as long as the swap benefits
  //      them in profit per day"; "as long as the crime is not filled"). Full crimes are never pulled from.
  // =====================================================================================================
  //   4. SAFEGUARDS (Nov 16 2026, user: "Enable safeguards so users don't get switched around too much."), for the
  //      moves in 3 (a member asked to LEAVE the crime they sit in):
  //        - WORTH IT: the other crime must pay them at least minGain % more per day (today's rule: 1 %);
  //        - NOT FROM A CRIME THAT NEEDS THEM: never out of a paused / about-to-pause crime, and never out of a crime
  //          that is fuller than the one being filled (that would only move the hole);
  //        - ONCE A DAY: X.moveLog {pid: {at, to, from}} = the last move each member was asked to make. Within
  //          cooldownHours of it they aren't asked to go anywhere else, and they're never sent back to the crime
  //          they left within backHours. (The same pending move may keep being proposed - it's one ask.)
  //      stats.v2_blocked counts the moves each safeguard held back.
  // =====================================================================================================
  // V3 "LADDER" RULES - SHADOW MODE ONLY (Nov 16 2026). They REPLACE the V2 rules in the shadow comparison (user: "3.
  // Replace them."); X.v2 is no longer passed by the Hub and its code is kept for reference. The live plan never sets
  // X.v3, so live team building is exactly as before.
  // Why (user, Nov 16 2026): the live planner put members who pass difficulty-5 crimes into a difficulty-1 crime because
  // it only fills crimes that are open. "I want to completely rework the way OCs are assigned ... prioritize keeping
  // members for higher tier OCs that pay the most per day ... limit paused planning time, mainly for these higher tier
  // crimes. Members should not sacrifice their pay per day to move to lower tier crimes than they qualify for. The goal
  // ... is to always place members at their highest possible pay, while maintaining their respective scores and pass
  // rates."  User's answers: spawning is by TIER (difficulty 1-2, 3-4, 5-6, 7-8, 9-10) and the crime inside it is
  // RANDOM; "Higher Tier should always be based on pay per day"; floor "75%"; wait "24 Hours. Alert leaders when members
  // are waiting for higher tier crimes to be spawned"; no full-team-before-first-join rule ("Remove that rule ... the
  // Join Now pay per day will begin to increase for new joins"); "Don't place members when there is no recorded rates";
  // alerts go to "Leader Alerts" (when this goes live - in shadow they're listed on the 🔬 Shadow tab only).
  // X.v3 = {floor (%), waitHours, pauseHours}; X.waitLog = {pid: ms since they've been waiting} (the shadow's own).
  //   1. LADDER: for each member, every switched-on crime TYPE they have a RECORDED rate for at a role's minimum,
  //      ranked by the crime's normal pay per member per day (ladPay). Rung 0 = their best. No recorded rate = no rung.
  //   2. FLOOR: a member is only placed in a recruiting crime whose JOIN-NOW pay per member per day (each(c)) is at
  //      least floor x their reference rung's pay (v3Low, checked wherever the role cap is: every fill). Paused crimes
  //      lift the cap as before but NOT the floor.
  //   3. WAIT: a member free with no seat above the floor WAITS for a spawn of their reference rung's tier
  //      (stats.v3.waiting / requests by tier). Every waitHours of waiting drops the reference one rung (v3Drop), so
  //      the floor relaxes step by step and nobody idles for ever. Placed / joined = the clock is cleared.
  //   4. ORDER: paused crimes first, then crimes pausing within pauseHours, then join-now pay (not "the fullest").
  //   5. NO SPAWN TEAMS for crime types (a spawn can't pick the crime): step 4's spawn teams are off; the tier
  //      requests replace them. Members with no recorded rates at all are listed (stats.v3.norates), never placed.
  //   Unchanged: role minimums, team target, the role cap, never moving a member whose planning has started, and the
  //   move safeguards (the Team Builder's 🛡 numbers).
  // =====================================================================================================
  //   8. MEASURE AGAINST WHAT'S OPEN (Nov 16 2026, later the same day - user: seven members sat waiting while Dish It
  //      Out / Guardian Ángels stayed open: "Measure against whats open. If the 'best ever' is 5m per day, but the
  //      available roles only pay 1m per day, go with the 1m per day crime, but warn the user/leader that they're
  //      joining an underperforming role and need a new, higher paying crime spawned to be efficient. Only show this
  //      alert when users drop below a certain % of their highest pay per day. This % can be adjusted in the Team
  //      Builder section."). This REPLACES rules 2 and 3 (X.v3.floor now defaults to 0 = no 75% floor, no rung drops):
  //        - BEST OPEN FIRST: on the first fill pass a member is not offered a crime while another recruiting crime
  //          with an open seat they qualify for pays them more if joined now (v3Better); a second pass then places
  //          whoever is left wherever they qualify. So nobody sits out because of a crime that isn't there.
  //        - UNDERPERFORMING (stats.v3.under): a member placed in a crime paying under X.v3.alert % of their best
  //          crime's pay per day - the warning for the member / leaders, and they count in the tier spawn requests.
  //        - LOWEST ALLOWED: rule 6's cap stays as a setting (X.v3.minFloor %, 0 = off): below it they are not
  //          placed at all and wait for a spawn (the Mob Mentality case).
  //      The numbers come from the Team Builder's 🔬 Shadow settings (opts.shAlert / shMin / shPause).
  //   7. SEAT BY SEAT (Nov 16 2026, user's answer 5 "Remove that rule. When members join a high tier crime, the Join Now
  //      pay per day will begin to increase for new joins" + "This crime already exists. Why are players not being put
  //      into it?" - a 1/6 Stage Fright with two qualifying members waiting): today's rules only fill a crime when EVERY
  //      open seat can be filled and the whole team reaches the target; otherwise it is skipped and nobody is placed.
  //      Under V3, when that all-seats fill fails, the members who do qualify are placed anyway (v3Partial): heaviest
  //      role first, best member each (script, then rate), as long as the weighted average of the members in it + the
  //      new ones still reaches the target (the weakest new member is dropped until it does). Seats nobody qualifies
  //      for stay open.
  //   6. DROP CAP (Nov 16 2026, user: "Cap how low someone can drop to 50%"): however long a member has waited, they are
  //      never placed in a crime that pays them (join now) under minFloor x their BEST crime's pay per day (rung 0).
  const V3 = X.v3 && typeof X.v3 === "object" ? {minFloor: (X.v3.minFloor != null ? Math.max(0, Number(X.v3.minFloor) || 0) : 50) / 100, floor: (Number(X.v3.floor) || 0) / 100,
    alert: (X.v3.alert != null ? Math.max(0, Number(X.v3.alert) || 0) : 75) / 100, waitHours: Number(X.v3.waitHours) || 24, pauseHours: Number(X.v3.pauseHours) || 12} : null;
  const V2 = V3 ? {pauseHours: V3.pauseHours, slack: 0, moveHours: 0, minGain: O.safeOn === false ? 0 : Number(O.safeGain ?? 10) || 0,
                   cooldownHours: O.safeOn === false ? 0 : Number(O.safeCooldown ?? 24) || 0, backHours: O.safeOn === false ? 0 : Number(O.safeBack ?? 72) || 0}
    : X.v2 && typeof X.v2 === "object" ? {pauseHours: Number(X.v2.pauseHours) || 12, slack: Number(X.v2.slack) || 0, moveHours: Number(X.v2.moveHours) || 0,
    minGain: Number(X.v2.minGain) || 0, cooldownHours: Number(X.v2.cooldownHours) || 0, backHours: Number(X.v2.backHours) || 0} : null;
  // SAFEGUARDS ON THE LIVE PLAN TOO (Nov 16 2026, user: "Enable safeguards for the primary team builder. Add settings
  // to the Team Builder page under their own category to adjust where feasible."): the same four checks now also guard
  // today's rules - both kinds of move the live planner makes: a member asked to LEAVE a crime they sit in (planning
  // not started) and a RESERVED member (not joined yet) switched to another crime (JOIN NOW MOVES). Settings (Team
  // Builder -> ⚙️ Settings -> 🛡 Safeguards, opts): safeOn, safeGain (% more pay per day), safeCooldown (hours between
  // moves), safeBack (hours before they may be sent back), safeProtect (never out of a crime that needs them).
  // Active only when the caller passes X.moveLog (the Hub's live run does; drafts and tests without it are unchanged).
  // Under V2 (shadow) the V2 numbers are used. stats.safe_blocked = members each check held back.
  const SAFE = V2 ? {minGain: V2.minGain, cooldownHours: V2.cooldownHours, backHours: V2.backHours, protect: true, pauseHours: V2.pauseHours}
    : (X.moveLog && O.safeOn !== false ? {minGain: Number(O.safeGain ?? 10) || 0, cooldownHours: Number(O.safeCooldown ?? 24) || 0, backHours: Number(O.safeBack ?? 72) || 0,
                                          protect: O.safeProtect !== false, pauseHours: 12} : null);
  const moveLog = X.moveLog || {}, v2Blocked = {gain: new Set(), source: new Set(), cooldown: new Set()};   // members a safeguard held back (at least once)
  let curSlack = 0;                                        // V2: points under the target / role minimums for the crime being filled
  const TGT = () => O.target - curSlack;
  const floorOf = (crime, label) => {
    if (O.minZero == null || !(O.minZero < O.minRole)) return O.minRole - curSlack;
    return O.minZero + (O.minRole - O.minZero) * Math.min(1, wOf(crime, label)) - curSlack;
  };
  const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t0 = clock();

  // ---- Torn's crimes right now ----
  const inst = new Map(), busy = new Map();
  for (const c of X.crimes || []) {
    if (!c || c.id == null || (c.status !== "Recruiting" && c.status !== "Planning")) continue;
    inst.set(String(c.id), c);
    const full = (c.slots || []).length > 0 && (c.slots || []).every(x => x.user);   // every slot taken
    for (const sl of c.slots || []) if (sl.user) busy.set(Number(sl.user.id), {cid: String(c.id), label: slotLabel(sl), status: c.status,
      prog: Number(sl.user.progress) || 0, full});
  }
  // NOT PLANNING YET -> CAN BE MOVED (Nov 13 2026, user: "members who joined or were assigned, but are not actively
  // planning, can be reassigned to better jobs if available ... as long as their planning has not started yet"):
  // idleIn(pid) = the id of the crime (recruiting or planning) a member sits in with planning progress 0, else null. Such a member
  // may be planned into a crime that pays them more if they join now (step 3) - the role carries leave {crime_id,
  // crime, position}: they leave that crime in Torn, then join. Once their planning starts (progress > 0) they're
  // locked in and the move is dropped.
  // (Recruiting OR Planning: a crime that filled up and is planning again still has members waiting for their turn)
  // FULL CRIMES (Nov 13 2026, user: "If a crime is full, do not pull members from it."): a member in a crime with
  // every slot taken is never moved, planning started or not - only crimes with an open slot can lose a member
  const idleIn = pid => { const b = busy.get(Number(pid)); return b && !b.full && (b.status === "Recruiting" || b.status === "Planning") && !(b.prog > (V2 && V2.moveHours > 0 ? Math.min(99, V2.moveHours / 24 * 100) : 0)) ? b.cid : null; };   // V2: under moveHours of planning
  // ---- queue: members in a Planning crime that's ready within the window ----
  // QUEUE REMOVED (Nov 13 2026, user: "Remove the queue options"): members still in a crime are never queued for their
  // next one - QWIN is always 0 whatever opts.queueHours says (rotated crimes' join-order deadlines are separate)
  const NOW = X.now || Date.now(), QWIN = 0;
  const freeAt = new Map();                                // pid -> ms their current (Planning) crime is ready
  for (const c of inst.values()) if (c.status === "Planning" && c.ready_at)
    for (const sl of c.slots || []) if (sl.user) freeAt.set(Number(sl.user.id), c.ready_at * 1000);
  const queueable = pid => QWIN > 0 && freeAt.has(Number(pid)) && freeAt.get(Number(pid)) <= NOW + QWIN;   // 0 h = queue off
  // (Nov 15 2026, user: "Once a user is queued, the crime will not expire.") a crime that already has a member in it
  // no longer expires, so its expiry date doesn't limit who can be lined up for it
  const beforeExpiry = (pid, c) => !c || !c.expired_at || (c.slots || []).some(sl => sl.user) || freeAt.get(Number(pid)) < c.expired_at * 1000;
  // can this member be planned here? free now, or queueable (and free before the live crime `c` expires)
  const usable = (pid, c) => !busy.has(Number(pid)) || (queueable(pid) && beforeExpiry(pid, c)) || rotOk(pid, c);
  // ROTATION REMOVED (Nov 13 2026, user: "remove rotation crimes altogether. Crimes should be on a "as available"
  // basis."): ROT is always empty, so no crime is rotated, nobody still in a crime is reserved for one (rotOk is
  // false) and rotFill never runs. X.rotate is ignored. The rotation code below is kept for reference only.
  const ROT = new Set();
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
  // PAUSED CRIMES - CAP MAXED (Nov 13 2026, user: "Paused crimes should have their cap maxed out."): a recruiting crime
  // whose members have ALL finished their planning but that still has an open slot is stuck waiting for members. Its
  // open slots ignore the role cap (as if the cap were 100%): a member above the cap may take one. curPaused is set
  // while such a crime is being filled (step 2b takeover, step 3 fill) and checked by capped(); overQ (spawn
  // eligibility) treats a paused crime's slots as open to everyone over the cap.
  // JOIN NOW STILL DECIDES (Nov 13 2026, user: "Paused crime qualifiers should still prioritize "Join Now" pay per
  // day."): lifting the cap only makes them ELIGIBLE - crimes are still filled best join-now pay first (step 3), so a
  // member goes to the paused crime only when it pays them the most if they join now.
  const paused = c => !!c && c.status === "Recruiting" && (c.slots || []).some(sl => sl.user) && (c.slots || []).some(sl => !sl.user)
    && (c.slots || []).every(sl => !sl.user || (Number(sl.user.progress) || 0) >= 100);
  let curPaused = false;
  const capped = (pid, crime, rate) => v3Low(pid) || (capOn && !curPaused && O.cap < 100 && rate > O.cap && (capUp[pid] || 0) > (diffOf(crime) || 0));   // v3Low: the V3 pay floor (below)
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
  // SPAWN HOLDS REMOVED (Nov 13 2026, user: "Remove ... spawn alerts ... always fill existing crimes"): HOLD is always 0
  const HOLD = 0, NS = Math.max(0, Number(O.noShowHours ?? 6) || 0) * 3600e3;
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
  // MEMBER CHOICE (Nov 13 2026, user): "Pay per day should not be based solely on payout ÷ members ÷ days" (answer:
  // drop the pass-rate multiply - pay per day = payout ÷ members ÷ days, it only ORDERS THE CRIMES), "It should simply
  // be highest pay rate with qualifying pass rates", "No delay costs", "Script members who qualify are picked before
  // non script members, no score penalty, just a comparison and selection", "Free members who have qualifying pass
  // rates should be placed immediately", rotation: "Pick the best suited for the role".
  // So inside a crime the members are chosen by a plain ORDER, compared in turn:
  //   1. uses the OC script (when known) - 2. free now (not queued behind their current crime) - 3. highest pass rate
  // (the search maximises the number of script users, then free members, then the rates - the tier sizes below just
  // keep each comparison ahead of the next; nothing is a pay figure). Who QUALIFIES is unchanged: role minimum, cap,
  // the team reaching the success target. Crimes themselves are still taken best pay per member per day first.
  // The opportunity cost ("minus half their best crime elsewhere"), the delay cost and the rotation "sat out the
  // last run" priority are gone.
  const TIER_S = 1e9, TIER_F = 1e6;
  const tier = (pid, rate, queued) => (noScr(pid) ? 0 : TIER_S) + (queued ? 0 : TIER_F) + rate;
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
  // ---- V3 LADDER (shadow only - see the V3 header) ----
  const ladPay = n => payDay(n) / (rolesOf(n).length || 1);        // a crime type's normal pay per member per day
  const ladder = {}, waitLog = X.waitLog || {}, v3Blocked = new Set();
  if (V3) Object.keys(roster).forEach(pid => {
    ladder[pid] = Object.keys(cat).filter(n => crimeOk(n) && ladPay(n) > 0 && rolesOf(n).some(pos => { const r = rateOf(pid, n, pos); return r && r.rate >= floorOf(n, pos); }))
      .map(n => ({crime: n, pay: ladPay(n), diff: diffOf(n)})).sort((a, b) => b.pay - a.pay); });
  const v3Drop = pid => { if (!V3.floor) return 0;          // no pay floor (rule 8) = no rung drops
    const since = Number(waitLog[String(pid)]) || 0; return since ? Math.max(0, Math.floor((NOW - since) / (V3.waitHours * 3600e3))) : 0; };
  const v3Rung = pid => { const L = ladder[String(pid)] || []; return L.length ? L[Math.min(L.length - 1, v3Drop(pid))] : null; };
  let curInst = null;                                      // the recruiting crime being filled (set by the fill loops)
  // true = this crime pays the member less than floor x their reference rung if they join now -> not offered to them
  const v3Low = pid => { if (!V3 || !curInst) return false; const r = v3Rung(pid); if (!r) return false;
    const top = (ladder[String(pid)] || [])[0];             // DROP CAP: never under minFloor x their best crime
    if (each(curInst) + 1e-9 < Math.max(V3.floor * r.pay, top ? V3.minFloor * top.pay : 0)) { v3Blocked.add(Number(pid)); return true; }
    return v3Pass === 1 && v3Better(pid, curInst); };
  // BEST OPEN FIRST (rule 8): is another recruiting crime, with an open seat this member has the minimum rate for, paying
  // them at least 1% more if joined now? (first fill pass only - the second pass places whoever is left)
  let v3Pass = 0;
  const v3Open = () => [...inst.values()].filter(x => x.status === "Recruiting" && !X.disabled.has(x.name) && (x.slots || []).some(sl => !sl.user));
  const v3Better = (pid, c) => { const mine = each(c) * 1.01;
    return v3Open().some(x => String(x.id) !== String(c.id) && each(x) > mine && !teams.some(t => t.lock && String(t.crime_id) === String(x.id))
      && (x.slots || []).some(sl => { if (sl.user) return false; const q = rateOf(pid, x.name, slotLabel(sl)); return q && q.rate >= floorOf(x.name, slotLabel(sl)); })); };
  // DELAYS (Nov 2026): X.delays {pid: {n, long, hrs, runs}} - a member's crime delays over the last 30 days. The hours
  // of delay they're likely to cause per crime (hrs / crimes they took part in) hold up EVERYONE's payout, so the
  // cost charged against them = the team's pay per day x those hours / (24 x the crime's days) - a member who often
  // holds crimes up drops behind an equally good reliable one, most of all in the big, short crimes.
  const delayHrs = pid => { const d = (X.delays || {})[String(pid)]; return d && d.hrs ? d.hrs / Math.max(1, d.runs || 0, d.n || 0) : 0; };
  // NO DELAY COSTS (Nov 13 2026, user) - delayCost is no longer used in any placement; kept for reference only
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
  const meets = (roles, crime) => { const c = calcOf(roles, crime); if (c != null) { calcChecked++; return c >= TGT(); }
    const a = avgOf(roles, crime); return a != null && a >= TGT(); };
  // a full team the search found: rejected only when its calculated chance is KNOWN and below the target
  const calcBad = (roles, crime) => { const c = calcOf(roles, crime); if (c != null && c < TGT()) { calcRejected++; return true; } return false; };
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
          // PLANNING LOCK (Nov 13 2026, user: "Members who have started their planning phase should never be moved from
          // their crimes. Once they begin planning they are locked in."): a replacement only stands while the member in
          // the slot hasn't started planning (progress 0) - once they have, it's dropped and they stay
          if (o.replaces && Number(o.replaces.pid) === pid && o.pid != null && Number(o.pid) !== pid && roster[String(o.pid)] != null
              && !(Number(sl.user.progress) > 0) && usable(o.pid, c) && !assigned.has(Number(o.pid)))
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
        // a MOVING member (o.leave): kept while they still sit idle (progress 0) in the crime they're leaving, or once
        // they've left it and are free; started planning there -> dropped (locked in)
        const moving = o.leave && o.pid != null && String(idleIn(o.pid) || "") === String(o.leave.crime_id);
        // LOCKED TEAMS KEEP BUSY MEMBERS (Nov 15 2026, user: "Team Builder should allow placement of all members,
        // regardless of their crime status."): a leader's placement on a locked team stands even while the member is
        // still in another crime (shown as queued when that crime has a ready time) - only leaving the faction drops it
        if (o.pid != null && !o.existing && (!X.reshuffle || t.lock) && roster[String(o.pid)] != null && (t.lock || usable(o.pid, c) || moving) && !assigned.has(Number(o.pid))) {
          const k = Object.assign({}, o, {joined: false}); delete k.replaces; if (!moving) delete k.leave; return k;   // the old member has left: a normal open slot now
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
      // (Nov 15 2026) locked spawn teams keep members who are busy in another crime too - see LOCKED TEAMS KEEP BUSY MEMBERS
      t.roles = (t.roles || []).map(r => (r.pid != null && (roster[String(r.pid)] == null || (!t.lock && !usable(r.pid) && !O.includeBusy) || assigned.has(Number(r.pid))))
        ? Object.assign({}, r, {pid: null, name: "", rate: null, src: null}) : r);
      t.roles.forEach(r => { if (r.pid != null) take(r.pid); });
      teams.push(t);
    }
  }

  // ---- 2. spawn teams whose crime is now recruiting -> into that crime's open slots ----
  for (let ti = 0; ti < teams.length; ti++) {
    const t = teams[ti];
    if (t.kind !== "spawn" || t._gone) continue;
    // LOCKED SPAWN TEAMS BIND TOO (Nov 15 2026, user: "this crime is already spawned and I am already part of it. Why
    // is the assigned mission saying 'Waiting for this crime to be spawned'??"): a locked team used to stay "to spawn"
    // for ever. Now it moves into its crime once Torn has it recruiting - the instance one of its members has already
    // joined comes first; if the planner had made its own (unlocked) team for that instance, the locked team takes it
    // over. It stays locked, and keeps every member a leader placed (busy ones too - see LOCKED TEAMS KEEP BUSY MEMBERS).
    let c = null;
    if (t.lock) {
      const mine = new Set(t.roles.filter(r => r.pid != null).map(r => Number(r.pid)));
      const rec = [...inst.values()].filter(x => x.name === t.crime && x.status === "Recruiting");
      const lockedHas = id => teams.some(x => x !== t && !x._gone && x.lock && x.crime_id != null && String(x.crime_id) === String(id));
      c = rec.find(x => !lockedHas(x.id) && (x.slots || []).some(sl => sl.user && mine.has(Number(sl.user.id))))
        || rec.find(x => !claimed.has(String(x.id)) && (x.slots || []).some(sl => !sl.user));
      if (c && claimed.has(String(c.id))) teams.forEach(x => {                 // the planner's own team for it: released
        if (x !== t && !x._gone && !x.lock && x.crime_id != null && String(x.crime_id) === String(c.id)) {
          x._gone = true; (x.roles || []).forEach(r => { if (r.pid != null && !r.existing) assigned.delete(Number(r.pid)); }); } });
    } else c = [...inst.values()].find(x => x.name === t.crime && x.status === "Recruiting" && !claimed.has(String(x.id)) && (x.slots || []).some(sl => !sl.user));
    if (!c) continue;
    const inC = new Set((c.slots || []).filter(sl => sl.user).map(sl => Number(sl.user.id)));
    const want = t.roles.filter(r => r.pid != null && !inC.has(Number(r.pid)) && (t.lock || usable(r.pid, c)));
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
    teams[ti] = {id: t.id, crime: c.name, difficulty: c.difficulty ?? t.difficulty, kind: "live", crime_id: c.id, lock: !!t.lock, roles};
    claimed.add(String(c.id));
  }
  for (let i = teams.length - 1; i >= 0; i--) if (teams[i]._gone) teams.splice(i, 1);   // teams a locked team took over

  // ---- B&B: best members for some open slots of one crime ----
  //   slots [{label}], fixedSum / n = the rates already in the crime; pool = [{pid, soft}] (soft = in a spawn team)
  //   maximise sum(score) with (fixedSum + sum WEIGHTED rates) / n >= target; each rate >= minRole, not capped
  //   (fixedSum = the weighted sum of the rates already in it; scores get the weighted rate - a member's share of
  //   the team's success, so a strong member counts for more in a heavy role)
  // leafOk(pick) (optional): false = this combination is rejected (CALCULATED SUCCESS below the target) - the search
  // carries on to the next-best one
  function fillSlots(crime, slots, fixedSum, n, pool, scoreOf, nodeCap, leafOk) {
    const need = TGT() * n - fixedSum - 1e-9;
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
      curPaused = paused(c);                               // PAUSED CRIMES: no cap in this crime's seats
      curInst = c || null;                                 // V3 floor
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
    curPaused = false;
  }

  // ---- 3. fill open slots of recruiting crimes; skip crimes that can't reach the target ----
  // ORDER (Nov 2026, revised): highest pay per MEMBER per day first; among crimes that pay the same (e.g. several
  // instances of one crime) the one already BUILT (members in it), most-filled first, goes first - so a half-built
  // crime is finished before a fresh copy of it, but never ahead of a better-paying crime.
  const filled = c => { const sl = c.slots || []; return sl.length ? sl.filter(x => x.user).length / sl.length : 0; };
  // V2 urgency: 2 = paused now, 1 = will pause within pauseHours (has members + open seats and Torn's ready_at - when
  // the members in it finish planning - falls inside the window), 0 = neither
  const urgRaw = (c, hours) => { if (!c || !(c.slots || []).some(sl => sl.user)) return 0;
    if (paused(c) || (c.ready_at && c.ready_at * 1000 <= NOW)) return 2;
    return c.ready_at && c.ready_at * 1000 - NOW <= hours * 3600e3 ? 1 : 0; };
  const urgency = c => V2 ? urgRaw(c, V2.pauseHours) : 0;
  // SAFEGUARDS: may member `pid` be moved out of crime xc into crime c? true = held back (and counted)
  const safeBlock = (pid, xc, c) => {
    if (!SAFE) return false;
    if (SAFE.minGain > 0 && !(each(xc) * (1 + SAFE.minGain / 100) < each(c))) { v2Blocked.gain.add(pid); return true; }
    if (SAFE.protect && (urgRaw(xc, SAFE.pauseHours) > 0 || filled(xc) > filled(c))) { v2Blocked.source.add(pid); return true; }
    const L = moveLog[String(pid)];
    if (L && ((SAFE.cooldownHours > 0 && NOW - Number(L.at) < SAFE.cooldownHours * 3600e3 && String(L.to) !== String(c.id))
           || (SAFE.backHours > 0 && NOW - Number(L.at) < SAFE.backHours * 3600e3 && String(L.from) === String(c.id)))) { v2Blocked.cooldown.add(pid); return true; }
    return false;
  };
  const each = c => payDayInst(c) / ((c.slots || []).length || 1);   // TIME IN THE CRIME: this instance's days
  const recruiting = [...inst.values()].filter(c => c.status === "Recruiting" && (c.slots || []).some(sl => !sl.user))
    .sort((a, b) => ROT_ON.has(String(b.id)) - ROT_ON.has(String(a.id))
      || (V2 ? urgency(b) - urgency(a) || (V3 ? 0 : filled(b) - filled(a)) : 0)       // V2: paused, about to pause, then the fullest
      || each(b) - each(a) || filled(b) - filled(a) || (b.difficulty || 0) - (a.difficulty || 0));   // rotated first
  // WHO fills a slot: MEMBER CHOICE (see tier() above) - script users, then free members, then the highest pass rate.
  // (The old "minus half of their best crime elsewhere" opportunity cost was removed Nov 13 2026, user.)
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
        tier(p.pid, rate, p.q), 20000, leafOk);              // MEMBER CHOICE: script, free, best rate (no "sat out" mix)
      if (!best) return null;
      const order = best.slice().sort((a, b) => fOf(a.pid) - fOf(b.pid));
      const late = order.find((b, i) => fOf(b.pid) > NOW + base + PLAN_MS * i + 600e3);   // 10 min slack
      if (!late) return best;
      ban.add(late.pid);
    }
    return null;
  }
  // V3 SEAT BY SEAT: the best member for each open seat (heaviest role first), kept only while the members in the crime
  // + the new ones reach the target on their weighted average. -> an array aligned with `open` (null = seat left open),
  // or null when nobody can be placed.
  const v3Partial = (c, roles, open, fixed, pool) => {
    const used = new Set(), pick = open.map(() => null);
    const order = open.map((i, k) => k).sort((a, b) => wOf(c.name, roles[open[b]].position) - wOf(c.name, roles[open[a]].position));
    for (const k of order) { const pos = roles[open[k]].position; let b = null;
      pool.forEach(p => { if (used.has(p.pid)) return; const r = rateOf(p.pid, c.name, pos);
        if (!r || r.rate < floorOf(c.name, pos) || capped(p.pid, c.name, r.rate)) return;
        const sc = tier(p.pid, r.rate, false); if (!b || sc > b.sc) b = {pid: p.pid, rate: r.rate, src: r.src, sc}; });
      if (b) { pick[k] = b; used.add(b.pid); } }
    for (;;) {
      if (!pick.some(Boolean)) return null;
      const a = avgOf(fixed.concat(pick.map((b, k) => b ? {position: roles[open[k]].position, pid: b.pid, rate: b.rate} : null).filter(Boolean)), c.name);
      if (a != null && a >= TGT()) return pick;
      let w = -1; pick.forEach((b, k) => { if (b && (w < 0 || b.rate < pick[w].rate)) w = k; }); pick[w] = null;   // drop the weakest new member
    }
  };
  const fillOrder = new Map(recruiting.map((c, i) => [String(c.id), i]));   // V2: this crime's place in the fill order
  const fillRecruiting = () => { for (const c of recruiting) {
    curPaused = paused(c);                                 // PAUSED CRIMES: cap maxed for this crime (reset below)
    curInst = c;                                           // V3 floor: what joining THIS crime now pays
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
    // JOIN NOW MOVES (Nov 13 2026, user: "When assigning members, go based on the "Join Now" rate of pay. This should
    // help fill crimes that are already actively planning, and should prioritize pay per day for members." + answer:
    // a reserved member who hasn't joined is MOVED when another recruiting crime pays them more if they join now).
    // Crimes are filled best join-now pay per member per day first (each() above), so a member RESERVED (planned, not
    // joined, not queued, not a leader replacement) in a recruiting crime that pays less if joined now is also a
    // candidate here; if picked, their old seat is emptied and refilled when the loop reaches that crime. A 1% margin
    // stops members flipping back and forth between two crimes whose join-now pay is practically the same. Locked
    // teams and rotated crimes are never pulled from. Active crimes still all come before new spawns (user's answer).
    const movePool = [], moveFrom = new Map();
    teams.forEach(x => {
      if (x.kind !== "live" || x.lock || String(x.crime_id) === String(c.id) || ROT_ON.has(String(x.crime_id))) return;
      const xc = inst.get(String(x.crime_id)); if (!xc || !(each(xc) * 1.01 < each(c))) return;
      // V2: crimes aren't filled in pay order any more, so a seat emptied in a crime the loop has ALREADY passed (an
      // urgent / fuller one) would never be refilled - reservations are only pulled from crimes still to come
      if (V2 && (fillOrder.get(String(x.crime_id)) ?? 1e9) < (fillOrder.get(String(c.id)) ?? 0)) return;
      x.roles.forEach((r, ri) => { if (r.pid == null || r.existing || r.joined || r.replaces || busy.has(Number(r.pid)) || nsBan.has(Number(r.pid))) return;
        if (safeBlock(Number(r.pid), xc, c)) return;         // SAFEGUARDS: a reserved member isn't switched around either
        moveFrom.set(Number(r.pid), {t: x, ri}); movePool.push({pid: Number(r.pid), soft: false}); });
    });
    // ... and members SITTING in another crime (recruiting or planning) that pays them less if joined now, who haven't started
    // planning there (idleIn) - re-evaluated every run. Not from a crime with a locked team.
    const idleFrom = new Map();
    for (const [pid0] of busy) {
      const pid = Number(pid0), cid = idleIn(pid);
      if (!cid || cid === String(c.id) || assigned.has(pid) || nsBan.has(pid) || roster[String(pid)] == null || moveFrom.has(pid)) continue;
      const xc = inst.get(cid); if (!xc || !(each(xc) * 1.01 < each(c))) continue;
      if (teams.some(x => x.lock && String(x.crime_id) === cid)) continue;
      if (safeBlock(pid, xc, c)) continue;                  // SAFEGUARDS (see the header)
      idleFrom.set(pid, {crime_id: xc.id, crime: xc.name, position: busy.get(pid).label}); movePool.push({pid, soft: false});
    }
    const pool = freePool().concat(softPool()).concat(movePool).filter(p => !nsBan.has(p.pid));
    const k = payDayInst(c) / roles.length / 100;      // (unused for choice - pass rates never enter pay per day, Nov 13 2026)
    // CALCULATED SUCCESS: the whole crime with these new members (always full - every open slot is filled)
    const leafOk = pick => !calcBad(roles.map((r, i) => { const j = open.indexOf(i); return j < 0 ? r : {position: r.position, pid: pick[j].pid, rate: pick[j].rate}; }), c.name);
    let best = null;
    if (ROT_ON.has(String(c.id))) best = rotFill(c, roles, open, fixedSum, pool, k, nsBan, leafOk);
    if (!best) best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool,
                           (p, rate) => tier(p.pid, rate, false), 20000, leafOk);   // MEMBER CHOICE
    // QUEUE: nobody free can fill it to the target -> let members finishing their crime soon in, as few as possible
    if (!best && !ROT_ON.has(String(c.id))) {
      const qpool = Object.keys(roster).map(Number).filter(p => busy.has(p) && !assigned.has(p) && queueable(p) && beforeExpiry(p, c) && !nsBan.has(p))
        .map(pid => ({pid, soft: false, q: true}));
      if (qpool.length) best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool.concat(qpool),
                           (p, rate) => tier(p.pid, rate, p.q), 20000, leafOk);     // MEMBER CHOICE (free before queued)
    }
    // V2: an urgent crime nobody can fill by the normal rules is tried once more, `slack` points under the target
    // and the role minimums (the pool, cap and member choice are the same)
    let usedSlack = 0;
    if (!best && V2 && V2.slack > 0 && urgency(c) > 0 && !ROT_ON.has(String(c.id))) {
      curSlack = V2.slack;
      best = fillSlots(c.name, open.map(i => ({label: roles[i].position})), fixedSum, roles.length, pool, (p, rate) => tier(p.pid, rate, false), 20000, leafOk);
      if (best) usedSlack = V2.slack;
      curSlack = 0;
    }
    // V3 SEAT BY SEAT: no full fill -> place the members who qualify, leave the other seats open (see the V3 header)
    if (!best && V3 && !ROT_ON.has(String(c.id))) best = v3Partial(c, roles, open, fixed, pool);
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
      if (!b) return;                                      // V3 seat by seat: this seat stays open
      const i = open[k];
      roles[i] = {position: roles[i].position, pid: b.pid, name: nameOf(b.pid), rate: b.rate, src: b.src};
      if (idleFrom.has(b.pid)) roles[i].leave = idleFrom.get(b.pid);   // must leave the crime they're idle in first
      // a member moved for a better join-now rate: empty their old reserved seat (refilled when that crime's turn comes)
      const mv = moveFrom.get(Number(b.pid));
      if (mv) { const o = mv.t.roles[mv.ri]; mv.t.roles[mv.ri] = {position: o.position, pid: null, name: "", rate: null}; }
      // a member taken from a spawn team: empty their old spawn role
      teams.forEach(x => { if (x.kind === "spawn") x.roles.forEach(r => { if (Number(r.pid) === b.pid) Object.assign(r, {pid: null, name: "", rate: null, src: null}); }); });
      take(b.pid);
    });
    if (!t) { t = {id: uid(), crime: c.name, difficulty: c.difficulty ?? diffOf(c.name), kind: "live", crime_id: c.id, lock: false, roles}; teams.push(t); claimed.add(String(c.id)); }
    else t.roles = roles;
    if (V2) { t.urgency = urgency(c); if (usedSlack) t.slack = usedSlack; }   // V2 report: why this crime came first / filled below the floor
  } curPaused = false; curInst = null; };
  curInst = null;
  if (V3) { v3Pass = 1; fillRecruiting(); v3Pass = 2; skipped.length = 0; }   // V3 rule 8: best open crime first, then everyone left
  fillRecruiting();

  // ---- 3b. SPAWN HOLDS (see the header) ----
  const density = c => payDay(c) / (rolesOf(c).length || 1);
  const openRecruitingNames = new Set(recruiting.filter(c => (c.slots || []).some(sl => !sl.user)).map(c => c.name));
  if (HOLD > 0) {
    const resv = new Map();                                // pid -> the live role they're reserved in (not joined)
    teams.forEach(t => { if (t.kind === "live" && !t.lock) t.roles.forEach(r => { if (r.pid != null && !r.existing && !r.replaces) resv.set(Number(r.pid), {t, r}); }); });
    const liveDen = t => { const c = inst.get(String(t.crime_id)); return c ? payDayInst(c) / (t.roles.length || 1) : density(t.crime); };   // TIME IN THE CRIME
    // what a pulled member is planned for now: their reserved crime's MAX pay per member per day (no expected pay)
    const curPay = pid => { const x = resv.get(pid); return x ? liveDen(x.t) : 0; };   // not planned anywhere = 0
    const cands = Object.keys(cat).filter(n => crimeOk(n) && !openRecruitingNames.has(n) && !(holdLog[n] > NOW)
      && !teams.some(t => t.kind === "spawn" && t.hold && t.crime === n)).sort((a, b) => density(b) - density(a));
    let pulled = false;
    for (const C of cands) {
      const roles = rolesOf(C), n = roles.length || 1, k = payDay(C) / n / 100;
      const pool = Object.keys(roster).map(Number).filter(p => resv.has(p) ? liveDen(resv.get(p).t) < density(C) : (!assigned.has(p) && usable(p)));
      if (pool.length < n) continue;
      const best = fillSlots(C, roles.map(l => ({label: l})), 0, n, pool.map(pid => ({pid})),
        (p, rate) => tier(p.pid, rate, busy.has(p.pid)), 40000,   // MEMBER CHOICE: script, free, best rate
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

  // ---- 4. spawn teams ONLY for members whose pass rates are too high for every open crime ----
  // SPAWN ONLY WHEN OVERQUALIFIED (Nov 13 2026, user: "The only time a spawn alert should appear is if members pass rate
  // is too high for any of the available crimes. Outside of that, always fill existing crimes."): a member left over
  // after the recruiting crimes were filled goes into a spawn team only when every open slot of every recruiting,
  // switched-on crime they qualify for (rate at the role's floor) is closed to them by the role cap (rate above
  // opts.cap with a harder crime they pass) - and there's at least one such slot. A member left over for any other
  // reason (the crime couldn't reach the target, someone better took the slot, no recruiting crime at all) gets no
  // spawn team. Leaders' locked spawn teams are kept as they are.
  const openNow = [...inst.values()].filter(c => c.status === "Recruiting" && !X.disabled.has(c.name) && (c.slots || []).some(sl => !sl.user));
  const overQ = pid => { let high = false;
    if (V3) return false;                                  // V3: no spawn teams for crime types - tier requests instead (stats.v3)
    for (const c of openNow) for (const sl of c.slots || []) { if (sl.user) continue;
      const pos = slotLabel(sl), r = rateOf(pid, c.name, pos);
      if (!r || r.rate < floorOf(c.name, pos)) continue;
      if (paused(c) || !capped(pid, c.name, r.rate)) return false;   // a paused crime has no cap
      high = true; }
    return high; };
  teams.forEach(t => { if (t.kind === "spawn" && !t.lock) t.roles.forEach(r => {
    if (r.pid != null && !overQ(r.pid)) { assigned.delete(Number(r.pid)); Object.assign(r, {pid: null, name: "", rate: null, src: null}); } }); });
  // existing spawn teams: refill their empty roles (only if the team then reaches the target), else drop the empties
  for (const t of teams) {
    if (t.kind !== "spawn" || t.lock) continue;
    const open = t.roles.map((r, i) => r.pid == null ? i : -1).filter(i => i >= 0);
    if (!open.length) continue;
    const fixed = t.roles.filter(r => r.pid != null), fixedSum = wSum(t.crime, fixed);
    const pool = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p) && overQ(p)).map(pid => ({pid, soft: false}));
    const best = fillSlots(t.crime, open.map(i => ({label: t.roles[i].position})), fixedSum, t.roles.length, pool, (p, rate) => tier(p.pid, rate, busy.has(p.pid)), 20000,   // MEMBER CHOICE: script, free, best rate
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
  const pool0 = Object.keys(roster).map(Number).filter(p => (O.includeBusy || usable(p)) && !assigned.has(p) && overQ(p));   // free + too high for every open crime
  // (the spawn optimizer's "opp" opportunity cost was removed Nov 13 2026 - MEMBER CHOICE above; the alpha runs only
  //  vary the crime order now)
  // one spawn team for a crime type - MEMBER CHOICE (script, free, best rate); cost = steal step (Infinity = can't move)
  function teamFor2(crime, pool, alpha, cost) {
    const roles = rolesOf(crime); if (!roles.length) return null;
    const k = payDay(crime) / roles.length / 100;
    const best = fillSlots(crime, roles.map(l => ({label: l})), 0, roles.length, [...pool].map(pid => ({pid: Number(pid)})),
      // MEMBER CHOICE: script, free, best rate. cost (the steal step): Infinity = can't be taken from their team
      (p, rate) => tier(p.pid, rate, busy.has(p.pid)) - (cost && !isFinite(cost(p.pid)) ? 1e15 : 0), 40000,
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
    // (the old "capOn = false" pass - capped members into easier spawn crimes - was removed Nov 13 2026: spawn teams
    //  exist only for members the cap keeps out of the open crimes, so they go to crimes they're not capped in)
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
        // MEMBER CHOICE (Nov 13 2026): script users first, then free members, then the highest pass rate
        const pay = expPay(tt), ns = noScr(pid), q = busy.has(pid), sc = tier(pid, r.rate, q);
        if (!b || sc > b.sc) b = {c: {pid, name: nameOf(pid), rate: r.rate, src: r.src}, pay, ns, sc}; });
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
  // live teams ordered by JOIN NOW pay per member per day (Nov 13 2026), spawn teams by the crime's normal rate
  const showPay = t => { const c = t.kind === "live" ? inst.get(String(t.crime_id)) : null; return c ? each(c) : density(t.crime); };
  teams.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "live" ? -1 : 1) || showPay(b) - showPay(a) || (b.difficulty || 0) - (a.difficulty || 0));
  const sig = ts => JSON.stringify(ts.map(t => [t.id, t.crime_id, t.lock, t.hold ? 1 : 0, Object.keys(t.noshow || {}).length, t.roles.map(r => [r.position, r.pid, r.joined ? 1 : 0, r.queued ? 1 : 0])]));
  const changed = sig(teams) !== sig(X.prev || []);
  // TEAM SUCCESS for display (Nov 13 2026 - the Discord recruiting post / assignment pings): the calculated chance
  // (succ_calc) when the team is full and it's known, else the weighted average of the members placed so far
  teams.forEach(t => { const c = calcOf(t.roles, t.crime), a = c != null ? c : avgOf(t.roles.filter(r => r.pid != null), t.crime);
    t.succ = a == null ? null : Math.round(a * 10) / 10; t.succ_calc = c != null; });
  // ---- V3: who is waiting for a spawn, the tier requests for leaders, and the wait clock for the next run ----
  let v3 = undefined;
  if (V3) {
    const tierOf = d => { const x = Math.max(1, Math.min(10, Math.round(Number(d) || 1))), lo = x % 2 ? x : x - 1; return lo + "-" + (lo + 1); };
    const waiting = [], norates = [], wl = {};
    Object.keys(roster).map(Number).forEach(pid => {
      if (busy.has(pid) || assigned.has(pid)) return;       // in a crime, or placed by this plan: not waiting
      const L = ladder[String(pid)] || [];
      if (!L.length) { norates.push({pid, name: nameOf(pid)}); return; }   // "Don't place members when there is no recorded rates"
      const since = Number(waitLog[String(pid)]) || NOW, r = v3Rung(pid); wl[pid] = since;
      // WHY NOT (Nov 16 2026, user: "Why are there open crimes that aren't being filled by these members?"): for every
      // recruiting crime with an open seat, the first thing that keeps this member out - shown on the 🔬 Shadow tab.
      //   norate = no recorded rate for any open role · lowrate = best rate under the role minimum (v = rate, min)
      //   pay = joining now pays under the floor (v = % of their best crime, pay) · cap = over the pass-rate ceiling
      //   team = they qualify, but the team's average with them stays under the target, or another member was chosen
      const need = Math.max(V3.floor * r.pay, V3.minFloor * L[0].pay);
      const why = [...inst.values()].filter(c => c.status === "Recruiting" && !X.disabled.has(c.name) && (c.slots || []).some(sl => !sl.user)).map(c => {
        let bestR = null, bestMin = null, any = false;
        (c.slots || []).forEach(sl => { if (sl.user) return; const pos = slotLabel(sl), q = rateOf(pid, c.name, pos); if (!q) return; any = true;
          if (bestR == null || q.rate - floorOf(c.name, pos) > bestR - bestMin) { bestR = q.rate; bestMin = Math.round(floorOf(c.name, pos)); } });
        const o = {crime: c.name, id: c.id, pay: Math.round(each(c))};
        if (!any) return Object.assign(o, {r: "norate"});
        if (bestR < bestMin) return Object.assign(o, {r: "lowrate", rate: bestR, min: bestMin});
        if (each(c) + 1e-9 < need) return Object.assign(o, {r: "pay", pct: Math.round(100 * each(c) / L[0].pay)});
        if (!paused(c) && O.cap < 100 && bestR > O.cap && (capUp[pid] || 0) > (diffOf(c.name) || 0)) return Object.assign(o, {r: "cap", rate: bestR});
        return Object.assign(o, {r: "team", rate: bestR});
      }).sort((a, b) => b.pay - a.pay);
      waiting.push({pid, name: nameOf(pid), since, why, best: L[0].crime, best_pay: Math.round(L[0].pay), rung: r.crime, rung_pay: Math.round(r.pay),
                    dropped: Math.min(L.length - 1, v3Drop(pid)), tier: tierOf(r.diff), floor_blocked: v3Blocked.has(pid)}); });
    // UNDERPERFORMING (rule 8): placed by this plan in a crime paying under alert % of their best crime's pay per day
    const under = [];
    teams.forEach(t => { if (t.kind !== "live") return; const c = inst.get(String(t.crime_id)); if (!c) return;
      t.roles.forEach(r => { if (r.pid == null || r.existing) return; const top = (ladder[String(r.pid)] || [])[0]; if (!top || !(top.pay > 0)) return;
        const pay = each(c); if (pay + 1e-9 >= V3.alert * top.pay) return;
        under.push({pid: Number(r.pid), name: nameOf(r.pid), since: NOW, crime: c.name, id: c.id, role: r.position, pay: Math.round(pay), pct: Math.round(100 * pay / top.pay),
                    best: top.crime, best_pay: Math.round(top.pay), tier: tierOf(top.diff)}); }); });
    const byTier = {};
    waiting.concat(under).forEach(w => { (byTier[w.tier] = byTier[w.tier] || []).push(w); });
    const requests = Object.keys(byTier).sort((a, b) => parseInt(b) - parseInt(a)).map(t => ({tier: t, members: byTier[t].map(w => w.pid), longest: Math.min(...byTier[t].map(w => w.since))}));
    v3 = {floor: Math.round(V3.floor * 100), minFloor: Math.round(V3.minFloor * 100), alert: Math.round(V3.alert * 100), under, waitHours: V3.waitHours, pauseHours: V3.pauseHours, waiting, requests, norates, wait_log: wl, floor_blocked: v3Blocked.size};
  }
  return {teams, changed, stats: {v3, v2_blocked: V2 ? {gain: v2Blocked.gain.size, source: v2Blocked.source.size, cooldown: v2Blocked.cooldown.size} : undefined,
    safe_blocked: SAFE ? {gain: v2Blocked.gain.size, source: v2Blocked.source.size, cooldown: v2Blocked.cooldown.size} : undefined,
    live: teams.filter(t => t.kind === "live").length, spawn: teams.filter(t => t.kind === "spawn").length,
    pay: teams.reduce((s, t) => s + (avgOf(t.roles, t.crime) == null ? 0 : payDay(t.crime)), 0), ms: Math.round(clock() - t0), skipped,
    holds: teams.filter(t => t.hold).length, hold_log: holdLog,
    // CALCULATED SUCCESS: how many team checks used a known calculated chance / full teams rejected for being below the target
    calc_checked: calcChecked, calc_rejected: calcRejected,
    // TIME IN THE CRIME: {crime_id: crime type's days / days for whoever joins now} - scales a live team's pay per day
    inst_mult: Object.fromEntries([...inst.values()].filter(c => c.status === "Recruiting").map(c => {
      const v = X.payOf(c.name); return [String(c.id), v && v.days ? +(v.days / instDays(c)).toFixed(3) : 1]; })),
    // JOIN NOW (Nov 12 2026): {crime_id: days to payout for whoever joins now} - every recruiting crime
    inst_days: Object.fromEntries([...inst.values()].filter(c => c.status === "Recruiting").map(c => [String(c.id), +instDays(c).toFixed(3)])),
    // HB SUITE 0.2.5 (Nov 14 2026, user: "Pay per day should show the maximum ... based off the "Join Now" amount"): the
    // same figures for PLANNING crimes (every seat taken) - pay per day from now until payout for the members in them.
    // Kept apart from inst_mult so recruiting-only users (/oc/plan join_now, team pay) are unchanged.
    plan_mult: Object.fromEntries([...inst.values()].filter(c => c.status === "Planning").map(c => {
      const v = X.payOf(c.name); return [String(c.id), v && v.days ? +(v.days / instDays(c)).toFixed(3) : 1]; })),
    plan_days: Object.fromEntries([...inst.values()].filter(c => c.status === "Planning").map(c => [String(c.id), +instDays(c).toFixed(3)])),
    rotation: Object.keys(poolOf).map(n => ({crime: n, pool: poolOf[n].size, seats: rolesOf(n).length,
      max: Math.max(1, Math.floor(poolOf[n].size / (rolesOf(n).length || 1))),
      live: [...ROT_ON].filter(id => (inst.get(id) || {}).name === n).length}))}};
}

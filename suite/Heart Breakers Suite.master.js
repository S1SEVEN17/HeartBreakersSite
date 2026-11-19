// ==UserScript==
// @name         Heart Breakers Suite
// @namespace    S1SEVEN.suite
// @version      0.2.89
// @description  One centralized "Suite" of scripts for Heart Breakers.
// @author       Chris5295 [974757]
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      hb-gate.heartbreakers.workers.dev
// @connect      api.torn.com
// @connect      ffscouter.com
// @run-at       document-idle
// @noframes
// @homepageURL  https://greasyfork.org/en/scripts/605562-heart-breakers-suite
// @supportURL   https://greasyfork.org/en/scripts/605562-heart-breakers-suite/feedback
// @downloadURL  https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.user.js
// @updateURL    https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.meta.js
// ==/UserScript==

/*
 * =====================================================================
 *  HEART BREAKERS SUITE (userscript) — maintainer notes (keep for future updates)
 * =====================================================================
 *  v0.2.89 (Nov 19 2026) - 📡 Smarter syncing: the Hub tells your Suite when something changes; shared Torn reads; one check-in for your OC tile + alerts; Loans use the Hub's copy.
 *  v0.2.88 (Nov 18 2026) - 📡 Fewer API calls: your OC pass rates are re-read every 6 hours (was hourly), plus at once when a crime spawns, your crime changes or a seat opens while you're free.
 *  v0.2.87 (Nov 18 2026) - 📡 Your OC check also runs while the Suite is minimized, so your pass rates are shared soon after your crime changes.
 *  v0.2.86 (Nov 18 2026) - 🔑 Signing in without an API key (0.2.83-0.2.84) removed for now - add your key in ⚙.
 *  v0.2.85 (Nov 18 2026) - ⛓ 🎯 Target during a war: one of the 5 easiest enemies who can be hit right now (fair fight
 *          2.0 or lower, from your FFScouter key); otherwise the random target as before.
 *  v0.2.84 (Nov 18 2026) - 🔑 Without an API key: fixed the Suite not recognising you (it looked before Torn had drawn
 *          your name).
 *  v0.2.83 (Nov 18 2026) - 🔑 Without an API key the Suite now recognises you from Torn's page and shares your OC pass
 *          rates when you open the faction crimes page.
 *  v0.2.82 (Nov 18 2026) - ⛓ Chain: fixed the count sometimes being read as the next bonus (e.g. 10 / 10 while the
 *          chain was at 1) from Torn's faction chain box.
 *  v0.2.81 (Nov 17 2026) - 📣 Leaders: the Notify list is easier to read - short one-line rows, members who still
 *          need a message first, and those already notified folded away.
 *  v0.2.80 (Nov 17 2026) - 🧰 Armory stock is read the moment a leader opens the Stock section, a new "Check now"
 *          button reads it on demand, and the Hub's background read is every 3 minutes (was 15).
 *  v0.2.79 (Nov 17 2026) - 🧰 Unused loans now update on their own: the Hub reads the loaned utilities every 15 minutes
 *          (and right away when someone leaves an item seat or a crime finishes), and a Loan / Retrieve made on
 *          Armoury → Utilities shows for every loan staff member within seconds. ↻ Refresh still checks instantly.
 *  v0.2.78 (Nov 17 2026) - 🧰 Leaders: new Armory tab - stock of the key items (Xanax, first aid kits, morphine, ipecac,
 *          blood bags, beer) against the minimum leadership sets, with the restock cost at Torn's market value, and a
 *          line on Home when something runs low (each leader can switch that line off). 🗜 Compact mode is now the
 *          default layout for everyone; ⚙ → Display still switches it.
 *  v0.2.77 (Nov 17 2026) - 🏷 Leaders: 📡 Sharing CPR rates now shows each member's Suite version (amber when it is
 *          older than yours). Your Suite reports its version to the Hub with its regular check-in.
 *  v0.2.76 (Nov 17 2026) - 📈 Your OC pass rates are now sent when something can have changed them (a new crime
 *          appears, you join or leave a crime, your crime completes) plus once an hour, instead of every 5 minutes -
 *          about 10 fewer Torn calls an hour on your key.
 *  v0.2.75 (Nov 16 2026) - 📜 Your chain summary and your OC summary + latest crimes are now only on the History tab
 *          (they were shown twice); the Chain and OC tabs end with a line pointing there.
 *  v0.2.74 (Nov 16 2026) - 🕵 Torn's crimes page: crimes leadership has disabled are hatched red and their Join buttons
 *          can't be pressed (nothing else is blocked), and the crime you're assigned to sits at the top of the list.
 *  v0.2.73 (Nov 16 2026) - 🤝 Recruit (Torn PDA): the pool and scout list are now kept in the device's larger
 *          database instead of the small page storage that filled up and silently stopped saving. Unsaved changes
 *          are written when you leave a page, and the Recruit tab says so if a save ever fails.
 *  v0.2.72 (Nov 16 2026) - 📱 Torn PDA: Compact mode is now on by default, and is switched on once for Suites that
 *          were already installed. You can still turn it off in ⚙ → Display.
 *  v0.2.71 (Nov 16 2026) - 📡 Fresher data with fewer repeated reads: the Suite feeding the crime list now also passes
 *          the war + chain state (every minute) and the completed crimes (every 3 minutes) to the Hub; the ⚔ War tab
 *          shares one enemy-faction reading between everyone who has it open (status updated about every 30 s;
 *          FFScouter scores are read once per war, as the enemy roster is locked); your pass
 *          rates are sent straight away when your own crime changes. The Hub's own 3-minute check stays as the backup.
 *  v0.2.70 (Nov 16 2026) - 🕵 Joining or leaving a crime now reaches the Hub within seconds: after you press a
 *          button on Torn's crimes page the Suite reads your own crime (own key, 1 call) and tells the Hub if it
 *          changed, so the plan and other members' views update without waiting for the next crime list.
 *  v0.2.69 (Nov 16 2026) - 🕵 Faster crime updates: one member's Suite at a time now reads the faction's crimes every
 *          minute (own key, 1 call a minute, never sent anywhere) and passes the list to the Hub, which re-plans as soon
 *          as something changes. Another Suite takes over if that one goes quiet; the Hub's own 3-minute check stays
 *          as the backup. Runs under ⚙ → Share from this script → OC pass rates; needs a key with Faction API access.
 *  v0.2.68 (Nov 16 2026) - 🕵 OC tab: new "Recently completed" tile - the last 5 finished crimes with their total
 *          payout and whether they've been paid out. An unpaid crime stays listed until it is paid; Heart Stoppers,
 *          HR and leaders see a red "Not paid" tag once it has waited over an hour.
 *  v0.2.67 (Nov 16 2026) - Reliability note updated: a termed war now counts in your favour when you took part in it,
 *          and still never against you (the score itself comes from the Hub).
 *  v0.2.66 (Nov 16 2026) - 📢 ANNOUNCEMENTS: leaders can send a message tile to Suite users (yellow = announcement, can
 *          be dismissed; red = urgent, stays until it expires or a leader deletes it). Leaders: ••• More → 📢 Announce
 *          (or the Hub site). Pick who sees it: everyone, the chain queue, leadership or positions.
 *  v0.2.65 (Nov 16 2026) - OC assignments: when your assignment is moved to a different crime, the 📌 tile and the OC
 *          tab say "changed from <crime>" - no new alert. (The Hub now waits 30 minutes before showing a new assignment.)
 *  v0.2.64 (Nov 16 2026) - ⚔ WAR tab rebuilt: the live (or upcoming) war's header, "Your war so far", and 🎯 Priority
 *          targets - enemy members inside YOUR fair-fight range (FFScouter key needed; default 2.0 - 2.5), the ones
 *          you can hit right now first. Past wars, your war / chain / OC summaries now live in a new 📜 History tab.
 *  v0.2.63 (Nov 16 2026) - COMPACT MODE: the Home tab gets its compact layout - your header stays, and Your stats,
 *          My organized crime, Latest war, Latest chain and Latest fold to one-line summaries (closed by default).
 *  v0.2.62 (Nov 16 2026) - COMPACT MODE (⚙ Display → Compact mode) now has its own layouts for the Chain and OC tabs:
 *          one timer row, the queue-cover card as a one-line strip, icon buttons, slimmer alert tiles, and every extra
 *          section folded to a one-line summary (closed by default, remembered). 🧰 Loans is now also shown to
 *          Heart Stoppers and HR (the Hub decides who).
 *  v0.2.61 (Nov 16 2026) - 🧰 Loans: the OC "Loan" button, pressed away from Armoury -> Utilities, now takes you there
 *          (and selects the Utilities tab) and highlights a free copy of the item - the same trip Retrieve makes.
 *  v0.2.60 (Nov 16 2026) - ⛓ NEW QUEUE LAYOUT (user: "a better UI for the queue ... More compact user tiles"): the top 3
 *          are a podium of tiles, everyone else is a two-column grid of small tiles ("Also queued", only when there
 *          are more than 3). Every member shows energy + four icons - drug, booster, MEDICAL (new - needs this version
 *          on the member's side) and refill: green = free, amber + time = on cooldown, grey = used / unknown. Timers
 *          are decimal hours down to 1h, then minutes, never seconds. Tap any energy value to switch all of them to
 *          hits. One tag per member (urgent first, the rest take turns); the dot shows online / idle. "You're #N" when
 *          you're outside the top 3. Names are no longer links (no tap behaviour).
 *  v0.2.59 (Nov 16 2026) - 🔑 Password managers (user: members' "Lastpass is trying to autofill data into the chat window
 *          when they open the script"): the two key fields in ⚙ (Torn API key, FFScouter key) were type="password"
 *          with no form around them, so a password manager saw "a login" on torn.com and offered the nearest text box
 *          - Torn's chat - as the username. They are plain text fields now, masked with CSS (class hbs-secret), and
 *          every Suite input carries the "ignore me" marks LastPass / 1Password / Bitwarden / Dashlane look for.
 *  v0.2.58 (Nov 16 2026) - ⚙ Display: "Compact mode" and "Pinned Chain Watch tile" only toggle when the checkbox itself
 *          is tapped (user: "the clickable area expands far past the prompt. Only the checkbox should be
 *          interactable.") - class hbs-ckx: the label ignores taps, the box takes them.
 *  v0.2.57 (Nov 15 2026) - 🔑 The API key field says a Limited Access key is needed (user: "Notate that a limited API
 *          key is needed on the input field.") - it used to say a Public key is enough, which left energy / cooldowns
 *          and OC pass rates unread.
 *  v0.2.56 (Nov 15 2026) - 📡 Sharing CPR rates (leaders): ✉ Notify next to members with no script - a pre-filled Torn
 *          mail with the Suite's install link (you press Send) - and "notified x ago by Leader", shared between leaders.
 *  v0.2.55 (Nov 15 2026) - 📡 CPR sharing (user: "Run all 3 fixes. Run the CPR check regularly while the script is active
 *          ... Switch all sharing an API key to 'On' for CPR rates." / "Put CPR Rate Sharing option above Battle Stats
 *          and Work Stats"): OC pass rates are shared by default (a member can still switch it off in ⚙); the script
 *          re-reads its own pass rates every 5 min while it runs (1 Torn call, shared between tabs) instead of only
 *          when the Hub found a new crime; leaders' Sharing list says who has the script with sharing off.
 *  v0.2.54 (Nov 15 2026) - 🕵 OC: your crime's pay card shows Normal and Joined at pay per day side by side; a crime with
 *          open seats says "Earliest Ready Time:" (user's wording) instead of "Ready in". 💩 Dumping: the bonus at 10
 *          is no longer protected (Hub + the attack-button cover).
 *  v0.2.53 (Nov 15 2026) - 💩 Dumping: the red STOP banner now goes away when the chain ends (it used to stay up).
 *  v0.2.52 (Nov 15 2026) - 🧰 Loans: Retrieve / the Armoury link open
 *          factions.php?step=your&type=1#/tab=armoury&sub=utilities&start=0 (the address the user gave).
 *  v0.2.51 (Nov 15 2026) - ✉ OC Notify: the message's script tip now names the Heart Breakers Suite and links to its
 *          Greasy Fork page ({scripts} fills in that link). User: "All references to [the OC and Chain watching
 *          scripts] should now link to the Suite." Keep in step with OC Management's NOTIFY_DEFAULT / SUITE_URL.
 *  v0.2.50 (Nov 15 2026) - 🧰 Loans: Retrieve pressed away from Armoury -> Utilities now takes you there and highlights
 *          the loaned copy; it also switches "Hide loaned items" off so the row can be seen and retrieved.
 *  v0.2.49 (Nov 15 2026) - 🕵 OC: the pay per day on YOUR crime is now your join-now figure from when you joined (worked
 *          out by the Hub), labelled "Your pay per day · from when you joined".
 *  v0.2.48 (Nov 15 2026) - 💩 Dumping hits: queued members can burn their energy fast before going offline. The Hub hands
 *          out an allowance that stops short of the protected hits before each bonus (leader-set); STOP banner + sound;
 *          dumpers get a tap-to-uncover cover over the attack button inside the protected hits. Leaders: Chain settings.
 *  v0.2.47 (Nov 15 2026) - ⛓ Alerts arrive sooner: the script now checks in with the Hub just after each alert mark
 *          instead of waiting for its next 5 / 15 s round. New alert tiles above the Queue (Alert 1 / 2 / 3 + Min
 *          chain) that light up as each alert goes out.
 *  v0.2.46 (Nov 15 2026) - ⛶ Compact View: the tiny Smaller-closed tab is gone. Three views (Original, Smaller, Timer
 *          only), and a tap on any of them (except the I'm hitting / Join button) opens Chain Watch in the full panel.
 *  v0.2.45 (Nov 15 2026) - ⚔ War Readiness removed (user: "Remove War Readiness tab and sharing settings. Not
 *          needed."): the leaders' ⚡ Ready tab, the War readiness sharing option and the readiness readings the script
 *          sent are gone. A script that had it on switches it off on the Hub by itself (the Hub deletes what it sent).
 *  v0.2.44 (Nov 15 2026) - 🕵 OC "pays out in ~1.0 days" now counts down to the crime's ready time (the same clock as
 *          "Ready in") instead of the Hub's estimate in days.
 *  v0.2.43 (Nov 15 2026) - ⛶ Compact view opens by itself the moment an alert fires. 🧩 Scripts: the sort buttons
 *          added in 0.2.42 are gone - the tab shows the order leaders set on the Hub's Scripts page (▲ / ▼ there).
 *  v0.2.42 (Nov 15 2026) - ⛶ Compact View (Chain tab button): a small tab on the left or right edge with the chain
 *          timer, your position and I'm hitting - shown instead of the round icon while the Suite is minimized. Tap to
 *          open / close, drag up or down, Original or Smaller size, ⤢ for the full Suite.
 *  v0.2.41 (Nov 15 2026) - 🕒 Time setting (user: "Should be TCT / Local, 12h / 24h"): the TCT button read "EST" when a
 *          page-wide TCT converter script rewrote it - "TCT" is now drawn by CSS there and after every printed time,
 *          like the schedule's. Two rows: TCT / Local, then 12h / 24h (same order on the schedule).
 *  v0.2.40 (Nov 15 2026) - ⛓ Queue cover: the four runway tiles are one headline - "Queue covers about 12 min · until
 *          ~14:32" (red under 15 min, amber under 30, green above) with hits ready, how many can hit now and whether
 *          the next bonus is in reach. 🕒 ⚙ → Display → "Times shown in" TCT / Local (12h / 24h for Local): every clock
 *          time and date in the Suite follows it; the schedule's own switch is the same setting.
 *  v0.2.39 (Nov 15 2026) - ⬆ Updates reach you fast (user: "I want them to be pushed ASAP to users"): the Hub now
 *          sends the published Suite version with every Chain Watch update, so the banner shows within seconds of a
 *          release (the old check was every 6 h; the fallback check is now every 30 min). 3+ versions behind: the
 *          banner turns red and can't be dismissed. ⛔ "Update required" banner when leaders mark a release required.
 *  v0.2.38 (Nov 15 2026) - ⛓ "No live chain" while Torn wasn't in focus: the Hub now stays awake for slowly-polling
 *          background tabs and takes a fresh Torn read before answering a poll whose reading is old (Hub side); the
 *          Suite asks the Hub at once when you come back to the tab, and says "No update from the Hub for X" instead
 *          of showing old data as fact.
 *  v0.2.37 (Nov 15 2026) - ⛓ Queue rows without energy / cooldowns: the read of your own bars / cooldowns failed
 *          silently (usually a key without that access). Now the Chain tab says so while you're queued - Torn's own
 *          reason, what's needed, a Try again button - and joining warns you. Rows with nothing say "no energy /
 *          cooldown info shared". Runway shows energy regen per hour (not hits).
 *  v0.2.36 (Nov 15 2026) - ⛓ Chain shown as "No live chain" when Torn wasn't in focus (Hub fix: an API answer lower
 *          than the count the Hub already holds can no longer wipe a chain whose timer is still running). 🔍 Alert
 *          check (leaders) now shows what Torn's API last told the Hub, any read error and the last page reading.
 *          🔔 Leaving the queue stops alerts at once (a repeating alert kept sounding; late ones still played).
 *  v0.2.35 (Nov 15 2026) - 🛡 Low reliability alerts only when a member is new on the list or drops a full grade
 *          (E -> F) - a score moving inside the same grade no longer re-alerts. When it does alert, a "New since you
 *          last looked" line names who and why, and their rows are tagged (NEW / ▼ E→F).
 *  v0.2.34 (Nov 15 2026) - ⏱ Minimized icon (user: "This should also flash and alert when the alerts go out. Just like
 *          the old Chain Watch script."): the launcher shows the live chain timer, turns red while you're up, and
 *          flashes for as long as an alert is sounding (faster for Panic).
 *  v0.2.33 (Nov 15 2026) - 🔔 Leader alerts (user: "Format leader alerts for low reliability better."): low
 *          reliability is its own 🛡 section - one row per member with the grade badge, score bar and what's dragging
 *          it down (wars hit, large chains hit, idle days), worst first; tap a name for the profile.
 *  v0.2.32 (Nov 15 2026) - ✅ Getting started (user approved "Member onboarding checklist"): a tile at the top of 🏠
 *          Home - add your key, turn on CPR sharing, test your alerts, join the Chain Watch queue, join an organized
 *          crime (ticked at once if you're already in one) - each ticked when done, with a button for the next one.
 *          Gone for good once all five are done.
 *  v0.2.31 (Nov 15 2026) - ⛓ Chain goal on the Chain tab: next bonus, hits to go and the time to reach it at the
 *          current pace (the Hub's hits/min over the last 15 min). 🔴 Tab dots: ⛓ Chain when you're up, 🕵 OC when an
 *          assignment is waiting (on ••• More if that tab isn't in the bar). ⚡ Leaders' data (scout list + the
 *          25,000-player pool) is no longer read on every page load for every member - only once you're signed in as
 *          a leader. Still one script.
 *  v0.2.30 (Nov 15 2026) - 🚀 Deployed crimes (user: "Show unfilled roles in the Deployed Crimes list."): roles with
 *          nobody assigned are listed under each team (role, weight, the item it needs), counted on the team's line,
 *          and a seat taken by someone who isn't on the plan says so.
 *  v0.2.29 (Nov 15 2026) - 🚀 Deployed crimes (user: "Script is showing incorrect information"): who's joined now comes
 *          from the live crime's seats for every team with a crime (Hub fix - members seated in it showed "not
 *          joined"); success shows both figures like OC Management - 🎲 calculated (tornprobability) and weighted.
 *  v0.2.28 (Nov 15 2026) - ⛓ Chain Watch: the Hub takes you out of the queue when your script has been gone 60+ min;
 *          when you come back the Suite puts you back in by itself (and tells you). Leaving on purpose isn't undone.
 *  v0.2.27 (Nov 15 2026) - ⚡ Performance: ⚙ isn't redrawn by background updates while it's open (only by what you do
 *          in it); "Loading…" under Share from this script is gone; 🏠 Home draws at once from what's cached and fills
 *          in each part as the Hub answers; the 🗃 device pool is stored in 16 parts and only changed parts are written.
 *          ⛓ Chain Watch: a quiet "⏭ You're next" notice when you become backup; from 5 hits before a bonus assigned to
 *          someone else, retal Attack buttons are marked (and the hit right before it asks first); 🎯 Find target opens
 *          a weak target's attack page (the Panic Mode pick, no alert).
 *  v0.2.26 (Nov 15 2026) - 📌 OC assignment tile: when you have an OC assignment and aren't in a crime, a pinned tile
 *          under the status chips (every tab but 🕵 OC) shows the crime, your role, its weight and pay/day (est) with
 *          Join (or "waiting to be spawned"); tap it for the OC tab. ⛓ Chain Watch runway leaves Offline members out
 *          (Hub side). ⚙ Share from this script no longer flashes "Loading…": its settings were re-read from the Hub
 *          on every background redraw - now kept for a minute (refreshed at once when you change one).
 *  v0.2.25 (Nov 15 2026) - 🕵 Role weights (user: "Show weights with roles."): every seat in your crime / assigned
 *          crime and every role in 🚀 Deployed crimes shows its weight - that role's share of the crime's success,
 *          from tornprobability's role weights (when the Hub has them for that crime).
 *  v0.2.24 (Nov 15 2026) - ⚡ Faster taps (user: "Clicking some tabs ... it takes a moment to respond"): every tap that
 *          redraws a tab used to ask the Hub again (e.g. the OC tab re-read your OC and the leaders' list each time).
 *          Hub "live" reads are now kept for 30 s and shared between redraws (anything you change, or ↻, refreshes
 *          them at once), and 🚀 Deployed / 📡 Sharing open instantly and fill in when the Hub answers. 🕵 Team success
 *          is filled in again: tornprobability's exact chance when the Hub has it, else the role-weighted success
 *          from the seated members' pass rates ("· weighted"); 🚀 Deployed shows the exact chance correctly.
 *  v0.2.23 (Nov 15 2026) - 🤝 Recruit: 🗃 Pool, 🔎 Scout and 📋 Hub list show 30 at a time and load the next 30 as you
 *          scroll to the end (or tap "Show more"). The Hub list now comes from the Hub 30 rows per call (best score
 *          first, with a count per filter) instead of the whole list on every redraw - no slowdown as it grows.
 *          🕵 OC (leaders): 📣 Notify now writes the message for you like Recruit does - ✉️ fills in the mail's subject
 *          and message on Torn's compose page, 💬 types it into the chat box when you open the chat on their profile
 *          (you still press Send). Under 🧰 Loans: 🚀 Deployed crimes (the live plan's teams - status, who's joined /
 *          queued, pass rates) and 📡 Sharing CPR rates (who shares, when they last did, who doesn't) as dropdowns.
 *  v0.2.22 (Nov 15 2026) - ⛓ Chain tab: the "browser blocks live connections" banner is gone (● Polling chip only);
 *          the queue runway is four labelled stats (hits banked · regen/hour · runway · next bonus in reach); 00:00
 *          when there's no active chain (tab + header chip). When the timer runs out with a count still showing,
 *          alerts stop at once and the Hub re-reads Torn right away to confirm the chain is dead - a dead chain ends
 *          every alert (including ones waiting for polling devices); a late hit brings the new timer back.
 *  v0.2.21 (Nov 15 2026) - 🔔 ALERT FIX (user: "None of the alerts are firing for the Suite Chain Watch"): the
 *          Suite dropped Hub alerts when its own timer read was above the 1st alert, when it only had the page-load
 *          snapshot, when a Panic came while its "queued" flag lagged, or when the tab was visible but not "focused"
 *          (TornPDA) - now an alert is skipped only if a hit has landed since the Hub sent it (or another visible
 *          Torn tab is the alert tab). New 🔍 Alert check under ⚙ Configure alerts: what reached this device and
 *          what happened to it; leaders also see the Hub's view (why it is / isn't alerting, the queue's
 *          connections, the last 30 alerts it sent and to whom). Top page only (@noframes).
 *  v0.2.20 (Nov 14 2026) - ⛓ 🛠 Chain settings (leaders) is now a dropdown on the Chain tab: change the alert
 *          times, minimum chain, bonus heads-up and "1st alert to who's up only" right in the script - saved on the
 *          Hub (same checks as the Leaders Hub page) and sent to every connected script at once.
 *  v0.2.19 (Nov 14 2026) - ⛓ Chain tab: bonus picker sorted A-Z; 🛠 Chain settings button for leaders (the Hub's
 *          Chain Watch settings page); ↩ Retals and 🗓 Schedule are fold bars with a live summary (count + soonest
 *          timer / your next shift) - Retals closed by default, remembered per device. 🔔 FIX: "You're up" was
 *          dropped when it arrived with the timer above the 1st alert (nearly always) - now held and sounded when
 *          the timer enters the 1st-alert window, if you're still up.
 *  v0.2.18 (Nov 14 2026) - ⛓ Bonus assignment fixed (always shown once assigned, ★ BONUS in the queue, Clear for leaders); new queue rows - ⚡ energy now/max (bolt = refill available), 🌿 drug + 🥫 booster cooldowns, hits available, capacity line; 📦 Armory Loan Filter on Torn's faction armory page ("Hide loaned items", per device);
 *          recruit settings: only the ⚙ Criteria items are shared between leaders - the 🛰 collector switch (and the
 *          recruit criteria) are no longer in your personal Backup & sync either, so nothing recruit-related follows
 *          you between devices except through the shared Criteria.
 *  v0.2.17 (Nov 14 2026) - Recruit settings shared by every leader (Hub op "rcset": checks, limits, weights, must-haves,
 *          score thresholds, mail subject + message, Hub-list auto-send); another leader's change is applied at once
 *          with a toast + a 🔔 Alerts line saying who changed what; saving over a newer change asks first.
 *  v0.2.16 (Nov 14 2026) - Recruit ✉ Message: the contacted mark is saved before the mail tab opens, so the Suite in
 *          that tab already leaves the player out (was: still listed there).
 *  v0.2.15 (Nov 14 2026) - user's list: 🗃 Pool → ⚔ Pull from attack logs (outside players with level + faction,
 *          continues where the last pull stopped); 🧰 Unused loans no longer lists tools a crime (or a planned seat)
 *          needs - the needs list isn't wiped by a failed Hub read any more, and the Armoury outline checks it too; War
 *          tab "Hits by member" folds; Home "Latest" = tiles for the newest newsletter, war report and chain report;
 *          ⚙ settings: API keys together (Torn + FFScouter), Layout / Modules / About removed (every module on, the
 *          default tab layout), a warning to uninstall old scripts that are still installed. Scout: sort by Xanax / day.
 *  v0.2.14 (Nov 14 2026) - 🛰 collector fix: pages after the first on Torn's user search are read too (Torn rewrites the
 *          rows in place and changes the address without a reload); new players reach the device pool at once.
 *  v0.2.13 (Nov 14 2026) - 🛰 Recruit background collector (leaders, OFF by default - switch in 🗃 Pool): players on
 *          the pages you visit go into the pool (+ the Hub pool every 60 s) - page reading only while Torn is focused,
 *          no API calls; faction pages, chat windows, players showing a faction icon and our members are skipped.
 *          Scan page also marks players showing a faction icon as in a faction. OC tab: your crime as tiles + a ready
 *          line; seats as two-line blocks (role + member, planning bar + CPR) for narrow panels.
 *  v0.2.12 (Nov 14 2026) - Recruit ✉ Message fills Torn's mail form for you (subject + message; subject template in
 *          ⚙ Criteria) - you still press Send yourself. The clipboard copy stays as a fallback.
 *  v0.2.11 (Nov 14 2026) - Recruit layout for narrow panels (user: "Format this information to be better viewed"): the
 *          four views as an even 2 x 2 grid; Scout toolbar = Sort by + Update battle stats / Export list; ⚙ Criteria
 *          checks as stacked blocks (name + must on top, labelled boxes underneath), number spinners hidden.
 *  v0.2.10 (Nov 14 2026) - Recruit (user picked suggestions 2-6): streak + play-per-day checks and respect / attacks won
 *          / refills per day (all from the one quick-check call); a WEIGHTED SCORE (weight per check in ⚙ Criteria)
 *          sorts the list and decides fit / near / Hub auto-send; battle stats as a min-max range; a shared
 *          don't-contact list (declined / joined / removed on the Hub list -> hidden from every leader's pool).
 *  v0.2.9 (Nov 14 2026) - Recruit tab: 🗃 Pool first; ⇪ export the pool / scout list to the Hub pool (the Hub keeps the
 *          newer check and the full snapshot, trimming old ones to id + level); Check all; activity check removed;
 *          contacted shared by every leader (✉ Message stamps it; "Hide contacted" on by default); ⚙ Criteria no longer
 *          redrawn while you type; pool rows, scout cards and Hub list entries laid out as tiles for phones. Home: Chains
 *          and Gym side by side. OC: seat %s say "planning"; 🧰 Loans above Your OC summary. Boards: tables fold.
 *  v0.2.8 (Nov 14 2026) - 🔎 RECRUIT SCOUT moved into the Suite's Recruit tab (leaders): 🔎 Scout (Recruit Scout 0.6.1's
 *          checks, criteria + must-haves, battle stats, activity check, message, ⇪ Hub / auto-send) · 🗃 Pool (up to
 *          25,000 scanned players on the device as one small row each - was a 1,000 limit - plus the SHARED Hub pool,
 *          op "rcpool": scans + check results go up, "Check next N" skips players any leader checked in the last 24 h,
 *          "Load from Hub pool" searches it) · 📋 Hub list (the shared Recruitment list, as before) · ⚙ Criteria.
 *  v0.2.7 (Nov 14 2026) - header: Greasy Fork home / support / download / update URLs (script 605562). No code change.
 *  v0.2.6 (Nov 14 2026) - user's list: Home - Chains and Gym share one column; Chain tab - your chain summary at the
 *          bottom (hits, chains, respect, retals, most in one chain, highest bonus - db/chains.json "b"); "You're up"
 *          fires once by default (older saved settings moved to Once one time); 🚨 Test Panic Mode (the Panic alert +
 *          opens a target like Panic Mode); "I'm hitting" also clears Away; away members get alerts like everyone
 *          (Hub chainroom change); fixed the pinned tile going blank after it was hidden and shown again; OC tab -
 *          your OC summary card; header chips: chain + queue first, war last.
 *  v0.2.5 (Nov 14 2026) - OC pay per day shows ONE figure - the maximum, from the join-now amount (pay from now until
 *          payout; the planner's plan_mult now covers planning crimes too) - labelled "Pay per day (est)".
 *  v0.2.4 (Nov 14 2026) - user's list: Home keeps only the core figures, as one centred set of tiles grouped Wars /
 *          Chains / OCs / Gym (hits per war / chain, retals, war payouts, battle / work stats and the reliability scores
 *          removed); OC tab → Leaders: 📣 Notify (with the last contact time), ⏰ delayed crimes, ⏸ paused planning
 *          and 🧰 Loans (the OC Optimizer's To loan / Unused loans + Armoury outlines and Loan / Retrieve helpers;
 *          worker op live "spawn" now also sends delays, paused, missing, needs); the panel remembers its tab, the
 *          open profile / cards / ⚙ and each tab's scroll position over reloads and reopening (K.view); ⚔ War tab
 *          starts with your war summary; any member's name opens their profile in the Suite (← Back returns).
 *  v0.2.3 (Nov 14 2026) - user's list: schedule day chips show the date under Today / Sun / Mon; TCT is always 24 h
 *          (the 12 h / 24 h choice is for Local and is kept when you switch); 🔔 CHAIN WATCH ALERTS reworked = Chain Watch
 *          4.20.6's alerts (Alert 1/2/3, Panic, You're up, Shift started, New retal: six tones, only the most urgent
 *          sounds, repeat until the count moves / you're hitting / 2 min, desktop + TornPDA notification / alarm, keep
 *          screen awake, one alerting tab, opt-in Panic Mode) with ⚙ Configure alerts on the Chain tab (per alert: on /
 *          off, tone + preview, how often it repeats, vibrate, flash; K.alerts, in the settings backup); alert times
 *          shown as minutes (1m 45s); OC tab: Join Now pay per day up front, difficulty, ready time, team success and
 *          every seat (role, member, planning, CPR) for your crime and your assigned seat (Hub op live "myoc"), plus a
 *          Share CPR switch (the same Hub setting as ⚙ sharing); Home: your Hub profile at a glance (totals,
 *          reliability breakdown, battle / work stats if you share them) with a Full profile button.
 *  v0.2.2 (Nov 14 2026) - user's list: 🔴 badges count only alerts you haven't seen (opening 🔔 Alerts clears them;
 *          K.alertSeen) and the number is centred in its bubble; Chain schedule TCT / Local switch (TCT drawn by CSS so a
 *          TCT → local converter can't rewrite it to "EST"; Local = this device's time zone); retals always sorted by
 *          timer (no Timer / FF sort buttons); "Try live again" removed; "I'm hitting" is one toggle shared by the Chain
 *          tab and the pinned tile (✋ Hitting · 18s while it stands, tap to clear); the whole Suite is centre-aligned.
 *  v0.2.1 (Nov 14 2026) - user's list: the Home panel show / hide was REVERTED (tab layout kept); 🗂 OC Management,
 *          🖼 Panel Editor and 🧮 Payout calculator now just open the Hub's pages (the in-script calculator is gone -
 *          ~45 KB smaller); 🔴 alert badges (leaders: More, Alerts, launcher); 📌 pinned Chain Watch tile on every tab;
 *          🗓 the Chain Watching Schedule inside ⛓ Chain (same as Chain Watch 4.20.6: claim, grid, book / cancel,
 *          energy estimate); ↩ retals as in 4.20.6 (grouped per enemy, FFScouter FF + sort + range filter, 💬 paste
 *          into chat, call / release, hide for me, new-target chime); 💾 settings backup code + save / load on the Hub
 *          (op prefs_put / prefs_get - never any key); ⬆ update banner from the Hub's Scripts directory; 🗜 compact mode.
 *  v0.2.0 (Nov 14 2026) - user's list: 🔔 Leader alerts moved off Home into their own leaders' tab (••• More → Leaders →
 *          Alerts); ⚙ → LAYOUT: reorder every tab, choose the (up to 4) bottom-bar tabs, hide tabs from More, and show /
 *          hide / reorder the Home panels (header, My organized crime, latest war, latest chain, latest posts) - per device;
 *          leaders' 🗂 OC Management and 🖼 Panel Editor pages (open the Hub's pages; OC shows what's waiting); every
 *          picture in the panel opens full size (the .png itself / a drawn receipt as PNG; full-screen view where a new
 *          tab can't open).
 *  v0.1.5 (Nov 14 2026) - ⛓ no more "Opening the live connection…" wait (user: "This hangs for 5-10 seconds"): the room is
 *          fetched over /cw/sync at once while the live socket opens in the background; the socket takes over when open.
 *  v0.1.4 (Nov 14 2026) - ⛓ CHAIN WATCH AS FAST AS 4.20.6 (user: "The chain watch script provides much faster connection to
 *          the queue and other data seems to arrive faster and more reliable than the suite"): always connected from page
 *          load (was: only with the Chain tab open / while queued); Chain Watch token + your Hub identity kept 24 h (no
 *          sign-in round trips per page); polling keeps running while the live socket is re-tried every 60 s; actions
 *          go out at once even when polling; optimistic join / leave / hitting / away / retal; the last timer restored
 *          instantly on page load; dead-socket watchdog (45 s); stats as fresh as the 30 s key cache while queued.
 *  v0.1.3 (Nov 14 2026) - ⛓ IMMEDIATE CHAIN DATA (user: "This needs to be updated immediately"; reference = Faction Chain
 *          Watch 4.20.6): the timer / count follow Torn's own sidebar chain bar (live, no API, no cache) while Torn is
 *          the focused tab - on every transport, Firefox polling included - and the reading is shared with the Hub over
 *          the WebSocket (src "page", count change at once, else every 30 s), exactly as Chain Watch 4.20.6 does.
 *  v0.1.2 (Nov 14 2026) - ⛓ the user's Firefox refuses the live connection on Torn (NS_ERROR_CONTENT_BLOCKED - Torn's
 *          security policy): the refusal is remembered on that device (K.cwNoWs) so it polls straight away, with one
 *          plain sentence instead of the raw browser error; ↻ Try live again clears it.
 *  v0.1.1 (Nov 14 2026) - ⛓ CHAIN CONNECT FIX (user: "Chain watch is not able to connect"): the Chain tab shows each
 *          connection step and the last error with a ↻ Retry button; a live socket the page refuses, that doesn't open
 *          in 8 s, or that another Chain Watch connection (old script / another tab) replaces now drops straight to
 *          POST /cw/sync polling (GM_xmlhttpRequest / PDA_httpPost - not blockable by the page) instead of retrying.
 *  v0.1.0 (Nov 14 2026) - FIRST BUILD, a SEPARATE script from "Heart Breakers Hub" (user: "Create the new script with
 *          new data and header info, as to not override the actual current Hub script"). Base = Hub 2.8.0 (its full
 *          changelog stays in the Hub script / project doc claude/Heart Breakers Hub-2.8.0.user.js).
 *    - OWN IDENTITY: @name Heart Breakers Suite, @namespace S1SEVEN.suite, storage keys hbs_*, DOM ids / classes
 *      hbs-*, Torn API comment "HBSuite", page marker <meta name="hb-script" content="Heart Breakers Suite">. It can
 *      run next to the Hub script without either touching the other's settings.
 *    - MERGED (user: "share data, pull data from the hub, send data(like stats) to the hub, synchronize together and
 *      act as an all around Single Faction Script"):
 *        ⛓ Chain     = Faction Chain Watch on the Hub (contract claude/chainwatch-hub-contract.md + its addenda):
 *                      WebSocket /cw/ws (fallback POST /cw/sync), the queue in the order the Hub sends it, turn,
 *                      bonus, runway, retals, presence heartbeat, Hub-timed alerts / Panic, energy stats, chain
 *                      readings (shorten-only, phase-offset, only while queued or under the 1st alert).
 *        🕵 OC        = OC Payout Optimizer's member side: your crime + planned seat (op live "myoc"), Join link,
 *                      "leave first", your record, and the crimes-page highlight of your seat (class toggles only -
 *                      nothing is clicked for you). Pass-rate sharing = ⚙ sharing (oc), as in the Hub script.
 *        🤝 Recruit   = leaders: the Hub's shared Recruitment list (op "rc") - claim / status / note / remove.
 *                      Finding recruits stays in Torn Recruit Scout (it scans pages on purpose, one click at a time).
 *        ⚔ War       = the Hub's Wars tab; the header chip shows the live ranked war (op live "now").
 *    - NEW LOOK: graphite + amber (CSS variables in injectStyles), live status chips under the title, a 5-button tab
 *      bar at the bottom (Home · Chain · OC · War · More) - every other tab sits in the "More" grid, so new features
 *      add a grid button instead of another row of tabs.
 *    - MODULES: ⚙ → Modules switches Chain / crimes-page highlight / Recruit off per device (K.mods).
 *    - OLD SCRIPTS: ⚙ lists the standalone scripts still installed on this page (meta tags / launchers) - running
 *      both is safe but doubles the Torn calls for the same feature; uninstall the old one once happy.
 *
 *  SIZE / TornPDA (user: "My main concern is overall size of the script and keeping it within TornPDAs limitations")
 *    - TornPDA has NO fixed userscript size limit (checked in its source, Nov 2026): scripts are stored as text and
 *      injected whole. What matters on phones is work at load: this script builds nothing until the panel opens,
 *      draws one tab at a time, and loads Hub files only for the tab you open.
 *    - One readable file, no remote code (Greasy Fork rules: no minifying, no loading code from elsewhere).
 *    - Settings are tiny (GM storage / localStorage); nothing big is cached on the device.
 *
 *  TORN RATE BUDGET — every Torn call goes through tornGet(), which spaces calls >= 650 ms apart across ALL modules
 *  (sign-in, sharing, chain stats / readings, payout calculator). Steady state while chaining and queued: about
 *  2 calls / minute (stats + chain reading) + sharing if turned on. Nothing polls while the panel is closed except
 *  sharing (if on) and Chain Watch while you're queued.
 *
 *  TABS (who sees what - leader rights come from the HUB's member list, never from this script):
 *    everyone : 🏠 Home (your numbers vs the faction, latest posts;
 *               leaders also "Needs attention") · 🏆 Boards (leaderboards: war / chain / OC / gym, this month,
 *               all time, past months) · 👤 Me (your profile + your OWN reliability / receipt / opted-in stats)
 *               · 👥 Members (list + profiles; leaders also reliability, receipts, excused leave, armory, stats)
 *               · ⚔ Wars (recent wars, hits, report / payout links; leaders: Termed toggle) · 📰 News (latest
 *               posts, chain reports, recap archive) · 💰 Payouts (paid wars) · 🧩 Scripts (Hub scripts directory)
 *    leaders  : ⚡ Ready (live war readiness of opted-in members, re-read once a minute ONLY while this tab is open
 *               and Torn's page is visible - user's rule for opted-in keys) · 💪 Stats (opted-in battle / work stats)
 *               · 🗄 Armory (currently loaned + armory use per member / month)
 *               · 🧮 Payout (the payout calculator - same maths as the Hub's payout.html, saved wars from the Hub,
 *               receipts saved to the Hub, Termed question, vault links, newsletter)
 *    Announcements editing was removed in v2.1.0 (user) - it stays on the Hub site.
 *    Left on the site on purpose (user agreed): Chain Watch schedule sign-up (Chain Watch script), OC Management
 *    (OC Optimizer), Recruitment (Recruit Scout), My data & sharing (stores a key on the Hub - linked instead),
 *    Newsletter builder, homepage / header / profile-layout / faction-description editors (desktop editors).
 *
 *  SIGN-IN — the member's own Torn API key, which NEVER LEAVES THE DEVICE (user, Nov 11 2026:
 *  "use an API key to log in" + "Key never leaves device" + keep the key on the device)
 *  - Key: pasted once in ⚙ (desktop; stored only in this script's storage) or TornPDA's own key automatically
 *    (###PDA-APIKEY###). A Public key is enough for signing in.
 *  - The script reads ITS OWN Torn profile with the key (user/?selections=profile - one Torn call per sign-in,
 *    about once a day) and sends ONLY {pid, faction, name} to the Hub (op "hello"). The Hub checks Heart Breakers
 *    + a current member (its own member list) and returns a session "hbsx2.<pid>.<exp>.<sig>" (HMAC-signed by the
 *    Hub, 24 h). When it runs out (401) the script signs in again by itself.
 *  - Hub-wide client-reported identity pattern (OC / Chain Watch / Recruit Scout). Accepted tradeoff (user chose it
 *    knowing): a modified script could claim another member's id (a leader's too); the Hub never sees the key.
 *
 *  HUB API — ONE endpoint, POST only (TornPDA's PDA_httpPost works):
 *    POST https://hb-gate.heartbreakers.workers.dev/sx  {code, op, ...}
 *      op "hello" {pid, faction, name}  (no code) -> {ok, code, exp, me:{id,name,position,leader}}
 *      op "whoami"                              -> {ok, me, exp}
 *      op "read" {area:"m"|"l", path}           -> a Hub data file. m = members' folder db/*.json (everyone);
 *                                                  l = leaders' folder db/*.json, payout_data/*.json (leaders)
 *      op "mine"                                -> your own private figures (reliability, opt-in stats)
 *      op "live" {what}                         -> "board" | "schedule" | "scripts" (everyone), "readiness" (leaders)
 *                                                  "spawn" (leaders, 2.6.0): OC spawn alerts - crimes a planned team is
 *                                                  ready for but nobody has spawned, best pay first (Home card)
 *      op "gh" {method:"GET"|"PUT", path, ref?, body?} -> the leaders' save route (config.json, data/payouts/*)
 *  Files read (lazy, per tab, kept CACHE_MS in memory):
 *    m db/script_feed.json  latest posts, last 40 wars (termed, report / payout links, per-member hits), chain
 *                           reports, recap archive
 *    m db/members.json · db/wars.json · db/chains.json · db/crimes.json · db/gym.json · db/payouts.json ·
 *      db/home.json (your numbers vs average) · db/optin_shared.json (stats members share with the faction)
 *    l db/private.json (reliability, opt-in stats) · db/attention.json · db/armory.json · db/payout_cfg.json ·
 *      payout_data/index.json + payout_data/<war>.json (the calculator's saved wars)
 *
 *  LEADER ACTIONS (config.json saves go through op "gh": GET for the sha, then PUT; the Hub adds "(by <leader>)"
 *  to the commit; the site updates in a few minutes):
 *    Wars: Termed on/off ("termed_wars") · Members: excused leave ("leave"), performance receipt (same drawing as
 *    the Hub profile; Create Message copies it + opens Torn compose, subject "Faction Performance <date>") ·
 *    Payout: receipt file
 *    data/payouts/<war>-<YYYYMMDDHHMM>.json + "termed_wars".
 *
 *  TORN API (comment "HBSuite" on every call - shows in the key owner's API log):
 *    - sign-in: user/?selections=profile (about once a day per device)
 *    - payout calculator ONLY for a war the Hub hasn't saved yet (needs a key with Faction API access):
 *      v2 faction/basic, faction/rankedwars (Load wars), faction/{id}/rankedwarreport + faction/attacks pages
 *      (throttled 700 ms apart, max 200 pages - same as the Hub's calculator). Saved wars use NO Torn calls.
 *
 *  SHARING FROM THE SCRIPT (v2.1.0, user: "Allow users to share their same data from the hub, but via the script.
 *  This is only updated when the script is active and their key is only saved locally to their device"):
 *    ⚙ settings: battle stats / work stats (off | leaders | faction) and war readiness (on / off) -> op "share_set".
 *    Runs in the background whenever Torn is open and visible (panel open or not), ONLY if something is turned on:
 *    - stats: ONCE A DAY, the first time the script runs after 00:00 TCT (user's choice): Torn user/?selections=
 *      battlestats,workstats -> op "share_push" {bs, ws}.
 *    - readiness: ONLY WHILE A LEADER WATCHES (user's choice): op "share_ping" every 2 min -> want_ready; when true,
 *      Torn user/?selections=bars,cooldowns,refills,profile every minute -> op "share_push" {rd}.
 *    - OC pass rates (2.2.0): when op "share_ping" gives a NEW oc_tag (the Hub found a new crime - the Hub's rule
 *      for stored keys), Torn v2 user/organizedcrimes once -> op "share_push" {oc: [[crime, role, pass rate], ...]}
 *      (only open roles carry YOUR rate) -> the same shared rates the OC Optimizer / Team Builder use.
 *    - Chain timer: added in 2.2.0, REMOVED in 2.3.0 (Chain Watch's job) - no faction/chain reads any more.
 *    Pings run every 2 min while readiness / OC rates / chain timer is on.
 *    The Hub keeps the readings (D1 sx_share); the site build merges the stats with any Hub-key sharing.
 *  SCRIPT DETECTION (v2.1.0, user: "Can the scripts page detect when scripts are already installed? Show Update"):
 *    userscripts can't see each other, so suite scripts announce themselves on the page with
 *      <meta name="hb-script" content="<@name>" data-version="<@version>">  (this script adds its own; the others need
 *    the same 3 lines - project doc claude/hub-script-detection-addendum.md). A suite launcher (.torn-launcher with
 *    data-dock-label = the script name) also counts as "installed" (no version). Only scripts that run on the page
 *    you're on can be seen.
 *
 *  POLLING (only while the panel is open, that tab is shown and Torn's page is visible):
 *    Ready: every 60 s. (Home's 30 s chain board refresh was removed in 2.3.0.)
 *    (The sharing loop above is separate and runs while Torn is visible.)
 *
 *  SUITE CONVENTIONS
 *  - Dark panel + amber accent. Minimize-to-launcher (.torn-launcher, Torn Dock compatible via data-dock-icon /
 *    data-dock-label). Launcher and panel positions remembered + clamped; launcher auto-slots up the right edge
 *    until dragged; hover label. Collapsed state persists. Pointer events + touch-action:none for PDA. Panel sized
 *    for phones; the tab bar wraps onto more rows when the tabs don't fit (user asked).
 * =====================================================================
 */

(function () {
    'use strict';

    // ---------------------------------------------------------------------
    // CONFIG
    // ---------------------------------------------------------------------
    const SCRIPT_NAME = 'HB Suite';
    const VERSION = '0.2.89';
    const LOG = '[HBSuite]';
    const HUB_BASE = 'https://hb-gate.heartbreakers.workers.dev';
    const API_COMMENT = 'HBSuite';                // shows in the key owner's Torn API log
    // TornPDA swaps this placeholder for the user's own key when it installs the script
    const PDA_KEY = '###PDA-APIKEY###';
    const isPDA = () => typeof PDA_httpGet === 'function' && !PDA_KEY.includes('###');
    const CACHE_MS = 5 * 60 * 1000;            // Hub files kept in memory this long
    const MIN_HITS = 5;                        // "took part" = 5+ hits (Hub reliability rule)
    const READY_POLL_MS = 60000;               // war readiness - once a minute while the tab is open (user's rule)
    const OC_SHARE_MS = 6 * 3600000;            // (0.2.88) every 6 hours - see build_patch_0288.py (was hourly 0.2.76-0.2.87)
    const OC_SHARE_MS_OLD = 3600000;               // (0.2.76) OC pass rates: the hourly safety net - events send them at once (was every 5 min, 0.2.55)
    const SHARE_PING_MS = 120000;              // sharing: ask the Hub if a leader watches War Readiness (user's choice)
    const SHARE_READY_MS = 60000;              // sharing: readiness every minute while a leader watches

    const K = {
        key: 'hbs_key',                        // the member's Torn API key (this device only - never sent to the Hub)
        session: 'hbs_session',                // the Hub session {code, exp} from op "hello" (24 h)
        collapsed: 'hbs_collapsed',
        panelPos: 'hbs_panel_pos',
        panelSize: 'hbs_panel_size',           // resized panel {w, h} (v2.4.0)
        launchPos: 'hbs_launch_pos',
        tab: 'hbs_tab',
        pay: 'hbs_pay_settings',               // payout calculator settings (like the Hub page's hb_payout_settings)
        presets: 'hbs_pay_presets',
        paid: 'hbs_paid_',                     // + war id: members ticked as paid
        rcpt: 'hbs_rcpt_',                     // + war id: receipt saved from this device (newsletter image)
        share: 'hbs_share',                    // sharing from the script: {bs, ws, ready} as last saved / seen on the Hub
        shareMig: 'hbs_share_mig255',          // 1 = this device re-asked the Hub for its sharing settings (0.2.55 switch-on)
        ocShareAt: 'hbs_share_ocat',           // ms the OC pass rates were last read + sent (any tab) (0.2.55)
        sharePingAt: 'hbs_share_pingat',       // ms the Hub was last asked (any tab) (0.2.55)
        shareDay: 'hbs_share_day',             // TCT day (YYYY-MM-DD) the stats were last sent
        ocCurSig: 'hbs_oc_cur_sig',            // (0.2.76) the crime the Hub last showed this member in ("<crime id>" or "0") - a change sends the pass rates
        myOcSync: 'hbs_myoc_sync',             // (0.2.89) the check-in's myoc {at, d} (shared between tabs)
        alertsV: 'hbs_alerts_v',               // (0.2.89) leaders: the alert list's signature from the check-in
        busSeen: 'hbs_bus_seen',               // (0.2.89) 📡 the Hub push notes already acted on {k: v}
        ocMeSig: 'hbs_oc_me_sig',              // (0.2.70) the own crime last reported to the Hub ("<crime id>:<role>" or "0")
        feedDoneAt: 'hbs_feed_done_at',        // (0.2.71) ms the completed crimes were last read for the feed (any tab)
        feedOn: 'hbs_feed_on',                 // (0.2.69) ms until which THIS member's script is the crime feeder (any tab)
        feedAt: 'hbs_feed_at',                 // (0.2.69) ms the crimes were last read for the feed (any tab)
        feedNo: 'hbs_feed_no',                 // (0.2.69) ms until which this key isn't offered as feeder (no Faction API access)
        ocTag: 'hbs_share_octag',              // the Hub's crime-list signature when OC pass rates were last sent
        mods: 'hbs_mods',                      // module switches {chain, ocpage, recruit} (⚙ → Modules)
        cwTok: 'hbs_cw_token',                 // Chain Watch session token {token, exp, pid} (24 h, from /cw/hello - not a key)
        cwStats: 'hbs_cw_stats',               // your last energy / cooldown reading {s, at} (Torn caches a key ~30 s)
        cwSnap: 'hbs_cw_snap',                 // the last chain timer from the Hub (shown instantly on the next page load)
        ffKey: 'hbs_ff_key',                   // your FFScouter key (this device only - never sent to the Hub) (0.2.1)
        warRange: 'hbs_war_range',             // 🎯 Priority targets: your fair-fight range {lo, hi} (default 2 - 2.5) (0.2.64)
        warFF: 'hbs_war_ff',                   // FFScouter fair fight per enemy member for the current war {fid, at, m: {pid: {ff, est}}}
        warMine: 'hbs_war_mine',               // "Your war so far": {key: 'fid:start', hits, resp, last, ids: [...at last]} from your own attack log
        ffCache: 'hbs_ff_cache',               // FFScouter results, newest 300
        rtHide: 'hbs_rt_hide',                 // retal targets hidden for you only {attacker: expiry}
        rtSort: 'hbs_rt_sort',                 // retal sort: timer | ff
        rtFf: 'hbs_rt_ff',                     // retal FF range {min, max}
        schTz: 'hbs_sch_tz',                   // schedule clock: tct | local
        schHr: 'hbs_sch_hr',                   // schedule clock: 24 | 12
        view: 'hbs_view',                      // 💾 panel view {pid, back, open, set, scroll:{viewKey: px}} (0.2.4)
        loanCache: 'hbs_loan_cache',           // 🧰 Loans {missing, needs, unused, uts} (0.2.4, leaders)
        loanIgn: 'hbs_loan_ign',               // 🧰 "pid:itemId" unused loans you chose to ignore (0.2.4)
        rsDb: 'hbs_rs_db',                     // 🔎 Recruit Scout list - full data, fits / near / shortlisted, max 1,000 (0.2.8)
        rsPool: 'hbs_rs_pool',                 // 🗃 scanned players {pid: [name, level, fac, la, checked, pct, verdict, added]}, max 25,000
        rsCrit: 'hbs_rs_crit',                 // recruit criteria + must-haves
        rsTpl: 'hbs_rs_tpl',                   // message template ('' = built-in)
        rsSubj: 'hbs_rs_subj',                 // mail subject template ('' = built-in) (0.2.12)
        rsSetAt: 'hbs_rs_set_at', rsSetAt0: 'hbs_rs_set_at0',   // shared recruit settings: version applied / first download done (0.2.17)
        rsSetNote: 'hbs_rs_set_note',          // the last change another leader made {by, at, diff} (0.2.17)
        rtOpen: 'hbs_rt_open',
        cfold: 'hbs_cfold',                    // compact-mode folds: {key: true = open}; closed by default (0.2.62)
        cwHits: 'hbs_cw_hits',                 // true = the queue shows "N hits" instead of energy (tap an energy value) (0.2.60)
        cwDump: 'hbs_cw_dump',                 // 💩 dumping mirror {st, done, last, bonus, buffer, stopText} (0.2.48)
        cwCompact: 'hbs_cw_compact',           // ⛶ Compact view {on, size 'l'|'s', side 'left'|'right', y, open} (0.2.42)

        relSeen: 'hbs_rel_seen',               // 🛡 low reliability: {member id: grade rank last seen} (0.2.35)
        onb: 'hbs_onboard',                    // ✅ Getting started {oc, ocAt, test, join, crime, done} (0.2.32)
        ocDepOpen: 'hbs_oc_dep_open', ocShareOpen: 'hbs_oc_share_open',   // 🚀 Deployed / 📡 Sharing folds (0.2.23)
        chatFill: 'hbs_chat_fill',             // 💬 Notify: the chat message waiting for the member's profile (0.2.23)                 // ↩ Retals fold open/closed (0.2.19)
        armHide: 'hbs_arm_hide',               // 📦 armory page: hide loaned items (0.2.18)
        rsAtk: 'hbs_rs_atk',                   // ⚔ attack-log pull cursor {to (epoch s), at, n} (0.2.15)
        rsPassive: 'hbs_rs_passive',           // 🛰 background collector on/off (default off) (0.2.13)
        mailFill: 'hbs_mail_fill',             // ✉ pending compose pre-fill {pid, subject, html, text, at} - used once, 10 min (0.2.12)
        rsRate: 'hbs_rs_rate',                 // recruit Torn calls per minute (default 50)
        rsHubAuto: 'hbs_rs_hubauto', rsHubPct: 'hbs_rs_hubpct',   // auto-send to the Hub list + its % threshold
        rsView: 'hbs_rs_view', rsSort: 'hbs_rs_sort', rsPf: 'hbs_rs_pf',   // Recruit tab view / sort / pool filters
        alerts: 'hbs_alerts',                  // 🔔 alert settings {vol, desktop, pdaNotif, pdaAlarm, wake, panicMode, k:{a1..retal}} (0.2.3)
        alertSeen: 'hbs_alert_seen',           // 🔔 alerts already seen (the badge counts only new ones) (0.2.2)
        uiPdaMig: 'hbs_ui_pda_mig272',         // (0.2.72) 1 = compact mode was switched on once on this Torn PDA device
        ui: 'hbs_ui',                          // display: {compact, pin}
        armAlert: 'hbs_arm_alert',             // (0.2.78) false = this leader switched the Home "Armory low" line off (this device)
        annDismiss: 'hbs_ann_dismiss',         // id of the announcement this device dismissed (0.2.66)
        upd: 'hbs_update',                     // update check {at, ver, url, dismissed}
        layout: 'hbs_layout',                  // ⚙ Layout: {order, bar, hide, home, homeOff} (0.2.0)
        meC: 'hbs_me',                         // your Hub identity {me, exp} (same life as the Hub session)
        cwq: 'hbs_cw_queued',                  // in the Chain Watch queue (reconnect after a page load to keep alerts)
    };

    // ---------------------------------------------------------------------
    // STORAGE (GM_* with localStorage fallback)
    // ---------------------------------------------------------------------
    const store = {
        get(k, d) {
            try { if (typeof GM_getValue === 'function') { const v = GM_getValue(k, undefined); return v === undefined ? d : v; } } catch (e) { /* fall through */ }
            try { const raw = localStorage.getItem(k); return raw === null ? d : JSON.parse(raw); } catch (e) { return d; }
        },
        set(k, v) {
            try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; } } catch (e) { /* fall through */ }
            try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
        },
    };

    // ---------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const pnum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };   // "1,000,000" -> 1000000
    const int = n => Math.round(num(n)).toLocaleString('en-US');
    const tzLocal = () => store.get(K.schTz, 'tct') === 'local';
    const tzTag = () => tzLocal() ? 'local' : 'TCT';                                           // plain text (confirm() etc.)
    const tzTagH = () => tzLocal() ? 'local' : '<span class="hbs-tct" aria-label="TCT"></span>';   // html ("TCT" drawn by CSS - see the schedule notes)
    const tzOpt = o => tzLocal() ? Object.assign(o, o.hour ? { hour12: store.get(K.schHr, '24') === '12' } : {}) : Object.assign(o, { timeZone: 'UTC' }, o.hour ? { hour12: false } : {});
    const fmtD = t => t ? new Date(t * 1000).toLocaleDateString('en-US', tzOpt({ month: 'short', day: 'numeric', year: 'numeric' })) : '-';
    const fmtDT = t => t ? new Date(t * 1000).toLocaleString('en-US', tzOpt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '-';
    const money = n => '$' + Math.round(num(n)).toLocaleString('en-US');
    const shortMoney = n => { n = num(n); return n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'b' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n; };
    const big = n => n == null ? '-' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'b' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
    const nowS = () => Math.floor(Date.now() / 1000);
    const dur = s => { s = Math.max(0, Math.floor(s)); if (!s) return '0s'; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`; };
    const ago = t => t ? dur(nowS() - t) + ' ago' : '-';
    const monthOf = t => new Date(t * 1000).toISOString().slice(0, 7);
    const monthName = m => new Date(m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const thisMonth = () => new Date().toISOString().slice(0, 7);
    const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
    const b64ToText = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\n/g, '')), c => c.charCodeAt(0)));
    const textToB64 = t => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const abs = u => !u ? '' : /^https?:/i.test(u) ? u : HUB_BASE + (u.startsWith('/') ? u : '/m/' + u);
    // Hub reliability grades (same table as the Hub's REL_GRADES)
    const GRADES = [[95, 'S', '#c9a0ff'], [85, 'A', '#78c878'], [75, 'B', '#a8d878'], [65, 'C', '#e8be5a'], [55, 'D', '#e8a05a'], [45, 'E', '#e8705a'], [0, 'F', '#e4382e']];
    const relG = s => { for (const g of GRADES) if ((s || 0) >= g[0]) return [g[1], g[2]]; return ['F', '#e4382e']; };
    // sharing sources (v2.5.0): how a member shares each thing
    const SRC_ICON = { site: '🌐', script: '🧩', ocopt: '🕵️' }, SRC_NAME = { site: 'Hub site', script: 'Hub script', ocopt: 'OC Optimizer script' };
    const srcIcons = v => (v || []).map(x => `<span title="${SRC_NAME[x] || x}">${SRC_ICON[x] || x}</span>`).join('');
    const srcNames = v => (v || []).map(x => (SRC_ICON[x] || '') + ' ' + (SRC_NAME[x] || x)).join(' · ');

    async function copyText(text) {
        try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e) { return false; }
    }
    // ---- 📣 NOTIFY (2.7.0) - messages for members without the OC script (same wording as OC Management's Notify tab) ----
    let notifyList = [];
    const OC_CRIME_LINK = id => `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${id}`;
    let notifyTplS = null;                         // the leaders' edited wording (live "spawn" notify_tpl) or null
    const NOTIFY_DEFAULT = {
        chat: "Hi {name}! You've been picked for an Organized Crime: {crime} - {role}. Please join it here: {link} - thank you! 💗",
        subject: 'OC: please join {crime} ({role})',
        mail: "Hi {name},\n\nYou've been picked for an Organized Crime: **{crime}**, role **{role}**.\nPlease join it here: [{crime} #{crime_id}]({link})\n\n"
            + 'Tip: the Heart Breakers Suite script shows your OC assignment automatically, so you never miss one - [install the Heart Breakers Suite]({scripts}).\n'
            + 'You can also see your crimes and pass rates on [the Hub]({hub}).\n\nThanks!' };
    function notifyFill(tpl, x) {
        const v = { name: x.name, crime: x.crime, role: x.position, crime_id: x.crime_id, link: OC_CRIME_LINK(x.crime_id),
            scripts: 'https://greasyfork.org/en/scripts/605562-heart-breakers-suite', hub: HUB_BASE + '/m/' };   // (0.2.51) {scripts} = the Suite on Greasy Fork
        return String(tpl).replace(/\{(name|crime|role|crime_id|link|scripts|hub)\}/g, (m, k) => v[k] == null ? '' : String(v[k]));
    }
    const mdPlain = t => t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1: $2').replace(/\*\*([^*]+)\*\*/g, '$1');
    function mdHtml(t) {
        const link = (u, txt) => `<a href="${esc(u)}">${txt}</a>`;
        return t.split(/\n\s*\n/).map(par => {
            const parts = [], re = /\[([^\]]+)\]\((https?:[^)\s]+)\)|(https?:\/\/[^\s<]*[^\s<.,!?;:)])/g; let last = 0, m;
            while ((m = re.exec(par))) { parts.push(esc(par.slice(last, m.index))); parts.push(m[1] ? link(m[2], esc(m[1])) : link(m[3], esc(m[3]))); last = re.lastIndex; }
            parts.push(esc(par.slice(last)));
            return '<p>' + parts.join('').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }
    function notifyMsgs(x) {
        const t = notifyTplS || {}, T = { chat: t.chat || NOTIFY_DEFAULT.chat, subject: t.subject || NOTIFY_DEFAULT.subject, mail: t.mail || NOTIFY_DEFAULT.mail };
        const mail = notifyFill(T.mail, x);
        return { chat: mdPlain(notifyFill(T.chat, x)), subject: mdPlain(notifyFill(T.subject, x)), mail: mdPlain(mail), mailHtml: mdHtml(mail) };
    }
    // rich-text copy (HTML + plain text) so links stay clickable in Torn's mail editor
    async function copyRich(html, text) {
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
                return true;
            }
        } catch (e) { /* fall through */ }
        try {
            const d = document.createElement('div'); d.contentEditable = 'true'; d.innerHTML = html;
            d.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'; document.body.appendChild(d);
            const r = document.createRange(); r.selectNodeContents(d); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
            const ok = document.execCommand('copy'); sel.removeAllRanges(); d.remove(); return ok;
        } catch (e) { return copyText(text); }
    }
    // NOTIFIED STATUS (2.7.4; 0.2.81: one short coloured line, was a capital-letter pill + a second line): the shared
    // contact log entry ({at, crime, crime_id, role, how, by}) -> "Notified 13h ago · marked · Chris5295"
    const ntfSame = x => !!(x.contacted && x.contacted.at && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position);
    function ntfBadge(x) {
        const c = x.contacted, line = (cls, t) => `<span class="hbs-ntfs ${cls}" title="${esc(t)}">${esc(t)}</span>`;
        if (!c || !c.at) return line('hbs-bad', 'Not notified yet');
        const mins = Math.max(0, Math.round((Date.now() - c.at) / 60000));
        const ago = mins < 60 ? mins + 'm ago' : mins < 2880 ? Math.round(mins / 60) + 'h ago' : Math.round(mins / 1440) + 'd ago';
        const same = ntfSame(x), how = { chat: 'chat', mail: 'mail', sent: 'marked' }[c.how] || c.how || '';
        const by = c.by ? ' · ' + String(c.by).replace(/ \[\d+\]$/, '') : '';
        return same ? line('hbs-good', `Notified ${ago}${how ? ' · ' + how : ''}${by}`)
                    : line('hbs-ntfw', `Other crime ${ago} · was ${c.crime && c.crime !== x.crime ? c.crime + ' · ' : ''}${c.role || '?'}${how ? ' · ' + how : ''}${by}`);
    }
    // (0.2.81) THE NOTIFY LIST - used by 🔔 Alerts and 🕵 OC → Leaders. NT = the Hub's oc_notify rows (notifyList - the
    // buttons carry each row's index in it); nameHtml(x) = how the name is drawn; max = most rows shown (0 = all).
    function ntfListHtml(NT, nameHtml, max) {
        const idx = NT.map((x, i) => i), todo = idx.filter(i => !ntfSame(NT[i])), done = idx.filter(i => ntfSame(NT[i]));
        const cap = max ? Math.max(0, max - todo.length) : Infinity;
        const row = i => { const x = NT[i]; return `<div class="hbs-li hbs-ntf" title="${esc(x.name)} - ${esc(x.crime)} #${esc(x.crime_id)} · ${esc(x.position)}"><span class="hbs-ntfl"><b class="hbs-ntfn">${nameHtml(x)}</b>
                <span class="hbs-ntfc">${esc(x.crime)} · ${esc(x.position)}</span><span data-ntfst="${i}">${ntfBadge(x)}</span></span>
            <span class="hbs-ntfb"><button class="hbs-btn" data-ntf="chat" data-i="${i}" title="Chat">💬</button><button class="hbs-btn" data-ntf="mail" data-i="${i}" title="Mail">✉️</button><button class="hbs-btn" data-ntf="sent" data-i="${i}" title="Mark as notified">✓</button></span></div>`; };
        return (todo.length ? `<div class="hbs-ntfh">Needs a message · ${todo.length}</div>` + (max ? todo.slice(0, max) : todo).map(row).join('') : '<div class="hbs-hint hbs-good" style="text-align:left">✓ Everyone has been notified.</div>')
            + (done.length ? cFold('ntfdone', '✅', 'Already notified', `<b class="hbs-foldn">${done.length}</b>`, done.slice(0, cap).map(row).join('') || '<div class="hbs-hint">Listed in OC Management → Notify.</div>') : '');
    }
    // [HB Suite] Hub API — op "oc_contacted": log the contact in the Hub's shared Notify log (leaders)
    function logContact(x, how) {
        x.contacted = { at: Date.now(), crime: x.crime, crime_id: x.crime_id, role: x.position, how, by: 'you' };
        const el = bodyEl.querySelector(`[data-ntfst="${notifyList.indexOf(x)}"]`); if (el) el.innerHTML = ntfBadge(x);
        hub('oc_contacted', { entry: { pid: x.pid, crime: x.crime, crime_id: x.crime_id, role: x.position, how } }).catch(() => { /* best effort */ });
    }
    async function notifyClick(b) {
        const x = notifyList[Number(b.dataset.i)]; if (!x) return;
        const k = x.pid + ':' + x.crime_id, msgEl = bodyEl.querySelector('[data-ntfmsg]');
        const say = t => { if (msgEl) msgEl.textContent = t; };
        logContact(x, b.dataset.ntf);                                    // shared log + green pill at once (2.7.4)
        if (b.dataset.ntf === 'sent') return;
        const m = notifyMsgs(x), chat = b.dataset.ntf === 'chat';
        // (0.2.23) like 🤝 Recruit: the compose page fills in subject + message (rsMailFill), the profile's new chat box gets
        // the chat text (ocChatFill) - saved BEFORE the tab opens; the copy stays as the fallback. You press Send.
        if (chat) store.set(K.chatFill, { pid: Number(x.pid), text: m.chat, at: Date.now() });
        else store.set(K.mailFill, { pid: Number(x.pid), subject: m.subject, html: m.mailHtml, text: m.mail, at: Date.now() });
        const ok = chat ? await copyText(m.chat) : await copyRich(m.mailHtml, m.mail);   // mail: clickable links
        const url = chat ? `https://www.torn.com/profiles.php?XID=${x.pid}` : `https://www.torn.com/messages.php#/p=compose&XID=${x.pid}`;
        say(ok ? (chat ? `On ${x.name}'s profile tap Chat - the message is typed in for you; press Enter to send. (Also copied.)` : `Opening the mail - subject and message are filled in for you; check it and press Send. (Also copied.)`)
               : `Couldn't copy on this device - the message: ${chat ? m.chat : m.mail}`);
        const w = window.open(url, '_blank'); if (!w) location.href = url;   // PDA / popup blocked: same tab
    }
    function download(name, blobOrUrl) {
        const a = document.createElement('a'); a.download = name;
        a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
        document.body.appendChild(a); a.click(); a.remove();
    }

    class HubError extends Error { constructor(message, relink) { super(message); this.relink = !!relink; } }

    // ---------------------------------------------------------------------
    // HUB REQUESTS — POST /sx. TornPDA: PDA_httpPost; desktop: GM_xmlhttpRequest; else fetch (CORS allowed).
    // ---------------------------------------------------------------------
    function rawPost(body) {
        const url = HUB_BASE + '/sx';
        const payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const done = (status, txt) => {
                let r = null; try { r = txt ? JSON.parse(txt) : null; } catch (e) { /* handled below */ }
                if (r == null) return reject(new HubError(`Hub error (${status || 'no response'}).`));
                if (r && r.ok === false) return reject(new HubError(r.error || `Hub error (${status}).`, r.relink));
                // save-route errors come back as GitHub's own JSON ({message}); 409 = someone else saved first
                if (num(status) >= 400) return reject(new HubError(num(status) === 409 ? 'Someone else saved at the same time - try again.' : (r.message || `Hub error (${status}).`)));
                resolve({ status: num(status), data: r });
            };
            if (typeof PDA_httpPost === 'function') {
                try {
                    Promise.resolve(PDA_httpPost(url, { 'Content-Type': 'application/json' }, payload))
                        .then(r => done(r && r.status, (r && (r.responseText || r.response || r.body || r.text)) || ''))
                        .catch(() => reject(new HubError('Hub unreachable.')));
                    return;
                } catch (e) { /* fall through */ }
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST', url, data: payload, timeout: 25000, headers: { 'Content-Type': 'application/json' },
                    onload: r => done(r.status, r.responseText),
                    onerror: () => reject(new HubError('Hub unreachable.')),
                    ontimeout: () => reject(new HubError('Hub timed out.')),
                });
                return;
            }
            fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })
                .then(r => r.text().then(t => done(r.status, t)))
                .catch(() => reject(new HubError('Hub unreachable.')));
        });
    }

    const getKey = () => isPDA() ? PDA_KEY : String(store.get(K.key, '') || '').trim();

    // [HB Suite] Torn API — every Torn call goes through here (GET, key in Torn's own address as Torn requires; it goes
    // to Torn only, never to the Hub). comment=HBSuite on every call.
    // SHARED TORN BUDGET (suite): one queue for every module - calls go out >= TORN_GAP ms apart
    const TORN_GAP = 650;
    let tornNext = 0;
    // (0.2.89) 10. counts of Torn reads by type since the last check-in (numbers only - see build_patch_0289.py)
    const tornCount = {};
    const tornKind = url => { const m = String(url).replace(/^https:\/\/api\.torn\.com\//, '').split('?'); const sel = (m[1] || '').match(/selections=([^&]*)/);
        return (m[0].replace(/\/\d+/g, '/#').replace(/\/$/, '') + (sel ? ':' + sel[1] : '') + (/cat=(\w+)/.test(m[1] || '') ? ':' + RegExp.$1 : '')).slice(0, 30); };
    // (0.2.89) 1. the same URL asked again within TORN_MEMO_MS gets the kept answer (Torn caches ~30 s anyway)
    const TORN_MEMO_MS = 30000, tornMemo = new Map();
    async function tornGet(url) {
        const hit = tornMemo.get(url);
        if (hit && Date.now() - hit.at < TORN_MEMO_MS) return hit.p;
        const p = tornGetRaw(url);
        tornMemo.set(url, { at: Date.now(), p }); if (tornMemo.size > 40) tornMemo.delete(tornMemo.keys().next().value);
        p.catch(() => tornMemo.delete(url));                   // a failed read is never kept
        return p;
    }
    async function tornGetRaw(url) {
        const k = tornKind(url); tornCount[k] = (tornCount[k] || 0) + 1;
        const wait = Math.max(0, tornNext - Date.now());
        tornNext = Math.max(Date.now(), tornNext) + TORN_GAP;
        if (wait) await sleep(wait);
        return tornCall(url);
    }
    function tornCall(url) {
        const u = url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(getKey()) + '&comment=' + API_COMMENT;
        return new Promise((resolve, reject) => {
            const fail = () => reject(new HubError("Torn didn't answer - try again."));
            const done = txt => {
                let d = null; try { d = JSON.parse(txt); } catch (e) { /* below */ }
                if (!d) return fail();
                if (d.error) return reject(new HubError('Torn: ' + (d.error.error || 'key error') + (d.error.code === 2 ? ' - check your API key in ⚙.' : '')
                    + (d.error.code === 16 ? ' - this needs a key with Faction API access.' : '')));
                resolve(d);
            };
            if (typeof PDA_httpGet === 'function') {
                Promise.resolve(PDA_httpGet(u)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(fail);
                return;
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'GET', url: u, timeout: 20000, onload: r => done(r.responseText), onerror: fail,
                                    ontimeout: () => reject(new HubError('Torn timed out - try again.')) });
                return;
            }
            fetch(u).then(r => r.text()).then(done).catch(fail);
        });
    }

    // (0.2.83) 🔑 KEYLESS: a real key = 16 letters/numbers (on PDA the placeholder stays when PDA has no key set)
    const keyOk = () => /^[A-Za-z0-9]{16}$/.test(getKey());
    // YOUR OWN name + profile ID from Torn's sidebar (the logged-in player's block). Exactly one distinct profile link
    // with a plain player name must be found - none or several = don't guess. If Torn's "uid" cookie is readable it must
    // agree. The Hub then checks the name + ID pair against its member list.
    // Sign in: read who this key belongs to (Torn, in the browser), send only {pid, faction, name} to the Hub.
    let signingIn = null;
    function signIn() {
        if (signingIn) return signingIn;
        signingIn = (async () => {
            if (!keyOk()) throw new HubError('Add your API key first: ⚙ → API key.', true);   // (0.2.86: no keyless sign-in)
            // [HB Suite] Torn API — sign-in: this key's own profile (id, name, faction)
            const p = await tornGet('https://api.torn.com/user/?selections=profile');
            const id = { pid: p.player_id, faction: p.faction && p.faction.faction_id, name: p.name };
            // [HB Suite] Hub API — op "hello": client-reported identity -> session (no key is sent)
            const r = (await rawPost(Object.assign({ op: 'hello' }, id))).data;
            store.set(K.session, { code: r.code, exp: r.exp });
            setMe(r.me);
            return r.code;
        })().finally(() => { signingIn = null; });
        return signingIn;
    }

    // [HB Suite] Hub API — every Hub call goes through here (the Hub session, never a Torn key). Signs in by itself
    // when there's no session yet or it ran out (once per call).
    let shareMemo = null;                                   // (0.2.26) {at, p} - the last op share_get
    let whoMemo = null;                                     // (0.2.27) {at, p} - the last op whoami
    async function hub(op, extra) {
        if (op === 'whoami') {
            if (whoMemo && Date.now() - whoMemo.at < 30000) return whoMemo.p;
            const p = (async () => { const ses = store.get(K.session, null);
                if (!(ses && ses.code && ses.exp > Date.now() + 60000) || (ses.keyless && keyOk())) { await signIn(); if (me) return { ok: true, me }; }   // the hello just answered it (0.2.83: + a keyless session once a key is there)
                return hubCall(op, extra); })();
            whoMemo = { at: Date.now(), p }; p.catch(() => { whoMemo = null; }); return p;
        }
        if (op === 'share_get' && shareMemo && Date.now() - shareMemo.at < 60000) return shareMemo.p;
        if (op === 'share_get') { const p = hubCall(op, extra); shareMemo = { at: Date.now(), p }; p.catch(() => { shareMemo = null; }); return p; }
        if (op === 'share_set') shareMemo = null;
        return hubCall(op, extra);
    }
    async function hubCall(op, extra) {
        if ((/^(rc|rcset|cwcfg|oc_contacted|share_set)$/.test(op) && !/^(get|list|page)$/.test(String((extra || {}).do || ''))) || (op === 'gh' && (extra || {}).method === 'PUT')) { try { liveClear(); } catch (e) { /* not set up yet */ } }   // only changes that alter a live read   // (0.2.24) a change -> fresh live reads
        const ses = store.get(K.session, null);
        let code = ses && ses.code && ses.exp > Date.now() + 60000 && !(ses.keyless && keyOk()) ? ses.code : null;   // (0.2.83)
        if (!code) code = await signIn();
        try {
            return (await rawPost(Object.assign({ code, op }, extra || {}))).data;
        } catch (e) {
            if (!e.relink) throw e;
            store.set(K.session, null);
            code = await signIn();                    // session refused (expired / no longer valid): once more
            return (await rawPost(Object.assign({ code, op }, extra || {}))).data;
        }
    }

    // [HB Suite] Hub API — read a Hub data file (op "read"), cached CACHE_MS in memory.
    const cache = {};
    const readsOut = {};                                    // (0.2.27) file reads in flight - shared
    async function readFile(area, path, force) {
        const k = area + ':' + path;
        if (!force && cache[k] && Date.now() - cache[k].at < CACHE_MS) return cache[k].data;
        if (readsOut[k]) return readsOut[k];
        readsOut[k] = hub('read', { area, path }).then(d => { cache[k] = { at: Date.now(), data: d }; return d; }).finally(() => { delete readsOut[k]; });
        return readsOut[k];
    }
    const optMiss = {};
    const readOpt = (area, path) => { const k = area + ':' + path; if (optMiss[k] && Date.now() - optMiss[k] < 60000) return Promise.resolve(null);
        return readFile(area, path).then(d => { delete optMiss[k]; return d; }, () => { optMiss[k] = Date.now(); return null; }); };   // optional files (may not exist yet)

    // [HB Suite] Hub API — live data (op "live"): board / schedule / scripts / readiness / spawn. Not cached (polled).
    const LIVE_TTL = 30000, liveMemo = {};
    const liveClear = () => { Object.keys(liveMemo).forEach(k => delete liveMemo[k]); };
    const live = what => {
        const m = liveMemo[what], now = Date.now();
        if (m && now - m.at < LIVE_TTL) return m.p;
        const p = hub('live', { what }); liveMemo[what] = { at: now, p };
        p.catch(() => { if (liveMemo[what] && liveMemo[what].p === p) delete liveMemo[what]; });   // a failed read isn't kept
        return p;
    };

    // [HB Suite] Hub API — config.json through the leaders' save route (op "gh"): read, change, write back.
    async function editConfig(mutate, message) {
        const j = await hub('gh', { method: 'GET', path: 'config.json', ref: 'main' });
        if (!j || !j.content || !j.sha) throw new HubError("Couldn't read the Hub settings.");
        const c = JSON.parse(b64ToText(j.content));
        mutate(c);
        await hub('gh', { method: 'PUT', path: 'config.json',
                          body: { message, sha: j.sha, branch: 'main', content: textToB64(JSON.stringify(c, null, 2) + '\n') } });
        return c;
    }
    // [HB Suite] Hub API — config.json (read only)
    async function readConfig() {
        const j = await hub('gh', { method: 'GET', path: 'config.json', ref: 'main' });
        return JSON.parse(b64ToText(j.content));
    }

    // ---------------------------------------------------------------------
    // STYLES (suite house style: dark panel + amber accent)
    // ---------------------------------------------------------------------
    function injectStyles() {
        const s = document.createElement('style');
        s.id = 'hbs-styles';
        s.textContent = `
            #hbs-panel{position:fixed;z-index:2147482000;display:none;flex-direction:column;
                width:min(430px, calc(100vw - 16px));height:min(680px, 82vh);
                background:var(--bg);color:var(--txt);border:1px solid var(--edge);border-radius:10px;
                font:12px/1.4 var(--font);box-shadow:0 6px 24px rgba(0,0,0,.55);overflow:hidden;}
            #hbs-panel.hbs-open{display:flex;}
            /* resize grip (v2.4.0) - bottom-right corner, touch friendly */
            #hbs-panel .hbs-grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:3;
                touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:flex-end;justify-content:flex-end;
                padding:0 3px 2px 0;color:#6b7280;font-size:13px;line-height:1;}
            #hbs-panel .hbs-grip:hover,#hbs-panel .hbs-grip.hbs-on{color:var(--acc);}
            #hbs-panel.hbs-resizing{user-select:none;-webkit-user-select:none;}
            #hbs-panel *{box-sizing:border-box;}
            #hbs-panel .hbs-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 10px;
                background:var(--bg);border-bottom:1px solid var(--edge);cursor:move;
                user-select:none;-webkit-user-select:none;touch-action:none;}
            #hbs-panel .hbs-title{font-weight:bold;color:var(--acc);}
            #hbs-panel .hbs-ver{margin-left:6px;font-size:10px;color:var(--link);}
            #hbs-panel .hbs-who{font-size:10.5px;opacity:.7;margin-left:6px;}
            #hbs-panel .hbs-ctrls{display:flex;gap:4px;}
            #hbs-panel .hbs-ibtn{cursor:pointer;min-width:26px;height:24px;padding:0 6px;color:var(--txt);background:var(--raise);
                border:1px solid var(--edge);border-radius:5px;font:13px/22px var(--font);}
            #hbs-panel .hbs-ibtn:hover,#hbs-panel .hbs-ibtn.hbs-on{border-color:var(--acc);color:var(--acc);}
            /* tab bar wraps onto more rows when the tabs don't fit (user, Nov 11 2026: "Make the header multiple rows if necessary") */
            #hbs-panel .hbs-tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--edge);background:var(--card);flex:0 0 auto;padding:0 2px;}
            #hbs-panel .hbs-tabs button{flex:1 0 auto;cursor:pointer;padding:7px 8px;background:none;border:0;color:#cfd3d9;white-space:nowrap;
                font:bold 11.5px var(--font);border-bottom:2px solid transparent;touch-action:manipulation;}
            #hbs-panel .hbs-tabs button.hbs-on{color:var(--acc);border-bottom-color:var(--acc);}
            #hbs-panel .hbs-tabs button.hbs-lead{color:#e8be5a;}
            #hbs-panel .hbs-tabs .hbs-sep{flex:0 0 1px;background:var(--edge);margin:6px 2px;}
            #hbs-panel .hbs-bar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:7px 10px 0;}
            #hbs-panel .hbs-btn{cursor:pointer;padding:5px 9px;color:var(--bg);background:var(--acc);border:0;border-radius:6px;
                font:bold 11px var(--font);touch-action:manipulation;text-decoration:none;display:inline-block;}
            #hbs-panel .hbs-btn.hbs-ghost{color:var(--txt);background:var(--raise);border:1px solid var(--edge);}
            #hbs-panel .hbs-btn.hbs-ghost:hover{border-color:var(--acc);}
            #hbs-panel .hbs-btn:disabled{opacity:.45;cursor:default;}
            #hbs-panel .hbs-input{min-width:0;padding:5px 7px;color:var(--txt);background:var(--well);border:1px solid var(--edge);
                border-radius:6px;font:12px var(--font);}
            #hbs-panel .hbs-input:focus{outline:none;border-color:var(--acc);}
            #hbs-panel .hbs-status{padding:5px 10px;font-size:11px;opacity:.85;min-height:16px;}
            #hbs-panel .hbs-status.hbs-err{color:#FF7676;opacity:1;}
            #hbs-panel .hbs-body{flex:1 1 auto;overflow-y:auto;padding:0 10px 12px;-webkit-overflow-scrolling:touch;}
            #hbs-panel .hbs-empty{padding:20px 4px;text-align:center;opacity:.65;}
            #hbs-panel .hbs-card{border:1px solid var(--edge);border-left:3px solid var(--edge);border-radius:8px;background:var(--card);
                padding:7px 8px;margin-top:7px;}
            #hbs-panel .hbs-card.hbs-gold{border-left-color:var(--acc);}
            #hbs-panel .hbs-card.hbs-green{border-left-color:#5fd38a;}
            #hbs-panel .hbs-card.hbs-red{border-left-color:#FF7676;}
            #hbs-panel .hbs-r1{display:flex;align-items:center;gap:6px;cursor:pointer;}
            #hbs-panel .hbs-name{color:var(--link);font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
            #hbs-panel a.hbs-name{text-decoration:none;}
            #hbs-panel .hbs-sub{font-size:11px;opacity:.75;margin-top:2px;}
            #hbs-panel .hbs-chip{margin-left:auto;flex:0 0 auto;font-size:10.5px;font-weight:bold;padding:1px 7px;border-radius:9px;
                background:var(--well);border:1px solid var(--edge);white-space:nowrap;}
            #hbs-panel .hbs-tag{font-size:10px;padding:1px 6px;border-radius:5px;background:#3a2d12;color:var(--acc);border:1px solid #6b4a18;white-space:nowrap;}
            #hbs-panel .hbs-tag.hbs-red{background:#3a1414;color:#FF7676;border-color:#7a2f2f;}
            #hbs-panel .hbs-tag.hbs-green{background:#143a20;color:#8ee6ae;border-color:#2f7a4c;}
            #hbs-panel .hbs-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
            #hbs-panel .hbs-detail{margin-top:6px;padding:6px;border-radius:6px;background:var(--well);border:1px solid var(--edge2);}
            #hbs-panel .hbs-kv{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:11.5px;}
            #hbs-panel .hbs-kv b{color:#fff;text-align:right;}
            #hbs-panel .hbs-list{max-height:220px;overflow-y:auto;margin-top:5px;}
            #hbs-panel .hbs-li{display:flex;gap:6px;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--line);font-size:11.5px;}
            #hbs-panel .hbs-li.hbs-low{color:#FF7676;}
            #hbs-panel .hbs-img{display:block;width:100%;max-height:170px;object-fit:cover;object-position:top;border-radius:6px;
                border:1px solid var(--edge2);margin-top:6px;background:var(--well);}
            #hbs-panel canvas{width:100%;height:auto;display:block;border-radius:6px;border:1px solid var(--edge2);margin-top:6px;}
            #hbs-panel .hbs-msg{font-size:11px;color:var(--acc);margin-top:5px;word-break:break-word;}
            #hbs-panel .hbs-sec{margin:10px 0 5px;font-weight:bold;color:var(--acc);border-bottom:1px solid var(--edge);padding-bottom:3px;}
            #hbs-panel .hbs-hint{font-size:10.5px;opacity:.65;margin-top:3px;}
            #hbs-panel textarea.hbs-input{width:100%;min-height:70px;resize:vertical;font:11px monospace;word-break:break-all;}
            #hbs-panel .hbs-lvadd{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px;}
            #hbs-panel .hbs-lvadd label{display:flex;flex-direction:column;gap:2px;font-size:10.5px;opacity:.85;}

            /* --- v2 building blocks --- */
            #hbs-panel .hbs-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;margin-top:7px;}
            #hbs-panel .hbs-tiles div{background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px;text-align:center;min-width:0;}
            #hbs-panel .hbs-tiles b{display:block;color:#fff;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-tiles > div > span{display:block;font-size:9.5px;opacity:.7;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-tiles i{display:block;font-style:normal;font-size:10px;opacity:.75;margin-top:1px;}
            #hbs-panel .hbs-up{color:#8ee6ae;} #hbs-panel .hbs-down{color:#FF7676;}
            #hbs-panel .hbs-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px;}
            #hbs-panel .hbs-chips button{cursor:pointer;padding:4px 9px;border-radius:12px;background:var(--card);border:1px solid var(--edge);color:#cfd3d9;
                font:11px var(--font);touch-action:manipulation;}
            #hbs-panel .hbs-chips button.hbs-on{background:var(--acc);color:var(--bg);border-color:var(--acc);font-weight:bold;}
            #hbs-panel .hbs-meter{margin-top:4px;}
            #hbs-panel .hbs-meter .l{display:flex;justify-content:space-between;font-size:11px;}
            #hbs-panel .hbs-meter .t{height:6px;border-radius:3px;background:var(--well);overflow:hidden;margin-top:2px;}
            #hbs-panel .hbs-meter .t i{display:block;height:100%;}
            #hbs-panel table.hbs-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:5px;}
            #hbs-panel table.hbs-tbl th{color:var(--acc);font-weight:bold;text-align:right;padding:3px 4px;border-bottom:1px solid var(--edge);white-space:nowrap;}
            #hbs-panel table.hbs-tbl td{text-align:right;padding:3px 4px;border-bottom:1px solid var(--line);white-space:nowrap;}
            #hbs-panel table.hbs-tbl th:first-child,#hbs-panel table.hbs-tbl td:first-child{text-align:left;}
            #hbs-panel table.hbs-tbl td.hbs-nm{max-width:120px;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
            #hbs-panel .hbs-form label{display:block;font-size:10.5px;opacity:.8;margin:6px 0 2px;}
            #hbs-panel .hbs-form .hbs-input{width:100%;}
            #hbs-panel .hbs-row{display:flex;gap:5px;align-items:center;margin-top:4px;}
            #hbs-panel .hbs-row > *{min-width:0;}
            #hbs-panel .hbs-row .hbs-input{flex:1 1 0;}
            #hbs-panel .hbs-row .hbs-btn{flex:0 0 auto;}
            #hbs-panel .hbs-ck,#hbs-panel .hbs-form label.hbs-ck{display:flex;gap:6px;align-items:center;font-size:11.5px;margin-top:5px;cursor:pointer;}
            #hbs-panel .hbs-ck input{width:16px;height:16px;flex:0 0 auto;}
            #hbs-panel .hbs-item{border:1px solid var(--edge2);border-radius:7px;padding:6px;margin-top:6px;background:var(--well2);}
            #hbs-panel .hbs-bad{color:#FF7676;} #hbs-panel .hbs-good{color:#8ee6ae;}
            #hbs-panel .hbs-paid td{opacity:.45;}
            #hbs-panel a{color:var(--link);}
            /* leaderboards (v2.1.0) */
            #hbs-panel .hbs-lb{border:1px solid var(--edge);border-radius:9px;background:var(--card);margin-top:8px;overflow:hidden;}
            #hbs-panel .hbs-lb .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:8px 10px;background:var(--raise2);border-bottom:1px solid var(--edge);}
            #hbs-panel .hbs-lb .h b{color:var(--acc);font-size:11px;text-transform:uppercase;letter-spacing:.9px;}
            #hbs-panel .hbs-lb .h span{font-size:10.5px;opacity:.65;white-space:nowrap;}
            #hbs-panel .hbs-lb .r{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:9px;align-items:center;padding:6px 10px;cursor:pointer;}
            #hbs-panel .hbs-lb .r + .r{border-top:1px solid var(--raise2);}
            #hbs-panel .hbs-lb .r:hover{background:var(--raise2);}
            #hbs-panel .hbs-lb .rk{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:bold;
                background:var(--well);color:#9aa0a8;border:1px solid var(--edge);}
            #hbs-panel .hbs-lb .r1 .rk{background:#e8be5a;color:var(--bg);border-color:#e8be5a;}
            #hbs-panel .hbs-lb .r2 .rk{background:#c3c9d2;color:var(--bg);border-color:#c3c9d2;}
            #hbs-panel .hbs-lb .r3 .rk{background:#cd8b52;color:var(--bg);border-color:#cd8b52;}
            #hbs-panel .hbs-lb .nm > span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--txt);font-weight:bold;font-size:12px;}
            #hbs-panel .hbs-lb .nm small{font-weight:normal;font-size:9.5px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-lb .nm i{display:block;height:3px;border-radius:2px;background:#2e323a;margin-top:4px;}
            #hbs-panel .hbs-lb .nm em{display:block;height:100%;border-radius:2px;background:var(--acc);opacity:.75;}
            #hbs-panel .hbs-lb .r1 .nm em{opacity:1;}
            #hbs-panel .hbs-lb .v{font-weight:bold;color:#fff;font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap;}
            #hbs-panel .hbs-lb .r.me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-lb .gap{text-align:center;opacity:.4;font-size:11px;line-height:10px;}
            #hbs-panel .hbs-lb .none{padding:10px;text-align:center;opacity:.6;font-size:11.5px;}
            /* war detail (v2.2.1): compact rows, own scroll area with room for the scroll bar */
            #hbs-panel .hbs-wtiles .hbs-tiles{grid-template-columns:repeat(auto-fill,minmax(70px,1fr));}
            /* average marker (v2.4.1): blue vertical line across each bar at the war's average */
            #hbs-panel .hbs-wl .nm i{position:relative;height:4px;overflow:visible;}
            #hbs-panel .hbs-wl .nm i u{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--link);border-radius:1px;box-shadow:0 0 0 1px rgba(20,22,27,.8);}
            #hbs-panel .hbs-avgkey{display:inline-block;width:2px;height:10px;background:var(--link);border-radius:1px;margin-right:4px;vertical-align:-1px;}
            #hbs-panel .hbs-wtiles .hbs-tiles b{font-size:13.5px;}
            /* thin dark scroll bars in the panel (v2.2.1) */
            #hbs-panel, #hbs-panel *{scrollbar-width:thin;scrollbar-color:#4a505b transparent;}
            #hbs-panel ::-webkit-scrollbar{width:6px;height:6px;}
            #hbs-panel ::-webkit-scrollbar-track{background:transparent;}
            #hbs-panel ::-webkit-scrollbar-thumb{background:#4a505b;border-radius:3px;}
            /* armory use cards (v2.4.2): items grouped by type */
            #hbs-panel .hbs-arm .hbs-ag{margin-top:6px;}
            #hbs-panel .hbs-arm .hbs-agh{font-size:10.5px;color:var(--acc);text-transform:uppercase;letter-spacing:.6px;font-weight:bold;}
            #hbs-panel .hbs-arm .hbs-agh b{color:#fff;margin-left:3px;}
            #hbs-panel .hbs-arm .hbs-agi{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;}
            #hbs-panel .hbs-arm .hbs-agi span{font-size:11px;background:var(--well2);border:1px solid var(--edge2);border-radius:5px;padding:2px 6px;white-space:nowrap;}
            #hbs-panel .hbs-arm .hbs-agi b{color:#fff;}
            /* member card stats (v2.4.3) */
            #hbs-panel .hbs-ms{margin-top:5px;border-top:1px solid var(--edge2);padding-top:4px;}
            #hbs-panel .hbs-msr{display:grid;grid-template-columns:58px 52px repeat(4,minmax(0,1fr));align-items:stretch;gap:3px;
                font-size:11px;padding:2px 0;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-msr .k{color:var(--acc);font-weight:bold;white-space:nowrap;align-self:center;}
            #hbs-panel .hbs-src{display:block;font-size:10px;font-weight:normal;letter-spacing:1px;margin-top:1px;}
            #hbs-panel .hbs-msr .t{color:#fff;text-align:right;padding-right:4px;align-self:center;white-space:nowrap;}
            #hbs-panel .hbs-msr .na{grid-column:2 / -1;align-self:center;opacity:.45;font-size:10.5px;font-style:italic;}
            #hbs-panel .hbs-msr .p{background:var(--well2);border-radius:4px;padding:1px 2px;text-align:center;white-space:nowrap;overflow:hidden;min-width:0;}
            #hbs-panel .hbs-msr .p.e{background:transparent;}
            #hbs-panel .hbs-msr .p i{display:block;font-style:normal;opacity:.6;font-size:8.5px;letter-spacing:.4px;}
            #hbs-panel .hbs-msr .p b{color:var(--txt);font-size:10.5px;}
            #hbs-panel .hbs-wlist{max-height:300px;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:6px;}
            #hbs-panel .hbs-wl .r{padding:4px 10px;gap:8px;}
            #hbs-panel .hbs-wl .r + .r{border-top:1px solid var(--raise2);}
            #hbs-panel .hbs-wl .v{min-width:34px;text-align:right;}
            #hbs-panel .hbs-wl .r.low .v{color:#FF7676;}
            #hbs-panel .hbs-wl .r.low .nm em{background:#FF7676;}
            /* history rows (v2.1.0 - Me / profile wars + chains) */
            #hbs-panel .hbs-ev{border:1px solid var(--edge2);border-radius:8px;background:var(--card);padding:6px 9px;margin-top:5px;}
            #hbs-panel .hbs-ev.low{border-left:3px solid #FF7676;}
            #hbs-panel .hbs-ev .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
            #hbs-panel .hbs-ev .t b{color:var(--txt);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
            #hbs-panel .hbs-ev .t span{font-size:10.5px;opacity:.6;white-space:nowrap;}
            #hbs-panel .hbs-ev .s{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:5px;}
            #hbs-panel .hbs-ev .s div{text-align:center;background:var(--well2);border-radius:5px;padding:3px 0;}
            #hbs-panel .hbs-ev .s div b{display:block;color:#fff;font-size:12.5px;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-ev .s div span{display:block;font-size:9px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-ev.low .s div:first-child b{color:#FF7676;}

            /* --- launcher (suite FAB) --- */
            #hbs-launcher{position:fixed;z-index:2147481000;width:52px;height:52px;border-radius:50%;display:none;
                align-items:center;justify-content:center;box-sizing:border-box;background:linear-gradient(180deg,var(--raise),var(--bg));
                border:1px solid var(--edge);color:#9aa0a8;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;
                -webkit-touch-callout:none;box-shadow:0 3px 10px rgba(0,0,0,.45);transition:box-shadow .15s,color .15s;}
            #hbs-launcher.hbs-show{display:flex;}
            #hbs-launcher svg{width:26px;height:26px;pointer-events:none;}
            #hbs-launcher:hover{color:var(--acc);box-shadow:0 0 12px rgba(255,180,84,.6);}
            #hbs-launcher::after{content:attr(data-dock-label);position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);
                white-space:nowrap;padding:3px 7px;border-radius:5px;background:var(--bg);border:1px solid var(--edge);color:var(--txt);
                font:11px var(--font);opacity:0;pointer-events:none;transition:opacity .15s;}
            #hbs-launcher:hover::after{opacity:1;}
            @media (max-width:600px), (pointer:coarse){ #hbs-launcher{width:46px;height:46px;} #hbs-launcher svg{width:23px;height:23px;} }
            /* ===== SUITE LOOK (v0.1.0): graphite + amber, chips row, bottom tab bar, More grid ===== */
            #hbs-panel,#hbs-launcher,#hbs-toast{--bg:#111318;--card:#181b21;--edge:#2b3039;--edge2:#262a32;--well:#0c0e12;--well2:#14171c;
                --raise:#20242c;--raise2:#1d2128;--line:#1f232a;--acc:#FFB454;--link:#7CC5FF;--txt:#e7e9ec;--mut:#98a1ab;--ok:#5fd38a;--bad:#FF7676;
                --font:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
            #hbs-panel{border-radius:14px;border-color:var(--edge);box-shadow:0 12px 36px rgba(0,0,0,.6);font-size:12.5px;}
            #hbs-panel .hbs-head{padding:9px 12px 6px;border-bottom:0;}
            #hbs-panel .hbs-title{font-size:13.5px;letter-spacing:.3px;}
            #hbs-panel .hbs-ver{color:var(--mut);}
            #hbs-panel .hbs-ibtn{background:transparent;border-color:transparent;border-radius:8px;}
            #hbs-panel .hbs-ibtn:hover,#hbs-panel .hbs-ibtn.hbs-on{background:var(--raise);}
            #hbs-panel .hbs-chipbar{display:flex;gap:5px;overflow-x:auto;padding:0 12px 8px;flex:0 0 auto;border-bottom:1px solid var(--edge);scrollbar-width:none;}
            #hbs-panel .hbs-chipbar::-webkit-scrollbar{display:none;}
            #hbs-panel .hbs-chipb{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--card);
                border:1px solid var(--edge);color:var(--txt);font:600 11px var(--font);cursor:pointer;white-space:nowrap;touch-action:manipulation;}
            #hbs-panel .hbs-chipb:hover{border-color:var(--acc);}
            #hbs-panel .hbs-dot{width:7px;height:7px;border-radius:50%;background:var(--mut);display:inline-block;}
            #hbs-panel .hbs-dot.ok{background:var(--ok);box-shadow:0 0 6px var(--ok);} #hbs-panel .hbs-dot.warn{background:var(--acc);box-shadow:0 0 6px var(--acc);}
            #hbs-panel .hbs-body{padding:0 12px 14px;}
            #hbs-panel .hbs-tabs{order:9;flex-wrap:nowrap;border-bottom:0;border-top:1px solid var(--edge);background:var(--bg);padding:2px 4px calc(2px + env(safe-area-inset-bottom));}
            #hbs-panel .hbs-tabs button{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px 5px;
                border-bottom:0;border-top:2px solid transparent;color:var(--mut);font:600 10px var(--font);}
            #hbs-panel .hbs-tabs button span{font-size:16px;line-height:18px;}
            #hbs-panel .hbs-tabs button.hbs-on{color:var(--acc);border-top-color:var(--acc);border-bottom-color:transparent;}
            #hbs-panel .hbs-card{border-radius:12px;border-left-width:1px;padding:9px 10px;margin-top:8px;}
            #hbs-panel .hbs-card.hbs-gold,#hbs-panel .hbs-card.hbs-alert{box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-card.hbs-green{box-shadow:inset 3px 0 0 var(--ok);} #hbs-panel .hbs-card.hbs-red{box-shadow:inset 3px 0 0 var(--bad);}
            #hbs-panel .hbs-hero{background:linear-gradient(160deg,#1f232b,#15181d);}
            #hbs-panel .hbs-big{font:700 28px/1.1 var(--font);color:#fff;margin-top:6px;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-big small{display:block;font:500 10.5px var(--font);color:var(--mut);margin-top:2px;}
            #hbs-panel .hbs-banner{margin-top:7px;padding:6px 8px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:11.5px;}
            #hbs-panel .hbs-sec{border-bottom:0;margin:14px 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);}
            #hbs-panel .hbs-li{padding:5px 0;align-items:center;}
            /* 0.2.42 - ⛶ compact view (edge tab) */
            #hbs-launcher.hbs-cvhide{display:none !important;}
            /* (0.2.60) ⛓ queue: podium (top 3) + "also queued" tiles */
            #hbs-panel .hbs-qyou{font-size:11px;color:#bcd9ff;text-align:center;margin:0 0 5px;}
            #hbs-panel .hbs-pod{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
            #hbs-panel .hbs-pt{background:#1b1e24;border:1px solid #2c313a;border-radius:8px;padding:5px 3px 6px;text-align:center;min-width:0;}
            #hbs-panel .hbs-pt.up{border-color:#FFB454;} #hbs-panel .hbs-pt.me, #hbs-panel .hbs-ch.me{box-shadow:inset 0 0 0 1px #6aa9ff;} #hbs-panel .hbs-pt.dim, #hbs-panel .hbs-ch.dim{opacity:.55;}
            #hbs-panel .hbs-pt .hd{display:flex;align-items:center;justify-content:center;gap:4px;min-height:16px;flex-wrap:nowrap;overflow:hidden;} #hbs-panel .hbs-pt .ps{font-size:10px;opacity:.65;flex:0 0 auto;}
            #hbs-panel .hbs-pt b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;font-weight:bold;}
            #hbs-panel .hbs-pt .hbs-qe{display:block;font-size:16px;font-weight:bold;line-height:1.25;} #hbs-panel .hbs-pt .hbs-qe.none{font-size:12px;line-height:20px;}
            #hbs-panel .hbs-qe{cursor:pointer;text-decoration:underline dotted #555;text-underline-offset:3px;white-space:nowrap;} #hbs-panel .hbs-qe.none{cursor:default;text-decoration:none;opacity:.6;}
            #hbs-panel .hbs-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle;flex:0 0 7px;background:#4caf50;} #hbs-panel .hbs-dot.idle{background:#FFB454;} #hbs-panel .hbs-dot.off{background:#666;}
            #hbs-panel .hbs-pt .ic, #hbs-panel .hbs-ch .ic{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 2px;}
            #hbs-panel .hbs-pt .ic{margin-top:5px;padding-top:5px;border-top:1px solid #2c313a;} #hbs-panel .hbs-ch .ic{margin-top:3px;gap:2px 4px;}
            #hbs-panel .hbs-ci{display:flex;align-items:center;justify-content:center;gap:2px;font-size:10px;white-space:nowrap;line-height:13px;} #hbs-panel .hbs-ch .hbs-ci{justify-content:flex-start;}
            #hbs-panel .hbs-ci svg{width:13px;height:13px;flex:0 0 13px;} #hbs-panel .hbs-ci em{font-style:normal;}
            #hbs-panel .hbs-ci.free{color:#7CFC9A;} #hbs-panel .hbs-ci.cd{color:#FFB454;} #hbs-panel .hbs-ci.off{color:#6b7078;}
            #hbs-panel .hbs-qsub{font-size:10.5px;opacity:.65;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;}
            #hbs-panel .hbs-chg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;}
            #hbs-panel .hbs-ch{background:#1b1e24;border:1px solid #2c313a;border-radius:7px;padding:4px 5px;min-width:0;} #hbs-panel .hbs-ch.up{border-color:#FFB454;}
            #hbs-panel .hbs-ch .t{display:flex;align-items:center;gap:4px;min-width:0;} #hbs-panel .hbs-ch .n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:bold;min-width:0;flex:0 1 auto;}
            #hbs-panel .hbs-ch .hbs-qe{margin-left:auto;font-size:11px;padding-left:3px;flex:0 0 auto;}
            #hbs-panel .hbs-pt .hbs-qt, #hbs-panel .hbs-ch .hbs-qt{font-size:10px;line-height:15px;padding:0 6px;border-radius:8px;white-space:nowrap;margin:0;flex:0 0 auto;} #hbs-panel .hbs-qt em{font-style:normal;}
            #hbs-panel .hbs-pt .hbs-qt.up, #hbs-panel .hbs-ch .hbs-qt.up{background:#FFB454;color:#2a1c00;} #hbs-panel .hbs-pt .hbs-qt.bon, #hbs-panel .hbs-ch .hbs-qt.bon{background:#4a3a10;color:#FFD48A;}
            #hbs-panel .hbs-qt.you{background:#1f3a5c;color:#bcd9ff;} #hbs-panel .hbs-rot{display:inline-flex;flex:0 0 auto;} #hbs-panel .hbs-rot > span[hidden]{display:none;}
            /* (0.2.59) key fields: text inputs drawn as dots - not type=password, so password managers leave the page alone */
            #hbs-panel input.hbs-secret{-webkit-text-security:disc;text-security:disc;font-family:text-security-disc,monospace;}
            #hbs-panel label.hbs-ck.hbs-ckx{pointer-events:none;cursor:default;} #hbs-panel label.hbs-ck.hbs-ckx input{pointer-events:auto;cursor:pointer;}
            #hbs-panel .hbs-depm .hbs-cprn{flex:0 0 auto;width:auto;min-width:0;padding:2px 8px;margin:0;font-size:11px;} #hbs-panel .hbs-depm .nt{flex:1 0 100%;opacity:.7;font-size:11px;}
            #hbs-panel .hbs-pay2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:5px 0 3px;} #hbs-panel .hbs-pay2 div{background:rgba(0,0,0,.25);border-radius:7px;padding:5px 4px;text-align:center;}
            #hbs-panel .hbs-pay2 small{display:block;font-size:10px;opacity:.75;text-transform:uppercase;letter-spacing:.3px;} #hbs-panel .hbs-pay2 b{display:block;font-size:19px;color:#7CFC9A;}
            /* (0.2.48) 💩 dumping hits */
            #hbs-panel .hbs-dmbtn{flex:0 0 auto;min-width:0;width:38px;padding-left:0;padding-right:0;font-size:16px;} #hbs-panel .hbs-dmbtn.on{background:#3a2f55;border-color:#9b86e0;}
            #hbs-panel .hbs-dmline{display:flex;align-items:center;gap:8px;text-align:left;background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px 8px;margin-top:7px;font-size:12px;}
            #hbs-panel .hbs-dmline span{flex:1 1 auto;min-width:0;} #hbs-panel .hbs-dmline b{color:#FFB454;} #hbs-panel .hbs-dmline small{opacity:.7;white-space:nowrap;}
            #hbs-panel .hbs-dmline i{flex:1 1 40px;height:4px;border-radius:2px;background:#2c313a;overflow:hidden;} #hbs-panel .hbs-dmline em{display:block;height:100%;background:#9b86e0;}
            #hbs-panel .hbs-dmline .hbs-btn{flex:0 0 auto;width:auto;min-width:0;padding:4px 10px;margin:0;}
            #hbs-panel .hbs-dmstop{background:#5a2626;border:1px solid #ff5b5b;border-radius:8px;padding:9px;margin-top:7px;text-align:center;color:#ffd6d6;font-size:12px;}
            #hbs-panel .hbs-dmstop b{display:block;font-size:16px;color:#fff;} #hbs-panel .hbs-dmstop span, #hbs-panel .hbs-dmstop small{display:block;} #hbs-panel .hbs-dmstop small{opacity:.75;margin-top:3px;}
            #hbs-panel .hbs-qt.dmp{background:#3a2f55;color:#d9ccff;}
            #hbs-dmcover{position:fixed;z-index:2147481500;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:3px;background:#3a1d1d;border:2px dashed #ff5b5b;border-radius:10px;padding:8px 10px;color:#ffd6d6;font:12px/1.3 Arial,sans-serif;text-align:center;cursor:pointer;touch-action:manipulation;}
            #hbs-dmcover b{color:#fff;font-size:13px;} #hbs-dmcover u{text-decoration:none;display:block;background:#8a2a2a;color:#ffe0e0;border-radius:7px;padding:5px;font-weight:bold;margin-top:2px;}
            #hbs-dmwarn{position:fixed;z-index:2147481500;left:8px;right:8px;top:8px;max-width:520px;margin:0 auto;background:#5a4417;border:1px solid #FFB454;border-radius:8px;padding:8px 10px;color:#FFE3B0;font:12px/1.35 Arial,sans-serif;text-align:center;pointer-events:none;}
            /* (0.2.47) alert timer tiles above the Queue: next = amber outline, sent = amber fill (last alert red), off = dimmed (chain under the minimum) */
            #hbs-panel .hbs-altiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:5px;margin-top:7px;}
            #hbs-panel .hbs-altiles div{background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px 2px;text-align:center;min-width:0;}
            #hbs-panel .hbs-altiles span{display:block;font-size:9.5px;opacity:.75;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-altiles b{display:block;color:#ccc;font-size:15px;white-space:nowrap;} #hbs-panel .hbs-altiles i{display:block;font-style:normal;font-size:10px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-altiles .next{border-color:#FFB454;} #hbs-panel .hbs-altiles .next b{color:#FFB454;}
            #hbs-panel .hbs-altiles .sent{background:#5a4417;border-color:#FFB454;} #hbs-panel .hbs-altiles .sent b, #hbs-panel .hbs-altiles .sent span, #hbs-panel .hbs-altiles .sent i{color:#FFD48A;opacity:1;}
            #hbs-panel .hbs-altiles .sent.last{background:#5a2626;border-color:#ff5b5b;} #hbs-panel .hbs-altiles .sent.last b, #hbs-panel .hbs-altiles .sent.last span, #hbs-panel .hbs-altiles .sent.last i{color:#ffc4c4;}
            #hbs-panel .hbs-altiles .off{opacity:.45;} #hbs-panel .hbs-altiles .met b{color:#7CFC9A;}
            #hbs-panel .hbs-altiles .below{border-style:dashed;} #hbs-panel .hbs-altiles .below b{color:#ff8f8f;}
            #hbs-compact{position:fixed;z-index:2147481000;box-sizing:border-box;background:#14161b;border:1px solid #FFB454;color:#e8e8e8;font:13px/1.3 Arial,sans-serif;text-align:center;
                cursor:pointer;user-select:none;-webkit-user-select:none;box-shadow:0 2px 10px rgba(0,0,0,.5);padding:5px 6px;}
            #hbs-compact.cv-right{right:0;border-right:0;border-radius:10px 0 0 10px;} #hbs-compact.cv-left{left:0;border-left:0;border-radius:0 10px 10px 0;}
            #hbs-compact .t{font-weight:bold;color:#fff;font-variant-numeric:tabular-nums;} #hbs-compact .t.amber{color:#FFB454;} #hbs-compact .t.red{color:#ff5b5b;} #hbs-compact .t.dim{color:#777;}
            #hbs-compact .p{font-size:11px;color:#bbb;} #hbs-compact .s{font-size:11px;color:#999;}
            #hbs-compact .pl span{display:inline-block;padding:2px 8px;border-radius:9px;background:#2c313a;color:#ddd;font-weight:bold;font-size:12px;white-space:nowrap;}
            #hbs-compact.up .pl span{background:#2f5d33;color:#c8f5cf;} #hbs-compact.bk .pl span{background:#5a4417;color:#FFD48A;}
            #hbs-compact.cv-right.up{border-left:3px solid #4caf50;} #hbs-compact.cv-right.bk{border-left:3px solid #FFB454;}
            #hbs-compact.cv-left.up{border-right:3px solid #4caf50;} #hbs-compact.cv-left.bk{border-right:3px solid #FFB454;}
            #hbs-compact .b{display:block;width:100%;margin-top:6px;padding:8px 6px;border:0;border-radius:8px;background:#FFB454;color:#2a1c00;font:bold 13px Arial,sans-serif;cursor:pointer;touch-action:none;}
            #hbs-compact .b.on{background:#2f5d33;color:#c8f5cf;}
            #hbs-compact .x{position:absolute;top:2px;font-size:13px;color:#999;padding:2px 5px;} #hbs-compact.cv-right .x{left:2px;} #hbs-compact.cv-left .x{right:2px;}
            #hbs-compact.cv-l:not(.open) .t{font-size:16px;} #hbs-compact.cv-s:not(.open){padding:4px 6px;} #hbs-compact.cv-s:not(.open) .t{font-size:13px;}
            #hbs-compact.cv-l.open{width:138px;padding:8px;} #hbs-compact.cv-l.open .t{font-size:30px;line-height:1.2;} #hbs-compact.cv-l.open .pl{margin:4px 0 2px;}
            #hbs-compact.cv-s.open{width:100px;padding:6px;} #hbs-compact.cv-s.open .r{display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:8px;}
            #hbs-compact.cv-s.open .t{font-size:21px;} #hbs-compact.cv-s.open .pl span{font-size:11px;padding:1px 6px;} #hbs-compact.cv-s.open .b{font-size:12px;padding:7px 4px;margin-top:5px;}
            #hbs-compact.flash{animation:hbsCvFlash .9s steps(1,end) infinite;} #hbs-compact.flash.panic{animation-duration:.45s;}
            @keyframes hbsCvFlash{0%{background:#7a1410;border-color:#ff3b30;}50%{background:#14161b;border-color:#FFB454;}}
            #hbs-panel .hbs-cvopt{text-align:left;margin-top:6px;}
            /* 0.2.40 - queue cover headline + time setting row */
            #hbs-panel .hbs-cover{margin:8px 0 2px;padding:9px 12px;border-radius:9px;text-align:left;border:1px solid #2f5d33;background:#16261b;color:#c8f5cf;}
            #hbs-panel .hbs-cover .h{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;}
            #hbs-panel .hbs-cover .h i{font-style:normal;font-size:15px;}
            #hbs-panel .hbs-cover .h b{font-size:14.5px;}
            #hbs-panel .hbs-cover .h span{margin-left:auto;font-size:11.5px;opacity:.85;white-space:nowrap;}
            #hbs-panel .hbs-cover .d{margin-top:5px;font-size:11.5px;opacity:.9;line-height:1.5;}
            #hbs-panel .hbs-cover .d .y{color:#7CFC9A;font-weight:bold;} #hbs-panel .hbs-cover .d .n{color:#ff8f8f;font-weight:bold;}
            #hbs-panel .hbs-cover.warn{border-color:#6b4a18;background:#2a2414;color:#ffd9a0;}
            #hbs-panel .hbs-cover.low{border-color:#7a3a3a;background:#3a1f1f;color:#ffd0d0;}
            #hbs-panel .hbs-tzrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;text-align:left;}
            #hbs-panel .hbs-tzrow > span:first-child{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-tzrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-tzrow .hbs-chips{flex:0 0 auto;margin:0;}
            #hbs-panel .hbs-tzset{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto;}
            /* 0.2.39 - red update banner (3+ versions behind / required) */
            #hbs-panel .hbs-upd.hbs-updreq{background:#4a1616;border-color:#ff6b6b;color:#ffe0e0;font-size:12.5px;line-height:1.5;padding:8px 10px;}
            #hbs-panel .hbs-upd.hbs-updreq .hbs-btn{margin-left:6px;text-decoration:none;}
            /* 0.2.37 - "your energy isn't reaching the queue" note */
            #hbs-panel .hbs-banner.hbs-warnb{background:#3a1f1f;border-color:#7a3a3a;color:#ffd0d0;text-align:left;line-height:1.45;}
            #hbs-panel .hbs-banner.hbs-warnb .hbs-actions{margin-top:6px;justify-content:flex-start;}
            /* 0.2.35 - low reliability: who's new / dropped a grade */
            #hbs-panel .hbs-relnew{margin:4px 0 6px;padding:6px 10px;border-radius:8px;background:#3a1f1f;border:1px solid #7a3a3a;color:#ffd0d0;font-size:12px;text-align:left;line-height:1.5;}
            #hbs-panel .hbs-relrow.new{border-color:#ff6b6b;box-shadow:inset 3px 0 0 #ff6b6b;}
            #hbs-panel .hbs-relrow .n{position:relative;}
            #hbs-panel .hbs-relrow .n em{align-self:flex-start;font-style:normal;font-size:10px;font-weight:bold;padding:0 6px;border-radius:8px;background:#c0392b;color:#fff;margin:2px 0;}
            /* 0.2.34 - minimized icon: chain timer, you're-up, alert flash */
            #hbs-launcher .hbs-ltime{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);padding:1px 6px;border-radius:9px;background:#111318;border:1px solid var(--acc,#FFB454);
                color:#e8e8e8;font:bold 11px/1.3 Arial,sans-serif;white-space:nowrap;pointer-events:none;}
            #hbs-launcher .hbs-ltime.amber{color:#FFB454;} #hbs-launcher .hbs-ltime.red{color:#fff;background:#c0392b;border-color:#ff6b6b;}
            #hbs-launcher.hbs-l-up{box-shadow:0 0 0 3px #ff4d4d,0 2px 10px rgba(0,0,0,.6);}
            #hbs-launcher.hbs-l-flash,#hbs-launcher.hbs-l-flash.hbs-alerting{animation:hbsLFlash .9s steps(1,end) infinite;}   /* wins over the old 2.6 s hbs-alerting pulse */
            #hbs-launcher.hbs-l-flash.hbs-l-panic,#hbs-launcher.hbs-l-flash.hbs-l-panic.hbs-alerting{animation-duration:.45s;}
            @keyframes hbsLFlash{0%{background:#ff3b30;box-shadow:0 0 0 6px rgba(255,59,48,.55),0 0 18px 6px rgba(255,59,48,.6);transform:scale(1.12);}
                50%{background:#FFB454;box-shadow:0 0 0 2px rgba(255,180,84,.5);transform:scale(1);}}
            /* 0.2.33 - 🛡 low reliability rows */
            #hbs-panel .hbs-rel{display:flex;flex-direction:column;gap:4px;margin:4px 0 6px;}
            #hbs-panel .hbs-relrow{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;text-align:left;}
            #hbs-panel .hbs-relrow .g{flex:0 0 26px;height:26px;line-height:26px;border-radius:6px;text-align:center;color:#111;font-size:14px;}
            #hbs-panel .hbs-relrow .n{flex:1;min-width:0;display:flex;flex-direction:column;}
            #hbs-panel .hbs-relrow .n a{font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-relrow .n small{color:#999;font-size:10.5px;}
            #hbs-panel .hbs-relrow .sc{flex:0 0 64px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
            #hbs-panel .hbs-relrow .sc b{font-size:14px;line-height:1;}
            #hbs-panel .hbs-relrow .sc i{display:block;width:100%;height:4px;border-radius:2px;background:#2c313a;overflow:hidden;}
            #hbs-panel .hbs-relrow .sc u{display:block;height:100%;text-decoration:none;}
            /* 0.2.32 - ✅ Getting started */
            #hbs-panel .hbs-onb{box-shadow:inset 3px 0 0 var(--acc);text-align:left;}
            #hbs-panel .hbs-onbrow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #2c313a;}
            #hbs-panel .hbs-onbrow i{font-style:normal;width:18px;text-align:center;color:#888;font-weight:bold;}
            #hbs-panel .hbs-onbrow span{flex:1;min-width:0;display:flex;flex-direction:column;}
            #hbs-panel .hbs-onbrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-onbrow.ok i{color:#7CFC9A;} #hbs-panel .hbs-onbrow.ok b{color:#888;font-weight:normal;text-decoration:line-through;}
            /* 0.2.31 - chain goal + tab dots */
            #hbs-panel .hbs-goal{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin:6px 0 4px;padding:6px 10px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;font-size:12px;color:#bbb;}
            #hbs-panel .hbs-goal b{color:#e8e8e8;} #hbs-panel .hbs-goal span:first-child b{color:var(--acc);}
            #hbs-panel .hbs-tabs button{position:relative;}
            #hbs-panel .hbs-tdot{position:absolute;top:4px;left:calc(50% + 9px);width:9px;height:9px;border-radius:50%;background:#FF4D4D;box-shadow:0 0 0 2px #111318;}
            /* 0.2.30 - unfilled roles in 🚀 Deployed crimes */
            #hbs-panel .hbs-depm.open{background:rgba(255,107,107,.06);}
            #hbs-panel .hbs-depm.open i{color:#888;}
            /* 0.2.27 - bonus guard */
            #hbs-panel .hbs-bguard{font-size:11px;color:#FFB454;margin:4px 0 2px;}
            #hbs-panel .hbs-btn.hbs-warnbtn{background:#5a4417;color:#FFD48A;border-color:#8a6a2a;}
            /* 0.2.26 - 📌 OC assignment tile */
            #hbs-panel .hbs-pin.hbs-ocpin{box-shadow:inset 3px 0 0 var(--acc);cursor:pointer;}
            #hbs-panel .hbs-ocpin .hbs-pin-l{flex-wrap:wrap;row-gap:2px;white-space:normal;}
            #hbs-panel .hbs-ocpin .hbs-pin-t{color:var(--acc);font-size:14px;}
            #hbs-panel .hbs-ocpin .hbs-pin-s{flex-basis:100%;white-space:normal;}
            /* 0.2.25 - role weights */
            #hbs-panel .hbs-wt{display:inline-block;margin-left:4px;padding:0 5px;border-radius:8px;background:#2a2440;color:#d9ccff;font-size:10px;font-weight:bold;white-space:nowrap;vertical-align:middle;}
            #hbs-panel .hbs-depm .r .hbs-wt{display:block;margin:2px 0 0;width:max-content;}
            /* 0.2.23 - 🚀 Deployed crimes / 📡 Sharing rows */
            #hbs-panel .hbs-dep{margin:6px 0;text-align:left;}
            #hbs-panel .hbs-depm{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 2px;border-top:1px solid #2c313a;font-size:12px;text-align:left;}
            #hbs-panel .hbs-depm .r{flex:0 0 32%;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-depm a{flex:1 1 auto;min-width:35%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:bold;}
            #hbs-panel .hbs-depm .s{font-size:11px;white-space:nowrap;} #hbs-panel .hbs-depm .s.ok{color:#7CFC9A;} #hbs-panel .hbs-depm .s.q{color:#FFB454;} #hbs-panel .hbs-depm .s.no{color:#ff6b6b;}
            #hbs-panel .hbs-depm .p{font-size:11px;color:#888;min-width:30px;text-align:right;}
            #hbs-panel .hbs-depm.t{display:grid;grid-template-columns:30% minmax(0,1fr) auto;gap:2px 8px;}
            #hbs-panel .hbs-depm.t .n{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-depm.t .n a{min-width:0;}
            /* 0.2.23 - paged lists */
            #hbs-panel .hbs-pgmore{display:flex;flex-direction:column;align-items:center;gap:4px;margin:10px 0 4px;}
            #hbs-panel .hbs-pgmore small,#hbs-panel .hbs-pgend{font-size:10.5px;color:#888;text-align:center;}
            #hbs-panel .hbs-pgend{margin:10px 0 4px;}
            /* 0.2.22 - queue runway + dead-chain timer */
            #hbs-panel .hbs-runway{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 2px;}
            #hbs-panel .hbs-runway > div{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;border-radius:8px;
                background:#1b1e24;border:1px solid #2c313a;text-align:center;min-width:0;}
            #hbs-panel .hbs-runway b{font-size:15px;color:#e8e8e8;line-height:1.2;}
            #hbs-panel .hbs-runway small{font-size:9.5px;color:#888;text-transform:uppercase;letter-spacing:.4px;line-height:1.25;margin-top:2px;}
            #hbs-panel .hbs-runway .ok b{color:#7CFC9A;} #hbs-panel .hbs-runway .no b{color:#ff6b6b;}
            @media (max-width:360px){ #hbs-panel .hbs-runway{grid-template-columns:repeat(2,1fr);} }
            #hbs-panel .hbs-big.hbs-dead{color:#666;}
            /* 0.2.21 - 🔍 Alert check */
            #hbs-panel .hbs-allog{display:flex;flex-direction:column;gap:2px;margin:4px 0 8px;max-height:220px;overflow:auto;text-align:left;font-size:11px;}
            #hbs-panel .hbs-allog > div{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;padding:3px 6px;border-radius:6px;background:#1b1e24;}
            #hbs-panel .hbs-allog span{color:#888;min-width:54px;}
            #hbs-panel .hbs-allog em{font-style:normal;color:#bbb;margin-left:auto;}
            /* 0.2.20 - 🛠 Chain settings (leaders) */
            #hbs-panel .hbs-cwcfg{margin-top:6px;text-align:left;}
            #hbs-panel .hbs-cwcfg .hbs-ck{display:flex;align-items:center;gap:8px;padding:8px 0;text-align:left;}
            #hbs-panel .hbs-cwcfg .hbs-ck small{color:#888;}
            #hbs-panel .hbs-cfgrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #2c313a;}
            #hbs-panel .hbs-cfgrow > span:first-child{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-cfgrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-cfgin{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
            #hbs-panel .hbs-cfgin input{width:78px;text-align:right;}
            #hbs-panel .hbs-cfgin small{min-width:44px;color:var(--acc);}
            /* 0.2.19 - fold bars (Retals / Schedule) */
            #hbs-panel .hbs-fold{display:flex;align-items:center;gap:8px;width:100%;margin:14px 0 0;padding:9px 12px;border-radius:9px;cursor:pointer;
                background:#1b1e24;border:1px solid #2c313a;border-left:3px solid var(--acc);color:#e8e8e8;font:inherit;text-align:left;touch-action:manipulation;}
            #hbs-panel .hbs-fold:hover{background:#21252d;}
            #hbs-panel .hbs-fold .ic{font-size:15px;}
            #hbs-panel .hbs-fold .tt{font-weight:bold;font-size:12.5px;color:var(--acc);white-space:nowrap;}
            #hbs-panel .hbs-fold .mt{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:#bbb;min-width:0;overflow:hidden;white-space:nowrap;}
            #hbs-panel .hbs-fold .mt small{color:#888;}
            #hbs-panel .hbs-fold .cv{display:inline-block;transition:transform .15s;color:var(--acc);font-size:12px;}
            #hbs-panel .hbs-fold.open{border-radius:9px 9px 0 0;border-bottom-color:transparent;}
            #hbs-panel .hbs-fold.open .cv{transform:rotate(90deg);}
            #hbs-panel .hbs-fold.alert{border-left-color:#ff6b6b;}
            #hbs-panel .hbs-foldn{display:inline-block;min-width:18px;padding:0 6px;border-radius:9px;background:#2c313a;color:#fff;text-align:center;font-size:11px;}
            #hbs-panel .hbs-fold.alert .hbs-foldn{background:#c0392b;}
            #hbs-panel .hbs-foldme{padding:1px 6px;border-radius:9px;background:#2f5d33;color:#b9f5c0;font-weight:bold;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-foldb{padding:6px 10px 8px;border:1px solid #2c313a;border-top:0;border-radius:0 0 9px 9px;background:#16191e;}
            #hbs-panel .hbs-fold:not(.open) + .hbs-foldb{border-top:1px solid #2c313a;border-radius:9px;margin-top:4px;}
            #hbs-panel .hbs-foldb .hbs-sec:first-child{margin-top:4px;}
            /* 0.2.18 - Chain Watch queue + bonus line */
            .hbs-bonusline{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;padding:6px 10px;border-radius:8px;background:#2a2440;border:1px solid #4a3f6e;color:#d9ccff;font-size:12px;}
            .hbs-bonusline .hbs-mini{margin-left:auto;}
            .hbs-cap{font-size:12px;font-weight:bold;color:#7CFC9A;margin:2px 0 6px;}
            .hbs-cap.warn{color:#FFB454;} .hbs-cap.low{color:#ff6b6b;}
            .hbs-q{display:flex;flex-direction:column;gap:4px;}
            .hbs-qr{padding:6px 8px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;}
            .hbs-qr.up{box-shadow:inset 3px 0 0 #4caf50;border-color:#2f5d33;}
            .hbs-qr.bon{box-shadow:inset 3px 0 0 #9b87f5;}
            .hbs-qr.me{border-color:#FFB454;}
            .hbs-qr.dim{opacity:.55;}
            .hbs-qr .m{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
            .hbs-qr .m .p{min-width:16px;color:#888;font-weight:bold;}
            .hbs-qr .m a{font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%;}
            .hbs-qr .m .h{margin-left:auto;font-weight:bold;font-size:15px;color:#e8e8e8;}
            .hbs-qr .m .h small{font-size:10px;font-weight:normal;color:#888;margin-left:2px;}
            .hbs-qr.dry .h{color:#ff6b6b;}
            .hbs-qt{font-size:10px;font-weight:bold;padding:1px 6px;border-radius:9px;background:#2c313a;color:#ccc;white-space:nowrap;}
            .hbs-qt.up{background:#2f5d33;color:#b9f5c0;} .hbs-qt.bon{background:#4a3f6e;color:#d9ccff;}
            .hbs-qt.cant{background:#5a2626;color:#ffc4c4;} .hbs-qt.hit{background:#1f4d3a;color:#7CFC9A;}
            .hbs-qr .st{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:3px;padding-left:22px;font-size:11px;}
            .hbs-qr .st span{display:inline-flex;align-items:center;gap:3px;}
            .hbs-qr .st .en{color:#7CFC9A;font-weight:bold;} .hbs-qr .st .cd{color:#FFB454;} .hbs-qr .st .ok{color:#888;} .hbs-qr .st .n{color:#888;}
            .hbs-qr .st .bolt.off{opacity:.3;filter:grayscale(1);}
            .hbs-ic{height:12px;width:auto;vertical-align:middle;}
            /* 0.2.18 - Armory Loan Filter (on Torn's page, outside the panel) */
            .hbs-armbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0;padding:6px 10px;border-radius:8px;background:#1b1e24;
                border:1px solid #33373f;color:#eaeaea;font:12px Arial,sans-serif;}
            .hbs-armbar label{display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:bold;color:#FFB454;}
            .hbs-armbar span{opacity:.7;}
            li.hbs-armhide{display:none !important;}
            /* 0.2.15 - Home Latest tiles */
            #hbs-panel .hbs-latest{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px;}
            #hbs-panel .hbs-lt{display:flex;flex-direction:column;gap:3px;padding:6px;border-radius:9px;background:var(--card);border:1px solid var(--edge);text-decoration:none;color:inherit;min-width:0;}
            #hbs-panel .hbs-lt .k{font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--acc);font-weight:800;}
            #hbs-panel .hbs-lt img{width:100%;height:70px;object-fit:cover;object-position:top;border-radius:6px;background:var(--well);}
            #hbs-panel .hbs-lt b{font-size:11.5px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
            #hbs-panel .hbs-lt small{font-size:10px;opacity:.65;}
            /* 0.2.13 - OC crime card for narrow panels: ready line, seat blocks with a planning bar */
            #hbs-panel .hbs-ocready{margin-top:7px;padding:6px 8px;border-radius:8px;background:var(--well);border:1px solid var(--edge);}
            #hbs-panel .hbs-ocready small{display:block;font-size:10.5px;opacity:.7;}
            #hbs-panel .hbs-seat{max-width:520px;margin:0 auto;padding:6px 8px;border-bottom:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-seat.me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);border-radius:4px;}
            #hbs-panel .hbs-seat.open{opacity:.6;}
            #hbs-panel .hbs-seat .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
            #hbs-panel .hbs-seat .t span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-seat .b{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-top:3px;}
            #hbs-panel .hbs-seat .b i{display:block;height:5px;border-radius:3px;background:var(--edge);overflow:hidden;}
            #hbs-panel .hbs-seat .b em{display:block;height:100%;background:var(--ok);}
            #hbs-panel .hbs-seat .b small{font-size:10.5px;opacity:.85;white-space:nowrap;}
            /* 0.2.11 - recruit layout for narrow panels */
            #hbs-panel .hbs-chips[data-chips="rsv"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:5px;}
            #hbs-panel .hbs-chips[data-chips="rsv"] button{margin:0;}
            #hbs-panel .hbs-rstool{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;}
            #hbs-panel .hbs-rstool > label{grid-column:1 / -1;}
            #hbs-panel .hbs-rstool .hbs-btn{margin:0;width:100%;font-size:11.5px;}
            #hbs-panel .hbs-rsfld{display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0;}
            #hbs-panel .hbs-rsfld > span{font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-rsfld .hbs-input{width:100%;box-sizing:border-box;text-align:right;} #hbs-panel .hbs-rsfld select.hbs-input{text-align:left;}
            #hbs-panel .hbs-rsfldck{justify-content:flex-start;} #hbs-panel .hbs-rsfldck input{width:18px;height:18px;margin:4px 0 0;}
            #hbs-panel .hbs-rscrit{padding:7px 2px;border-top:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-rscrit .h{display:flex;justify-content:space-between;align-items:center;gap:8px;}
            #hbs-panel .hbs-rscrit .h b{font-size:12.5px;}
            #hbs-panel .hbs-rscrit .f{display:grid;grid-template-columns:1fr 64px;gap:6px;margin-top:5px;}
            #hbs-panel .hbs-rscrit .f.f3{grid-template-columns:1fr 1fr 64px;}
            #hbs-panel .hbs-rsmust{display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border:1px solid var(--edge);border-radius:12px;cursor:pointer;white-space:nowrap;}
            #hbs-panel .hbs-rsmust:has(input:checked){border-color:var(--acc);color:var(--acc);}
            #hbs-panel .hbs-rsset{grid-template-columns:1fr 96px !important;}
            #hbs-panel .hbs-rscrit input[type=number],#hbs-panel .hbs-rsset input[type=number]{-moz-appearance:textfield;appearance:textfield;}
            #hbs-panel .hbs-rscrit input::-webkit-outer-spin-button,#hbs-panel .hbs-rscrit input::-webkit-inner-spin-button,
            #hbs-panel .hbs-rsset input::-webkit-outer-spin-button,#hbs-panel .hbs-rsset input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
            /* 0.2.10 - ⚙ Criteria rows: check · limit · weight · must */
            #hbs-panel .hbs-rsset4{display:grid;grid-template-columns:1fr 104px 44px 50px;gap:5px;align-items:center;margin-top:5px;text-align:left;}
            #hbs-panel .hbs-rsset4 > span:first-child{font-size:11.5px;} #hbs-panel .hbs-rsset4 .hbs-input{width:100%;text-align:right;padding-left:3px;padding-right:3px;}
            #hbs-panel .hbs-rsset4 .hbs-ck{margin:0;font-size:10.5px;} #hbs-panel .hbs-rsset4 > input[type=checkbox]{justify-self:end;}
            #hbs-panel .hbs-rshead span{font-size:9.5px !important;text-transform:uppercase;letter-spacing:.5px;opacity:.6;text-align:center;}
            #hbs-panel .hbs-rshead span:first-child{text-align:left;}
            #hbs-panel .hbs-rsrange{grid-column:1 / -1;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:5px;align-items:center;}
            #hbs-panel .hbs-rsrange small{font-size:10px;opacity:.65;}
            /* 0.2.9 - recruit tiles for phones: 3-column value / label grid, even button rows, two-line pool rows */
            #hbs-panel .hbs-rsg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:7px;}
            #hbs-panel .hbs-rsg > div{background:var(--well);border:1px solid var(--edge);border-radius:7px;padding:4px 3px;text-align:center;min-width:0;}
            #hbs-panel .hbs-rsg b{display:block;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-rsg span{display:block;font-size:9px;letter-spacing:.4px;text-transform:uppercase;opacity:.65;}
            #hbs-panel .hbs-rsbtns,#hbs-panel .hbs-rsact{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:5px;margin-top:7px;}
            #hbs-panel .hbs-rsbtns .hbs-btn,#hbs-panel .hbs-rsact .hbs-btn,#hbs-panel .hbs-rsbtns select{width:100%;margin:0;}
            #hbs-panel .hbs-rshd{text-align:center;} #hbs-panel .hbs-rshd small{opacity:.6;}
            #hbs-panel .hbs-rsfit{height:5px;max-width:180px;margin:5px auto 2px;border-radius:3px;background:var(--edge);overflow:hidden;}
            #hbs-panel .hbs-rsfit i{display:block;height:100%;background:var(--acc);}
            #hbs-panel .hbs-rsrow{max-width:520px;margin:0 auto;padding:7px 4px;border-bottom:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-rsrow .t{font-weight:bold;} #hbs-panel .hbs-rsrow .t small{opacity:.55;font-weight:normal;}
            #hbs-panel .hbs-rsrow .s{font-size:11px;opacity:.8;margin-top:2px;}
            #hbs-panel .hbs-rsset{display:grid;grid-template-columns:1fr 90px 54px;gap:6px;align-items:center;margin-top:5px;text-align:left;}
            #hbs-panel .hbs-rsset span{font-size:11.5px;} #hbs-panel .hbs-rsset .hbs-input{width:100%;text-align:right;}
            #hbs-panel .hbs-rsset .hbs-ck{margin:0;font-size:10.5px;}
            /* 0.2.8 - Recruit Scout cards: check chips, 7-day bars */
            #hbs-panel .hbs-rsck{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:6px;}
            #hbs-panel .hbs-rsck span{font-size:10.5px;padding:1px 6px;border-radius:5px;background:var(--well);border:1px solid var(--edge);color:#9aa0a8;white-space:nowrap;}
            #hbs-panel .hbs-rsck span.pass{border-color:#2f7a4c;color:#8ee6ae;} #hbs-panel .hbs-rsck span.near{border-color:#8a6a2e;color:var(--acc);}
            #hbs-panel .hbs-rsck span.fail{border-color:#7a2f2f;color:#FF7676;} #hbs-panel .hbs-rsck span.must{font-weight:bold;}
            #hbs-panel .hbs-rsbars{display:flex;align-items:flex-end;gap:3px;height:30px;max-width:260px;margin:4px auto;}
            #hbs-panel .hbs-rsbars i{flex:1 1 0;min-height:2px;border-radius:2px 2px 0 0;background:var(--acc);}
            #hbs-panel .hbs-rsbars i.idle{background:#FF7676;} #hbs-panel .hbs-rsbars i.na{background:var(--edge);height:2px;}
            /* 0.2.4 - Home tile groups (centred), Armoury loan outlines */
            #hbs-panel .hbs-grps{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px;}
            #hbs-panel .hbs-grp{flex:1 1 150px;max-width:100%;background:rgba(255,255,255,.02);border:1px solid var(--edge);border-radius:10px;padding:5px 6px 6px;}
            #hbs-panel .hbs-grp > .t{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);text-align:center;}
            #hbs-panel .hbs-grp .hbs-tiles{display:flex;flex-wrap:wrap;justify-content:center;margin-top:4px;}
            #hbs-panel .hbs-grp .hbs-tiles > div{flex:1 1 84px;max-width:140px;}
            #hbs-panel .hbs-grp2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
            #hbs-panel .hbs-grp2 > div{min-width:0;}
            #hbs-panel .hbs-grp2 > div > .t{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);text-align:center;}
            #hbs-panel .hbs-ctiles .hbs-tiles{display:flex;flex-wrap:wrap;justify-content:center;}
            #hbs-panel .hbs-ctiles .hbs-tiles > div{flex:1 1 96px;max-width:150px;}
            .hbs-arm-loan{outline:2px solid #4caf50 !important;outline-offset:-2px;border-radius:4px;}
            .hbs-arm-retr{outline:2px solid #e4382e !important;outline-offset:-2px;border-radius:4px;}
            .hbs-arm-pulse{animation:hbsArmPulse .6s ease-in-out 4;}
            @keyframes hbsArmPulse{50%{box-shadow:0 0 0 4px rgba(232,190,90,.75);}}
            /* 0.2.3 - schedule day chip (date on a second line), OC pay hero, alert settings, alert flash */
            #hbs-panel .hbs-day{display:inline-flex;flex-direction:column;align-items:center;line-height:1.15;}
            #hbs-panel .hbs-day small{display:block;font-size:10px;opacity:.75;font-weight:normal;}
            #hbs-panel .hbs-pay{margin:8px auto;padding:8px 10px;border-radius:8px;background:#1b2418;border:1px solid #2f5a34;max-width:360px;}
            #hbs-panel .hbs-pay.jn{background:#2a2410;border-color:var(--acc);box-shadow:0 0 0 1px rgba(232,190,90,.25);}
            #hbs-panel .hbs-pay .l{font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.85;}
            #hbs-panel .hbs-pay .v{font-size:22px;font-weight:800;color:#7cfc9a;}
            #hbs-panel .hbs-pay.jn .v{color:var(--acc);}
            #hbs-panel .hbs-pay .v small{font-size:11px;font-weight:normal;opacity:.7;}
            #hbs-panel .hbs-pay .s{font-size:11px;opacity:.75;}
            #hbs-panel .hbs-alcfg{text-align:center;}
            #hbs-panel .hbs-alrow{padding:6px 0;border-top:1px solid var(--edge);}
            #hbs-panel .hbs-alrow:first-of-type{border-top:0;}
            #hbs-panel .hbs-alcfg .hbs-row{gap:6px;flex-wrap:wrap;margin-top:4px;}
            #hbs-panel .hbs-alcfg select.hbs-input{width:auto;min-width:96px;}
            #hbs-panel .hbs-alcfg input[type=range]{width:140px;}
            #hbs-panel .hbs-alcfg label.hbs-ck{display:inline-flex;align-items:center;gap:4px;margin:3px 6px;}
            #hbs-panel.hbs-alerting,#hbs-launcher.hbs-alerting{animation:hbsAlertFlash .65s ease-in-out 4;}
            @keyframes hbsAlertFlash{50%{box-shadow:0 0 0 3px #FF3B3B,0 0 24px rgba(255,59,59,.7);}}
            #hbs-panel .hbs-li.hbs-me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);padding-left:6px;border-radius:4px;}
            #hbs-panel .hbs-li.hbs-dim{opacity:.55;}
            #hbs-panel .hbs-btn{border-radius:8px;padding:6px 11px;}
            #hbs-panel .hbs-more{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;}
            #hbs-panel .hbs-more button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;border-radius:12px;
                background:var(--card);border:1px solid var(--edge);color:var(--txt);font:600 11px var(--font);cursor:pointer;touch-action:manipulation;}
            #hbs-panel .hbs-more button span{font-size:20px;}
            #hbs-panel .hbs-more button:hover{border-color:var(--acc);}
            #hbs-panel .hbs-tiles div{border-radius:10px;}
            #hbs-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,420px);padding:9px 14px;
                border-radius:10px;background:var(--bg);color:var(--txt);border:1px solid var(--edge);font:600 13px var(--font);
                box-shadow:0 8px 24px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;pointer-events:none;}
            #hbs-toast.hbs-strong{border-color:var(--acc);color:var(--acc);box-shadow:0 0 18px rgba(255,180,84,.45);}
            /* 0.2.1: pinned chain tile, badges, update banner, retals, schedule grid, compact mode */
            #hbs-panel .hbs-pin{display:flex;align-items:center;gap:8px;margin:0 12px 6px;padding:6px 8px;border-radius:10px;background:var(--card);border:1px solid var(--edge);box-shadow:inset 3px 0 0 var(--ok);}
            #hbs-panel .hbs-pin-l{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;cursor:pointer;white-space:nowrap;overflow:hidden;}
            #hbs-panel .hbs-pin-t{font:700 15px var(--font);color:#fff;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-pin-s{font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-pin .hbs-btn{padding:4px 9px;}
            #hbs-panel .hbs-upd{margin:0 12px 6px;padding:6px 8px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:11.5px;}
            #hbs-panel .hbs-upd button{float:right;background:none;border:0;color:#ffd9a0;cursor:pointer;}
            /* badge: flex-centred number (0.2.2 - user: "very out of center and hard to read") */
            .hbs-badge{position:absolute;top:1px;left:calc(50% + 5px);box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border-radius:9px;
                display:flex;align-items:center;justify-content:center;background:#FF3B3B;color:#fff;font:800 11px/1 system-ui,Arial,sans-serif;
                letter-spacing:0;box-shadow:0 0 0 2px #111318;pointer-events:none;}
            #hbs-panel .hbs-tabs button, #hbs-panel .hbs-more button{position:relative;}
            #hbs-panel .hbs-more .hbs-badge{left:auto;right:8px;top:6px;}
            #hbs-launcher .hbs-badge.hbs-lb{left:auto;top:-4px;right:-4px;}
            .hbs-tct::before{content:"TCT";}
            #hbs-panel .hbs-btn.hbs-hitting{background:#2f8f4e;color:#fff;box-shadow:0 0 0 2px rgba(124,252,154,.45);}
            /* CENTRE-FOCUSED (0.2.2, user: "Center all of the pages and information. The entire suite should be
               center-focused."): text, card headers, buttons, chips, tiles and the pinned tile are centred; list rows
               (queue, members...) keep name left / value right but sit in a centred column */
            #hbs-panel .hbs-body{text-align:center;}
            #hbs-panel .hbs-r1{justify-content:center;flex-wrap:wrap;}
            #hbs-panel .hbs-r1 .hbs-chip{margin-left:0;}
            #hbs-panel .hbs-actions,#hbs-panel .hbs-chips,#hbs-panel .hbs-rtc,#hbs-panel .hbs-bar,#hbs-panel .hbs-row{justify-content:center;}
            #hbs-panel .hbs-sec{text-align:center;}
            #hbs-panel .hbs-kv{grid-template-columns:1fr 1fr;column-gap:12px;}
            #hbs-panel .hbs-kv span{text-align:right;} #hbs-panel .hbs-kv b{text-align:left;}
            #hbs-panel .hbs-li{max-width:520px;margin-left:auto;margin-right:auto;text-align:left;}
            #hbs-panel .hbs-pin{justify-content:center;} #hbs-panel .hbs-pin-l{flex:0 1 auto;justify-content:center;}
            #hbs-panel .hbs-upd{text-align:center;}
            /* (0.2.66) 📢 announcement tile + the leaders' Announce tab */
            /* (0.2.78) armory: the Home line, the tab's headline, the detail under a low item, the minimums grid */
            #hbs-panel .hbs-armal{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 8px;padding:7px 10px;border-radius:8px;background:#2a1719;border:1px solid #7a2f2f;color:#FF9a9a;font-size:12.5px;cursor:pointer;}
            #hbs-panel .hbs-armal small{display:block;color:#c9a3a3;font-size:11px;font-weight:normal;} #hbs-panel .hbs-armal > b{color:#FFB454;white-space:nowrap;}
            #hbs-panel .hbs-armhd{font-size:13px;margin:0 0 4px;text-align:left;} #hbs-panel .hbs-armhd small{opacity:.7;font-size:11px;}
            #hbs-panel .hbs-armtip{display:block;font-size:10.5px;opacity:.6;}
            /* (0.2.81) 📣 Notify rows: three one-line rows that cut off instead of wrapping; buttons on the right */
            #hbs-panel .hbs-ntf{align-items:center;gap:8px;} #hbs-panel .hbs-ntfl{flex:1;min-width:0;display:block;}
            #hbs-panel .hbs-ntfn,#hbs-panel .hbs-ntfc,#hbs-panel .hbs-ntfs{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-ntfn{font-size:12.5px;} #hbs-panel .hbs-ntfc{opacity:.75;} #hbs-panel .hbs-ntfs{font-size:10.5px;} #hbs-panel .hbs-ntfw{color:#FFB454;}
            #hbs-panel .hbs-ntfb{display:flex;gap:4px;flex:none;} #hbs-panel .hbs-ntfb .hbs-btn{min-width:34px;padding-left:0;padding-right:0;}
            #hbs-panel .hbs-ntfh{font-size:11px;color:#FFB454;margin:6px 0 1px;text-align:left;}
            #hbs-panel .hbs-armset{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px 10px;}
            #hbs-panel .hbs-armset label{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11.5px;} #hbs-panel .hbs-armset .hbs-input{width:74px;text-align:right;}
            #hbs-panel .hbs-ann{margin:0 12px 6px;padding:7px 10px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:12.5px;line-height:1.4;word-break:break-word;position:relative;}
            #hbs-panel .hbs-ann.urgent{background:#4a1616;border-color:#ff6b6b;color:#ffe0e0;}
            #hbs-panel .hbs-ann small{display:block;opacity:.7;font-size:10.5px;margin-top:2px;}
            #hbs-panel .hbs-ann.dis{padding-right:30px;} #hbs-panel .hbs-ann button{position:absolute;top:2px;right:2px;width:28px;height:28px;background:none;border:0;color:inherit;cursor:pointer;font-size:13px;}
            #hbs-panel .hbs-annbox{width:100%;min-height:64px;resize:vertical;font:13px var(--font);margin:0;}
            #hbs-panel .hbs-annpick{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
            #hbs-panel .hbs-annpick label{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;border:1px solid var(--edge);background:var(--well);font-size:11.5px;cursor:pointer;min-height:30px;}
            #hbs-panel .hbs-annpick label.on{border-color:var(--acc);color:var(--acc);} #hbs-panel .hbs-annpick input{margin:0;accent-color:var(--acc);}
            #hbs-panel .hbs-ck,#hbs-panel .hbs-form label.hbs-ck{justify-content:center;}
            #hbs-panel .hbs-lay{text-align:left;}
            #hbs-panel table.hbs-tbl{margin-left:auto;margin-right:auto;}
            #hbs-panel .hbs-rtc{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
            #hbs-panel .hbs-rtc .hbs-chips{margin-top:4px;}
            #hbs-panel .hbs-rtff{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mut);}
            #hbs-panel .hbs-rtff .hbs-input{width:52px;padding:3px 5px;}
            #hbs-panel .hbs-rt{border:1px solid var(--edge);border-radius:10px;padding:7px 9px;margin-top:6px;background:var(--card);box-shadow:inset 3px 0 0 #FF5C5C;}
            #hbs-panel .hbs-rt.hbs-rtsoon{box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-rt.hbs-rtcalled{box-shadow:inset 3px 0 0 var(--link);opacity:.85;}
            #hbs-panel .hbs-ff{font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:#2b2f37;color:#cfd3da;white-space:nowrap;}
            #hbs-panel .hbs-ffe{background:#2f5f3a;color:#b6f0c4;} #hbs-panel .hbs-ffm{background:#5f5330;color:#ffe0a3;} #hbs-panel .hbs-ffh{background:#5f2f2f;color:#ffbcbc;}
            #hbs-panel .hbs-schh{cursor:pointer;}
            #hbs-panel .hbs-slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px;margin:3px 0 6px;}
            #hbs-panel .hbs-slot{padding:5px 0;border-radius:5px;border:1px solid var(--edge);background:var(--well2);color:var(--txt);font:10.5px var(--font);cursor:pointer;touch-action:manipulation;}
            #hbs-panel .hbs-slot.hbs-sp{background:#173d27;border-color:#2f7a4c;} #hbs-panel .hbs-slot.hbs-sb{background:#3d3217;border-color:#6b4a18;}
            #hbs-panel .hbs-slot.hbs-past{opacity:.3;cursor:default;} #hbs-panel .hbs-slot.hbs-on{outline:2px solid var(--acc);}
            #hbs-panel .hbs-key{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 3px 0 8px;vertical-align:-1px;border:1px solid var(--edge);}
            #hbs-panel .hbs-key.hbs-sp{background:#173d27;} #hbs-panel .hbs-key.hbs-sb{background:#3d3217;} #hbs-panel .hbs-key.hbs-so{background:var(--well2);}
            #hbs-panel .hbs-chips button:disabled{opacity:.4;}
            #hbs-panel.hbs-compact{font-size:11px;}
            #hbs-panel.hbs-compact .hbs-card{padding:6px 8px;margin-top:5px;border-radius:9px;}
            #hbs-panel.hbs-compact .hbs-tiles{gap:4px;} #hbs-panel.hbs-compact .hbs-tiles div{padding:4px;} #hbs-panel.hbs-compact .hbs-tiles b{font-size:13px;}
            #hbs-panel.hbs-compact .hbs-big{font-size:22px;} #hbs-panel.hbs-compact .hbs-btn{padding:4px 8px;font-size:10.5px;}
            #hbs-panel.hbs-compact .hbs-tabs button{padding:4px 2px 3px;font-size:9px;} #hbs-panel.hbs-compact .hbs-tabs button span{font-size:14px;}
            #hbs-panel.hbs-compact .hbs-li{padding:3px 0;font-size:11px;} #hbs-panel.hbs-compact .hbs-sec{margin:9px 0 3px;}
            /* (0.2.62) compact-mode layouts: Chain + OC */
            #hbs-panel.hbs-compact .hbs-fold{margin-top:5px;padding:6px 9px;} #hbs-panel.hbs-compact .hbs-fold .tt{font-size:11.5px;}
            #hbs-panel.hbs-compact .hbs-foldb{padding:4px 8px 6px;}
            #hbs-panel .hbs-cmtop{display:flex;align-items:center;gap:8px;min-width:0;}
            #hbs-panel .hbs-cmt{font:700 24px/1 var(--font);color:#fff;font-variant-numeric:tabular-nums;flex:0 0 auto;} #hbs-panel .hbs-cmt.dead{color:#777;}
            #hbs-panel .hbs-cmi{flex:1 1 auto;min-width:0;line-height:1.25;text-align:left;} #hbs-panel .hbs-cmi > b{display:block;font-size:12.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-cmi > small{display:block;font-size:10.5px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} #hbs-panel .hbs-cmi > small b{color:var(--acc);}
            #hbs-panel .hbs-cmdot{flex:0 0 auto;font-size:10px;color:#7CFC9A;} #hbs-panel .hbs-cmdot.poll{color:#FFB454;} #hbs-panel .hbs-cmdot.off{color:#777;}
            #hbs-panel .hbs-cmic{flex:0 0 auto !important;width:34px;min-width:34px;padding:6px 0 !important;font-size:14px !important;text-align:center;}
            #hbs-panel .hbs-cmup{margin-top:4px;font-size:11px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-cmcov{display:flex;align-items:center;gap:6px;margin:5px 0 0;padding:5px 9px;font-size:11.5px;cursor:pointer;white-space:nowrap;overflow:hidden;}
            #hbs-panel .hbs-cmcov b{flex:0 0 auto;} #hbs-panel .hbs-cmcov span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.9;} #hbs-panel .hbs-cmcov em{font-style:normal;flex:0 0 auto;opacity:.8;}
            #hbs-panel .hbs-cmcovd{margin:0;border-radius:0 0 9px 9px;border-top:0;padding:4px 9px 6px;font-size:11px;} #hbs-panel .hbs-cmcov.open{border-radius:9px 9px 0 0;}
            #hbs-panel .hbs-cmact{flex-wrap:nowrap;} #hbs-panel .hbs-cmact > .hbs-btn:first-child{flex:1 1 auto;padding:7px 8px !important;font-size:12px !important;}
            #hbs-panel .hbs-cmact .hbs-dmbtn{width:34px;min-width:34px;padding:6px 0 !important;font-size:14px !important;}
            /* (0.2.62, user: "Add small text under the icons. 'Target' 'Dump'. Remove the X, replace it as 'Leave'. Use small text ... so they fit in the existing buttons") */
            #hbs-panel .hbs-cmact .hbs-cmic, #hbs-panel .hbs-cmact .hbs-dmbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px 0 !important;line-height:1;font-size:13px !important;}
            #hbs-panel .hbs-cmact small{display:block;font-size:7.5px;font-weight:bold;letter-spacing:.1px;line-height:1;white-space:nowrap;opacity:.9;} #hbs-panel .hbs-cmact small.only{font-size:8.5px;}
            #hbs-panel .hbs-cmal .hbs-altiles{gap:4px;margin-top:5px;} #hbs-panel .hbs-cmal .hbs-altiles div{padding:2px 2px 3px;border-radius:7px;}
            #hbs-panel .hbs-cmal .hbs-altiles i{display:none;} #hbs-panel .hbs-cmal .hbs-altiles b{font-size:12.5px;} #hbs-panel .hbs-cmal .hbs-altiles span{font-size:8.5px;}
            #hbs-panel .hbs-cmq{display:flex;align-items:baseline;gap:8px;} #hbs-panel .hbs-cmq .hbs-cap{margin:0 0 0 auto;font-size:11px;}
            /* (0.2.64) ⚔ War tab: priority targets */
            #hbs-panel .hbs-wscore{font:700 24px/1.1 var(--font);color:#fff;text-align:center;margin-top:6px;font-variant-numeric:tabular-nums;} #hbs-panel .hbs-wscore small{display:block;font:normal 11.5px var(--font);color:#aaa;margin-top:3px;}
            #hbs-panel .hbs-wscore .up{color:#7CFC9A;} #hbs-panel .hbs-wscore .dn{color:#ff8f8f;}
            #hbs-panel .hbs-wrange{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11.5px;color:#bbb;} #hbs-panel .hbs-wrange input{width:58px;margin:0;text-align:center;}
            #hbs-panel .hbs-wrow{display:flex;align-items:center;gap:6px;padding:6px 0;border-top:1px solid var(--edge);text-align:left;min-width:0;}
            #hbs-panel .hbs-wrow .n{flex:1 1 auto;min-width:0;line-height:1.25;} #hbs-panel .hbs-wrow .n a{font-weight:bold;font-size:12.5px;} #hbs-panel .hbs-wrow .n small{display:block;font-size:10.5px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-wrow .hbs-btn{flex:0 0 auto;text-decoration:none;} #hbs-panel .hbs-wrow.off{opacity:.5;}
            #hbs-panel .hbs-wst{font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;background:#2f5f3a;color:#b6f0c4;} #hbs-panel .hbs-wst.no{background:#5f2f2f;color:#ffbcbc;} #hbs-panel .hbs-wst.aw{background:#2b2f37;color:#cfd3da;}
            #hbs-panel .hbs-wgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:6px;}
            #hbs-panel .hbs-wgrid a{display:block;text-decoration:none;text-align:left;padding:5px 7px;border-radius:7px;background:var(--well);border:1px solid var(--edge);min-width:0;}
            #hbs-panel .hbs-wgrid a b{display:block;font-size:12px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} #hbs-panel .hbs-wgrid a span{display:block;font-size:10.5px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-wgrid a.ok{border-color:#2f5d33;} #hbs-panel .hbs-wgrid a.ok span i{font-style:normal;color:#7CFC9A;} #hbs-panel .hbs-wgrid a.off{opacity:.5;}
            #hbs-panel .hbs-cmpay{flex:0 0 auto;text-align:right;line-height:1.15;} #hbs-panel .hbs-cmpay b{display:block;font-size:17px;color:#7CFC9A;} #hbs-panel .hbs-cmpay small{font-size:9.5px;opacity:.75;text-transform:uppercase;}
            #hbs-panel .hbs-cm4 .hbs-rsg{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:5px;} #hbs-panel .hbs-cm4 .hbs-rsg b{font-size:12px;}
            /* ⚙ Layout rows (0.2.0) */
            #hbs-panel .hbs-lay{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line);font-size:11.5px;}
            #hbs-panel .hbs-lay > span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-lay small{opacity:.55;font-size:9.5px;}
            #hbs-panel .hbs-lay label{display:flex;align-items:center;gap:3px;font-size:10.5px;color:var(--mut);white-space:nowrap;}
            #hbs-panel .hbs-btn.hbs-mini{padding:3px 8px;min-width:28px;}
            /* pictures open full size (0.2.0) */
            #hbs-panel img, #hbs-panel canvas{cursor:zoom-in;}
            #hbs-full{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;overflow:auto;padding:12px;}
            #hbs-full > div{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:100%;}
            #hbs-full img{max-width:none;width:auto;height:auto;}
            @media (max-width:700px){ #hbs-full img{max-width:100%;} }
            #hbs-full a{color:#1b1e24;background:#FFB454;border-radius:8px;padding:6px 12px;font:bold 12px system-ui,Arial,sans-serif;text-decoration:none;}
            #hbs-full span{color:#ccc;font:12px system-ui,Arial,sans-serif;}
            /* crimes page: your assigned crime + seat (OC module) */
            .hbs-occard{outline:2px solid #FFB454 !important;outline-offset:2px;border-radius:6px;}
            /* (0.2.74) a crime leadership disabled: red hatch (never catches a press itself) + dead Join buttons */
            .hbs-ocdis{position:relative !important;}
            .hbs-ocdis::before{content:'';position:absolute;inset:0;z-index:3;border-radius:6px;pointer-events:none;
                background:repeating-linear-gradient(135deg,rgba(255,118,118,.13) 0 5px,rgba(0,0,0,.34) 5px 10px);box-shadow:inset 0 0 0 1px rgba(255,118,118,.6);}
            .hbs-ocdis::after{content:'⛔ Disabled by leadership';position:absolute;top:2px;left:2px;z-index:4;max-width:calc(100% - 4px);pointer-events:none;
                background:#FF7676;color:#2a0000;font:bold 10px Arial,sans-serif;padding:1px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .hbs-ocdis [class*="joinButton"]{pointer-events:none !important;opacity:.35 !important;cursor:not-allowed !important;}
            .hbs-ocseat{position:relative !important;outline:3px solid #4caf50 !important;outline-offset:1px;border-radius:6px;animation:hbsSeatPulse 1.4s ease-in-out infinite;}
            .hbs-ocseat::after{content:'★ Your role';position:absolute;top:1px;left:1px;z-index:5;max-width:calc(100% - 2px);pointer-events:none;
                background:#4caf50;color:#06240a;font:bold 9px Arial,sans-serif;padding:0 5px;border-radius:3px;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            @keyframes hbsSeatPulse{0%,100%{box-shadow:0 0 0 2px rgba(76,175,80,.4),0 0 10px rgba(76,175,80,.4);}50%{box-shadow:0 0 0 3px rgba(76,175,80,.7),0 0 20px rgba(76,175,80,.75);}}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    // Launcher glyph: a heart with a small network node ("Hub"). Also declared to Torn Dock.
    const ICON_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>' +
        '<circle cx="12" cy="12.6" r="1.6"/><path d="M12 14.2v2.3M10.6 11.8l-2-1.3M13.4 11.8l2-1.3"/></svg>';

    // ---------------------------------------------------------------------
    // PANEL
    // ---------------------------------------------------------------------
    let panel, bodyEl, statusEl, whoEl, gearBtn, tabsEl, launcher;
    let collapsed = true, showSettings = !!(store.get(K.view, null) || {}).set;
    let tab = store.get(K.tab, 'home');
    let me = null;                           // {id, name, position, leader} from the Hub (hello / whoami)
    // (0.2.4) restored from K.view - the panel opens where you left it (user: "Persist the Suite panel over refreshes")
    const open = Object.assign({}, (store.get(K.view, null) || {}).open || {});   // expanded cards: {'w:<id>': true, ...}
    let profileId = (store.get(K.view, null) || {}).pid || null;   // Members tab: the member whose profile is open (null = the list)

    // every tab: who sees it (lead = leaders only), its label, and what it draws
    // main = the DEFAULT bottom bar (0.2.0: each member can change it in ⚙ → Layout); the rest open from ••• More.
    // mod = hidden when that module is off in ⚙.
    const TABS = [
        { id: 'home', icon: '🏠', label: 'Home', main: true }, { id: 'chain', icon: '⛓', label: 'Chain', main: true, mod: 'chain' },
        { id: 'oc', icon: '🕵', label: 'OC', main: true }, { id: 'wars', icon: '⚔', label: 'War', main: true },
        { id: 'more', icon: '•••', label: 'More', main: true },
        { id: 'boards', icon: '🏆', label: 'Boards' }, { id: 'me', icon: '👤', label: 'Me' }, { id: 'members', icon: '👥', label: 'Members' },
        { id: 'history', icon: '📜', label: 'History' }, { id: 'news', icon: '📰', label: 'News' }, { id: 'payouts', icon: '💰', label: 'Payouts' }, { id: 'scripts', icon: '🧩', label: 'Scripts' },
        // href = a Hub page that opens in a new tab (0.2.1, user: "OC Management, Panel Editor and Payout Calculator should
        // just link to the hub, not have independently built pages")
        { id: 'alerts', icon: '🔔', label: 'Alerts', lead: true }, { id: 'announce', icon: '📢', label: 'Announce', lead: true }, { id: 'ocm', icon: '🗂', label: 'OC Management ↗', lead: true, href: '/l/oc.html' },
        { id: 'panels', icon: '🖼', label: 'Panel Editor ↗', lead: true, href: '/l/panels.html' },
        { id: 'recruit', icon: '🤝', label: 'Recruit', lead: true, mod: 'recruit' },
        { id: 'stats', icon: '💪', label: 'Stats', lead: true },
        { id: 'armory', icon: '🗄', label: 'Armory', lead: true }, { id: 'calc', icon: '🧮', label: 'Payout calculator ↗', lead: true, href: '/l/payout.html' },
    ];
    // a link tab: open the Hub page instead of switching tab (true = handled)
    const hrefTab = id => { const t = TABS.find(x => x.id === id); if (!t || !t.href) return false; window.open(HUB_BASE + t.href, '_blank', 'noopener'); return true; };
    const tabOk = id => { const t = TABS.find(x => x.id === id); if (t && t.href) return false;
        return !!t && (!t.lead || !!(me && me.leader)) && (!t.mod || MOD[t.mod] !== false); };

    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

    function buildPanel() {
        panel = el('div'); panel.id = 'hbs-panel';
        panel.innerHTML = `
            <div class="hbs-head">
                <span><span class="hbs-title">${SCRIPT_NAME}</span><span class="hbs-ver">v${VERSION}</span><span class="hbs-who"></span></span>
                <span class="hbs-ctrls">
                    <button type="button" class="hbs-ibtn" data-h="reload" title="Reload from the Hub">↻</button>
                    <button type="button" class="hbs-ibtn" data-h="gear" title="Settings">⚙</button>
                    <button type="button" class="hbs-ibtn" data-h="min" title="Minimize">–</button>
                </span>
            </div>
            <div class="hbs-chipbar"></div>
            <div class="hbs-upd" style="display:none"></div>
            <div class="hbs-ann" style="display:none"></div>
            <div class="hbs-pin" style="display:none"></div>
            <div class="hbs-pin hbs-ocpin" style="display:none"></div>
            <div class="hbs-tabs"></div>
            <div class="hbs-status"></div>
            <div class="hbs-body"></div>`;
        document.body.appendChild(panel);
        bodyEl = panel.querySelector('.hbs-body');
        statusEl = panel.querySelector('.hbs-status');
        whoEl = panel.querySelector('.hbs-who');
        tabsEl = panel.querySelector('.hbs-tabs');
        gearBtn = panel.querySelector('[data-h="gear"]');
        chipsEl = panel.querySelector('.hbs-chipbar');
        pinEl = panel.querySelector('.hbs-pin:not(.hbs-ocpin)'); updEl = panel.querySelector('.hbs-upd');
        ocPinEl = panel.querySelector('.hbs-ocpin');   // (0.2.26) 📌 OC assignment tile
        ocPinEl.addEventListener('click', e => { if (e.target.closest('a')) return; if (!e.target.closest('[data-ocpin]')) return; tab = 'oc'; store.set(K.tab, tab); showSettings = false; render(); });
        pinEl.addEventListener('click', e => { const b = e.target.closest('[data-pin]'); if (b) cwAction(b.dataset.pin, b.tagName === 'BUTTON' ? b : null); });
        annEl = panel.querySelector('.hbs-ann');
        annEl.addEventListener('click', e => { if (!e.target.closest('[data-anndis]')) return; const a = nowData && nowData.announce; if (a) store.set(K.annDismiss, a.id); drawAnn(); });
        updEl.addEventListener('click', e => { if (!e.target.closest('[data-upd]')) return; const U = store.get(K.upd, {}) || {}; U.dismissed = U.ver; store.set(K.upd, U); drawUpdate(); });
        chipsEl.addEventListener('click', e => { const b = e.target.closest('[data-gotab]'); if (!b || hrefTab(b.dataset.gotab) || !tabOk(b.dataset.gotab)) return;
            tab = b.dataset.gotab; store.set(K.tab, tab); showSettings = false; render(); });
        panel.querySelector('[data-h="min"]').addEventListener('click', () => setCollapsed(true));
        gearBtn.addEventListener('click', () => { showSettings = !showSettings; render(); });
        panel.querySelector('[data-h="reload"]').addEventListener('click', () => { Object.keys(cache).forEach(k => delete cache[k]); liveClear(); Object.keys(optMiss).forEach(k => delete optMiss[k]); render(); });
        tabsEl.addEventListener('click', e => {
            const b = e.target.closest('button[data-tab]'); if (!b || hrefTab(b.dataset.tab)) return;
            if (tab === b.dataset.tab && b.dataset.tab === 'members') profileId = null;     // tapping Members again = back to the list
            profileBack = null;
            tab = b.dataset.tab; store.set(K.tab, tab); showSettings = false; render();
        });
        // keep Torn's global hotkeys out of our inputs
        panel.addEventListener('keydown', e => { if (e.target.matches('input,textarea,select')) e.stopPropagation(); }, true);
        ['pointerdown', 'keydown', 'input', 'change'].forEach(ev => panel.addEventListener(ev, () => { userActAt = Date.now(); }, true));   // (0.2.27)
        buildTabs();
        restorePanelSize();
        restorePanelPos();
        makePanelDraggable(panel.querySelector('.hbs-head'), panel.querySelector('.hbs-ctrls'));
        makePanelResizable();
    }

    function buildTabs() {
        if (!tabsEl) return;
        const lead = !!(me && me.leader);
        void lead;
        tabsEl.innerHTML = barTabs().map(t =>
            `<button type="button" data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('');
    }

    function setMe(m) {
        const wasLead = !!(me && me.leader);
        me = m || null;
        if (me) me.id = num(me.id);
        if (me && me.leader) { try { rsLeaderLoad(); } catch (e) { /* recruit module */ } }   // (0.2.31) leaders' data, once
        try { const ses = store.get(K.session, null); store.set(K.meC, me && ses ? { me, exp: ses.exp } : null); } catch (e) { /* */ }
        if (whoEl) whoEl.textContent = me ? '· ' + me.name : '';
        if (wasLead !== !!(me && me.leader)) buildTabs();
    }

    function setStatus(text, isErr) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.toggle('hbs-err', !!isErr);
    }

    // ---------------------------------------------------------------------
    // TIMERS — the Ready tab refresh, and a 1-second ticker for countdowns (data-exp = ms,
    // data-until = epoch s). All of it runs only while the panel is open and Torn's page is visible.
    // ---------------------------------------------------------------------
    let pollTimer = null, tickTimer = null;
    function stopTimers() { clearTimeout(pollTimer); pollTimer = null; clearInterval(tickTimer); tickTimer = null; }
    function schedulePoll() {
        clearTimeout(pollTimer); pollTimer = null;
        if (collapsed || showSettings || document.visibilityState !== 'visible') return;
        const ms = tab === 'ready' ? READY_POLL_MS : 0;          // (Home's chain refresh removed in 2.3.0)
        if (ms) pollTimer = setTimeout(() => { if (tab === 'ready') render(true); }, ms);
        if (!tickTimer) tickTimer = setInterval(tick, 1000);
    }
    function tick() {
        if (collapsed || !panel) return;
        tickEl(panel);
        refreshNow(false);                                     // header chips: op live "now" at most every 30 s
    }
    function tickEl(root) {
        const n = Date.now();
        root.querySelectorAll('[data-exp]').forEach(x => { const v = Number(x.dataset.exp) - n; x.textContent = v > 0 ? dur(v / 1000) : (x.dataset.zero || '0s'); });
        root.querySelectorAll('[data-until]').forEach(x => { const v = Number(x.dataset.until) - n / 1000; x.textContent = v > 0 ? dur(v) : (x.dataset.zero || 'Ready'); });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { if (!collapsed && (tab === 'home' || tab === 'ready')) render(true); }
        else stopTimers();
    });

    // ---------------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------------
    let renderSeq = 0;
    // quiet = a timed refresh (keeps the scroll position, no "Loading…")
    let userActAt = 0;                                      // (0.2.27) last tap / key / edit inside the panel
    async function render(quiet) {
        if (!panel || collapsed) return;
        if (quiet && showSettings && Date.now() - userActAt > 5000) return;   // (0.2.27) ⚙ open: no background redraws
        if (quiet && tab === 'recruit' && rsView === 'set' && !showSettings) return;   // (0.2.9) don't redraw the Criteria form
        const seq = ++renderSeq;
        gearBtn.classList.toggle('hbs-on', showSettings);
        if (showSettings || !getKey()) { markTab(); renderSettings(); stopTimers(); viewSave(); return; }
        const top = bodyEl.scrollTop;
        if (!quiet) viewHold();                         // (0.2.4) the "Loading…" jump isn't saved as your position
        if (!quiet) { bodyEl.innerHTML = '<div class="hbs-empty">Loading…</div>'; setStatus(''); }
        try {
            if (!me) setMe((await hub('whoami')).me);      // also signs in when needed
            if (!tabOk(tab)) { tab = 'home'; store.set(K.tab, tab); }
            markTab(); cwWatch(); refreshNow(false);
            if (tab === 'ready') { tab = 'home'; store.set(K.tab, tab); }   // (0.2.45) the War Readiness tab is gone
            const T = VIEWS[tab];
            const html = await T.html();
            if (seq !== renderSeq) return;            // a newer render started (tab switch)
            bodyEl.innerHTML = html;
            if (quiet) bodyEl.scrollTop = top;
            if (T.bind) T.bind();
            if (!quiet) viewRestore();                      // (0.2.4) back to this tab's saved scroll position
            tick(); drawPin(); drawBadges();
        } catch (e) {
            if (seq !== renderSeq) return;
            console.warn(LOG, e);
            if (!quiet) bodyEl.innerHTML = `<div class="hbs-empty">${esc(e.message || 'Something went wrong.')}</div>`;
            setStatus(e.message, true);
        }
        schedulePoll();
    }
    function markTab() {
        const t = TABS.find(x => x.id === tab), on = t && inBar(t.id) && barTabs().includes(t) ? tab : 'more';      // a More tab lights up "More"
        tabsEl.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('hbs-on', !showSettings && b.dataset.tab === on));
    }
    const msgIn = key => bodyEl.querySelector(`[data-msg="${key}"]`);

    // ---- shared data ----
    async function names() {
        const M = await readFile('m', 'db/members.json');
        if (!M._by) { M._by = {}; (M.members || []).forEach(m => { M._by[m.id] = m; }); }
        return { list: M.members || [], byId: M._by };
    }
    const nameOf = (N, id) => (N.byId[id] || {}).name || '[' + id + ']';
    const kv = rows => `<div class="hbs-kv">${rows.filter(Boolean).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
    const tiles = rows => `<div class="hbs-tiles">${rows.filter(Boolean).map(([v, l, sub]) => `<div><b>${v}</b><span>${l}</span>${sub ? `<i>${sub}</i>` : ''}</div>`).join('')}</div>`;
    const sec = t => `<div class="hbs-sec">${t}</div>`;
    const meter = (lab, b, col) => !b ? '' : `<div class="hbs-meter"><div class="l"><span>${lab}</span><b>${int(b.cur)} / ${int(b.max)}</b></div>
        <div class="t"><i style="width:${b.max ? Math.min(100, Math.round(100 * b.cur / b.max)) : 0}%;background:${col}"></i></div></div>`;
    const vsAvg = (v, a) => v == null || !a ? '' : `<span class="${v >= a ? 'hbs-up' : 'hbs-down'}">${v >= a ? '▲' : '▼'} ${Math.abs(Math.round((v / a - 1) * 100))}% vs avg</span>`;
    const chips = (name, opts, cur) => `<div class="hbs-chips" data-chips="${name}">${opts.map(([v, l]) =>
        `<button type="button" data-v="${esc(v)}" class="${String(v) === String(cur) ? 'hbs-on' : ''}">${l}</button>`).join('')}</div>`;
    // chips -> state + re-render
    function bindChips(name, set) {
        const c = bodyEl.querySelector(`[data-chips="${name}"]`);
        if (c) c.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; set(b.dataset.v); render(); });
    }

    // =====================================================================
    // 🏠 HOME — your numbers vs the faction, Needs attention (leaders), latest posts (chain items removed in 2.3.0)
    // =====================================================================
    // 🏠 HOME (2.8.0, user: "Home tab should show certain faction information about yourself: A header that shows your
    // name, rank, how many days in faction, etc. Simple info. For Leaders, alerts should be at the top in their own
    // tile. This could be OC Alerts, OC Notify tasks, members with bad reliability rating, etc. A new tile should show
    // your Organized Crime information. A new tile should show your latest war information. A new tile should show your
    // latest chain information."). Order: header -> 🔔 leader alerts (leaders) -> 🕵 my OC -> ⚔ latest war ->
    // ⛓ latest chain -> latest posts. Data: the Hub's db files (no Torn call) + op live "myoc" (your crime from the
    // Hub's OC feed + your seat in the plan) + op "mine" (your reliability, cached 10 min) + leaders: op live "spawn".
    let mineCache = null;
    const OC_LINK = id => `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${id}`;
    // Home → Full profile opens the 👤 Me tab (0.2.3)
    const onb = () => store.get(K.onb, {}) || {};
    const onbSet = p => { const o = onb(); if (o.done) return; store.set(K.onb, Object.assign(o, p)); };
    let onbBusy = false;
    function onbHtml() {
        const o = onb(); if (o.done) return '';
        if (!o.oc && !onbBusy && Date.now() - num(o.ocAt) > 20000) { onbBusy = true;
            // [HB Suite] Hub API — op "share_get" (your sharing settings; kept 60 s) for the Getting started tile
            hub('share_get').then(g => { const on = !!((g && g.settings) || {}).oc; onbSet({ oc: on, ocAt: Date.now() }); if (on && tab === 'home' && !collapsed && !showSettings) render(true); }, () => onbSet({ ocAt: Date.now() }))
                .then(() => { onbBusy = false; }); }
        if (cw.queued && !o.join) { onbSet({ join: true }); o.join = true; }
        // 🕵 JOIN AN OC (user: "Should also queue you to join an OC. If you're already in one, complete the task."): ticked
        // when the Hub shows you seated in a crime (op live "myoc", cached). With a live assignment the button opens that
        // crime on Torn (you press Torn's Join); otherwise it opens the 🕵 OC tab.
        const MO = typeof myOc !== 'undefined' ? myOc : null, as = MO && MO.assignment;
        if (!MO && !o.crime) loadMyOc(false).then(d => { if (d && tab === 'home' && !collapsed && !showSettings) render(true); }, () => {});
        if (MO && MO.current && !o.crime) { onbSet({ crime: true }); o.crime = true; }
        const ocBtn = as && !as.joined && as.kind === 'live' && as.crime_id
            ? `<a class="hbs-btn hbs-mini" href="${OC_LINK(as.crime_id)}">Join ${esc(as.crime)}</a>` : '<button type="button" class="hbs-btn hbs-mini" data-onb="oc">Open 🕵 OC</button>';
        const steps = [
            ['key', !!getKey(), 'Add your API key', 'A Limited Access key. Stays on this device.', ''],
            ['oc', !!o.oc, 'Share your OC pass rates', 'So the planner seats you in roles you pass.', '<button type="button" class="hbs-btn hbs-mini" data-onb="oc">Open 🕵 OC</button>'],
            ['test', !!o.test, 'Test your alerts', "Hear and feel what a chain alert is like.", '<button type="button" class="hbs-btn hbs-mini" data-onb="test">🔔 Test</button>'],
            ['join', !!o.join, 'Join the Chain Watch queue', 'Take a turn keeping the chain alive.', '<button type="button" class="hbs-btn hbs-mini" data-onb="chain">Open ⛓ Chain</button>'],
            ['crime', !!o.crime, 'Join an organized crime', as && !as.joined ? `You're assigned: ${esc(as.crime)} · ${esc(as.position)}${as.kind === 'live' ? '' : ' (waiting to be spawned)'}.` : 'Take a seat in a faction OC.', ocBtn]];
        const left = steps.filter(x => !x[1]).length;
        if (!left) { store.set(K.onb, { done: true }); return ''; }
        return `<div class="hbs-card hbs-onb"><div class="hbs-r1"><span class="hbs-name">✅ Getting started</span><span class="hbs-chip">${steps.length - left}/${steps.length}</span></div>
            ${steps.map(([k, ok, t, sub, btn]) => `<div class="hbs-onbrow${ok ? ' ok' : ''}"><i>${ok ? '✓' : '○'}</i><span><b>${t}</b><small>${sub}</small></span>${ok ? '' : btn}</div>`).join('')}</div>`;
    }
    function homeBind() {
        bodyEl.querySelectorAll('[data-onb]').forEach(x => x.addEventListener('click', () => { const a = x.dataset.onb;
            if (a === 'test') { cwAction('test'); toast('🔔 Test alert sent - it comes back from the Hub in a moment.'); setTimeout(() => { if (tab === 'home') render(true); }, 300); return; }
            tab = a; store.set(K.tab, tab); render(); })); const b = bodyEl.querySelector('[data-homeme]'); if (b) b.addEventListener('click', () => { tab = 'me'; store.set(K.tab, tab); render(); }); }
    async function homeHtml() {
        // [HB Suite] Hub API — op "live" what "myoc" (your crime + plan seat) and op "mine" (your reliability)
        const myP = live('myoc').catch(() => null);
        const minP = mineCache && Date.now() - mineCache.at < 600000 ? Promise.resolve(mineCache.d)
            : hub('mine').then(d => { mineCache = { at: Date.now(), d }; return d; }).catch(() => null);
        const pend = [], peek = (area, path) => { const k = area + ':' + path;
            if (cache[k] && Date.now() - cache[k].at < CACHE_MS) return cache[k].data;
            if (optMiss[k] && Date.now() - optMiss[k] < 60000) return null;
            pend.push(readOpt(area, path)); return null; };
        const soon = p => Promise.race([p, new Promise(r => setTimeout(() => r(undefined), 150))]).then(v => { if (v === undefined) { pend.push(p); return null; } return v; });
        const H = peek('m', 'db/home.json'), F = peek('m', 'db/script_feed.json'), W = peek('m', 'db/wars.json'), C = peek('m', 'db/chains.json'),
              O = peek('m', 'db/crimes.json'), PO = peek('m', 'db/payouts.json');
        const [N, MY, MINE] = await Promise.all([names(), soon(myP), soon(minP)]);   // the member list is needed for everything
        if (pend.length) Promise.all(pend.map(p => p.catch(() => null))).then(() => { if (tab === 'home' && !collapsed && !showSettings) render(true); });
        let out = onbHtml();   // (0.2.32) ✅ Getting started
        // ---- HEADER: who you are in the faction ----
        const m = N.byId[me.id] || {}, row = H && H.m ? H.m[String(me.id)] : null, A = (H && H.avg) || {};
        out += `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">${esc(me.name)} <span style="opacity:.5;font-weight:normal">[${me.id}]</span></span>
            <span class="hbs-chip">${esc(me.position || m.position || 'Member')}</span></div>
            <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', (row && row[0] != null ? row[0] : m.days) != null ? int(row && row[0] != null ? row[0] : m.days) + ' days in the faction' : '']
                .filter(Boolean).join(' · ')}</div>`;
        const cmH = out.length;   // (0.2.63) compact mode: everything the block below adds is split into header buttons + a 📊 fold
        {
            // (0.2.4) the header's figures + the Hub-profile totals, grouped and centred; no reliability scores here
            const [, wh, gym, oc] = row || [], t = m.t || {};
            const grp = (title, rows) => rows.filter(Boolean).length ? `<div class="hbs-grp"><div class="t">${title}</div>${tiles(rows)}</div>` : '';
            out += `<div class="hbs-grps">`
                + grp('⚔ Wars', [row ? [wh == null ? '-' : int(wh), 'Last war hits', wh == null ? 'not in it' : vsAvg(wh, A.war)] : null,
                                 [int(t.war_hits), 'War hits', `${int(t.wars)} wars`]])
                + `<div class="hbs-grp hbs-grp2"><div><div class="t">⛓ Chains</div>${tiles([[int(t.chain_hits), 'Chain hits', `${int(t.chains)} chains`]])}</div>
                    ${row ? `<div><div class="t">🏋 Gym</div>${tiles([[big(gym), 'Gym this month', vsAvg(gym, A.gym)]])}</div>` : ''}</div>`
                + grp('🕵 OCs', [row ? [oc == null ? '-' : oc + '%', 'OC success', oc == null ? 'no crimes' : vsAvg(oc, A.oc)] : null,
                                [`${int(t.crimes_ok)}/${int(t.crimes)}`, 'OCs passed'], [shortMoney(t.crime_money), 'OC earnings']])
                + `</div><div class="hbs-actions"><button type="button" class="hbs-btn" data-homeme>Full profile</button>
                <a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/member.html?id=${me.id}" target="_blank" rel="noopener">On the Hub</a></div>`;
        }
        if (CMP()) { const g = out.slice(cmH), i = g.indexOf('<div class="hbs-actions">'), t = m.t || {};
            out = out.slice(0, cmH) + (i >= 0 ? g.slice(i) : '') + '</div>'
                + cFold('homestats', '📊', 'Your stats', `<small>${int(t.war_hits)} war hits · ${int(t.chain_hits)} chain hits${row && row[3] != null ? ` · OC ${row[3]}%` : ''}</small>`, i >= 0 ? g.slice(0, i) : g, false); }
        else out += '</div>';
        // (🔔 Leader alerts moved to their own leaders' tab in 0.2.0 - user: "Move Leader Alerts from the home page")
        // ---- 🕵 MY ORGANIZED CRIME ----
        {
            const cur = MY && MY.current, as = MY && MY.assignment;
            const mineOC = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
            const last = mineOC.length ? mineOC[mineOC.length - 1] : null, okN = mineOC.filter(c => String(c.status).toLowerCase() === 'successful').length;
            const earned = mineOC.reduce((a, c) => a + num(c.share), 0);
            let body = '';
            if (cur) {
                const eta = cur.ready_at ? new Date(cur.ready_at * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                body += `<div class="hbs-li"><span>In <a href="${OC_LINK(cur.crime_id)}"><b>${esc(cur.crime)}</b></a> as <b>${esc(cur.position)}</b>${cur.rate != null ? ` · ${cur.rate}%` : ''}<br>
                    <span style="opacity:.75">${esc(cur.status)} · ${cur.filled}/${cur.seats} filled · your planning ${Math.round(cur.progress)}%${eta ? ' · ready ' + eta : ''}</span></span></div>`;
            }
            if (as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id))) {
                body += `<div class="hbs-li"><span>📌 Assigned: <b>${esc(as.crime)}</b> · <b>${esc(as.position)}</b>${as.rate != null ? ` · ${Math.round(as.rate)}%` : ''}
                    ${as.leave ? `<br><span style="color:#e8be5a">↪ Leave ${esc(as.leave.crime)} first - your planning there hasn't started</span>` : ''}
                    ${as.kind !== 'live' ? '<br><span style="opacity:.75">Waiting for this crime to be spawned</span>' : ''}</span>
                    ${as.kind === 'live' && as.crime_id ? `<a class="hbs-btn" href="${OC_LINK(as.crime_id)}">Join</a>` : ''}</div>`;
            }
            if (!cur && !(as && !as.joined)) body += '<div class="hbs-hint">Not in a crime and nothing assigned right now.</div>';
            body += tiles([[mineOC.length ? `${okN}/${mineOC.length}` : '-', 'Crimes passed'],
                [mineOC.length ? Math.round(100 * okN / mineOC.length) + '%' : '-', 'Success rate'], [earned ? shortMoney(earned) : '-', 'OC earnings'],
                last ? [esc(last.name || '?'), 'Last crime', `${fmtD(last.t)} · <span class="${String(last.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(last.status || '')}</span>`] : null]);
            const asWait = !!(as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id)));
            out += cmCard('homeoc', '🕵', 'My organized crime', asWait ? `<span class="hbs-foldme">📌 ${esc(as.crime)}</span>` : cur ? `<small>${esc(cur.crime)} · ${Math.round(cur.progress)}%</small>` : '<small>not in a crime</small>', asWait,
                `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🕵 My organized crime</span></div>${body}</div>`);
        }
        // ---- ⚔ LATEST WAR ----
        {
            const wars = ((W && W.wars) || []).slice().sort((a, b) => num(a.end) - num(b.end)), w = wars[wars.length - 1];
            if (w) {
                const ranked = (w.m || []).slice().sort((a, b) => b[1] - a[1]), x = (w.m || []).find(r => r[0] === me.id);
                const avg = ranked.length ? ranked.reduce((a, r) => a + r[1], 0) / ranked.length : 0;
                const pay = ((PO && PO.payouts) || []).find(p => p.end === w.end && (p.m || []).some(r => r[0] === me.id));
                const paid = pay ? pay.m.find(r => r[0] === me.id) : null;
                out += cmCard('homewar', '⚔', 'Latest war', `<small>vs ${esc(w.opponent || '?')} · ${x ? int(x[1]) + ' hits' : 'not in it'}${paid && paid[1] ? ' · ' + shortMoney(paid[1]) : ''}</small>`, false,
                    `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⚔ Latest war · vs ${esc(w.opponent || '?')}</span><span class="hbs-chip">${fmtD(w.end)}</span></div>`
                    + (x ? tiles([[int(x[1]), 'Your hits', `#${ranked.findIndex(r => r[0] === me.id) + 1} of ${ranked.length}<br>${vsAvg(x[1], avg)}`], [int(x[2]), 'Respect'],
                                  [int(x[3]), 'Assists'], [paid && paid[1] ? shortMoney(paid[1]) : (w.payout ? '-' : 'pending'), 'Your payout']])
                         : '<div class="hbs-hint">You weren\'t in this war.</div>')
                    + `<div class="hbs-hint">Faction: ${int(w.hits)} hits · ${w.attackers}/${w.members} members hit${w.termed ? ' · 🤝 termed' : ''}${x && x[1] < MIN_HITS ? ` · <span class="hbs-bad">under ${MIN_HITS} hits</span>` : ''}</div>`
                    + `<div class="hbs-actions">${w.report ? `<a class="hbs-btn hbs-ghost" href="${esc(w.report)}" target="_blank" rel="noopener">📄 Report</a>` : ''}</div></div>`);
            }
        }
        // ---- ⛓ LATEST CHAIN ----
        {
            const chains = ((C && C.chains) || []).slice().sort((a, b) => num(a.end) - num(b.end)), c = chains[chains.length - 1];
            if (c) {
                const x = (c.m || []).find(r => r[0] === me.id), ranked = (c.m || []).slice().sort((a, b) => b[1] - a[1]);
                out += cmCard('homechain', '⛓', 'Latest chain', `<small>${int(c.length)} hits · ${x ? 'yours ' + int(x[1]) : 'you: none'}</small>`, false,
                    `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⛓ Latest chain · ${int(c.length)} hits</span><span class="hbs-chip">${fmtD(c.end)}</span></div>`
                    + (x ? tiles([[int(x[1]), 'Your hits', `#${ranked.findIndex(r => r[0] === me.id) + 1} of ${ranked.length}`], [int(x[2]), 'Respect'], [int(x[3]), 'Retals'],
                                  [c.length ? (100 * x[1] / c.length).toFixed(1) + '%' : '-', 'Of the chain']])
                         : '<div class="hbs-hint">You didn\'t hit in this chain.</div>') + '</div>');
            }
        }
        // 📰 LATEST (0.2.15, user: "Home page should have a 'Latest' Section ... latest entry tiles for Newsletters, War
        // Reports, Chain Reports"): one tile each - the image (opens full size), title and date - from db/script_feed.json
        {
            const pick = (l, label) => { const x = ((F && F[l]) || [])[0]; return x ? [x, label] : null; };
            const T = [pick('newsletters', '📰 Newsletter'), pick('war_reports', '⚔ War report'), pick('chain_reports', '⛓ Chain report')].filter(Boolean);
            if (T.length && CMP()) out += cFold('homelatest', '📰', 'Latest', `<small>${T.map(([, label]) => label.replace(/^\S+\s/, '')).join(' · ')}</small>`,
                `<div class="hbs-latest">${T.map(([x, label]) => `<a class="hbs-lt" href="${esc(x.url)}" target="_blank" rel="noopener">
                <span class="k">${label}</span>${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : ''}<b>${esc(x.title || '')}</b><small>${esc(x.sub || '')}</small></a>`).join('')}</div>
                <div class="hbs-hint">More in 📰 News.</div>`, false);
            else if (T.length) out += sec('Latest') + `<div class="hbs-latest">${T.map(([x, label]) => `<a class="hbs-lt" href="${esc(x.url)}" target="_blank" rel="noopener">
                <span class="k">${label}</span>${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : ''}<b>${esc(x.title || '')}</b><small>${esc(x.sub || '')}</small></a>`).join('')}</div>
                <div class="hbs-hint">More in 📰 News.</div>`;
        }
        return out;
    }
    // =====================================================================
    // =====================================================================
    // 🔔 ALERTS (leaders, 0.2.0) — the Home "Leader alerts" tile, moved to its own tab (user: "Move Leader Alerts from the
    // home page to the '... More' tabs. Create a new 'Alerts' page under the Leaders section"). Same data and Notify buttons.
    // =====================================================================
    async function alertsHtml() {
        const N = await names();
        let out = '';
        // ---- 🔔 LEADER ALERTS: everything that needs a leader, in one tile at the top ----
        if (me.leader) {
            const [At, P] = await Promise.all([readOpt('l', 'db/attention.json'), readOpt('l', 'db/private.json')]);
            // [HB Suite] Hub API — op "live" what "spawn" (leaders): spawn alerts, OC alerts, Notify list
            const S = await live('spawn').catch(() => null);
            const lines = [];
            // (0.2.17) another leader changed the shared recruit settings in the last 48 h
            await rsSyncSettings();
            { const SN = store.get(K.rsSetNote, null);
              if (SN && Date.now() - SN.at < 48 * 3600e3) lines.push(`⚙ Recruit settings changed by <b>${esc(SN.by)}</b> (${fmtDT(Math.floor(SN.at / 1000))} ${tzTagH()})${(SN.diff || []).length ? ': ' + esc(SN.diff.slice(0, 4).join(', ')) + (SN.diff.length > 4 ? '…' : '') : ''}`); }
            (At ? At.unpaid || [] : []).forEach(w => lines.push(`💰 No payout yet: vs ${esc(w.opponent || '?')} (${fmtD(w.end)})`));
            (At ? At.recruits || [] : []).forEach(r => lines.push(`🧑 Recruit ${esc(r.name)} idle ${r.idle} days`));
            const OA = (S && S.oc_alerts) || {};
            (OA.crimes || []).forEach(x => lines.push(`📉 <b>${esc(x.crime)}</b> #${esc(x.crime_id)} - team success ${esc(x.success)}%, below the ${esc(x.target)}% target`));
            (OA.roles || []).slice(0, 8).forEach(x => lines.push(`🎯 <b>${esc(x.name)}</b> joined ${esc(x.position)} in ${esc(x.crime)} at ${esc(x.rate)}% - ${esc(x.why)}`));
            ((S && S.alerts) || []).slice(0, 6).forEach(a => lines.push(`🧪 Spawn <b>${esc(a.crime)}</b>${a.difficulty != null ? ` D${esc(a.difficulty)}` : ''}${a.pay_day ? ` · $${big(a.pay_day)}/day each` : ''} - pass rates too high for every open crime${(a.names || []).length ? `: ${esc(a.names.filter(Boolean).join(', '))}` : ''}`));
            // members with a bad reliability rating (grade D or lower, current members), worst first
            const bad = P && P.members ? Object.entries(P.members).filter(([id, v]) => v && v.reliability && v.reliability.score != null && v.reliability.score < 55
                && (N.byId[id] || {}).current).sort((a, b) => a[1].reliability.score - b[1].reliability.score) : [];
            const REL_MAX = 12;
            relTrack(bad);   // (0.2.35) who is new on the list / dropped a grade since you last looked
            const relNewList = bad.filter(([id]) => relWhy[id]);
            const relHtml = !bad.length ? '' : sec(`🛡 Low reliability · ${bad.length}`)
                + `<div class="hbs-hint">Score under 55 (grade E or F), worst first. War = wars with ${MIN_HITS}+ hits · Chains = large chains hit · Idle = days since last action.</div>`
                + (relNewList.length ? `<div class="hbs-relnew">🔻 <b>New since you last looked:</b> ${relNewList.map(([id, v]) => `<a href="#" data-prof="${id}">${esc(nameOf(N, id))}</a> ${relWhyText(id)} (${int(v.reliability.score)})`).join(' · ')}</div>` : '')
                + `<div class="hbs-rel">` + relNewList.concat(bad.filter(([id]) => !relWhy[id])).slice(0, REL_MAX).map(([id, v]) => { const R = v.reliability, g = relG(R.score), D = R.detail || {};
                    const why = [D.wars_in ? `War ${int(D.wars_hit)}/${int(D.wars_in)}` : '', D.chains_elig ? `Chains ${int(D.chains_hit)}/${int(D.chains_elig)}` : '',
                        D.idle_days != null && D.idle_days >= 1 ? `Idle ${int(D.idle_days)} d` : ''].filter(Boolean).join(' · ');
                    const W = relWhy[id];
                    return `<div class="hbs-relrow${W ? ' new' : ''}"><b class="g" style="background:${g[1]}">${g[0]}</b>
                        <span class="n"><a href="#" data-prof="${id}">${esc(nameOf(N, id))}</a>${W ? `<em>${W.from == null ? 'NEW' : '▼ ' + GRADES[W.from][1] + '→' + GRADES[W.to][1]}</em>` : ''}<small>${why || 'not enough detail yet'}</small></span>
                        <span class="sc"><b style="color:${g[1]}">${int(R.score)}</b><i><u style="width:${Math.max(0, Math.min(100, num(R.score)))}%;background:${g[1]}"></u></i></span></div>`; }).join('') + '</div>'
                + (bad.length > REL_MAX ? `<div class="hbs-hint">+${bad.length - REL_MAX} more - 👥 Members → sort by Lowest reliability.</div>` : '');
            const NT = (S && S.oc_notify) || [];
            notifyList = NT; notifyTplS = (S && S.notify_tpl) || null;
            const todo = NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position)).length;
            const n = lines.length + bad.length + todo; alertN = n;   // total on the page (0.2.1) (0.2.33: + each low-reliability member)
            // what each alert is (0.2.2: the badge counts only the ones not seen yet)
            alertKeys = lines.map(t => String(t).replace(/<[^>]+>/g, '')).concat(NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position))
                .map(x => 'ntf:' + x.pid + ':' + x.crime_id + ':' + x.position));
            out += `<div class="hbs-card ${n ? 'hbs-red' : 'hbs-green'}"><div class="hbs-r1"><span class="hbs-name">🔔 Leader alerts</span><span class="hbs-chip">${n}</span></div>`
                + (n ? '' : '<div class="hbs-hint">✅ Nothing needs you right now.</div>')
                + lines.map(t => `<div class="hbs-li"><span>${t}</span></div>`).join('')
                + relHtml
                // 📣 NOTIFY tasks (2.7.0 / 2.7.4): members without the OC script - with their NOTIFIED status
                + (NT.length ? sec(`📣 Notify (no OC script) · ${todo} to do`) + `<div class="hbs-hint">They can't see their OC assignment. Each button copies the message and opens Torn - paste and send. 💬 / ✉️ / ✓ log the contact for every leader (here and on the Hub site).</div>`
                    + ntfListHtml(NT, x => esc(x.name), 12)      // (0.2.81) grouped, one-line rows
                    + `<div class="hbs-hint" data-ntfmsg>Full list: OC Management → 📣 Notify on the Hub site.</div>` : '')
                + (lines.length ? '<div class="hbs-hint">Details: OC Management / War reports on the Hub site.</div>' : '') + '</div>';
        }
        return out;
    }

    // 🏆 BOARDS — leaderboards (same maths as the Hub's leaderboards.html: top 10, war / chain / OC / gym)
    // =====================================================================
    let lbPeriod = 'month', lbSec = 'war', lbMonth = '';
    const GS = [['gymstrength', 'Strength'], ['gymspeed', 'Speed'], ['gymdefense', 'Defense'], ['gymdexterity', 'Dexterity']];
    async function boardsHtml() {
        const [N, W, C, O, G] = await Promise.all([names(), readFile('m', 'db/wars.json'), readFile('m', 'db/chains.json'),
                                                    readFile('m', 'db/crimes.json'), readFile('m', 'db/gym.json')]);
        const cur = {}; N.list.forEach(m => { if (m.current) cur[m.id] = 1; });
        const ms = new Set(Object.keys(G.history || {}));
        (W.wars || []).forEach(w => w.end && ms.add(monthOf(w.end))); (C.chains || []).forEach(c => c.end && ms.add(monthOf(c.end)));
        (O.crimes || []).forEach(c => c.t && ms.add(monthOf(c.t)));
        const months = [...ms].filter(m => m < thisMonth()).sort().reverse();
        if (!lbMonth || !months.includes(lbMonth)) lbMonth = months[0] || '';
        const period = lbPeriod === 'all' ? { all: true } : { month: lbPeriod === 'past' ? lbMonth : thisMonth() };
        const onlyCur = lbPeriod !== 'past';             // this month / all time: current members only (as on the Hub)
        const inP = t => period.all || (t && monthOf(t) === period.month);
        const add = (o, id, v) => { if (v) o[id] = (o[id] || 0) + v; };
        // one board (v2.1.0, user: "Format the leaderboards to look more professional"): ranked rows with gold / silver /
        // bronze badges, a bar showing each value against #1, your own row highlighted (and your rank under the top 10)
        const board = (title, vals, fmt) => {
            fmt = fmt || int;
            // LEADERBOARD OPT-OUT (2.6.1): members who chose "Hide me" in the Hub's My data & sharing (db/members.json "nolb")
            // aren't ranked - they still count everywhere else (profiles, members, reports)
            const rows = Object.entries(vals).filter(([id, v]) => v > 0 && !(N.byId[id] || {}).nolb && (!onlyCur || cur[id])).sort((a, b) => b[1] - a[1]);
            const tot = rows.reduce((a, r) => a + r[1], 0), top = rows.length ? rows[0][1] : 1;
            const row = ([id, v], i) => `<div class="r r${i + 1}${Number(id) === me.id ? ' me' : ''}" data-prof="${id}"><span class="rk">${i + 1}</span>
                <span class="nm"><span>${esc(nameOf(N, id))}${cur[id] ? '' : ' <small>left</small>'}${Number(id) === me.id ? ' <small>you</small>' : ''}</span><i><em style="width:${Math.max(2, Math.round(100 * v / top))}%"></em></i></span>
                <span class="v">${fmt(v)}</span></div>`;
            const mine = rows.findIndex(([id]) => Number(id) === me.id), fk = 'lbc:' + title, shut = !!open[fk];
            return `<div class="hbs-lb"><div class="h" data-toggle="${esc(fk)}" style="cursor:pointer"><b>${shut ? '▸' : '▾'} ${title}</b><span>${shut && mine >= 0 ? `you #${mine + 1} · ` : ''}${rows.length} member${rows.length === 1 ? '' : 's'} · total ${fmt(tot)}</span></div>` +
                (shut ? '' : rows.length ? rows.slice(0, 10).map(row).join('') + (mine >= 10 ? '<div class="gap">⋯</div>' + row(rows[mine], mine) : '')
                    : '<div class="none">Nothing this period.</div>') + '</div>';
        };
        let out = chips('lbp', [['month', 'This month'], ['all', 'All time'], ['past', 'Past months']], lbPeriod);
        if (lbPeriod === 'past') out += `<div class="hbs-row"><select class="hbs-input" data-lbm>${months.map(m => `<option value="${m}"${m === lbMonth ? ' selected' : ''}>${monthName(m)}</option>`).join('')}</select></div>`;
        out += chips('lbs', [['war', '⚔ War'], ['chain', '⛓ Chain'], ['oc', '🕵 OC'], ['gym', '🏋 Gym']], lbSec);
        out += `<div class="hbs-hint">${period.all ? 'All time on record' : monthName(period.month) + (lbPeriod === 'month' ? ' (so far)' : '')} · ${onlyCur ? 'current members' : 'everyone who took part'} · top 10</div>`;
        if (lbSec === 'war') {
            const wh = {}, wr = {}, wn = {};
            (W.wars || []).filter(w => inP(w.end)).forEach(w => w.m.forEach(x => { add(wh, x[0], x[1]); add(wr, x[0], x[2]); if (x[1] > 0) add(wn, x[0], 1); }));
            out += board('War hits', wh) + board('War respect', wr) + board('Wars hit', wn);
        } else if (lbSec === 'chain') {
            const ch = {}, cr = {}, crt = {};
            (C.chains || []).filter(c => inP(c.end)).forEach(c => c.m.forEach(x => { add(ch, x[0], x[1]); add(cr, x[0], x[2]); add(crt, x[0], x[3]); }));
            out += board('Chain hits', ch) + board('Chain respect', cr) + board('Retaliations', crt);
        } else if (lbSec === 'oc') {
            const op = {}, oe = {};
            (O.crimes || []).filter(c => inP(c.t) && String(c.status).toLowerCase() === 'successful').forEach(c => (c.m || []).forEach(id => { add(op, id, 1); add(oe, id, c.share || 0); }));
            out += board('Crimes passed', op) + board('Crime earnings', oe, shortMoney);
        } else {
            let g = {};
            if (period.all) g = G.all || {};
            else if (period.month === G.month) g = G.month_gain || {};
            else { const h = (G.history || {})[period.month] || {}; Object.entries(h).forEach(([id, arr]) => { g[id] = {}; GS.forEach(([k], j) => { g[id][k] = arr[j] || 0; }); }); }
            const gt = {}, per = {}; GS.forEach(([k]) => { per[k] = {}; });
            Object.entries(g).forEach(([id, st]) => GS.forEach(([k]) => { add(per[k], id, st[k] || 0); add(gt, id, st[k] || 0); }));
            out += board('Total energy', gt) + GS.map(([k, l]) => board(l, per[k])).join('');
        }
        return out;
    }
    function boardsBind() {
        bindChips('lbp', v => { lbPeriod = v; });
        bindChips('lbs', v => { lbSec = v; });
        const s = bodyEl.querySelector('[data-lbm]'); if (s) s.onchange = () => { lbMonth = s.value; render(); };
    }

    // =====================================================================
    // 👤 ME / 👥 MEMBERS — the member list and profiles. Public parts for everyone (same data as the Hub's
    // member.html); your OWN private figures on Me (op "mine"); leaders see everyone's private figures + actions.
    // =====================================================================
    let memberFilter = '', memberSort = 'name';
    async function membersHtml() {
        if (profileId) return profileHtml(profileId, false);
        const N = await names();
        const P = me.leader ? await readOpt('l', 'db/private.json') : null;
        const PM = (P && P.members) || {};
        // shared battle / work stats (v2.4.3): leaders see everything shared (private.json), everyone else what's
        // shared with the faction (optin_shared.json). Latest reading of each series.
        const SH = P ? null : await readOpt('m', 'db/optin_shared.json');
        const statsOf = id => {
            const o = P ? (PM[id] || {}).optin : SH && SH.members ? SH.members[id] : null;
            const last = x => x && x.s && x.s.length ? x.s[x.s.length - 1] : null;
            const b = last(o && o.bs), w = last(o && o.ws);
            const via = P ? ((PM[id] || {}).optin || {}).via || null : null;          // leaders only (v2.5.0)
            return { bs: b ? { tot: b[1] + b[2] + b[3] + b[4], str: b[1], def: b[2], spd: b[3], dex: b[4], day: b[0] } : null,
                     ws: w ? { tot: w[1] + w[2] + w[3], man: w[1], int: w[2], end: w[3], day: w[0] } : null, via };
        };
        const ST = {}; N.list.forEach(m => { if (m.current) ST[m.id] = statsOf(m.id); });
        let list = N.list.filter(m => m.current);
        if (memberFilter) list = list.filter(m => String(m.name).toLowerCase().includes(memberFilter) || String(m.id) === memberFilter);
        const rel = m => { const r = (PM[m.id] || {}).reliability; return r && r.score != null ? r.score : -1; };
        const S = { name: (a, b) => String(a.name).localeCompare(String(b.name)), days: (a, b) => num(b.days) - num(a.days),
                    level: (a, b) => num(b.level) - num(a.level), hits: (a, b) => num((b.t || {}).war_hits) - num((a.t || {}).war_hits),
                    rel: (a, b) => rel(b) - rel(a), low: (a, b) => rel(a) - rel(b),
                    bs: (a, b) => num((ST[b.id].bs || {}).tot) - num((ST[a.id].bs || {}).tot),
                    ws: (a, b) => num((ST[b.id].ws || {}).tot) - num((ST[a.id].ws || {}).tot) };
        if (!S[memberSort] || (!P && (memberSort === 'rel' || memberSort === 'low'))) memberSort = 'name';
        list.sort(S[memberSort]);
        const opts = [['name', 'Name'], ['days', 'Days in faction'], ['level', 'Level'], ['hits', 'War hits'], ['bs', 'Battle stats'], ['ws', 'Work stats']]
            .concat(P ? [['rel', 'Best reliability'], ['low', 'Lowest reliability']] : []);
        const head = `<div class="hbs-bar" style="padding:7px 0 0">
            <input class="hbs-input" data-mf placeholder="Search members…" value="${esc(memberFilter)}" style="flex:1">
            <select class="hbs-input" data-ms>${opts.map(([v, l]) => `<option value="${v}"${memberSort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="hbs-hint">${list.length} current members${P && P.averages ? ` · faction reliability ${relG(P.averages.reliability)[0]} · ${P.averages.reliability}` : ''} · tap a member for their profile</div>`;
        return head + list.map(m => {
            const R = (PM[m.id] || {}).reliability, sc = R ? R.score : null, G = sc == null ? ['', '#33373f'] : relG(sc);
            const chip = P ? (sc == null ? '<span class="hbs-chip" style="color:#9aa0a8">Not enough data</span>' : `<span class="hbs-chip" style="color:${G[1]}">${G[0]} · ${sc}</span>`)
                : `<span class="hbs-chip">${int((m.t || {}).war_hits)} war hits</span>`;
            return `<div class="hbs-card" style="${P ? 'border-left-color:' + G[1] : ''}"><div class="hbs-r1" data-prof="${m.id}"><span class="hbs-name">${esc(m.name)}</span>
                <span style="font-size:10.5px;opacity:.6;white-space:nowrap">${esc(m.position || '')}</span>${chip}</div>
                <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', m.days != null ? m.days + ' days' : '', m.last_action ? 'active ' + ago(m.last_action) : ''].filter(Boolean).join(' · ')}</div>
                ${statRows(ST[m.id])}</div>`;
        }).join('');
    }
    // a member card's shared stats (v2.4.3): total + each stat, one row per kind
    function statRows(st) {
        if (!st || (!st.bs && !st.ws)) return '';
        // fixed grid (v2.4.4): label | total | 4 stat cells - the same on every card, both rows always shown
        const row = (ic, lab, tot, parts, src) => `<div class="hbs-msr"><span class="k">${ic} ${lab}${src && src.length ? `<span class="hbs-src">${srcIcons(src)}</span>` : ''}</span>` + (tot == null
            ? '<span class="na">not shared</span>'
            : `<b class="t">${big(tot)}</b>` + [0, 1, 2, 3].map(i => parts[i]
                ? `<span class="p"><i>${parts[i][0]}</i><b>${big(parts[i][1])}</b></span>` : '<span class="p e"></span>').join('')) + '</div>';
        return '<div class="hbs-ms">' +
            row('💪', 'Battle', st.bs ? st.bs.tot : null, st.bs ? [['STR', st.bs.str], ['DEF', st.bs.def], ['SPD', st.bs.spd], ['DEX', st.bs.dex]] : [], st.via && st.via.bs) +
            row('🧰', 'Work', st.ws ? st.ws.tot : null, st.ws ? [['MAN', st.ws.man], ['INT', st.ws.int], ['END', st.ws.end]] : [], st.via && st.via.ws) + '</div>';
    }
    function membersBind() {
        if (profileId) { profileBind(profileId); return; }
        const f = bodyEl.querySelector('[data-mf]'), s = bodyEl.querySelector('[data-ms]');
        if (f) {
            let t = null;
            f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { memberFilter = f.value.trim().toLowerCase(); render().then(() => {
                const n = bodyEl.querySelector('[data-mf]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250); });
        }
        if (s) s.addEventListener('change', () => { memberSort = s.value; render(); });
    }

    // one member's profile. own = the Me tab (your own private figures from op "mine")
    async function profileHtml(pid, own) {
        pid = Number(pid);
        const [N, W, C, O, PO, SH] = await Promise.all([names(), readFile('m', 'db/wars.json'), readFile('m', 'db/chains.json'),
            readFile('m', 'db/crimes.json'), readFile('m', 'db/payouts.json'), readOpt('m', 'db/optin_shared.json')]);
        const m = N.byId[pid];
        if (!m) return '<div class="hbs-empty">That member isn\'t on the Hub.</div>';
        // private figures: your own (Me) / everyone's (leaders)
        let pv = null, P = null;
        if (own) { try { pv = await hub('mine'); } catch (e) { pv = null; } }
        else if (me.leader) { P = await readOpt('l', 'db/private.json'); pv = P && P.members ? P.members[pid] || {} : null; }
        const t = m.t || {}, cur = N.list.filter(x => x.current);
        const avg = f => { const v = cur.map(f).filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        const hpw = x => x.t && x.t.wars ? x.t.war_hits / x.t.wars : null, hpc = x => x.t && x.t.chains ? x.t.chain_hits / x.t.chains : null;
        const myW = hpw(m), myC = hpc(m), aW = avg(hpw), aC = avg(hpc);
        let out = `${own ? '' : '<div class="hbs-bar" style="padding:7px 0 0"><button type="button" class="hbs-btn hbs-ghost" data-back>← ' + (profileBack && tabOk(profileBack) ? 'Back' : 'Members') + '</button></div>'}
            <div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">${esc(m.name)} <span style="opacity:.5;font-weight:normal">[${pid}]</span></span>
            <span class="hbs-chip">${esc(m.position || (m.current ? '' : 'Former member'))}</span></div>
            <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', m.days != null ? m.days + ' days in the faction' : '', m.last_action ? 'active ' + ago(m.last_action) : ''].filter(Boolean).join(' · ')}</div>
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="https://www.torn.com/profiles.php?XID=${pid}">Torn profile</a>
            <a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/member.html?id=${pid}" target="_blank" rel="noopener">Hub profile</a>
            ${own ? `<a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/my-data.html" target="_blank" rel="noopener">My data & sharing</a>` : ''}</div></div>`;
        out += sec('📊 Totals') + tiles([[int(t.war_hits), 'War hits', `${int(t.wars)} wars`], [myW == null ? '-' : myW.toFixed(1), 'Hits / war', vsAvg(myW, aW)],
            [int(t.chain_hits), 'Chain hits', `${int(t.chains)} chains`], [myC == null ? '-' : myC.toFixed(1), 'Hits / chain', vsAvg(myC, aC)],
            [int(t.rets), 'Retaliations'], [`${int(t.crimes_ok)}/${int(t.crimes)}`, 'OCs passed'], [shortMoney(t.crime_money), 'OC earnings'],
            [shortMoney(t.paid), 'War payouts', `${int(t.payouts)} paid`]]);
        // reliability (own / leaders)
        const R = pv && pv.reliability;
        if (R) {
            const WT = (P && P.weights) || pv.weights || { war: 55, chains: 25, activity: 20 }, D = R.detail || {};
            const pt = (k, mx) => R.parts && R.parts[k] != null ? `${R.parts[k]} / ${mx}` : 'not enough data';
            const G = R.score == null ? null : relG(R.score);
            out += sec('🛡 Reliability') + `<div class="hbs-card" style="border-left-color:${G ? G[1] : '#33373f'}"><div class="hbs-r1">
                <span class="hbs-name" style="color:${G ? G[1] : '#9aa0a8'};font-size:15px">${G ? G[0] + ' · ' + R.score + ' / 100' : 'Not enough data yet'}</span></div>
                ${kv([[`War (${MIN_HITS}+ hits in ${D.wars_hit || 0}/${D.wars_in || 0})`, pt('war', WT.war)], [`Large chains (${D.chains_hit || 0}/${D.chains_elig || 0})`, pt('chains', WT.chains)],
                      [`Activity (idle ${D.idle_days != null ? D.idle_days : '-'} d)`, pt('activity', WT.activity)]])}
                <div class="hbs-actions">${R.receipt ? `<button type="button" class="hbs-btn" data-rc="${pid}">🧾 Performance receipt</button>` : ''}
                ${me.leader && !own ? `<button type="button" class="hbs-btn hbs-ghost" data-lv="${pid}">🗓 Excused leave</button>` : ''}</div>
                <div data-rcbox="${pid}"></div><div data-lvbox="${pid}"></div></div>`;
        }
        // battle / work stats: own (opted in) / leaders (everyone opted in) / everyone (what's shared with the faction)
        const op = (pv && pv.optin) || (SH && SH.members && SH.members[pid]) || null;
        if (op && ((op.bs && op.bs.s && op.bs.s.length) || (op.ws && op.ws.s && op.ws.s.length))) {
            out += sec('💪 Battle and work stats');
            if (op.bs && op.bs.s.length) { const l = op.bs.s[op.bs.s.length - 1], tot = r => r[1] + r[2] + r[3] + r[4];
                out += tiles([[big(tot(l)), 'Battle total', gainTxt(op.bs.s, 30, tot)], [big(l[1]), 'Strength'], [big(l[2]), 'Defense'], [big(l[3]), 'Speed'], [big(l[4]), 'Dexterity']]); }
            if (op.ws && op.ws.s.length) { const l = op.ws.s[op.ws.s.length - 1], wt = r => r[1] + r[2] + r[3];
                out += tiles([[big(wt(l)), 'Work total', gainTxt(op.ws.s, 30, wt)], [big(l[1]), 'Manual labor'], [big(l[2]), 'Intelligence'], [big(l[3]), 'Endurance']]); }
            out += `<div class="hbs-hint">Shared ${own ? 'by you' : 'with ' + ((op.bs || op.ws || {}).share === 'faction' ? 'the faction' : 'leaders')}${own ? ' - change it on My data & sharing' : ''}.</div>`;
        }
        // how they share (v2.5.0) - leaders (any profile) and yourself (Me), when the Hub has it
        const via = pv && pv.optin && pv.optin.via;
        if (via && Object.values(via).some(v => v && v.length)) {
            const K2 = [['bs', '💪 Battle stats'], ['ws', '🧰 Work stats'], ['oc', '🕵️ OC pass rates'], ['cw', '⛓️ Chain timer']];
            out += sec('🔗 How ' + (own ? 'you share' : 'they share')) + K2.filter(([k]) => (via[k] || []).length)
                .map(([k, l]) => `<div class="hbs-li"><span>${l}</span><b style="font-weight:normal">${srcNames(via[k])}</b></div>`).join('');
        }
        // gym
        const gm = m.gym_month || {}, ga = m.gym || {}, gsum = o => GS.reduce((a, [k]) => a + num(o[k]), 0);
        if (gsum(ga) || gsum(gm)) out += sec('🏋 Gym energy') + tiles([[big(gsum(gm)), 'This month'], [big(gsum(ga)), 'Since joining']]
            .concat(GS.map(([k, l]) => [big(num(gm[k])), l, 'this month'])));
        // payouts / wars / chains / crimes - last 10 of each
        const pays = (PO.payouts || []).map(p => { const x = (p.m || []).find(r => r[0] === pid); return x && x[1] ? [p, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        if (pays.length) out += sec('💰 War payouts') + pays.map(([p, x]) => `<div class="hbs-li"><span>${fmtD(p.end)} vs ${esc(p.opponent || '?')} · ${x[2]} hits</span><b>${money(x[1])}</b></div>`).join('');
        const wl = (W.wars || []).map(w => { const x = w.m.find(r => r[0] === pid); return x ? [w, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        // war / chain history as rows (v2.1.0, user: "Me page wars and chains are hard to read")
        const ev = (title, when, stats, low) => `<div class="hbs-ev${low ? ' low' : ''}"><div class="t"><b>${title}</b><span>${when}</span></div>
            <div class="s">${stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>`;
        if (wl.length) out += sec('⚔ Wars (last 10)') + wl.map(([w, x]) => ev('vs ' + esc(w.opponent || '?'), fmtD(w.end),
            [[x[1], 'Hits'], [int(x[2]), 'Respect'], [x[3], 'Assists'], [x[5], 'Outside']], x[1] < MIN_HITS)).join('')
            + `<div class="hbs-hint">Red = under ${MIN_HITS} war hits.</div>`;
        const cl = (C.chains || []).map(c => { const x = c.m.find(r => r[0] === pid); return x ? [c, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        if (cl.length) out += sec('⛓ Chains (last 10)') + cl.map(([c, x]) => ev(int(c.length) + '-hit chain', fmtD(c.end),
            [[x[1], 'Hits'], [int(x[2]), 'Respect'], [x[3], 'Retals'], [c.length ? (100 * x[1] / c.length).toFixed(1) + '%' : '-', 'Of chain']])).join('');
        const ol = (O.crimes || []).filter(c => (c.m || []).includes(pid)).reverse().slice(0, 10);
        if (ol.length) out += sec('🕵 Organized crimes (last 10)') + ol.map(c => `<div class="hbs-li"><span>${fmtD(c.t)} · ${esc(c.name || '?')}</span>
            <b class="${String(c.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(c.status || '')}${c.share ? ' · ' + shortMoney(c.share) : ''}</b></div>`).join('');
        // armory (leaders)
        if (me.leader && !own) {
            const A = await readOpt('l', 'db/armory.json'), r = A && A.members && A.members[pid] ? A.members[pid].r || [] : [];
            if (r.length) out += sec('🗄 Armory - latest') + r.slice(0, 8).map(([tm, it, cnt, kind]) =>
                `<div class="hbs-li"><span>${fmtDT(tm)} · ${esc((A.items || [])[it] || it)}${kind === 'r' ? ' · points refill' : ''}</span><b>×${cnt}</b></div>`).join('');
        }
        return out;
    }
    const gainTxt = (s, days, f) => {
        if (!s || s.length < 2) return '';
        const last = s[s.length - 1], want = new Date(Date.parse(last[0]) - days * 864e5).toISOString().slice(0, 10);
        const base = s.filter(x => x[0] <= want).pop() || s[0];
        return base === last ? '' : `<span class="hbs-up">+${big(f(last) - f(base))} / ${days} d</span>`;
    };
    function profileBind() {
        const b = bodyEl.querySelector('[data-back]'); if (b) b.onclick = closeProfile;   // back to the tab you came from (0.2.4)
    }

    // ---- performance receipt: the same receipt as the Hub profile, drawn on a canvas ----
    async function showReceipt(pid) {
        const box = bodyEl.querySelector(`[data-rcbox="${pid}"]`);
        if (!box) return;
        if (box.innerHTML) { box.innerHTML = ''; return; }
        const N = await names(), own = pid === me.id && tab === 'me';
        let pv, WT, RU;
        if (own) { const x = await hub('mine'); pv = x; WT = x.weights; RU = x.rules; }
        else { const P = await readFile('l', 'db/private.json'); pv = (P.members || {})[pid] || {}; WT = P.weights; RU = P.rules; }
        WT = WT || { war: 55, chains: 25, activity: 20 }; RU = RU || { min_hits: 5, min_wars: 3, min_chains: 2, chain_min: 100 };
        const m = N.byId[pid] || { id: pid, name: String(pid) }, R = pv.reliability;
        if (!R || !R.receipt) { box.innerHTML = '<div class="hbs-msg">No receipt data yet.</div>'; return; }
        const cv = drawReceipt(m, R, WT, RU);
        box.innerHTML = '';
        box.appendChild(cv);
        const subject = 'Faction Performance ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const acts = el('div', 'hbs-actions');
        acts.innerHTML = (me.leader && !own ? `<button type="button" class="hbs-btn" data-a="msg">✉ Create Message</button>` : '') +
            `<button type="button" class="hbs-btn hbs-ghost" data-a="copy">📋 Copy image</button>
            <button type="button" class="hbs-btn hbs-ghost" data-a="dl">⬇ Download PNG</button>` +
            (me.leader && !own ? `<button type="button" class="hbs-btn hbs-ghost" data-a="subj">📋 Copy subject</button>` : '');
        box.appendChild(acts);
        const msg = el('div', 'hbs-msg', me.leader && !own ? 'Subject: ' + subject : ''); box.appendChild(msg);
        const pngP = () => new Promise(ok => cv.toBlob(ok, 'image/png'));
        // ClipboardItem gets a PROMISE of the PNG so the copy starts inside the tap
        const copyImg = () => {
            if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error("Copying images isn't supported here - use Download PNG and attach it."));
            return navigator.clipboard.write([new ClipboardItem({ 'image/png': pngP() })]).catch(() => { throw new Error("Couldn't copy the image - use Download PNG."); });
        };
        const compose = `https://www.torn.com/messages.php#/p=compose&XID=${encodeURIComponent(pid)}`;
        const on = (a, f) => { const b = acts.querySelector(`[data-a="${a}"]`); if (b) b.onclick = f; };
        on('msg', () => {
            const cp = copyImg();                     // start the copy first, then open Torn's compose page (both from the tap)
            window.open(compose, '_blank');
            cp.then(() => { msg.innerHTML = `Image copied ✓ - set the subject to <b>${esc(subject)}</b> (Copy subject) and paste the image into the message to <b>${esc(m.name)}</b>.`; },
                e => { msg.textContent = e.message + " Torn's message page was opened."; });
        });
        on('copy', () => copyImg().then(() => { msg.textContent = 'Image copied ✓'; }, e => { msg.textContent = e.message; }));
        on('dl', () => download(`receipt-${pid}-${new Date().toISOString().slice(0, 10)}.png`, cv.toDataURL('image/png')));
        on('subj', () => copyText(subject).then(ok => { msg.textContent = ok ? 'Subject copied ✓' : 'Subject: ' + subject; }));
    }

    // ---- excused leave (leaders - config "leave"): list + add + remove ----
    async function showLeave(pid, note) {
        const box = bodyEl.querySelector(`[data-lvbox="${pid}"]`);
        if (!box) return;
        if (box.innerHTML && note == null) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="hbs-msg">Loading…</div>';
        try {
            const list = ((await readConfig()).leave || {})[String(pid)] || [];
            box.innerHTML = `<div class="hbs-sec">🗓 Excused leave</div>
                <div class="hbs-hint">Wars and large chains during these dates don't count for them. Dates are TCT (UTC), whole days.</div>
                ${list.length ? list.map((x, k) => `<div class="hbs-li"><span>${fmtD(x.from)} – ${fmtD(x.to)}${x.note ? ' · ' + esc(x.note) : ''}${x.by ? ' · ' + esc(x.by) : ''}</span>
                    <button type="button" class="hbs-btn hbs-ghost" data-lvdel="${pid}" data-k="${k}">Remove</button></div>`).join('') : '<div class="hbs-hint">No excused leave.</div>'}
                <div class="hbs-lvadd"><label>From<input class="hbs-input" type="date" data-lvf></label><label>To<input class="hbs-input" type="date" data-lvt></label></div>
                <input class="hbs-input" data-lvn maxlength="80" placeholder="Note (optional)" style="width:100%;margin-top:5px">
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-lvadd="${pid}">Add leave</button></div>
                <div class="hbs-msg" data-lvmsg>${note || ''}</div>`;
            box._list = list;
        } catch (e) { box.innerHTML = `<div class="hbs-msg">${esc(e.message)}</div>`; }
    }

    // [HB Suite] leader action — excused leave add / remove (config "leave"), same as the Hub profile's editor.
    async function saveLeave(pid, mutate, what) {
        const box = bodyEl.querySelector(`[data-lvbox="${pid}"]`), msgEl = box && box.querySelector('[data-lvmsg]');
        if (msgEl) msgEl.textContent = 'Saving…';
        try {
            const N = await names(), m = N.byId[pid] || {};
            await editConfig(c => { c.leave = c.leave || {}; mutate(c.leave); if (!(c.leave[pid] || []).length) delete c.leave[pid]; },
                             `Excused leave: ${m.name || pid} [${pid}] ${what} (Hub script)`);
            await showLeave(pid, 'Saved ✓ - reliability and the receipt update in a few minutes.');
        } catch (e) { if (msgEl) msgEl.textContent = e.message; }
    }

    // =====================================================================
    // ⚔ WARS — recent wars (script feed), per-member hits; leaders: Termed toggle
    // =====================================================================
    // =====================================================================
    // ⚔ WAR TAB (0.2.64, user: "War tab now. I want to provide war targets for members when they provide a FFScouter
    // key. Members select a FF Range, by default it's between 2 - 2.5. These should be 'priority targets' for members
    // during wars. These members will provide the best respect gains per hit.")
    //   User's choices (Nov 16 2026): layout "A normal. B when compact" (rows / two-column tiles); data from "Members own
    //   keys while their war tab is open"; unavailable targets "Replaced if other enemies are available, greyed out if
    //   not. Targets at the top should be available to hit."; "War Header, foldable in compact with score summary";
    //   "Your war so far, foldable"; "No active war = show upcoming data. Move war history and summary to a new History
    //   page with chain and OC info included."  NOT built (offered, not picked): enemy status counts, hospital-soon
    //   list, top hitters, hits available.
    //   DATA - all only while the War tab is open, the panel is open and the Torn tab is visible:
    //     - the war itself (opponent, opponent_id, scores, target, start) from the Hub's op live "now" (nowData.war)
    //     - enemy members: ONE Torn call (faction/<id>?selections=basic) at most every 60 s -> wt.mem
    //     - fair fight: FFScouter get-stats in batches of 200 with the member's own FFScouter key, kept per war in
    //       K.warFF and read ONCE PER WAR since 0.2.71 (the enemy roster is locked for the war; FF is relative to the
    //       key's owner - which is the point)
    //     - Your war so far: your own attack log (user/?selections=attacks), read incrementally from the war's start
    //       at most every 60 s, at most 6 calls a pass; kept in K.warMine. A "hit" = an attack on the enemy faction
    //       with respect gained.
    //   LIST: in-range (lo <= FF <= hi) members, hittable (status Okay) first by FF high -> low; if those don't fill the
    //   slots (10 rows / 6 compact tiles) the rest are greyed-out unavailable ones, soonest out first. "Attack" is a
    //   plain link to Torn's attack page - nothing is started for the member.
    // =====================================================================
    const WT_SLOTS = 10, WT_SLOTS_C = 6;
    const wt = { fid: 0, mem: null, memAt: 0, busy: false, err: '', ffBusy: false, ffErr: '', mineBusy: false, mineAt: 0, mineErr: '' };
    const warRange = () => { const r = store.get(K.warRange, null) || {}; let lo = Number(r.lo), hi = Number(r.hi);
        if (!(lo >= 1)) lo = 2; if (!(hi >= lo)) hi = Math.max(lo, 2.5); return { lo, hi }; };
    const warNow = () => (nowData && nowData.war && num(nowData.war.opponent_id)) ? nowData.war : null;
    const warVisible = () => tab === 'wars' && !collapsed && !showSettings && document.visibilityState === 'visible';
    function warHttp(url) {   // FFScouter GET (PDA + desktop) -> text
        return new Promise((res, rej) => { try {
            if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(url)).then(r => res((r && (r.responseText || r.response || r.body)) || ''), rej); return; }
            GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000, onload: r => res(r.responseText), onerror: () => rej(new Error('no answer')), ontimeout: () => rej(new Error('timed out')) });
        } catch (e) { rej(e); } });
    }
    async function warLoad() {
        const W = warNow(); if (!W || !warVisible() || wt.busy) return;
        const fid = num(W.opponent_id);
        if (wt.fid !== fid) { wt.fid = fid; wt.mem = null; wt.memAt = 0; }
        if (!ffKey()) { warMine(); return; }                       // no FFScouter key = no target list: the enemy faction isn't read at all
        if (Date.now() - wt.memAt < 30000) return;
        wt.busy = true; wt.memAt = Date.now();
        try {
            // (0.2.71) ONE SHARED READING: ask the Hub first - a list under 30 s old is used as is; `read` = this Suite
            // is the one to read Torn now and upload it for everyone; no usable answer = read Torn as before
            let r = null;
            // [HB Suite] Hub API — op "war_feed" get: the enemy faction list other Suites already read (no Torn call)
            try { r = await hub('war_feed', { do: 'get', fid }); } catch (e) { r = null; }
            if (r && r.members && !r.read) wt.mem = r.members;
            else {
                // [HB Suite] Torn API — War tab: the enemy faction's members + status (your key; only when the Hub's shared
                // list is over 30 s old and no other Suite is already reading it - at most twice a minute, War tab open)
                const d = await tornGet(`https://api.torn.com/faction/${fid}?selections=basic`);
                wt.mem = Object.entries((d && d.members) || {}).map(([pid, m]) => ({ pid: num(pid), name: m.name || '#' + pid, level: num(m.level),
                    state: String((m.status || {}).state || ''), until: num((m.status || {}).until), la: String((m.last_action || {}).status || '') }));
                // [HB Suite] Hub API — op "war_feed" put: that list, for every other Suite (names, levels, status - no key)
                if (r && r.read && wt.mem.length) hub('war_feed', { do: 'put', fid, members: wt.mem }).catch(() => {});
            }
            wt.err = '';
        } catch (e) { wt.err = e.message || 'Could not read the enemy faction.'; }
        wt.busy = false;
        warFF(); warMine();
        if (warVisible() && !cwBusy()) render(true);
    }
    async function warFF() {
        const key = ffKey(); if (!key || !wt.mem || !wt.mem.length || wt.ffBusy) return;
        const wst = num((warNow() || {}).start);                    // (0.2.71) once per war: this enemy + this war's start
        let C = store.get(K.warFF, null) || {}; if (num(C.fid) !== wt.fid || num(C.war) !== wst) C = { fid: wt.fid, war: wst, at: 0, m: {} };
        const need = wt.mem.map(x => x.pid).filter(p => !C.m[p]);
        if (!need.length) return;
        wt.ffBusy = true;
        try {
            for (let i = 0; i < need.length; i += 200) {
                // [HB Suite] FFScouter API — War tab: fair fight + stat estimate for the enemy faction (your FFScouter key, this device)
                const rows = JSON.parse(await warHttp(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${need.slice(i, i + 200).join(',')}`));
                if (!Array.isArray(rows)) throw new Error((rows && (rows.error || rows.message)) || 'FFScouter refused the request');
                rows.forEach(r => { if (r && r.player_id != null) C.m[r.player_id] = { ff: r.fair_fight != null ? Number(r.fair_fight) : null, est: r.bs_estimate_human || '' }; });
                need.slice(i, i + 200).forEach(p => { if (!C.m[p]) C.m[p] = { ff: null, est: '' }; });   // asked, no data: don't ask again until stale
            }
            C.at = Date.now(); store.set(K.warFF, C); wt.ffErr = '';
        } catch (e) { wt.ffErr = 'FFScouter: ' + (e.message || 'no answer'); }
        wt.ffBusy = false;
        if (warVisible() && !cwBusy()) render(true);
    }
    // Your war so far: count your attacks on the enemy faction since the war began (incremental; newest attack time kept)
    async function warMine() {
        const W = warNow(); if (!W || W.kind !== 'ongoing' || !num(W.start) || wt.mineBusy || Date.now() - wt.mineAt < 60000) return;
        const key = wt.fid + ':' + num(W.start);
        let M = store.get(K.warMine, null) || {}; if (M.key !== key) M = { key, hits: 0, resp: 0, last: num(W.start), ids: [] };
        wt.mineBusy = true; wt.mineAt = Date.now();
        try {
            const seen = new Set(M.ids || []), from0 = num(M.last);
            let from = from0, to = 0, maxTs = from0;
            for (let n = 0; n < 6; n++) {
                // [HB Suite] Torn API — War tab "Your war so far": your own attack log since the war began (War tab open, once a minute)
                const d = await tornGet(`https://api.torn.com/user/?selections=attacks&from=${from}${to ? '&to=' + to : ''}`);
                const L = Object.entries((d && d.attacks) || {}).map(([id, a]) => Object.assign({ id: String(id) }, a));
                let lo = Infinity, hi = 0;
                L.forEach(a => { const ts = num(a.timestamp_ended || a.timestamp_started); lo = Math.min(lo, ts); hi = Math.max(hi, ts);
                    if (seen.has(a.id)) return; seen.add(a.id);
                    if (num(a.attacker_id) === me.id && num(a.defender_faction) === wt.fid && num(a.respect_gain != null ? a.respect_gain : a.respect) > 0) { M.hits++; M.resp += num(a.respect_gain != null ? a.respect_gain : a.respect); } });
                maxTs = Math.max(maxTs, hi);
                if (L.length < 100) break;
                // a full page: Torn either sent the newest 100 (gap below -> page back with `to`) or the oldest 100 (gap above -> move `from`)
                if (lo - from > Math.floor(Date.now() / 1000) - hi) to = lo; else from = hi;
            }
            M.last = maxTs; M.ids = [...seen].slice(-300); M.at = Date.now(); store.set(K.warMine, M); wt.mineErr = '';
        } catch (e) { wt.mineErr = e.message || 'Could not read your attacks.'; }
        wt.mineBusy = false;
        if (warVisible() && !cwBusy()) render(true);
    }
    setInterval(() => { if (warVisible()) warLoad(); }, 15000);
    const warStat = x => x.state === 'Okay' ? ['', 'Okay'] : x.state === 'Hospital' ? ['no', `Hosp <span data-until="${x.until}" data-zero="out">-</span>`]
        : x.state === 'Jail' ? ['no', `Jail <span data-until="${x.until}" data-zero="out">-</span>`] : ['aw', esc(x.state || '?')];
    function warTargetsHtml(compact) {
        const R = warRange(), key = ffKey(), C = store.get(K.warFF, null) || {}, FM = num(C.fid) === wt.fid ? C.m || {} : {};
        const rng = `FF ${R.lo.toFixed(1)} – ${R.hi.toFixed(1)}`;
        const inputs = `<div class="hbs-wrange"><span>Your FF range</span><input type="number" class="hbs-input" data-wrange="lo" min="1" max="10" step="0.1" value="${R.lo}"><span>to</span>
            <input type="number" class="hbs-input" data-wrange="hi" min="1" max="10" step="0.1" value="${R.hi}"></div>`;
        let head = `<div class="hbs-r1"><span class="hbs-name">🎯 Priority targets</span>${compact ? `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cfold="warrange">${rng} ✎</button>` : `<span class="hbs-chip">${rng}</span>`}</div>`;
        if (!key) return `<div class="hbs-card">${head}<div class="hbs-hint">Add your <b>FFScouter key</b> in ⚙ Settings to see the enemy members in your fair-fight range - the hits that pay the most respect. The key stays on this device.</div></div>`;
        head += !compact || cfOpen('warrange') ? inputs : '';
        if (!wt.mem) return `<div class="hbs-card">${head}<div class="hbs-hint">${wt.err ? esc(wt.err) : 'Reading the enemy faction…'}</div></div>`;
        const all = wt.mem.map(x => Object.assign({ ff: (FM[x.pid] || {}).ff, est: (FM[x.pid] || {}).est || '' }, x));
        const inR = all.filter(x => x.ff != null && x.ff >= R.lo - 1e-9 && x.ff <= R.hi + 1e-9), noFF = all.filter(x => x.ff == null).length;
        const ok = inR.filter(x => x.state === 'Okay').sort((a, b) => b.ff - a.ff);
        const off = inR.filter(x => x.state !== 'Okay').sort((a, b) => (a.until || 9e12) - (b.until || 9e12) || b.ff - a.ff);
        const slots = compact ? WT_SLOTS_C : WT_SLOTS, show = ok.slice(0, slots).concat(off.slice(0, Math.max(0, slots - ok.length)));
        const atk = pid => `https://www.torn.com/loader.php?sid=attack&user2ID=${pid}`;
        let list;
        if (!Object.keys(FM).length && wt.ffBusy) list = '<div class="hbs-hint">Asking FFScouter…</div>';
        else if (!show.length) list = `<div class="hbs-hint">Nobody in ${rng} right now. Widen your range to see more targets.</div>`;
        else if (compact) list = `<div class="hbs-wgrid">${show.map(x => { const s = warStat(x); return `<a class="${x.state === 'Okay' ? 'ok' : 'off'}" href="${atk(x.pid)}"><b>${esc(x.name)}</b><span>FF ${x.ff.toFixed(2)} · <i>${s[1]}</i></span></a>`; }).join('')}</div>`;
        else list = show.map(x => { const s = warStat(x); return `<div class="hbs-wrow${x.state === 'Okay' ? '' : ' off'}"><span class="n"><a href="#" data-prof="${x.pid}">${esc(x.name)}</a>
            <small>Lvl ${x.level}${x.est ? ' · est ' + esc(x.est) : ''}${x.la ? ' · ' + esc(x.la.toLowerCase()) : ''}</small></span>
            <span class="hbs-ff hbs-ffm">FF ${x.ff.toFixed(2)}</span><span class="hbs-wst ${s[0]}">${s[1]}</span><a class="hbs-btn${x.state === 'Okay' ? '' : ' hbs-ghost'}" href="${atk(x.pid)}">Attack</a></div>`; }).join('');
        return `<div class="hbs-card">${head}${list}
            <div class="hbs-hint">Higher FF = more respect per hit. ${inR.length} in range · <b>${ok.length}</b> hittable now${ok.length > slots ? ` (top ${slots} shown)` : ''}${noFF ? ` · ${noFF} without FF data` : ''}${wt.memAt ? ` · checked ${ago(Math.floor(wt.memAt / 1000))}` : ''}</div>
            ${wt.ffErr ? `<div class="hbs-msg">${esc(wt.ffErr)}</div>` : ''}${wt.err ? `<div class="hbs-msg">${esc(wt.err)}</div>` : ''}</div>`;
    }
    async function warTabHtml() {
        if (!nowData) { try { await refreshNow(true); } catch (e) { /* */ } }
        const W = nowData && nowData.war, compact = CMP();
        if (!W) return `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⚔ No war right now</span></div>
            <div class="hbs-hint">When a ranked war is matched, the opponent, the score and your priority targets show here. Past wars and your war summary are in 📜 History (••• More).</div></div>`;
        warLoad();                                                 // background; redraws when the enemy list arrives
        const on = W.kind === 'ongoing', lead = num(W.our) - num(W.their);
        // ---- header ----
        const when = on ? (num(W.start) ? `started ${ago(num(W.start))}` : 'ongoing') : `starts in <b><span data-until="${num(W.start)}" data-zero="now">-</span></b>`;
        const hBody = on ? `<div class="hbs-wscore">${int(W.our)} – ${int(W.their)}<small>Lead <b class="${lead >= 0 ? 'up' : 'dn'}">${lead >= 0 ? '+' : '−'}${int(Math.abs(lead))}</b>${num(W.target) ? ` · target ${int(W.target)}` : ''} · ${when}</small></div>`
            : `<div class="hbs-wscore"><span data-until="${num(W.start)}" data-zero="now">-</span><small>until the war starts${num(W.start) ? ' · ' + ocWhen(num(W.start)) : ''}</small></div>`;
        let out = compact ? cFold('warhead', '⚔', `vs ${esc(W.opponent || '?')}`, on ? `<b class="hbs-foldn">${lead >= 0 ? '+' : '−'}${int(Math.abs(lead))}</b><small>${int(W.our)} – ${int(W.their)}</small>` : `<small>starts in <span data-until="${num(W.start)}" data-zero="now">-</span></small>`, hBody, false)
            : `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">⚔ vs ${esc(W.opponent || '?')}</span><span class="hbs-chip">${on ? 'Ongoing' : 'Upcoming'}</span></div>${hBody}</div>`;
        // ---- your war so far (ongoing only) ----
        if (on) { const M = store.get(K.warMine, null) || {}, mine = M.key === num(W.opponent_id) + ':' + num(W.start) ? M : null;
            out += cFold('warmine', '🗡', 'Your war so far', mine ? `<small>${int(mine.hits)} hit${mine.hits === 1 ? '' : 's'} · ${num(mine.resp).toFixed(1)} respect</small>` : '<small>reading…</small>',
                (mine ? tiles([[int(mine.hits), 'Your hits', mine.hits >= MIN_HITS ? `<span class="hbs-good">min ${MIN_HITS} met</span>` : `<span class="hbs-bad">${MIN_HITS - mine.hits} more to reach ${MIN_HITS}</span>`],
                                [num(mine.resp).toFixed(1), 'Your respect'], [mine.hits ? (num(mine.resp) / mine.hits).toFixed(2) : '-', 'Respect / hit']])
                       : `<div class="hbs-hint">${wt.mineErr ? esc(wt.mineErr) : 'Reading your attack log…'}</div>`)
                + '<div class="hbs-hint">Counted from your own attack log on this device (attacks on the enemy faction with respect gained) - the official figures are in the war report.</div>', false, !compact); }
        out += warTargetsHtml(compact);
        return out;
    }
    function warTabBind() {
        bodyEl.querySelectorAll('[data-wrange]').forEach(i => i.addEventListener('change', () => {
            const R = warRange(), v = Math.round(Number(i.value) * 10) / 10; if (!(v >= 1 && v <= 10)) { i.value = R[i.dataset.wrange]; return; }
            R[i.dataset.wrange] = v; if (R.hi < R.lo) { if (i.dataset.wrange === 'lo') R.hi = R.lo; else R.lo = R.hi; }
            store.set(K.warRange, R); render(true); }));
    }
    // =====================================================================
    // 📜 HISTORY TAB (0.2.64, user: "Move war history and summary to a new History page with chain and OC info
    // included."): chips Wars / Chains / OCs. Wars = what the War tab was before (your war summary + every war, tap to
    // open); Chains = your chain summary + the latest chains with your hits; OCs = your OC record + latest crimes.
    // The Chain and OC tabs keep their own summaries. Opens from ••• More (or the bar, ⚙ → Layout).
    // =====================================================================
    let histSec = 'wars';
    async function historyHtml() {
        let out = chips('hs', [['wars', '⚔ Wars'], ['chains', '⛓ Chains'], ['ocs', '🕵 OCs']], histSec);
        if (histSec === 'chains') {
            const C = await readOpt('m', 'db/chains.json');
            const L = ((C && C.chains) || []).slice().sort((a, b) => num(b.end) - num(a.end)).slice(0, 15);
            out += await chainSummaryHtml();
            if (L.length) out += sec('Latest chains') + L.map(c => { const x = (c.m || []).find(r => num(r[0]) === me.id);
                return `<div class="hbs-li"><span>${c.end ? fmtD(c.end) + ' · ' : ''}<b>${int(c.length)}</b>-hit chain</span><b class="${x ? 'hbs-good' : ''}" style="${x ? '' : 'opacity:.6;font-weight:normal'}">${x ? `your hits ${int(x[1])}` : 'not in it'}</b></div>`; }).join('');
            return out;
        }
        if (histSec === 'ocs') {
            const O = await readOpt('m', 'db/crimes.json');
            const mine = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
            const okN = mine.filter(c => String(c.status).toLowerCase() === 'successful').length, earned = mine.reduce((a, c) => a + num(c.share), 0);
            const best = mine.reduce((a, c) => num(c.share) > num(a && a.share) ? c : a, null), m30 = mine.filter(c => num(c.t) > Date.now() / 1000 - 30 * 86400);
            out += `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">🕵 Your OC summary</span></div>
                ${mine.length ? `<div class="hbs-ctiles">${tiles([[int(mine.length), 'Crimes'], [`${okN}/${mine.length}`, 'Passed'], [Math.round(100 * okN / mine.length) + '%', 'Success rate'],
                    [earned ? shortMoney(earned) : '-', 'OC earnings'], [okN ? shortMoney(earned / okN) : '-', 'Avg payout'], [best && num(best.share) ? shortMoney(best.share) : '-', 'Best payout', best && num(best.share) ? esc(best.name || '') : ''],
                    [int(m30.length), 'Last 30 days']])}</div>` : '<div class="hbs-hint">No organized crimes on record for you yet.</div>'}</div>`;
            if (mine.length) out += sec('Latest crimes') + mine.slice(-15).reverse().map(c => `<div class="hbs-li"><span>${fmtD(c.t)} · ${esc(c.name || '?')}</span>
                <b class="${String(c.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(c.status || '')}${c.share ? ' · ' + shortMoney(c.share) : ''}</b></div>`).join('');
            return out;
        }
        return out + await warsHtml();
    }
    async function warsHtml() {
        const [F, N] = await Promise.all([readFile('m', 'db/script_feed.json'), names()]);
        const wars = F.wars || [];
        const summary = await warSummaryHtml();      // (0.2.4, user: "War tab should give a player summary of their war stats")
        if (!wars.length) return summary + '<div class="hbs-empty">No wars on the Hub yet.</div>';
        return summary + wars.map(w => {
            const key = 'w:' + w.id;
            const tags = (w.termed ? '<span class="hbs-tag">🤝 Termed</span> ' : '') +
                (w.payout ? '<span class="hbs-tag hbs-green">Paid</span>' : '<span class="hbs-tag hbs-red">No payout yet</span>');
            let detail = '';
            if (open[key]) {
                // v2.2.1: summary tiles + ranked rows in the leaderboard style (.hbs-lb), scrolling inside .hbs-wl
                const mine = (w.m || []).find(x => x[0] === me.id);
                const ranked = (w.m || []).slice().sort((a, b) => b[1] - a[1]), top = ranked.length ? Math.max(1, ranked[0][1]) : 1;
                const under = ranked.filter(x => x[1] < MIN_HITS).length;
                const myRank = mine ? ranked.findIndex(x => x[0] === me.id) + 1 : 0;
                // average hits per member in the war (everyone listed, 0s included) + where it sits on the bars
                const avg = ranked.length ? ranked.reduce((a, x) => a + x[1], 0) / ranked.length : 0;
                const avgPct = Math.min(100, Math.round(1000 * avg / top) / 10);
                const avgTxt = avg >= 100 ? int(avg) : avg.toFixed(1);
                const rows = ranked.map(([id, h], i) => `<div class="r r${i + 1}${id === me.id ? ' me' : ''}${h < MIN_HITS ? ' low' : ''}" data-prof="${id}"><span class="rk">${i + 1}</span>
                    <span class="nm"><span>${esc(nameOf(N, id))}${id === me.id ? ' <small>you</small>' : ''}</span><i><em style="width:${Math.max(2, Math.round(100 * h / top))}%"></em><u style="left:${avgPct}%"></u></i></span>
                    <span class="v">${int(h)}</span></div>`).join('');
                detail = `<div class="hbs-detail hbs-wtiles" style="padding:6px 0 0;background:none;border:0">
                    ${tiles([[int(w.hits), 'Total hits'], [`${w.attackers}/${w.members}`, 'Members hit'], [avgTxt, 'Average hits'],
                             [String(under), `Under ${MIN_HITS} hits`], mine ? [int(mine[1]), 'Your hits', `#${myRank} of ${ranked.length}<br>${vsAvg(mine[1], avg)}`] : null])}
                    <div class="hbs-lb hbs-wl"><div class="h" data-toggle="wlc:${w.id}" style="cursor:pointer"><b>${open['wlc:' + w.id] ? '▸' : '▾'} Hits by member</b><span><span class="hbs-avgkey"></span> avg ${avgTxt} · red = under ${MIN_HITS}</span></div>${open['wlc:' + w.id] ? '' : `<div class="hbs-wlist">${rows}</div>`}</div>
                    <div class="hbs-actions">
                        <a class="hbs-btn hbs-ghost" href="${esc(w.report)}" target="_blank" rel="noopener">📄 Report</a>
                        ${w.payout ? `<a class="hbs-btn hbs-ghost" href="${esc(w.payout)}" target="_blank" rel="noopener">💰 Payout receipt</a>` : ''}
                        ${me.leader ? `<button type="button" class="hbs-btn ${w.termed ? '' : 'hbs-ghost'}" data-termed="${w.id}" data-on="${w.termed ? 1 : 0}">
                            ${w.termed ? '🤝 Termed - tap to undo' : '🤝 Mark termed'}</button>` : ''}
                    </div>
                    <div class="hbs-msg" data-msg="${key}"></div></div>`;
            }
            return `<div class="hbs-card ${w.termed ? 'hbs-gold' : w.payout ? 'hbs-green' : ''}">
                <div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">vs ${esc(w.opponent || '?')}</span>
                    <span class="hbs-chip">${int(w.hits)} hits</span></div>
                <div class="hbs-sub">${fmtD(w.end)} · ${tags}</div>${detail}</div>`;
        }).join('');
    }

    // [HB Suite] leader action — Termed on/off (config "termed_wars"), same as the toggle on the war's report page.
    async function toggleTermed(btn) {
        const wid = String(btn.dataset.termed), on = btn.dataset.on !== '1';
        const msg = msgIn('w:' + wid);
        btn.disabled = true; if (msg) msg.textContent = 'Saving…';
        try {
            await editConfig(c => {
                const l = (c.termed_wars || []).map(String).filter(x => x !== wid);
                if (on) l.push(wid);
                c.termed_wars = l;
            }, `War ${wid} ${on ? 'marked termed' : 'no longer termed'} (Hub script)`);
            // show it now; the Hub's own files catch up after the next site update
            const F = cache['m:db/script_feed.json'];
            if (F) (F.data.wars || []).forEach(w => { if (String(w.id) === wid) w.termed = on; });
            await render();
            setStatus(`Saved ✓ - war ${on ? 'marked termed' : 'no longer termed'}. Reliability and the Hub pages update in a few minutes.`);
        } catch (e) { if (msg) msg.textContent = e.message; btn.disabled = false; }
    }

    // =====================================================================
    // 📰 NEWS — latest posts, chain reports, recap archive (images open without signing in)
    // =====================================================================
    // News sections (v2.1.0, user: "Latest, Newsletters, Chain Reports, War Reports, etc."). Each list comes from the
    // Hub's script feed (up to 30 of each, newest first); the images open without signing in.
    let newsSec = 'latest';
    const NEWS = [['latest', 'Latest', 'latest'], ['news', '📰 Newsletters', 'newsletters'], ['war', '⚔ War reports', 'war_reports'],
                  ['chain', '⛓ Chain reports', 'chain_reports'], ['pay', '💰 Payouts', 'payouts'], ['recap', '🗂 Recaps', 'recap_items']];
    async function newsHtml() {
        const F = await readFile('m', 'db/script_feed.json');
        const S = NEWS.find(x => x[0] === newsSec) || NEWS[0];
        let items = F[S[2]];
        // older feeds (before v2.1.0's lists): fall back to what they had
        if (!items && S[0] === 'chain') items = (F.chains || []).map(x => ({ url: x.report, img: x.img, title: int(x.length) + '-hit chain', sub: fmtD(x.end), kind: 'chain' }));
        if (!items && S[0] === 'recap') items = (F.recaps || []).map(x => ({ url: x.url, img: x.img, title: x.label + ' recap', sub: 'Monthly recap', kind: 'recap' }));
        items = items || [];
        F._shown = items;                                       // for the copy buttons
        const ICON = { newsletter: '📰', recap: '🗂', war: '⚔', chain: '⛓', payout: '💰' };
        let out = chips('ns', NEWS.map(([k, l]) => [k, l]), newsSec);
        if (!items.length) return out + '<div class="hbs-empty">Nothing here yet.</div>';
        return out + items.map((x, i) => `<div class="hbs-card hbs-gold">
            <div class="hbs-r1"><a class="hbs-name" href="${esc(x.url)}" target="_blank" rel="noopener">${ICON[x.kind] || '•'} ${esc(x.title)}</a>
                ${S[0] === 'latest' ? `<span class="hbs-chip">${esc(x.kind)}</span>` : ''}</div>
            <div class="hbs-sub">${esc(x.sub || '')}</div>
            <a href="${esc(x.url)}" target="_blank" rel="noopener"><img class="hbs-img" loading="lazy" src="${esc(x.img)}" alt=""></a>
            <div class="hbs-actions">
                <a class="hbs-btn hbs-ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Open</a>
                <button type="button" class="hbs-btn hbs-ghost" data-news="${i}" data-what="link">📋 Image link</button>
                <button type="button" class="hbs-btn hbs-ghost" data-news="${i}" data-what="html">📋 Torn HTML</button>
            </div><div class="hbs-msg" data-msg="n:${i}"></div></div>`).join('');
    }
    async function copyNews(btn) {
        const F = await readFile('m', 'db/script_feed.json'), x = (F._shown || F.latest || [])[Number(btn.dataset.news)];
        if (!x) return;
        // Torn HTML: the image at full width, linked to itself (opens full size) - same as the Newsletter Builder
        const html = `<p style="text-align:center;"><a href="${x.img}" target="_blank"><img src="${x.img}" alt="${esc(x.title)}" style="max-width:100%;height:auto;"></a></p>`;
        const ok = await copyText(btn.dataset.what === 'html' ? html : x.img);
        const m = msgIn('n:' + btn.dataset.news);
        if (m) m.textContent = ok ? (btn.dataset.what === 'html' ? 'Torn HTML copied ✓ - paste it in HTML mode.' : 'Image link copied ✓') : "Couldn't copy.";
    }

    // =====================================================================
    // 💰 PAYOUTS — paid wars (view); leaders: the calculator is its own tab
    // =====================================================================
    async function payoutsHtml() {
        const [PO, N, F] = await Promise.all([readFile('m', 'db/payouts.json'), names(), readOpt('m', 'db/script_feed.json')]);
        const link = {}; ((F && F.wars) || []).forEach(w => { if (w.payout) link[w.war || w.id] = w.payout; });
        const pays = (PO.payouts || []).slice().sort((a, b) => num(b.end) - num(a.end));
        const unpaid = ((F && F.wars) || []).filter(w => !w.payout && !w.termed).slice(0, 5);
        let top = me.leader ? `<div class="hbs-bar" style="padding:7px 0 0"><a class="hbs-btn" href="${HUB_BASE}/l/payout.html" target="_blank" rel="noopener">🧮 Payout calculator ↗</a></div>` : '';
        const myTot = pays.reduce((a, p) => a + num(((p.m || []).find(x => x[0] === me.id) || [])[1]), 0);
        top += tiles([[shortMoney(pays.reduce((a, p) => a + num(p.paid), 0)), 'Paid out', `${pays.length} wars`], [shortMoney(myTot), 'Paid to you']]);
        if (me.leader && unpaid.length) top += `<div class="hbs-hint" style="color:#FF7676;opacity:1">No payout yet: ${unpaid.map(w => 'vs ' + esc(w.opponent || '?') + ' (' + fmtD(w.end) + ')').join(' · ')}</div>`;
        if (!pays.length) return top + '<div class="hbs-empty">No payouts on the Hub yet.</div>';
        return top + pays.slice(0, 40).map(p => {
            const key = 'p:' + p.war, rows = (p.m || []).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
            const mine = (p.m || []).find(x => x[0] === me.id);
            const detail = open[key] ? `<div class="hbs-detail"><div class="hbs-list">${rows.map(([id, pay, wh]) =>
                `<div class="hbs-li"><span>${id === me.id ? '<b>' : ''}${esc(nameOf(N, id))}${id === me.id ? '</b>' : ''} <span style="opacity:.55">· ${wh} hits</span></span><b>${money(pay)}</b></div>`).join('')}</div>
                ${link[p.war] ? `<div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${esc(link[p.war])}" target="_blank" rel="noopener">💰 Payout receipt</a></div>` : ''}</div>` : '';
            return `<div class="hbs-card hbs-green"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">vs ${esc(p.opponent || '?')}</span>
                <span class="hbs-chip">${shortMoney(p.paid)}</span></div>
                <div class="hbs-sub">${fmtD(p.end)} · ${rows.length} members paid${mine && mine[1] ? ` · <b class="hbs-good">you: ${money(mine[1])}</b>` : ''}</div>${detail}</div>`;
        }).join('');
    }

    // =====================================================================
    // 🧩 SCRIPTS — the Hub's scripts directory. Listings on Greasy Fork show Greasy Fork's CURRENT name / version /
    // description / install link (the Hub reads them, cached 1 h - v2.1.0). "Installed" / "Update" (v2.1.0): see
    // SCRIPT DETECTION in the notes - <meta name="hb-script"> tags, or a suite launcher with that name.
    // =====================================================================
    const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function installedScripts() {
        const out = {};
        document.querySelectorAll('meta[name="hb-script"]').forEach(m => { out[normName(m.content)] = m.dataset.version || ''; });
        document.querySelectorAll('.torn-launcher[data-dock-label]').forEach(l => { const k = normName(l.dataset.dockLabel); if (!(k in out)) out[k] = ''; });
        return out;
    }
    // "1.10.0" vs "1.9.2" -> 1 / 0 / -1 (numbers compared part by part)
    const verCmp = (a, b) => { const x = String(a).split(/[.\-]/), y = String(b).split(/[.\-]/);
        for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = parseInt(x[i] || '0', 10) || 0, q = parseInt(y[i] || '0', 10) || 0; if (p !== q) return p > q ? 1 : -1; }
        return 0; };
    async function scriptsHtml() {
        const S = await live('scripts');
        const list = S.scripts || [], inst = installedScripts();
        let out = `<div class="hbs-hint">"Installed" is checked on this page - a script that only runs on other Torn pages may not show here.${me.leader
            ? ` Add, edit or remove listings on the <a href="${HUB_BASE}/m/scripts.html" target="_blank" rel="noopener">Hub's Scripts page</a>.` : ''}</div>`;
        if (!list.length) return out + '<div class="hbs-empty">No scripts listed yet.</div>';
        return out + list.map(x => {
            const key = 's:' + x.id, k = normName(x.name), has = k in inst, iv = inst[k];
            const upd = has && iv && x.version && verCmp(x.version, iv) > 0;
            const state = !has ? '' : upd ? `<span class="hbs-tag hbs-red">v${esc(iv)} installed</span>`
                : `<span class="hbs-tag hbs-green">✓ Installed${iv ? ' v' + esc(iv) : ''}</span>`;
            const btn = !x.install_url ? '' : upd ? `<a class="hbs-btn" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">⬆ Update to v${esc(x.version)}</a>`
                : has ? `<a class="hbs-btn hbs-ghost" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">Reinstall</a>`
                : `<a class="hbs-btn" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">⬇ Install</a>`;
            return `<div class="hbs-card ${upd ? 'hbs-red' : has ? 'hbs-green' : 'hbs-gold'}"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">${esc(x.name)}</span>
                ${x.version ? `<span class="hbs-chip">v${esc(x.version)}</span>` : ''}</div>
                <div class="hbs-sub">${esc(x.summary || '')}</div>
                ${state ? `<div class="hbs-sub">${state}</div>` : ''}
                ${open[key] && x.description ? `<div class="hbs-detail" style="white-space:pre-wrap">${esc(x.description)}</div>` : ''}
                <div class="hbs-actions">${btn}
                ${x.gf && x.gf.url ? `<a class="hbs-btn hbs-ghost" href="${esc(x.gf.url)}" target="_blank" rel="noopener">Greasy Fork</a>` : ''}
                ${x.description ? `<button type="button" class="hbs-btn hbs-ghost" data-toggle="${key}">${open[key] ? 'Less' : 'More'}</button>` : ''}</div>
                <div class="hbs-hint">${x.updated ? 'Updated ' + fmtD(x.updated > 1e11 ? Math.floor(x.updated / 1000) : x.updated) + (x.updated_by ? (x.gf ? ' on ' : ' by ') + esc(x.updated_by) : '') : ''}${x.gf && x.gf.installs != null ? ' · ' + int(x.gf.installs) + ' installs' : ''}</div></div>`;
        }).join('');
    }

    // =====================================================================
    // ⚡ READY (leaders) — live war readiness of members who opted in (the Hub reads Torn with THEIR stored key, at
    // most once a minute; this tab asks again every 60 s only while it's open and Torn's page is visible)
    // =====================================================================
    let readySort = 'energy';
    async function readyHtml() {
        const D = await live('readiness');
        const rows = (D.members || []).slice(), el_ = Math.max(0, nowS() - num(D.at));
        const okState = r => r.status && String(r.status.state).toLowerCase() === 'okay';
        const en = r => r.energy ? r.energy.cur : -1;
        rows.sort(readySort === 'name' ? (a, b) => String(a.name).localeCompare(String(b.name))
            : readySort === 'ready' ? (a, b) => (okState(b) - okState(a)) || en(b) - en(a) : (a, b) => en(b) - en(a));
        const ok = rows.filter(r => !r.err && okState(r)), stacked = rows.filter(r => r.energy && r.energy.cur >= r.energy.max);
        const noDrug = rows.filter(r => r.cd && (r.cd.drug || 0) - el_ <= 0 && !r.err);
        let out = tiles([[rows.length, 'Opted in'], [ok.length, 'Okay'], [stacked.length, 'Stacked'], [noDrug.length, 'No drug CD'],
            [big(rows.reduce((a, r) => a + (r.energy ? r.energy.cur : 0), 0)), 'Total energy']]);
        out += chips('rs', [['energy', 'Most energy'], ['ready', 'Ready first'], ['name', 'Name']], readySort);
        out += `<div class="hbs-hint">Read ${ago(D.at)} with each member's own key · refreshes every minute while this tab is open</div>`;
        out += rows.map(r => {
            if (r.err) return `<div class="hbs-card hbs-red"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a><span class="hbs-chip hbs-bad">${esc(r.err)}</span></div></div>`;
            const st = r.status || {}, s = String(st.state || '').toLowerCase();
            const cd = k => { const until = num(D.at) + num((r.cd || {})[k]); return `<div><b data-until="${until}">${until > nowS() ? dur(until - nowS()) : 'Ready'}</b><span>${k}</span></div>`; };
            return `<div class="hbs-card ${s === 'okay' ? 'hbs-green' : 'hbs-red'}"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a>
                <span class="hbs-chip ${s === 'okay' ? 'hbs-good' : s === 'traveling' || s === 'abroad' ? '' : 'hbs-bad'}">${esc(st.state || '?')}${st.until && st.until > nowS() ? ' · <span data-until="' + st.until + '">' + dur(st.until - nowS()) + '</span>' : ''}</span></div>
                ${meter('Energy' + (r.energy && r.energy.cur >= r.energy.max ? ' · stacked' : ''), r.energy, '#78c878')}${meter('Happy', r.happy, '#e8be5a')}${meter('Nerve', r.nerve, '#e4382e')}
                <div class="hbs-tiles">${cd('drug')}${cd('booster')}${cd('medical')}</div>
                <div class="hbs-sub">Energy refill: ${r.refill == null ? '-' : r.refill ? 'used today' : '<b class="hbs-good">available</b>'}${r.last ? ' · active ' + ago(r.last) : ''}</div></div>`;
        }).join('') || '<div class="hbs-empty">Nobody has turned war readiness on yet.</div>';
        return out;
    }

    // =====================================================================
    // 💪 STATS (leaders) — battle / work stats of members who opted in (db/private.json, like the Hub's stats.html)
    // =====================================================================
    let statsKind = 'bs', statsSort = 'total';
    async function statsHtml() {
        const [P, N] = await Promise.all([readFile('l', 'db/private.json'), names()]);
        const bs = [], ws = [];
        Object.entries(P.members || {}).forEach(([id, x]) => { const o = x.optin; if (!o) return;
            const tot = r => r[1] + r[2] + r[3] + r[4], wt = r => r[1] + r[2] + r[3];
            if (o.bs && o.bs.s.length) { const l = o.bs.s[o.bs.s.length - 1];
                bs.push({ id, name: nameOf(N, id), total: tot(l), a: l[1], b: l[2], c: l[3], d: l[4], g: gainTxt(o.bs.s, 30, tot), share: o.bs.share, on: l[0], via: (o.via || {}).bs }); }
            if (o.ws && o.ws.s.length) { const l = o.ws.s[o.ws.s.length - 1];
                ws.push({ id, name: nameOf(N, id), total: wt(l), a: l[1], b: l[2], c: l[3], g: gainTxt(o.ws.s, 30, wt), share: o.ws.share, on: l[0], via: (o.via || {}).ws }); } });
        const opted = Object.values(P.members || {}).filter(x => x.optin).length;
        // how many share through each way (v2.5.0)
        const ways = { site: 0, script: 0, ocopt: 0 };
        Object.values(P.members || {}).forEach(x => { const v = x.optin && x.optin.via; if (!v) return;
            new Set([].concat(...Object.values(v))).forEach(k => { if (k in ways) ways[k]++; }); });
        let out = tiles([[opted, 'Sharing'], [bs.length, 'Battle stats'], [ws.length, 'Work stats'],
            [ways.site, '🌐 Hub site'], [ways.script, '🧩 Hub script'], [ways.ocopt, '🕵️ OC script']]);
        out += chips('sk', [['bs', '⚔ Battle'], ['ws', '🛠 Work']], statsKind);
        const L = statsKind === 'bs' ? [['total', 'Total'], ['a', 'Strength'], ['b', 'Defense'], ['c', 'Speed'], ['d', 'Dexterity']]
                                     : [['total', 'Total'], ['a', 'Manual labor'], ['b', 'Intelligence'], ['c', 'Endurance']];
        if (!L.find(x => x[0] === statsSort)) statsSort = 'total';
        out += chips('ss', L.concat([['name', 'Name']]), statsSort);
        const rows = (statsKind === 'bs' ? bs : ws).sort(statsSort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b[statsSort] - a[statsSort]);
        return out + (rows.map(r => `<div class="hbs-card"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a>
            <span class="hbs-chip">${big(r.total)}</span></div>
            <div class="hbs-sub">${L.slice(1).map(([k, l]) => `${l} <b>${big(r[k])}</b>`).join(' · ')}</div>
            <div class="hbs-sub">${r.g || 'no 30-day gain yet'} · shared with ${r.share === 'faction' ? 'the faction' : 'leaders'} · read ${esc(r.on || '-')}</div>
            ${r.via && r.via.length ? `<div class="hbs-sub">Through ${srcNames(r.via)}</div>` : ''}</div>`).join('')
            || '<div class="hbs-empty">Nobody shares these yet.</div>');
    }

    // =====================================================================
    // 🗄 ARMORY (leaders) — two sections (v2.1.0, user):
    //   Currently loaned: who has which armory items right now (Weapons / Armor / Temps / Utilities) - the Hub reads it
    //                     once per full update with the faction key (generate.py update_armory_loans; "loans", "loans_at")
    //   Armory use:       items USED from the armory (the Armory Monitor log), grouped Drugs (Xanax + other drugs) /
    //                     Medical / Boosters / Consumables (points refills + temporary items used)
    // =====================================================================
    const ARM_USE = [['Drugs', ['Xanax', 'Drugs']], ['Medical', ['Medical']], ['Boosters', ['Boosters']], ['Consumables', ['Refills', 'Temporary']]];
    const ARM_LOAN = [['Weapons', '🔫'], ['Armor', '🛡'], ['Temporary', '💣'], ['Utilities', '🧰']];
    let armSec = 'stock', armPeriod = 'month', armSort = 'total';   // (0.2.78) opens on 🧰 Stock
    async function armoryHtml() {
        const A = await readFile('l', 'db/armory.json');
        const nm = id => (A.names[id] || ['[' + id + ']'])[0];
        let out = chips('as', [['stock', '🧰 Stock'], ['loans', '📦 Currently loaned'], ['use', '💊 Armory use']], armSec);
        if (armSec === 'stock') return out + await armHtml();      // (0.2.78) the stock tracker
        if (armSec === 'loans') {
            const L = A.loans || {}, tot = {};
            const rows = Object.entries(L).map(([id, cats]) => {
                let n = 0; ARM_LOAN.forEach(([c]) => { const k = (cats[c] || []).length; n += k; tot[c] = (tot[c] || 0) + k; });
                return { id, name: nm(id), cur: !!(A.names[id] || [])[1], cats, n };
            }).filter(r => r.n).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
            out += tiles(ARM_LOAN.map(([c, ic]) => [int(tot[c] || 0), ic + ' ' + (c === 'Temporary' ? 'Temps' : c)]).concat([[String(rows.length), 'Members']]));
            out += `<div class="hbs-hint">${A.loans_at ? 'As of ' + fmtDT(A.loans_at) + ' ' + tzTagH() + ' (read with each full Hub update)' : 'Not read yet - it starts with the next full Hub update'} · tap a member for their items</div>`;
            out += rows.map(r => {
                const key = 'al:' + r.id;
                const detail = open[key] ? `<div class="hbs-detail">${ARM_LOAN.filter(([c]) => (r.cats[c] || []).length).map(([c, ic]) => {
                    const cnt = {}; r.cats[c].forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
                    return `<div class="hbs-sec" style="margin-top:4px">${ic} ${c === 'Temporary' ? 'Temps' : c} · ${r.cats[c].length}</div>` +
                        Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([n, k]) => `<div class="hbs-li ${k > 1 ? 'hbs-low' : ''}"><span>${esc(n)}</span><b>×${k}</b></div>`).join('');
                }).join('')}</div>` : '';
                return `<div class="hbs-card${r.cur ? '' : ' hbs-red'}"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">${esc(r.name)}${r.cur ? '' : ' <span style="opacity:.6">(left the faction)</span>'}</span>
                    <span class="hbs-chip">${r.n} item${r.n === 1 ? '' : 's'}</span></div>
                    <div class="hbs-sub">${ARM_LOAN.filter(([c]) => (r.cats[c] || []).length).map(([c, ic]) => `${ic} ${(r.cats[c] || []).length}`).join(' · ')}</div>${detail}</div>`;
            }).join('') || '<div class="hbs-empty">Nothing on loan right now.</div>';
            return out;
        }
        // ---- armory use ----
        const months = armPeriod === 'all' ? (A.months || []) : [armPeriod === 'month' ? thisMonth() : lastMonth()];
        const grp = c => { const g = ARM_USE.find(([, cs]) => cs.includes(c)); return g ? g[0] : null; };
        const usage = id => {
            const m = (A.members[id] || {}).m || {}, r = { total: 0, items: {} };
            ARM_USE.forEach(([g]) => { r[g] = 0; r.items[g] = {}; });
            months.forEach(mo => Object.entries(m[mo] || {}).forEach(([it, n]) => {
                const g = grp(A.item_cat[+it]); if (!g) return;
                const name = String(A.items[+it]).replace(/ \(points\)$/, ' · points');
                r[g] += n; r.total += n; r.items[g][name] = (r.items[g][name] || 0) + n; }));
            return r;
        };
        const ids = [...new Set(Object.keys(A.members || {}).concat(Object.keys(A.names || {}).filter(i => A.names[i][1])))];
        const rows = ids.map(id => Object.assign({ id, name: nm(id), cur: !!(A.names[id] || [])[1] }, usage(id)))
            .filter(r => r.cur || r.total)
            .sort(armSort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
        const fac = {}; rows.forEach(r => ARM_USE.forEach(([g]) => { fac[g] = (fac[g] || 0) + r[g]; }));
        const ICON = { Drugs: '💊', Medical: '🩸', Boosters: '🍺', Consumables: '⚡' };
        out += chips('ap', [['month', 'This month'], ['last', 'Last month'], ['all', 'All time']], armPeriod);
        out += '<div class="hbs-wtiles">' + tiles(ARM_USE.map(([g]) => [int(fac[g]), ICON[g] + ' ' + g])) + '</div>';
        out += chips('ao', [['total', 'Most used'], ['name', 'Name']], armSort);
        out += `<div class="hbs-hint">${armPeriod === 'all' ? 'All time on record' : monthName(months[0])} · items used from the armory · Drugs = Xanax + other drugs ·
            Consumables = points refills + temps used${A.done ? '' : ' · older months still filling in'}</div>`;
        // one card per member: every item used, grouped by type (v2.4.2)
        out += rows.map(r => `<div class="hbs-card hbs-arm"><div class="hbs-r1" data-prof="${r.id}"><span class="hbs-name">${esc(r.name)}${r.cur ? '' : ' <span style="opacity:.5">former</span>'}</span>
                <span class="hbs-chip">${int(r.total)} used</span></div>
                ${r.total ? ARM_USE.filter(([g]) => r[g]).map(([g]) => `<div class="hbs-ag"><div class="hbs-agh">${ICON[g]} ${g} <b>${int(r[g])}</b></div>
                    <div class="hbs-agi">${Object.entries(r.items[g]).sort((a, b) => b[1] - a[1]).map(([n, k]) => `<span>${esc(n)} <b>×${int(k)}</b></span>`).join('')}</div></div>`).join('')
                    : '<div class="hbs-sub">Nothing used this period.</div>'}</div>`).join('');
        return out;
    }

    // 🧮 PAYOUT CALCULATOR: removed in Suite 0.2.1 - the tab links to the Hub's own calculator (/l/payout.html).

    // ---------------------------------------------------------------------
    // TAB TABLE — what each tab draws and wires up
    // ---------------------------------------------------------------------
    // =====================================================================
    // SUITE MODULES (v0.1.0) — the features merged in from the Faction Chain Watch, OC Optimizer and Torn Recruit
    // Scout scripts. Everything shares ONE Hub sign-in (the same {pid, faction, name} identity - no key ever sent),
    // ONE Torn rate budget (tornGate below) and ONE panel. Each module can be switched off in ⚙ (MOD).
    //   ⛓ Chain    - the Hub's Chain Watch room live: WebSocket /cw/ws (fallback POST /cw/sync), queue, turn, bonus,
    //                runway, retals, alerts; sends YOUR energy stats + chain readings read with your own key
    //                (contract: project doc claude/chainwatch-hub-contract.md - same rules as Chain Watch 4.x)
    //   🕵 OC       - your crime + planned seat (op live "myoc"), Join link, the crimes-page highlight of your seat;
    //                leaders: OC alerts + the 📣 Notify list (op live "spawn"). Pass-rate sharing = ⚙ sharing (oc).
    //   🤝 Recruit  - leaders: the Hub's shared Recruitment list - claim / status / notes / remove (op "rc")
    //   ⚔ War      - the existing Wars tab; the header chip shows the live ranked war (op live "now")
    // =====================================================================
    const FACTION_ID = 51384;                  // Heart Breakers (the Hub refuses any other faction anyway)
    const MOD_DEF = { chain: true, ocpage: true, recruit: true };
    const MOD = Object.assign({}, MOD_DEF, store.get(K.mods, {}) || {});
    const modOn = k => true;                    // (0.2.15) every module is on - the Modules switches were removed (user)

    // POST JSON to any Hub path (Chain Watch /cw/*). TornPDA: PDA_httpPost; desktop: GM_xmlhttpRequest; else fetch.
    function postTo(path, body) {
        const url = HUB_BASE + path, payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const done = (status, txt) => { let r = null; try { r = txt ? JSON.parse(txt) : null; } catch (e) { /* below */ }
                if (!r) return reject(new HubError(`Hub error (${status || 'no response'}).`));
                if (num(status) >= 400 || r.ok === false) return reject(new HubError(r.error || `Hub error (${status}).`));
                resolve(r); };
            if (typeof PDA_httpPost === 'function') {
                try { Promise.resolve(PDA_httpPost(url, { 'Content-Type': 'application/json' }, payload))
                        .then(r => done(r && r.status, (r && (r.responseText || r.response || r.body || r.text)) || ''))
                        .catch(() => reject(new HubError('Hub unreachable.'))); return; } catch (e) { /* fall through */ }
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'POST', url, data: payload, timeout: 20000, headers: { 'Content-Type': 'application/json' },
                    onload: r => done(r.status, r.responseText), onerror: () => reject(new HubError('Hub unreachable.')),
                    ontimeout: () => reject(new HubError('Hub timed out.')) });
                return;
            }
            fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })
                .then(r => r.text().then(t => done(r.status, t))).catch(() => reject(new HubError('Hub unreachable.')));
        });
    }

    // ---- alerts: a toast on the page + a short beep + vibration (PDA / phones) ----
    let audioCtx = null;
    function alertMe(text, strong) {
        toast(text, strong);
        try { if (navigator.vibrate) navigator.vibrate(strong ? [200, 100, 200] : 150); } catch (e) { /* not supported */ }
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.frequency.value = strong ? 880 : 660; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + (strong ? 0.35 : 0.18));
        } catch (e) { /* audio blocked until the page was tapped */ }
    }
    function toast(text, strong) {
        let t = document.getElementById('hbs-toast');
        if (!t) { t = el('div'); t.id = 'hbs-toast'; document.body.appendChild(t); }
        t.textContent = text; t.className = strong ? 'hbs-strong' : '';
        t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, strong ? 7000 : 4000);
    }

    // =====================================================================
    // HEADER STATUS CHIPS — chain + ranked war, live (op live "now", every 30 s while the panel is open; the Chain
    // module's own live state wins when it's connected). Tap a chip to open its tab.
    // =====================================================================
    let nowData = null, nowAt = 0, chipsEl = null;
    async function refreshNow(force) {
        if (collapsed || document.visibilityState !== 'visible' || !me) return;
        if (!force && Date.now() - nowAt < 30000) return;
        nowAt = Date.now();
        try { nowData = await live('now'); } catch (e) { /* keep the last */ }   // [HB Suite] Hub API — op live "now"
        drawChips();
    }
    // 📢 ANNOUNCEMENT TILE (0.2.66): the Hub's announce for this member (op live "now"), above the tabs on every tab.
    // Yellow = announcement, with ✕ (dismissed on this device until a new one is sent); red = urgent, no ✕.
    let annEl = null;
    function drawAnn() {
        if (!annEl) return;
        const a = nowData && nowData.announce, dead = !a || (a.until && a.until <= Date.now()) || (a.type !== 'urgent' && store.get(K.annDismiss, '') === a.id);
        if (dead) { annEl.style.display = 'none'; annEl.innerHTML = ''; return; }
        const urgent = a.type === 'urgent';
        annEl.className = 'hbs-ann' + (urgent ? ' urgent' : ' dis'); annEl.style.display = '';
        annEl.innerHTML = `${urgent ? '🚨' : '📢'} ${esc(a.text)}<small>${esc(String(a.by || '').replace(/\s*\[\d+\]$/, ''))}${a.at ? ' · ' + ago(Math.floor(a.at / 1000)) : ''}${urgent && a.until ? ` · until ${ocWhen(Math.floor(a.until / 1000))}` : ''}</small>`
            + (urgent ? '' : '<button type="button" data-anndis title="Dismiss">✕</button>');
    }
    // ---------------------------------------------------------------------
    // 🧰 ARMORY (0.2.78) — see build_patch_0278.py. armS = the last op live "armory" answer {at, rows: [{key, name, label,
    // group, qty, min, price, short, cost}], low, cost, prices_at}, re-read when over a minute old. No Torn call here.
    // ---------------------------------------------------------------------
    let armS = null, armAt = 0, armMsg = '';
    const armMoney = n => { n = num(n); return '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'b' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e5 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n))); };
    const armAlertOn = () => store.get(K.armAlert, true) !== false;
    // the leaders' Home line (drawn above the Home tab; tap = open the Armory tab)
    function armHomeLine() {
        const a = nowData && nowData.armory;
        if (!me || !me.leader || !a || !(a.low > 0) || !armAlertOn()) return '';
        return `<div class="hbs-armal" data-armgo title="Open the Armory tab"><span>⚠ <b>Armory: ${int(a.low)} item${a.low === 1 ? '' : 's'} low</b><small>${esc((a.names || []).join(', '))}</small></span><b>${a.cost ? armMoney(a.cost) : ''}</b></div>`;
    }
    document.addEventListener('click', e => {
        if (!(e.target && e.target.closest && e.target.closest('#hbs-panel [data-armgo]'))) return;
        tab = 'armory'; store.set(K.tab, tab); showSettings = false; render();
    });
    async function armHtml() {
        if (!me.leader) return '<div class="hbs-empty">Leaders only.</div>';
        // [HB Suite] Hub API — op live "armory" (leaders: the Hub's armory reading; no Torn call from this script)
        // (0.2.80) [HB Suite] Hub API — op "armory_now" (leaders): the Hub reads the armory now if its reading is over
        // 30 s old, and answers with the same rows. Falls back to the stored reading (live "armory") if that fails.
        if (!armS || Date.now() - armAt > 60000) { try { delete liveMemo.armory;
            let d = await hub('armory_now').catch(() => null); if (!d || !Array.isArray(d.rows)) d = await live('armory');
            armS = d; armAt = Date.now(); } catch (e) { return `<div class="hbs-empty">${esc(e.message)}</div>`; } }
        const R = armS.rows || [], armMsgNow = armMsg; armMsg = '';   // a save message shows once
        if (!armS.at || !R.length) return '<div class="hbs-empty">No armory reading yet - the Hub checks the armory every few minutes.</div>';
        const lowR = R.filter(r => r.short > 0), okR = R.filter(r => !(r.short > 0));
        const blood = lowR.filter(r => r.group === 'blood'), lines = lowR.filter(r => r.group !== 'blood').map(r => ({ name: r.name, det: `${int(r.qty)} / ${int(r.min)}`, cost: r.cost,
            tip: `Short ${int(r.short)}${r.price != null ? ' · ' + armMoney(r.price) + ' each' : ' · no market value yet'}` }));
        if (blood.length) lines.push({ name: 'Blood bags', det: blood.map(r => `${r.label} ${int(r.qty)}`).join(' · '), cost: blood.some(r => r.cost == null) ? null : blood.reduce((a, r) => a + r.cost, 0),
            tip: `Short ${int(blood.reduce((a, r) => a + r.short, 0))} across ${blood.length} type${blood.length === 1 ? '' : 's'} · minimum ${[...new Set(blood.map(r => int(r.min)))].join(' / ')} each` });
        lines.sort((a, b) => num(b.cost) - num(a.cost));
        const head = lines.length
            ? `<div class="hbs-armhd"><b class="hbs-bad">${lines.length} low</b> · restock about <b style="color:#FFB454">${armMoney(armS.cost)}</b>${armS.unpriced ? ` <small>(+ ${int(armS.unpriced)} without a market value)</small>` : ''}</div>`
            : '<div class="hbs-armhd"><b class="hbs-good">✓ Every key item is stocked</b></div>';
        const row = l => `<div class="hbs-li" title="${esc(l.tip)}"><span>${esc(l.name)} <span class="hbs-bad">${esc(l.det)}</span><small class="hbs-armtip">${esc(l.tip)}</small></span><b style="color:#FFB454;white-space:nowrap">${l.cost == null ? '-' : armMoney(l.cost)}</b></div>`;
        const okList = okR.map(r => `<div class="hbs-li"><span>${esc(r.group === 'blood' ? 'Blood bag ' + r.label : r.name)}</span><span class="hbs-good" style="white-space:nowrap">${int(r.qty)} / ${int(r.min)}</span></div>`).join('');
        const mins = `<div class="hbs-hint" style="text-align:left;margin:0 0 6px">The stock level each item should stay above. Saved for every leader.</div><div class="hbs-armset">`
            + R.map(r => `<label><span>${esc(r.group === 'blood' ? 'Blood bag ' + r.label : r.name)}</span><input type="number" class="hbs-input" inputmode="numeric" min="0" max="1000000" step="1" value="${int(r.min).replace(/,/g, '')}" data-armmin="${esc(r.key)}"></label>`).join('')
            + `</div><div class="hbs-actions"><button type="button" class="hbs-btn" data-armsave>Save minimums</button></div>`;
        return `<div class="hbs-card">${head}${lines.map(row).join('')}
                <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-armnow>↻ Check now</button></div>
                <div class="hbs-hint" style="text-align:left">Checked ${ago(Math.floor(armS.at / 1000))}${armS.stale ? ' (the Hub couldn\'t read the armory just now)' : ''} · read when you open this, on Check now, and every 3 minutes in the background · cost = the shortfall × Torn's market value${armS.prices_at ? ' (prices from ' + ago(Math.floor(armS.prices_at / 1000)) + ')' : ''}.</div>
                ${armMsgNow ? `<div class="hbs-hint hbs-good" style="text-align:left">${esc(armMsgNow)}</div>` : ''}</div>`
            + (okR.length ? cFold('armok', '✅', `${okR.length} item${okR.length === 1 ? '' : 's'} stocked`, '', okList, false, false) : '')
            + cFold('armset', '🎯', 'Minimum stock', 'leaders', mins, false, false)
            + `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🔔 Low-stock line on Home</span><button type="button" class="hbs-btn ${armAlertOn() ? '' : 'hbs-ghost'}" data-armalert>${armAlertOn() ? 'On' : 'Off'}</button></div>
                <div class="hbs-hint" style="text-align:left">Your own choice on this device - other leaders set theirs. ${armAlertOn() ? 'Home shows a line when a key item is under its minimum.' : 'Home stays quiet; this tab still shows everything.'}</div></div>`;
    }
    function armBind() {
        const nw = bodyEl.querySelector('[data-armnow]');       // (0.2.80) read again right away
        if (nw) nw.addEventListener('click', () => { nw.disabled = true; nw.textContent = 'Reading…'; armAt = 0; render(true); });
        const al = bodyEl.querySelector('[data-armalert]');
        if (al) al.addEventListener('click', () => { store.set(K.armAlert, !armAlertOn()); render(true); });
        const sv = bodyEl.querySelector('[data-armsave]');
        if (sv) sv.addEventListener('click', async () => {
            const min = {}; let bad = false;
            bodyEl.querySelectorAll('[data-armmin]').forEach(i => { const v = String(i.value).trim(); if (v === '' || !/^\d+$/.test(v) || +v > 1000000) bad = true; else min[i.dataset.armmin] = +v; });
            if (bad) { armMsg = 'Enter whole numbers from 0 to 1,000,000.'; render(true); return; }
            sv.disabled = true;
            try {
                // [HB Suite] Hub API — op "armory_cfg" (leaders: the minimum stock per item)
                armS = await hub('armory_cfg', { min }); armAt = Date.now(); delete liveMemo.armory; delete liveMemo.now; nowAt = 0; refreshNow(true);
                armMsg = 'Minimums saved.';
            } catch (e) { armMsg = e.message || 'Could not save.'; }
            render(true);
        });
    }
    // 📢 LEADERS' ANNOUNCE TAB (0.2.66): what is showing now (+ Delete), a new one (kind, expiry, audience), the history
    let annS = null, annAt = 0, annMsg = '';   // annS = the last op "announce" answer, re-read when over 30 s old
    const annAud = a => !a ? '-' : a.all ? 'Everyone' : [a.queue ? 'Chain queue' : '', a.leaders ? 'All leaders' : ''].concat(a.roles || []).filter(Boolean).join(', ');
    async function annHtml() {
        if (!me.leader) return '<div class="hbs-empty">Leaders only.</div>';
        // [HB Suite] Hub API — op "announce" get (leaders: the current announcement, history, positions)
        if (!annS || Date.now() - annAt > 30000) { try { annS = await hub('announce', { do: 'get' }); annAt = Date.now(); } catch (e) { return `<div class="hbs-empty">${esc(e.message)}</div>`; } }
        const c = annS.cur, max = annS.max || 200;
        const hist = (annS.log || []).map(x => `<div class="hbs-li" style="display:block;text-align:left"><span class="hbs-tag ${x.type === 'urgent' ? 'hbs-red' : ''}">${x.type === 'urgent' ? 'Urgent' : 'Announcement'}</span> ${esc(x.text)}
            <div class="hbs-hint" style="text-align:left;margin:2px 0 0">${esc(x.by || '')} · ${fmtD(Math.floor(num(x.at) / 1000))} · ${esc(annAud(x.aud))} · ${esc(x.ended || 'expired')}${x.ended_by ? ' by ' + esc(x.ended_by) : ''}</div></div>`).join('');
        return `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">📢 Showing now</span></div>
                ${c ? `<div class="hbs-ann${c.type === 'urgent' ? ' urgent' : ''}" style="margin:6px 0 0">${c.type === 'urgent' ? '🚨' : '📢'} ${esc(c.text)}<small>${esc(c.by || '')} · ${esc(annAud(c.aud))} · ${c.until ? 'expires ' + ocWhen(Math.floor(c.until / 1000)) : 'no expiry'}</small></div>
                    <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-anndel>Delete it</button></div>` : '<div class="hbs-hint">Nothing is showing right now.</div>'}</div>
            <div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">✍ New announcement</span><span class="hbs-chip" data-anncn>0 / ${max}</span></div>
                <div class="hbs-hint" style="text-align:left">One at a time - sending replaces the one showing now. Members see it within about half a minute.</div>
                <textarea class="hbs-input hbs-annbox" data-anntx maxlength="${max}" placeholder="Chain starts at 20:00 TCT - join the queue"></textarea>
                ${sec('Kind')}<div class="hbs-annpick" data-annkind><label class="on"><input type="radio" name="hbs-annk" value="announce" checked> Announcement (yellow, can be dismissed)</label>
                    <label><input type="radio" name="hbs-annk" value="urgent"> Urgent (red, can't be dismissed)</label></div>
                ${sec('Expires')}<select class="hbs-input" data-annhrs></select>
                ${sec('Who sees it')}<div class="hbs-annpick" data-annaud><label class="on"><input type="checkbox" value="all" checked> Everyone</label><label><input type="checkbox" value="queue"> In the chain queue</label>
                    <label><input type="checkbox" value="leaders"> All leaders</label>${(annS.positions || []).map(p => `<label><input type="checkbox" data-role="1" value="${esc(p)}"> ${esc(p)}</label>`).join('')}</div>
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-annsend>Send</button></div>
                <div class="hbs-msg" data-annmsg>${esc(annMsg)}</div></div>
            ${sec('History')}${hist || '<div class="hbs-hint">No past announcements.</div>'}`;
    }
    function annBind() {
        const q = s => bodyEl.querySelector(s), tx = q('[data-anntx]'); if (!tx) return;
        const kind = () => (q('[data-annkind] input:checked') || {}).value || 'announce';
        const marks = () => bodyEl.querySelectorAll('.hbs-annpick label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
        const hours = () => { const u = kind() === 'urgent', L = u ? [1, 2, 3, 6, 12, 24] : [0, 1, 6, 12, 24, 72, 168];
            q('[data-annhrs]').innerHTML = L.map(h => `<option value="${h}"${h === (u ? 6 : 0) ? ' selected' : ''}>${h === 0 ? 'Stays until replaced or deleted' : h < 48 ? h + ' hour' + (h === 1 ? '' : 's') : (h / 24) + ' days'}</option>`).join(''); };
        hours();
        tx.addEventListener('input', () => { q('[data-anncn]').textContent = `${tx.value.length} / ${annS.max || 200}`; });
        q('[data-annkind]').addEventListener('change', () => { hours(); marks(); });
        q('[data-annaud]').addEventListener('change', e => { const all = q('[data-annaud] input[value=all]');
            if (e.target === all && all.checked) bodyEl.querySelectorAll('[data-annaud] input').forEach(i => { if (i !== all) i.checked = false; });
            else if (e.target !== all && e.target.checked) all.checked = false;
            marks(); });
        const act = async (body, done) => { const m = q('[data-annmsg]'); if (m) m.textContent = 'Saving…';
            // [HB Suite] Hub API — op "announce" send / delete (leaders)
            try { annS = await hub('announce', body); annAt = Date.now(); annMsg = done; delete liveMemo.now; nowAt = 0; refreshNow(true); render(true); }   // + the sender's own tile at once
            catch (e) { if (m) m.textContent = e.message; } };
        q('[data-annsend]').addEventListener('click', () => {
            const text = tx.value.trim(), A = [...bodyEl.querySelectorAll('[data-annaud] input:checked')];
            const aud = { all: A.some(i => i.value === 'all'), queue: A.some(i => i.value === 'queue'), leaders: A.some(i => i.value === 'leaders'), roles: A.filter(i => i.dataset.role).map(i => i.value) };
            if (!text) { q('[data-annmsg]').textContent = 'Write a message first.'; return; }
            if (!confirm(`Send this ${kind() === 'urgent' ? 'URGENT ' : ''}announcement to: ${annAud(aud) || 'nobody'}?${annS && annS.cur ? '\n\nIt replaces the one showing now.' : ''}`)) return;
            act({ do: 'send', text, type: kind(), hours: Number(q('[data-annhrs]').value), aud }, 'Sent ✓');
        });
        const del = q('[data-anndel]');
        if (del) del.addEventListener('click', () => { if (confirm("Delete the current announcement? It disappears from every member's Suite.")) act({ do: 'delete' }, 'Deleted ✓'); });
    }
    function drawChips() {
        drawAnn();
        if (!chipsEl) return;
        const out = [], S = cw.state, t = Date.now() / 1000;
        const PC = cwChain();
        if (S && PC.current > 0) {
            out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>⛓ ${int(PC.current)} · <span data-cwexp data-exp="${cwLocal(PC.expires_at)}" data-zero="00:00">-</span></button>`);
        } else if (!(cw.state && !cw.state.restored && cw.state.chain) && nowData && nowData.chain && nowData.chain.current > 0 && nowData.chain.timeout_at > t) {   // (0.2.22) the chain room's word wins once it has answered
            out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>⛓ ${int(nowData.chain.current)} · <span data-until="${nowData.chain.timeout_at}">-</span></button>`);
        } else out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot"></i>⛓ 00:00</button>`);   // (0.2.22, user: "Show 00:00 when no active chain")
        // chain first, war last (0.2.6, user: "War data should go behind active chain data in the top header. Chains are
        // more important to keep active on, war scores/etc can wait")
        if (cw.queued) out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>In queue #${cw.queuePos}</button>`);
        const w = nowData && nowData.war;
        if (w) out.push(w.kind === 'ongoing'
            ? `<button type="button" data-gotab="wars" class="hbs-chipb"><i class="hbs-dot warn"></i>⚔ ${int(w.our)}–${int(w.their)} vs ${esc(w.opponent)}</button>`
            : `<button type="button" data-gotab="wars" class="hbs-chipb"><i class="hbs-dot warn"></i>⚔ vs ${esc(w.opponent)} in <span data-until="${w.start}">-</span></button>`);
        chipsEl.innerHTML = out.join('');
        tickEl(chipsEl);
        drawPin();
    }

    // =====================================================================
    // ⛓ CHAIN MODULE — Chain Watch on the Hub (WebSocket while wanted; POST /cw/sync fallback)
    // Connected while the Chain tab is open OR you're in the queue (so alerts still reach you with the panel closed).
    // =====================================================================
    const cw = { ws: null, token: null, state: null, offset: 0, fails: 0, retryT: null, pingT: null, readT: null, syncT: null,
                 out: [], useSync: false, queued: false, queuePos: 0, lastTurnUp: null, stage: {}, backupFor: null, statsAt: 0, statsSent: false };
    (function cwRestore() {                                         // 4.20.6 restoreChainSnap: the last timer, instantly, on a page load
        try { const s = store.get(K.cwSnap, null);
            if (!s || !s.chain || Date.now() - num(s.at) > 300000) return;
            cw.offset = num(s.offset);
            if (num(s.chain.current) > 0 && num(s.chain.expires_at) > Date.now() + cw.offset) cw.state = { chain: s.chain, restored: true };
        } catch (e) { /* */ }
    })();
    const cwNow = () => Date.now() + cw.offset;                     // the Hub clock
    const cwLocal = ms => num(ms) - cw.offset;                      // a Hub-clock ms -> this device's clock (for countdowns)
    // 0.1.4 (user: "The chain watch script provides much faster connection to the queue and other data seems to arrive
    // faster and more reliable than the suite"): like Faction Chain Watch 4.20.6 the Suite now stays connected to the
    // chain room from page load (not only while the Chain tab is open / you're queued), re-uses its Chain Watch token
    // for 24 h (no /cw/hello round trip per page), keeps polling while it re-tries the live socket every 60 s, polls
    // straight away after anything you do, shows joins / leaves at once (optimistic, like 4.20.6), restores the last
    // timer instantly on a page load, and reconnects a socket that's gone quiet (no message for 45 s).
    const cwWanted = () => modOn('chain') && !!me && !!getKey();
    function cwSend(msg) {
        if (cw.ws && cw.ws.readyState === 1) { try { cw.ws.send(JSON.stringify(msg)); return; } catch (e) { /* queue it */ } }
        cw.out.push(msg); if (cw.out.length > 20) cw.out.shift();
        cwSyncSoon();
    }
    // 0.1.1 (user: "Chain watch is not able to connect"): every step now reports where it is / what failed (shown on
    // the Chain tab), a socket that doesn't OPEN within 8 s or is refused by the page (Torn's security policy / the
    // webview) drops straight to POST /cw/sync (goes through GM_xmlhttpRequest / PDA_httpPost, which the page can't
    // block), and a socket "replaced" by another Chain Watch connection (the old script or another tab) also moves to
    // /cw/sync instead of fighting it for the one live slot the Hub allows per member.
    async function cwConnect() {
        if (!cwWanted() || cw.ws || cw.syncT || cw.connecting) return;
        cw.connecting = true;
        try {
            if (!cw.token) { const t = store.get(K.cwTok, null);                  // the last token (24 h) - skips /cw/hello
                if (t && num(t.pid) === me.id && num(t.exp) > Date.now() + 60000) { cw.token = t.token; cw.tokenExp = num(t.exp); } }
            if (!cw.token || cw.tokenExp < Date.now() + 60000) {
                cw.step = 'Signing in to Chain Watch…'; cwShow();
                // [HB Suite] Hub API — /cw/hello: identity only ({pid, faction, name}); the key never leaves the device
                const h = await postTo('/cw/hello', { pid: me.id, faction: FACTION_ID, name: me.name, ver: VERSION, pda: isPDA() });
                if (!h.token) throw new HubError('Chain Watch sign-in gave no token.');
                cw.token = h.token; cw.tokenExp = num(h.expires) > 1e12 ? num(h.expires) : num(h.expires) > 1e9 ? num(h.expires) * 1000 : Date.now() + 20 * 3600e3;
                store.set(K.cwTok, { token: cw.token, exp: cw.tokenExp, pid: me.id });
            }
            if (typeof WebSocket !== 'function') { cwToSync('this browser has no live connections'); return; }
            // 0.1.5 (user: "This hangs for 5-10 seconds"): fetch the room over /cw/sync STRAIGHT AWAY while the live socket
            // opens in the background - data shows after one quick request, and the socket takes over (polling stops) the
            // moment it opens. On browsers that block or stall the socket (Firefox on Torn) nothing waits for it any more.
            cw.step = 'Connecting…';
            cwStartSync();
            cwOpenWs();
        } catch (e) {
            cw.err = e.message || String(e);
            if (/not_member|wrong_faction/.test(cw.err)) cw.denied = cw.err; else { cw.step = 'Retrying…'; cwRetry(); }
            cwShow();
        } finally { cw.connecting = false; }
    }
    const CW_BLOCKED = 'This browser blocks live connections on Torn, so Chain Watch checks the Hub every 15 s instead (every 5 s near an alert, and straight after anything you do).';
    // open the live socket. While polling, the poll loop KEEPS running until the socket is really open (no gap).
    function cwOpenWs() {
        if (!cw.syncT) { cw.step = 'Opening the live connection…'; cwShow(); }
        let ws;
        try { ws = new WebSocket(HUB_BASE.replace(/^http/, 'ws') + '/cw/ws?token=' + encodeURIComponent(cw.token) + '&faction=' + FACTION_ID); }
        catch (x) { console.warn(LOG, 'live connection refused', x); cwToSync(null); return; }
        cw.ws = ws; let opened = false, got = false;
        const openT = setTimeout(() => { if (!opened) { ws.onclose = null; try { ws.close(); } catch (x) { /* */ } if (cw.ws === ws) cw.ws = null; cwToSync('the live connection didn\'t open within 8 s'); } }, 8000);
        ws.onopen = () => { opened = true; clearTimeout(openT); cw.fails = 0; cw.err = ''; cw.step = 'Live'; cw.lastMsg = Date.now();
            clearTimeout(cw.syncT); cw.syncT = null; clearTimeout(cw.wsRetryT);          // socket's up -> stop polling
            cwSend({ t: 'hello', ver: VERSION, pda: isPDA() }); cw.out.splice(0).forEach(m => cwSend(m));
            if (store.get(K.cwq, false)) { const st = cwStatsCached(); cwSend(st ? { t: 'join', stats: st } : { t: 'join' }); }   // re-assert after a reconnect (4.20.6)
            clearInterval(cw.pingT); cw.pingT = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch (e) { /* closing */ } }, 25000);
            cwStats(false); cwPresence(); pageSentCount = -1; cwShow(); };
        ws.onmessage = e => { got = true; cw.lastMsg = Date.now(); let m = null; try { m = JSON.parse(e.data); } catch (x) { return; } cwIn(m); };
        ws.onclose = e => { clearTimeout(openT); clearInterval(cw.pingT); if (cw.ws === ws) cw.ws = null;
            if (e && (e.code === 1008 || e.code === 1011 || e.code === 4001 || e.code === 4003)) { cw.token = null; store.set(K.cwTok, null); cwRetry(); return; }
            if (!opened || !got) return cwToSync('the live connection was refused' + (e && e.code ? ' (code ' + e.code + ')' : ''));
            if (e && e.reason === 'replaced') return cwToSync('another Chain Watch connection (the old script, or Torn open in another tab) took the live slot');
            if (++cw.fails >= 3) return cwToSync('the live connection keeps dropping');
            cw.step = 'Reconnecting…'; cwShow(); cwRetry(); };
        ws.onerror = () => { /* onclose follows and decides */ };
    }
    // fall back to /cw/sync polling (goes through GM_xmlhttpRequest / PDA_httpPost - the page can't block it) and try
    // the live socket again every 60 s, like Chain Watch 4.20.6
    function cwToSync(why) {
        // (0.2.22, user: "Remove the warning") polling is shown only as the ● Polling chip (+ 🔍 Alert check), no banner
        cw.err = ''; cw.pollWhy = why || 'live connections blocked'; cw.step = 'Connected by polling';
        if (!cw.syncT) cwStartSync();
        clearTimeout(cw.wsRetryT);
        if (typeof WebSocket === 'function') cw.wsRetryT = setTimeout(() => { if (cwWanted() && !cw.ws && cw.token) cwOpenWs(); }, 60000);
        cwShow();
    }
    // redraw the Chain tab with the latest connection step / error (only while it's the open tab)
    function cwShow() { if (!collapsed && tab === 'chain' && !cwBusy()) { clearTimeout(cw.drawT); cw.drawT = setTimeout(() => { if (tab === 'chain' && !cwBusy()) render(true); }, 120); } }
    function cwRetry() { clearTimeout(cw.retryT); cw.retryT = null; if (cwWanted()) cw.retryT = setTimeout(() => { cw.retryT = null; cwConnect(); }, Math.min(30000, 2000 * (cw.fails + 1))); }
    function cwDisconnect() {
        clearTimeout(cw.retryT); clearInterval(cw.pingT); clearTimeout(cw.readT); clearTimeout(cw.syncT); cw.syncT = null; clearTimeout(cw.alT); cw.alT = null; clearTimeout(cw.wsRetryT);
        if (cw.ws) { try { cw.ws.onclose = null; cw.ws.close(); } catch (e) { /* gone */ } cw.ws = null; }
    }
    // no WebSocket (or it keeps failing): the same messages through POST /cw/sync every 15 s (5 s near the first alert)
    function cwStartSync() {
        clearTimeout(cw.syncT);
        cw.syncT = -1;                                              // "running" until the first round has its timer
        cwStats(false); cwSyncRun();
    }
    async function cwSyncRun() {
        clearTimeout(cw.syncT); cw.syncT = -1;
        if (!cwWanted() || (cw.ws && cw.ws.readyState === 1)) { cw.syncT = null; return; }
        if (cw.syncBusy) { cw.syncAgain = true; return; }
        cw.syncBusy = true;
        try {
            // [HB Suite] Hub API — /cw/sync (batched messages; token from /cw/hello)
            const r = await postTo('/cw/sync', { token: cw.token, out: cw.out.splice(0, 20), since: 0 });
            cw.lastMsg = Date.now();
            (r.in || []).forEach(cwIn);
            cw.err = cw.err && (/^Polling/.test(cw.err) || cw.err === CW_BLOCKED) ? cw.err : '';
        } catch (e) {
            cw.syncBusy = false;
            if (/bad_token/.test(e.message)) { cw.token = null; store.set(K.cwTok, null); cw.syncT = null; cwConnect(); return; }
            cw.err = 'Chain Watch poll failed: ' + e.message; cwShow();
        }
        cw.syncBusy = false;
        if (cw.ws && cw.ws.readyState === 1) { cw.syncT = null; return; }
        if (cw.syncAgain) { cw.syncAgain = false; cw.syncT = setTimeout(cwSyncRun, 50); return; }
        const c = cwChain(), left = c && c.current > 0 ? (num(c.expires_at) - cwNow()) / 1000 : 9e9;
        cw.syncT = setTimeout(cwSyncRun, left < num((cw.state && cw.state.config || {}).topAlertSeconds || 90) ? 5000 : 15000);
        cwAlSched();
    }
    // (0.2.47, user: "How can we make the alerts arrive sooner? ... a delay between the timer hitting its mark and the
    // alert arriving" -> "Yes build the scheduled check ins") The Hub makes each alert on its exact second but a polling
    // script only collects it on its next /cw/sync (15 s rounds, 5 s under alert 1) - so alert 1 could be ~15 s late.
    // Now one extra sync is timed for just after each alert / panic mark (the Hub fires 400 ms early, we ask 300 ms
    // after the mark, and once more 1.5 s after in case the Hub's alarm ran late). Re-planned after every sync, so it
    // follows the timer when a hit resets it. The Hub still decides who is alerted. No Torn API calls; a handful of
    // extra Hub syncs per run-down. (Hidden tabs: the browser / PDA may still hold timers back - can't be helped here.)
    const cwAlMarks = () => { const g = (cw.state && cw.state.config) || {};
        return [num(g.topAlertSeconds), num(g.restAlertSeconds), num(g.thirdAlertSeconds), 30, 15].filter(x => x > 0); };
    function cwAlSched() {
        clearTimeout(cw.alT); cw.alT = null;
        if (!cw.syncT || (cw.ws && cw.ws.readyState === 1)) return;                 // polling only
        const c = cwChain(), g = (cw.state && cw.state.config) || {};
        if (!c || !(c.current > 0) || !num(c.expires_at) || c.current < num(g.minChain)) return;
        const now = cwNow(), due = [];
        cwAlMarks().forEach(sec => [300, 1500].forEach(d => { const at = num(c.expires_at) - sec * 1000 + d; if (at > now + 50) due.push(at); }));
        if (!due.length) return;
        cw.alT = setTimeout(() => { cw.alT = null;
            if (cw.syncT && cw.syncT !== -1 && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cwSyncRun(); }   // cwSyncRun re-plans the next mark when it ends
            else if (cw.syncBusy) cw.syncAgain = true;
            else cwAlSched(); }, Math.min(...due) - now);
    }
    // (0.2.47, user: "Show the alert timers at the top above the Queue, under the chain panel. Alert 1 = #1, Alert 2 =
    // #1+#2, Alert 3 = All Queued. Minimum chain." - layout A (four tiles), live highlighting, only the alerts that are
    // set) "sent" = the timer has passed that mark on a chain at / over the minimum - worked out here from the timer,
    // not a delivery receipt from the Hub. Who gets each follows the Hub's rule by position in the list of set alerts
    // (1st -> #1 when "first alert to #1 only" is on, else all active; 2nd -> #1 + #2; 3rd -> all queued).
    function cwAlTilesHtml(cfg) {
        const st = [num(cfg.topAlertSeconds), num(cfg.restAlertSeconds), num(cfg.thirdAlertSeconds)].filter(x => x > 0).sort((a, b) => b - a);
        const who = i => i === 0 ? (cfg.firstAlertPrimaryOnly ? '#1' : 'All active') : i === 1 ? '#1 + #2' : 'All queued';
        return `<div class="hbs-altiles" data-altiles data-min="${num(cfg.minChain)}">`
            + st.map((x, i) => `<div data-alsec="${x}"${i === st.length - 1 && st.length > 1 ? ' data-allast="1"' : ''}><span data-allab="Alert ${i + 1}">Alert ${i + 1}</span><b>${mSec(x)}</b><i>${who(i)}</i></div>`).join('')
            + `<div data-almin><span>Min chain</span><b>${int(cfg.minChain)}</b><i>hits</i></div></div>`;
    }
    function cwAlTilesTick() {
        const box = bodyEl && bodyEl.querySelector('[data-altiles]'); if (!box) return;
        const c = cwChain(), live = !!(c && c.current > 0 && num(c.expires_at) > cwNow()), min = num(box.dataset.min);
        const left = live ? (num(c.expires_at) - cwNow()) / 1000 : null, ok = live && c.current >= min;
        let next = null;
        box.querySelectorAll('[data-alsec]').forEach(d => { const sec = num(d.dataset.alsec), sent = ok && left <= sec;
            if (ok && !sent && next == null) next = d;                                // tiles run longest -> shortest: the first unsent is next
            d.className = sent ? (d.dataset.allast ? 'sent last' : 'sent') : live && !ok ? 'off' : '';
            const l = d.querySelector('[data-allab]'); if (l) l.textContent = l.dataset.allab + (sent ? ' · sent' : ''); });
        if (next) next.classList.add('next');
        const m = box.querySelector('[data-almin]');
        if (m) { m.className = !live || !min ? '' : ok ? 'met' : 'below';
            m.querySelector('b').textContent = live && min && !ok ? `${int(c.current)} / ${int(min)}` : int(min);
            m.querySelector('i').textContent = !live || !min ? 'hits' : ok ? 'met' : 'alerts off'; }
    }
    setInterval(() => { if (!collapsed && tab === 'chain') cwAlTilesTick(); }, 1000);
    // (0.2.59) password managers: mark every field the Suite draws as not-a-login (LastPass data-lpignore, 1Password
    // data-1p-ignore, Bitwarden data-bwignore, Dashlane data-form-type="other")
    setInterval(() => { try { document.querySelectorAll('#hbs-panel input:not([data-lpignore]), #hbs-panel textarea:not([data-lpignore]), #hbs-compact input:not([data-lpignore])').forEach(i => {
        i.setAttribute('data-lpignore', 'true'); i.setAttribute('data-1p-ignore', ''); i.setAttribute('data-bwignore', ''); i.setAttribute('data-form-type', 'other');
        if (!i.hasAttribute('autocomplete')) i.setAttribute('autocomplete', 'off'); }); } catch (e) { /* */ } }, 1200);
    // anything you do while polling goes out at once (not on the next 15 s round)
    function cwSyncSoon() { if (cw.syncT && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cw.syncT = setTimeout(cwSyncRun, 120); } }
    function cwWatch() { if (cwWanted()) cwConnect(); else if (cw.ws || cw.syncT) cwDisconnect(); }
    // health watchdog (4.20.6 healthLoop): an "open" socket with no message for 45 s is dead -> reconnect;
    // nothing running at all while wanted -> connect
    setInterval(() => {
        if (!cwWanted()) return;
        if (cw.ws && cw.ws.readyState === 1 && Date.now() - (cw.lastMsg || 0) > 45000) { try { cw.ws.close(); } catch (e) { /* onclose reconnects */ } return; }
        if (!cw.ws && !cw.syncT && !cw.connecting && !cw.retryT) cwConnect();
    }, 5000);

    // CHAIN AT 0 (0.2.22, user: "When a chain reaches 0, force an API/Hub check to make sure its actually dead. If its
    // dead, ensure alerts are no longer going out."): when the timer this device shows runs out with a count still up,
    // any sounding alert stops and the Suite asks the Hub to re-read Torn now ({t:"verify"} - the Hub reads
    // faction/chain at once, at most once per 10 s for everyone). If Torn says the chain is over, the Hub drops it and
    // stops all alerts; if a late hit kept it alive, the new timer comes back. Asked again every 15 s until settled.
    let cwVerifyAt = 0;
    const cwLeft = () => { const c = cwChain(); return c.current > 0 ? num(c.expires_at) - cwNow() : 0; };
    setInterval(() => {
        const c = cwChain();
        if (!(c.current > 0) || !cw.state || cw.state.restored) { cwVerifyAt = 0; return; }
        if (cwLeft() > 0) { cwVerifyAt = 0; return; }
        if (cwVerifyAt && Date.now() - cwVerifyAt < 15000) return;
        if (!cwVerifyAt) { try { alStopAll(); } catch (e) { /* alerts module */ } }
        cwVerifyAt = Date.now(); cwSend({ t: 'verify', chain: c.current });
        if (tab === 'chain' && !collapsed && !cwBusy()) render(true);
    }, 1000);
    // NEXT UP (0.2.27, user approved: "a quiet notice when you become #2 (backup), before alert 2 fires"): once per
    // change, a plain toast (no sound / vibration) when the Hub makes you backup during a live chain at/above the minimum
    let cwWasBackup = false;
    function cwNextUp() {
        const S = cw.state || {}, t = S.turn || {}, c = cwChain(), cfg = S.config || {};
        const isB = !!(me && t.backup && num(t.backup) === me.id && num(t.up) !== me.id && c.current > 0 && c.current >= num(cfg.minChain));
        if (isB && !cwWasBackup) toast(`⏭ You're next - backup behind ${esc(((S.queue || []).find(x => num(x.pid) === num(t.up)) || {}).name || 'who\'s up')}. Get ready.`, false);
        cwWasBackup = isB;
    }
    // BONUS GUARD (0.2.27, user: "Do this 5 hits before a bonus"): from 5 hits before a bonus that's assigned to someone
    // else, attack buttons (retal cards, 🎯 Find target) are marked; on the hit right before it, tapping asks first.
    function bonusGuard() {
        const S = cw.state || {}, b = S.bonus || {}, c = cwChain();
        if (!b.pid || !b.next || !me || num(b.pid) === me.id || !(c.current > 0)) return null;
        const left = num(b.next) - c.current;
        return left > 0 && left <= 5 ? { left, name: b.name || '#' + b.pid, next: num(b.next), last: left === 1 } : null;
    }
    // (0.2.89) 📡 9. HUB PUSH - see build_patch_0289.py. {t: "bus", k, v} one change, {t: "bus", all} every k's latest
    // v on connect. Each changed k fetches just that, 2-17 s later (spread between Suites).
    function busIn(m) {
        cw.busOk = true;
        const seen = store.get(K.busSeen, null) || {}, ch = [];
        if (m.all && typeof m.all === 'object') Object.keys(m.all).forEach(k => { if (seen[k] !== m.all[k]) { ch.push(k); seen[k] = m.all[k]; } });
        else if (m.k && seen[m.k] !== m.v) { ch.push(m.k); seen[m.k] = m.v; }
        store.set(K.busSeen, seen);
        if (!ch.length || !me) return;
        const later = fn => setTimeout(() => { try { fn(); } catch (e) { /* next note */ } }, 2000 + Math.random() * 15000);
        if (ch.includes('crimes') || ch.includes('plan')) later(() => {
            // the check-in brings my OC tile, the crime tag (pass rates) and the leaders' alert signature in one call
            const st = store.get(K.share, null) || { oc: true };
            if (st.oc && getKey()) { store.set(K.sharePingAt, 0); shareTick(true); }
            else loadMyOc(true).then(() => { drawOcPin(); drawTabDots(); }, () => {});
            if (tab === 'oc' && !collapsed && !cwBusy()) { liveClear(); render(true); }
        });
        if (ch.includes('loans') && (me.leader || me.loans)) later(() => { liveClear(); if (tab === 'oc' && !collapsed && !cwBusy()) render(true); });
        if (ch.includes('armory') && me.leader) later(() => { liveClear(); if (!collapsed && !cwBusy()) render(true); });
    }
    // ---- messages from the Hub ----
    function cwIn(m) {
        if (!m || !m.t) return;
        if (m.now) cw.offset = num(m.now) - Date.now();
        if (m.t === 'alert') { cwHubAlert(m); return; }            // the Hub times every alert; this device delivers it (🔔 alerts, 0.2.3)
        if (m.t === 'panic') { cwHubPanic(m); return; }
        if (m.t === 'dump') { dmIn(m); return; }                    // 💩 dumping hits (0.2.48)
        if (m.t === 'diag') { cw.diag = m; if (tab === 'chain') render(true); return; }   // 🔍 Alert check (0.2.21, leaders)
        if (m.t === 'notice') {
            if (m.kind === 'join_refused') { cw.optimistic = null; cw.queued = false; store.set(K.cwq, false); cwShow(); }   // undo the optimistic join
            alertMe(m.text || m.kind, false); return; }
        if (m.t === 'mode') { cw.mode = m.mode; return; }
        if (m.t === 'bus') { busIn(m); return; }                    // (0.2.89) 📡 9. the Hub says something changed
        if (m.suite) updFromHub(m.suite);                           // (0.2.39) the published Suite version -> update banner at once
        if (m.chain) { cw.hubAt = Date.now();                      // when the Hub last sent a chain (page-read sanity reference)
            try { store.set(K.cwSnap, { chain: m.chain, offset: num(m.now) - Date.now(), at: Date.now() }); } catch (e) { /* */ } }
        if (m.t === 'state') cw.state = m;
        else if (m.t === 'sync') cw.state = Object.assign(cw.state || {}, m);
        else return;                                                // pong / hit: nothing to draw
        const q = (cw.state.queue || []), i = q.findIndex(x => num(x.pid) === me.id);
        const was = cw.queued; cw.queued = i >= 0; cw.queuePos = i + 1;
        // an optimistic join / leave stands until the Hub's list agrees (or 20 s pass)
        if (cw.optimistic && Date.now() - cw.optimistic.at < 20000 && cw.queued !== cw.optimistic.queued) cw.queued = cw.optimistic.queued;
        else cw.optimistic = null;
        if (was !== cw.queued) { store.set(K.cwq, cw.queued); cwPresence(); }
        alWatch(); cwReadPlan(); drawChips(); rtChime();   // alWatch: a changed count stops a sounding alert (0.2.3)
        cwNextUp();   // (0.2.27) quiet "you're next" notice
        // AUTO-REJOIN (0.2.28, user: "Offline for more than 60 minutes removes you from the Chain Watch hub. When you come
        // back, your script should rejoin the chain watch."): the Hub marks a member it removed for being offline 60+ min
        // (me.rejoin, in the state it sends when you connect); the Suite joins again by itself, once per 60 s at most.
        if (m.t === 'state' && m.me && m.me.rejoin && !cw.queued && Date.now() - (cw.rejoinAt || 0) > 60000) {
            cw.rejoinAt = Date.now();
            cwAction('join').then(() => toast("⛓ You were offline 60+ min and left the Chain Watch queue - you've been put back in.", true), () => {});
        }
        // redraw the Chain tab at most ~2x a second (syncs can come in bursts)
        cwShow();
    }
    const cwBusy = () => { const a = document.activeElement; return !!(a && panel.contains(a) && /SELECT|INPUT|TEXTAREA/.test(a.tagName)); };
    // (cwAlert replaced in 0.2.3 by cwHubAlert / cwHubPanic in the 🔔 CHAIN WATCH ALERTS module - 4.20.6's alert engine)
    // PRESENCE heartbeat (idle/offline addendum §1): WebSocket only, every 45 s while queued AND this tab is visible
    function cwPresence() {
        clearInterval(cw.presT);
        const beat = () => { if (cw.queued && !document.hidden && cw.ws && cw.ws.readyState === 1) { try { cw.ws.send('{"t":"presence"}'); } catch (e) { /* closing */ } } };
        if (cw.queued) { beat(); cw.presT = setInterval(beat, 45000); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && cw.queued) cwPresence(); });

    // ---- what this device sends: energy stats + chain readings (own key; one shared Torn budget) ----
    // last reading (kept on this device): Torn caches a key's reply ~30 s, so reading faster just re-reads it
    function cwStatsCached(maxAge) { const c = store.get(K.cwStats, null); return c && Date.now() - num(c.at) < (maxAge || 600000) ? c.s : null; }
    async function cwStats(force) {
        if (!getKey() || document.hidden) return null;         // stats are proof of life on the Hub - never from a hidden tab
        const last = store.get(K.cwStats, null), age = last ? Date.now() - num(last.at) : 9e9;
        if (age < 29500) { if (force && last) cwSend(Object.assign({ t: 'stats' }, last.s)); return last && last.s; }   // within the 30 s key cache
        if (!force && !cw.queued && cw.statsSent) return null;   // not queued: once per page (on connect) is enough
        cw.statsSent = true;
        try {
            // [HB Suite] Torn API — your energy / cooldowns / refill for the Chain Watch queue (v1 bars,cooldowns,refills)
            const d = await tornGet('https://api.torn.com/user/?selections=bars,cooldowns,refills');
            const e = (d && d.energy) || {}, cd = (d && d.cooldowns) || {}, rf = (d && d.refills) || {};
            const st = { energyCur: num(e.current), energyMax: num(e.maximum), energyInc: num(e.increment), energyInt: num(e.interval),
                         energyTick: num(e.ticktime), drug: num(cd.drug), booster: num(cd.booster), medical: num(cd.medical), refill: rf.energy_refill_used ? 0 : 1 };   // + medical (0.2.60)
            store.set(K.cwStats, { s: st, at: Date.now() });
            cwSend(Object.assign({ t: 'stats' }, st));
            cw.statsErr = '';
            return st;
        } catch (x) {
            // (0.2.37, user: "Some users arent showing their energy/cooldowns in the chain watch feature. What could cause
            // this?") this read used to fail SILENTLY - most often a key without access to bars / cooldowns (a Public key).
            // The reason is kept and shown on the Chain tab while you're queued (cwStatsWarn).
            const was = cw.statsErr; cw.statsErr = String((x && x.message) || 'Torn did not answer').replace(/^Torn: /, '').replace(/ - this needs a key with Faction API access\.?$/, '');
            if (!was && cw.queued && tab === 'chain' && !cwBusy()) render(true);
            return null;
        }
    }
    setInterval(() => { if ((cw.ws || cw.syncT) && cw.queued) cwStats(false); }, 10000);   // queued: as fresh as the 30 s cache allows (4.20.6)
    // chain readings: while queued, or while the timer is under the 1st alert - once per 30 s at this device's phase offset
    function cwReadPlan() {
        clearTimeout(cw.readT);
        const S = cw.state || {}, c = S.chain || {}, cfg = S.config || {};
        if (!getKey() || !(c.current > 0)) return;
        const left = (num(c.expires_at) - cwNow()) / 1000;
        if (!cw.queued && !(left > 0 && left <= num(cfg.topAlertSeconds || 90))) return;
        const phase = num((S.me || {}).phase_ms) % 30000, wait = (30000 - ((cwNow() - phase) % 30000) + 30000) % 30000 || 30000;
        cw.readT = setTimeout(async () => {
            try {
                // [HB Suite] Torn API — v2 faction/chain (the reading is sent to the Hub; the key stays here)
                const d = await tornGet('https://api.torn.com/v2/faction/chain');
                const ch = (d && d.chain) || {};
                if (num(ch.current) > 0) cwSend({ t: 'chain', current: num(ch.current), max: num(ch.max), timeout: num(ch.timeout), cooldown: num(ch.cooldown),
                                                  modifier: ch.modifier, start: num(ch.start), end: num(ch.end) });
            } catch (x) { /* next round */ }
            cwReadPlan();
        }, wait);
    }

    // =====================================================================
    // PAGE CHAIN READING (0.1.3) — ported from Faction Chain Watch 4.20.6 (addendum §3 + the user's Nov 13 2026 rules)
    // (user: "Is there a better way to pull the chain data? This needs to be updated immediately")
    // Torn's sidebar chain bar (and the faction chain box) are updated LIVE by Torn — no API, no cache — so a landed hit
    // and the exact time left show there the instant they happen. Like Chain Watch 4.20.6 we read it:
    //   (A) LOCAL DISPLAY: the timer / count on this device follow Torn's own bar (up OR down, capped at 5:00) while
    //       the reading is fresh (10 s) - a Hub push can't pull it back unless the Hub has a HIGHER count (a hit we
    //       haven't seen yet). Works on every transport, including Firefox's /cw/sync polling.
    //   (B) SHARE with the Hub ({t:"chain", src:"page"}): WebSocket ONLY (never buffered to /cw/sync - contract),
    //       at once on a count change, else at most once / 30 s.
    // TORN RULE: page reading ONLY while Torn is the focused, visible tab (document visible + window focus) - never
    // a backgrounded / minimised tab. Only while Chain Watch is connected. Zero Torn API calls.
    // A misparse guard ignores a reading wildly off a fresh Hub count (the "Bonus hit 250 in -113000" bug in 4.x).
    // =====================================================================
    const PAGE_CHAIN_MIN_MS = 30000, PAGE_LOCAL_TTL_MS = 10000;
    let pageSentAt = 0, pageSentCount = -1, pageObs = null, pageEl = null;
    const pageScrapeAllowed = () => !document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
    // the chain to SHOW: a fresh focused-tab page reading wins unless the Hub already has a higher count
    function cwChain() {
        const h = (cw.state && cw.state.chain) || {}, p = cw.page;
        if (p && pageScrapeAllowed() && Date.now() - p.at < PAGE_LOCAL_TTL_MS && p.current >= num(h.current))
            return { current: p.current, max: num(h.max), expires_at: p.expires_at, src: 'page' };
        return h;
    }
    // "current / limit" -> current (never strip the slash: "81/100" must not become 81100); else the first
    // standalone integer that isn't part of a decimal. The clock is removed first. NaN when nothing sane.
    function parseChainCount(text) {
        // (0.2.82) the bonus line ("Next bonus (10): unclaimed") and bracketed numbers are never the count
        const cleaned = String(text == null ? '' : text).replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
            .replace(/bonus[^\d]{0,20}\d[\d,]*/gi, ' ').replace(/[(\[]\s*\d[\d,]*\s*[)\]]/g, ' ');
        const slash = cleaned.match(/(\d[\d,]*)\s*\/\s*\d[\d,]*/);
        if (slash) return parseInt(slash[1].replace(/,/g, ''), 10);
        const m = cleaned.match(/(?:^|[^\d.,])(\d[\d,]{0,7})(?![\d.])/);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
    }
    // "mm:ss" / "h:mm:ss" -> ms, or null. Over 5:00 = a misread (chain timers max at 5:00).
    function parseClockMs(txt) {
        const m = String(txt == null ? '' : txt).match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
        if (!m) return null;
        const h = m[1] ? Number(m[1]) : 0, mn = Number(m[2]), sc = Number(m[3]);
        if (mn > 59 || sc > 59) return null;
        const ms = (h * 3600 + mn * 60 + sc) * 1000;
        return ms > 300000 ? null : ms;
    }
    // Torn hashes class SUFFIXES (…___a1b2), so match by PREFIX. 1) the sidebar Chain bar, 2) the faction chain box.
    function readPageChain() {
        try {
            for (const te of document.querySelectorAll('[class*="bar-timeleft"], [class*="barTimeleft"], [class*="timeleft___"]')) {
                const bar = (te.closest && (te.closest('[class*="bar___"]') || te.closest('[class*="chain"]'))) || te.parentElement;
                if (!bar || bar.closest('#hbs-panel')) continue;
                const label = bar.querySelector && (bar.querySelector('[class*="bar-name"]') || bar.querySelector('[class*="barName"]'));
                const name = ((label && label.textContent) || bar.getAttribute('aria-label') || bar.textContent || '').toLowerCase();
                if (name.indexOf('chain') === -1) continue;             // only the Chain bar, not Energy / Nerve
                const remMs = parseClockMs(te.textContent);
                if (remMs == null) continue;
                let count = NaN;
                const valEl = bar.querySelector && (bar.querySelector('[class*="bar-value"]') || bar.querySelector('[class*="barValue"]'));
                if (valEl) count = parseChainCount(valEl.textContent);
                if (!Number.isFinite(count)) count = parseChainCount(bar.textContent || '');
                if (Number.isFinite(count)) return { count, remainingMs: remMs, el: bar };
            }
            for (const box of document.querySelectorAll('[class*="chain-box"], [class*="chainBox"], [class*="chain___"]')) {
                if (box.closest('#hbs-panel')) continue;
                const t = box.textContent || '';
                if (t.toLowerCase().indexOf('chain') === -1) continue;
                const remMs = parseClockMs(t);
                if (remMs == null) continue;
                const count = parseChainCount(t);
                if (Number.isFinite(count)) return { count, remainingMs: remMs, el: box };
            }
        } catch (e) { /* Torn's page differs - the Hub's own reads carry on */ }
        return null;
    }
    function pageStop() { if (pageObs) { try { pageObs.disconnect(); } catch (e) { /* */ } } pageObs = null; pageEl = null; }
    function scanPageChain() {
        try {
            if (!modOn('chain') || !(cw.ws || cw.syncT) || !pageScrapeAllowed()) { pageStop(); return; }   // focus-only, connected-only
            const r = readPageChain();
            if (!r || !(r.count > 0) || r.remainingMs == null) return;                // no live chain on the page
            const hubRef = cw.hubAt && Date.now() - cw.hubAt < 120000 ? num((cw.state && cw.state.chain || {}).current) : 0;
            if (hubRef > 0 && (r.count < hubRef - 5 || r.count > hubRef + 500)) return;   // implausible -> misparse
            if (r.el && r.el !== pageEl) {                               // a scoped observer catches a landed hit at once
                pageStop(); pageEl = r.el;
                try { pageObs = new MutationObserver(() => { clearTimeout(scanPageChain._t); scanPageChain._t = setTimeout(scanPageChain, 200); });
                      pageObs.observe(r.el, { subtree: true, childList: true, characterData: true }); } catch (e) { /* */ }
            }
            // (A) local display
            const prev = cw.page;
            cw.page = { current: r.count, expires_at: cwNow() + Math.min(300000, r.remainingMs), at: Date.now() };
            if (!prev || prev.current !== r.count) { drawChips(); cwShow(); }
            else { const v = cwLocal(cw.page.expires_at); panel && panel.querySelectorAll('[data-cwexp]').forEach(x => { x.dataset.exp = v; }); }
            // (B) share - WebSocket only, count change at once, else once / 30 s
            if (!(cw.ws && cw.ws.readyState === 1)) return;
            const now = Date.now(), changed = r.count !== pageSentCount;
            if (!changed && now - pageSentAt < PAGE_CHAIN_MIN_MS) return;
            pageSentAt = now; pageSentCount = r.count;
            try { cw.ws.send(JSON.stringify({ t: 'chain', src: 'page', current: r.count, end_ms: cwNow() + r.remainingMs, remaining_ms: Math.min(300000, r.remainingMs) })); }
            catch (e) { /* WS only - never buffered */ }
        } catch (e) { /* never let a DOM quirk break the loop */ }
    }
    setInterval(scanPageChain, 1000);                                // 1 s backstop; the observer catches hits sooner
    const pageFocus = () => { if (pageScrapeAllowed()) { pageSentCount = -1; scanPageChain(); } else pageStop(); };
    window.addEventListener('focus', pageFocus); window.addEventListener('blur', pageFocus);
    document.addEventListener('visibilitychange', pageFocus);
    // (0.2.38) back on the tab / window: ask the Hub at once instead of waiting for the next (slowed) poll
    const cwWake = () => { if (document.hidden || !cwWanted()) return;
        if (cw.syncT && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cw.syncT = setTimeout(cwSyncRun, 50); } };
    document.addEventListener('visibilitychange', cwWake); window.addEventListener('focus', cwWake);

    // ---- ⛓ Chain tab ----
    // =====================================================================
    // 🗜 COMPACT MODE LAYOUTS (0.2.62, user: "I want to make the overall chain tab more compact, along with other tabs
    // ... better viewing on PDA" -> "#3 compact mode only", "Fold sections by default", "1. Folded by default 2. Keep
    // them as summaries", "Start with Chain and OC pages"). Only while ⚙ Display -> Compact mode is on (CMP()); the
    // normal layouts are untouched. Home / War / More still to do (user: "Then we will continue with others").
    //   cFold(key, icon, title, meta, body, alert)  a section folded to one line; meta = its summary. Open state per
    //       key in K.cfold (closed by default, remembered per device). One delegated click handler for [data-cfold].
    //   cmCard(key, icon, title, meta, alert, html) takes a normal "hbs-card with an hbs-r1 head" and, in compact mode,
    //       returns it as a fold (head stripped, body kept) - how the leaders' OC cards fold without being rewritten.
    //   The bodies keep their usual data-attributes, so chainBind / ocBind / ocLeadersBind work unchanged.
    // =====================================================================
    const CMP = () => !!uiOpt('compact');
    const cfOpen = k => !!(store.get(K.cfold, {}) || {})[k];
    function cFold(key, icon, title, meta, body, alert, defOpen) {   // defOpen (0.2.64): open until the member closes it
        const M = store.get(K.cfold, {}) || {}, o = key in M ? !!M[key] : !!defOpen;
        return cwFold(`data-cfold="${key}"${defOpen ? ' data-cfdef="1"' : ''}`, icon, title, meta, o, alert) + (o ? `<div class="hbs-foldb">${body}</div>` : '');
    }
    document.addEventListener('click', e => {
        const b = e.target && e.target.closest && e.target.closest('#hbs-panel [data-cfold]'); if (!b) return;
        const m = store.get(K.cfold, {}) || {}, k = b.dataset.cfold; m[k] = !(k in m ? m[k] : b.dataset.cfdef === '1'); store.set(K.cfold, m); render(true);
    });
    function cmCard(key, icon, title, meta, alert, html) {
        if (!CMP()) return html;
        const m = /^\s*<div class="hbs-card[^"]*"><div class="hbs-r1">[\s\S]*?<\/div>/.exec(html), e = html.lastIndexOf('</div>');
        if (!m || e < m[0].length) return html;
        return cFold(key, icon, title, meta, html.slice(m[0].length, e), alert);
    }
    // ⛓ Chain tab, compact: timer row (+ ⛶ Compact View icon) · cover strip (tap for detail) · one button row
    // (I'm hitting + 🎯 Target, ⏸ Away, 💩 Dump, Leave - icon with a tiny label under it; Leave is text only) · slim alert tiles · queue · folds (Retals, Schedule, Bonus
    // hitter, Alerts & settings, Your chain summary). X = what chainHtml already worked out.
    async function chainCompactHtml(X) {
        const { S, c, cfg, turn, bonus, rw, q, st, nm, live, hubAge } = X, lead = !!(S.me || {}).is_leader;
        let out = hubAge > 75000 ? `<div class="hbs-banner hbs-warnb">⚠ No update from the Hub for <b>${dur(hubAge / 1000)}</b> - may be out of date. Asking again…</div>` : '';
        const go = live && bonus.next ? Math.max(0, num(bonus.next) - c.current) : 0, pc = num(bonus.pace_per_min);
        const conn = cw.ws && cw.ws.readyState === 1 ? ['', 'Live'] : cw.syncT ? [' poll', 'Polling'] : [' off', 'Offline'];
        const sub = !live ? (S.cooldown && S.cooldown.until ? `next chain in <b data-exp="${cwLocal(S.cooldown.until)}">-</b>` : 'no active chain')
            : cwVerifyAt && cwLeft() <= 0 ? 'timer ran out - checking…'
            : bonus.next ? `🎯 bonus ${int(bonus.next)} · <b>${int(go)}</b> to go${pc > 0 ? ` · ~${dur(go / pc * 60)}` : ''}` : 'left on the timer';
        out += `<div class="hbs-card hbs-hero"><div class="hbs-cmtop">
            <div class="hbs-cmt${live ? '' : ' dead'}">${live ? `<span data-cwexp data-exp="${cwLocal(c.expires_at)}" data-zero="00:00">-</span>` : '00:00'}</div>
            <div class="hbs-cmi"><b>⛓ ${live ? int(c.current) + ' / ' + int(c.max) : 'No live chain'}</b><small>${sub}</small></div>
            <span class="hbs-cmdot${conn[0]}" title="${conn[1]}">●</span>
            <button type="button" class="hbs-btn${cvOptOpen ? '' : ' hbs-ghost'} hbs-cmic" data-cvopt title="Compact View - a small tab on the screen edge">⛶</button></div>
            ${cw.err ? `<div class="hbs-hint">${esc(cw.err)}</div>` : ''}`;
        if (live && turn.up) out += `<div class="hbs-cmup">Up: ${nm(turn.up)}${num(turn.up) === me.id ? ' <b class="hbs-good">(you)</b>' : ''}${turn.backup ? ` · Backup: ${nm(turn.backup)}${num(turn.backup) === me.id ? ' <b class="hbs-good">(you)</b>' : ''}` : ''}</div>`;
        if (live && bonus.next && c.current >= num(bonus.warn_from))
            out += `<div class="hbs-banner">🎯 Bonus hit <b>${int(bonus.next)}</b> in ${int(bonus.next - c.current)}${bonus.name ? ` · taken by <b>${esc(bonus.name)}</b>` : ''}
                ${bonus.pid && c.current === bonus.next - 1 && num(bonus.pid) !== me.id ? '<br><b>Hold - the bonus is theirs</b>' : ''}</div>`;
        else if (bonus.pid) out += `<div class="hbs-bonusline">★ Bonus <b>${bonus.next ? int(bonus.next) : ''}</b> → <b>${esc(bonus.name || '#' + bonus.pid)}</b>
            ${lead ? ' <button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cwbonusclr>Clear</button>' : ''}</div>`;
        // queue cover as ONE line (user: "'Queue can't cover chain' window could be rendered smaller"); tap = the detail
        if (rw) {
            const mins = rw.hours != null ? Math.max(0, Math.round(+rw.hours * 60)) : null;
            const canNow = q.filter(x => x.can_hit !== false && !x.away && !x.inactive && (!x.presence || x.presence === 'active') && (() => { const e = cwEnergy(x); return e && e.cur >= 25; })()).length;
            const lvl = mins == null ? 'ok' : mins < 15 ? 'low' : mins < 30 ? 'warn' : 'ok';
            const span = mins == null ? '' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}`;
            const head = mins == null ? 'Covered - regen keeps pace' : mins === 0 ? "Can't cover" : `Covered ~${span}`, o = cfOpen('cwcov');
            out += `<div class="hbs-cover ${lvl} hbs-cmcov${o ? ' open' : ''}" data-cfold="cwcov" role="button"><b>${lvl === 'low' ? '⚠' : lvl === 'warn' ? '⏳' : '✓'} ${head}</b>
                <span>· ${int(rw.banked_hits)} hit${num(rw.banked_hits) === 1 ? '' : 's'} · ${canNow}/${q.length} can hit</span><em>${o ? '▾' : '▸'}</em></div>`
                + (o ? `<div class="hbs-cover ${lvl} hbs-cmcovd"><div class="d">${mins ? `Holds the chain at the slowest safe pace until ~${tzClock(Math.floor(cwNow() / 1000) + mins * 60)} ${tzTagH()}. ` : mins === 0 ? 'No hits ready in the queue right now. ' : ''}
                    ${int(rw.banked_hits)} hits ready · ${canNow} of ${q.length} can hit now${bonus.next ? ` · <span class="${rw.bonus_reachable ? 'y' : 'n'}">bonus ${int(bonus.next)} ${rw.bonus_reachable ? 'in reach ✓' : 'out of reach ✗'}</span>` : ''}</div></div>` : '');
        }
        out += cw.queued ? `<div class="hbs-actions hbs-cmact">${hitBtn('chain')}
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="target" title="Find target - open a weak target's attack page (level 1-3, inactive 60+ days)">🎯<small>Target</small></button>
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="away" title="${(q.find(x => num(x.pid) === me.id) || {}).away ? "I'm back" : 'Away - skip me for now'}">${(q.find(x => num(x.pid) === me.id) || {}).away ? '↩<small>Back</small>' : '⏸<small>Away</small>'}</button>${dmBtnHtml().replace('💩</button>', '💩<small>Dump</small></button>')}
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="leave" title="Leave the queue"><small class="only">Leave</small></button></div>`
            : `<div class="hbs-actions hbs-cmact"><button type="button" class="hbs-btn" data-cw="join">Join the queue</button></div>`;
        out += '</div>' + cvChainHtml().replace(/^<div class="hbs-actions">[\s\S]*?<\/div>/, '');   // the ⛶ options card (when open), without its own button
        { const mineQ = q.find(x => num(x.pid) === me.id);
          if (mineQ && !mineQ.stats && (cw.statsErr || !cwStatsCached(600000)))
            out += `<div class="hbs-banner hbs-warnb">⚠ <b>Your energy and cooldowns aren't reaching the queue.</b>
                ${cw.statsErr ? `Torn said: <i>${esc(cw.statsErr)}</i>. ` : ''}Needs a <b>Limited Access</b> key or higher, and Torn open in a visible tab.
                <div class="hbs-actions"><button type="button" class="hbs-btn hbs-mini" data-cw="statsretry">↻ Try again</button></div></div>`; }
        const qOk = q.filter(x => !x.away && !x.inactive && (!x.presence || x.presence === 'active'));
        const capHits = qOk.reduce((a, x) => { const e = cwEnergy(x); return a + (e ? Math.floor(e.cur / 25) : 0); }, 0);
        out += dmLineHtml() + `<div class="hbs-cmal">${cwAlTilesHtml(cfg)}</div>`;
        out += `<div class="hbs-sec hbs-cmq"><span>Queue · ${q.length}</span>${q.length ? `<span class="hbs-cap${capHits === 0 ? ' low' : capHits < 5 ? ' warn' : ''}">${qOk.length ? `⚡ ~${int(capHits)} hits · ${qOk.length} online` : '⚠ no watchers online'}</span>` : ''}</div>`
            + (q.length ? cwQueueHtml(q, st, turn, bonus) : '<div class="hbs-hint">Nobody queued.</div>');
        out += retalsHtml() + schedHtml();
        // ★ Bonus hitter (leaders): the Assign select lives in a fold
        if (lead && (S.me || {}).members) out += cFold('cwbonus', '★', 'Bonus hitter', bonus.pid ? `<span class="hbs-foldme">${esc(bonus.name || '#' + bonus.pid)}</span>` : '<small>not assigned</small>',
            `<div class="hbs-actions"><select class="hbs-input" data-cwbonus><option value="">🎯 Assign bonus…</option><option value="clear">Clear</option>
                ${S.me.members.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })).map(m => `<option value="${m.pid}">${esc(m.name)}</option>`).join('')}</select></div>`, false);
        // ⚙ Alerts & settings: Configure alerts, Test, leaders' Chain settings
        const cfgUrl = lead && cfg.edit_url ? String(cfg.edit_url) : '';
        out += cFold('cwset', '⚙', 'Alerts & settings', `<small>${[cfg.topAlertSeconds, cfg.restAlertSeconds, cfg.thirdAlertSeconds].filter(x => num(x) > 0).map(mSec).join(' / ')} · min ${int(cfg.minChain)}</small>`,
            `<div class="hbs-actions"><button type="button" class="hbs-btn${alOpen ? '' : ' hbs-ghost'}" data-alopen>⚙ Configure alerts</button>${alOpen ? '' : '<button type="button" class="hbs-btn hbs-ghost" data-cw="test">🔔 Test my alerts</button>'}
                ${lead ? `<button type="button" class="hbs-btn${cwCfg.open ? '' : ' hbs-ghost'}" data-cwcfgopen>🛠 Chain settings ${cwCfg.open ? '▾' : '▸'}</button>` : ''}</div>` + cwCfgHtml(cfg, cfgUrl) + alertsCfgHtml(), false);
        // (0.2.75) "Your chain summary" lives on the History tab only
        out += `<div class="hbs-hint" style="margin-top:8px">📜 Your chain summary is on the <b>History</b> tab (••• More).</div>`;
        return out;
    }
    // 🕵 OC tab, compact: your crime as one card - name · status, role · CPR · difficulty, "joined at" pay on the right,
    // four tiles, and Seats & pay (Normal vs Joined at + every seat) folded
    function ocCmHero(cur) {
        const p = cur.pay || {}, open = num(cur.filled) < num(cur.seats);
        return `<div class="hbs-card hbs-hero hbs-cm4"><div class="hbs-cmtop">
            <div class="hbs-cmi"><b>${esc(cur.crime)} <span class="hbs-chip">${esc(cur.status)}</span></b>
                <small>${esc(cur.position)}${cur.rate != null ? ` · <b>${cur.rate}%</b> CPR` : ''}${cur.difficulty != null ? ` · difficulty ${esc(String(cur.difficulty))}` : ''}</small></div>
            ${p.pay_day ? `<div class="hbs-cmpay"><b>${shortMoney(p.pay_day)}</b><small>${p.yours ? 'joined at' : 'pay'} / day</small></div>` : ''}</div>
            ${rsTiles([[`${cur.filled}/${cur.seats}`, 'Filled'], [Math.round(cur.progress) + '%', 'Planning'], [cur.success != null ? Math.round(cur.success) + '%' : '-', 'Team'],
                cur.ready_at ? [`<span data-until="${ocEarliest(cur)}">-</span>`, open ? 'Earliest' : 'Ready in'] : null])}
            ${cFold('ocseats', '💺', 'Seats & pay', `<small>${cur.filled}/${cur.seats} filled${p.normal ? ` · normal ${shortMoney(p.normal)}` : ''}</small>`,
                payHero(cur.pay, 0, false, true) + (cur.ready_at ? `<div class="hbs-hint">${open ? 'Earliest ready time' : 'Ready'}: ${ocWhen(ocEarliest(cur))}</div>` : '')
                + slotsHtml(cur).replace(/^<div class="hbs-sec">[^<]*<\/div>/, ''), false)}
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${OC_LINK(cur.crime_id)}">Open the crime</a></div></div>`;
    }
    // ✅ RECENTLY COMPLETED (0.2.68) - see build note above. Tags: Paid (green) · No payout (failed, or nothing to share) ·
    // Awaiting payout (unpaid, not late / not staff) · Not paid <how long> (red - late, staff only).
    async function ocRecentHtml() {
        let R = null;
        // [HB Suite] Hub API — op live "recent" (OC tab: the last completed crimes and their payout state; no Torn call)
        try { R = await live('recent'); } catch (e) { return ''; }
        const rows = (R && R.rows) || []; if (!rows.length) return '';
        const late = rows.filter(r => r.late).length, unpaid = rows.filter(r => r.unpaid).length;
        const tag = r => r.late ? `<span class="hbs-tag hbs-red">Not paid · ${dur(Math.max(0, Date.now() / 1000 - r.at))}</span>`
            : r.unpaid ? '<span class="hbs-tag">Awaiting payout</span>' : r.paid ? '<span class="hbs-tag hbs-good">Paid</span>' : '<span class="hbs-tag">No payout</span>';
        const list = rows.map(r => `<div class="hbs-li"><span style="min-width:0"><a href="${OC_LINK(r.id)}"><b>${esc(r.name || '?')}</b></a>
            <small style="display:block;opacity:.7;font-size:10.5px">${r.ok ? 'Success' : 'Failed'} · ${ago(r.at)}${r.money ? ' · ' + shortMoney(r.money) : ''}${r.items ? ` · ${r.items} item${r.items === 1 ? '' : 's'}` : ''}</small></span>${tag(r)}</div>`).join('');
        const head = late ? `<span class="hbs-chip" style="background:#5f2f2f;color:#ffbcbc">${late} unpaid</span>` : '';
        if (CMP()) return cFold('ocrecent', '✅', 'Recently completed', late ? `<b class="hbs-foldn">${late}</b><small>unpaid</small>` : `<small>${rows.length} crime${rows.length === 1 ? '' : 's'}${unpaid ? ` · ${unpaid} awaiting payout` : ' · all paid'}</small>`, list, late > 0);
        return `<div class="hbs-card${late ? ' hbs-red' : ''}"><div class="hbs-r1"><span class="hbs-name">✅ Recently completed</span>${head}</div>
            ${late ? `<div class="hbs-hint">${late} crime${late === 1 ? " hasn't" : "s haven't"} been paid out after more than an hour.</div>` : ''}${list}</div>`;
    }
    async function chainHtml() {
        if (!modOn('chain')) return `<div class="hbs-empty">The Chain module is off - turn it on in ⚙.</div>`;
        if (cw.denied) return `<div class="hbs-empty">Chain Watch refused this account (${esc(cw.denied)}).</div>`;
        cwWatch();
        const S = cw.state;   // (a restored snapshot shows the timer at once on a page load, until the Hub answers)
        if (!S) return `<div class="hbs-empty">${esc(cw.step || 'Connecting to Chain Watch…')}${cw.err ? `<div class="hbs-msg">${esc(cw.err)}</div>` : ''}
            <div class="hbs-actions" style="justify-content:center"><button type="button" class="hbs-btn hbs-ghost" data-cw="retry">↻ Retry now</button></div></div>`;
        const c = cwChain(), cfg = S.config || {}, turn = S.turn || {}, bonus = S.bonus || {}, rw = S.runway || null;
        let q = S.queue || [];
        const st = S.status || {}, N = await names().catch(() => ({ byId: {} }));
        // an optimistic join / leave shows at once, before the Hub's list catches up (as in Chain Watch 4.20.6)
        if (cw.optimistic && Date.now() - cw.optimistic.at < 20000) {
            if (!cw.optimistic.queued) q = q.filter(x => num(x.pid) !== me.id);
            else if (!q.some(x => num(x.pid) === me.id)) q = q.concat([{ pid: me.id, name: me.name, energy: null, can_hit: true }]);
        }
        const nm = pid => `<a href="#" data-prof="${num(pid)}">${esc(((q.find(x => num(x.pid) === num(pid)) || {}).name) || nameOf(N, pid))}</a>`;   // name -> profile (0.2.4)
        const live = c.current > 0;
        // STALE HUB DATA (0.2.38, user: "Chain is showing inactive when not in focus, meanwhile there's an active chain"):
        // if the Hub hasn't been heard from for over 75 s (a background tab's timers are slowed by the browser, or the
        // connection dropped) the tab says so instead of showing an old "No live chain" as fact - and asks again now.
        const hubAge = cw.lastMsg ? Date.now() - cw.lastMsg : 0;
        if (hubAge > 75000) cwSyncSoon();
        if (CMP()) return await chainCompactHtml({ S, c, cfg, turn, bonus, rw, q, st, nm, live, hubAge });   // (0.2.62) compact-mode layout
        // (0.2.55, user: "Compact View goes to the top of the chain page.") ⛶ Compact View button + options first (0.2.42: it sat at the bottom)
        let out = cvChainHtml() + (hubAge > 75000 ? `<div class="hbs-banner hbs-warnb">⚠ No update from the Hub for <b>${dur(hubAge / 1000)}</b> - what's below may be out of date. Asking again…</div>` : '')
            + `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">⛓ ${live ? int(c.current) + ' / ' + int(c.max) : 'No live chain'}</span>
            <span class="hbs-chip">${cw.ws && cw.ws.readyState === 1 ? '● Live' : cw.syncT ? '● Polling' : '○ Offline'}</span></div>${cw.err ? `<div class="hbs-hint">${esc(cw.err)}</div>` : ''}`;
        if (live) out += `<div class="hbs-big"><span data-cwexp data-exp="${cwLocal(c.expires_at)}" data-zero="00:00">-</span><small>${cwVerifyAt && cwLeft() <= 0 ? 'timer ran out - checking with the Hub…' : 'left on the timer' + (c.src === 'page' ? ' · live from your Torn page' : '')}</small></div>`;
        else out += `<div class="hbs-big hbs-dead">00:00<small>no active chain</small></div>`   // (0.2.22, user: "Show 00:00 when no active chain")
            + (S.cooldown && S.cooldown.until ? `<div class="hbs-sub">Next chain can start in <b data-exp="${cwLocal(S.cooldown.until)}">-</b></div>` : '');
        // 🎯 CHAIN GOAL (0.2.31, user approved: "hits left to the next bonus and an estimated time to reach it at the current
        // pace"): from the Hub (bonus.to_go / pace_per_min over the last 15 min / eta_s); pace needs a few minutes of hits
        if (live && bonus.next) { const go = Math.max(0, num(bonus.next) - c.current), pc = num(bonus.pace_per_min);
            out += `<div class="hbs-goal"><span>🎯 Next bonus <b>${int(bonus.next)}</b></span><span><b>${int(go)}</b> hits to go</span>
                <span>${pc > 0 ? `~<b>${dur(go / pc * 60)}</b> at ${pc >= 10 ? pc.toFixed(0) : pc.toFixed(1)} hits/min` : 'pace: not enough hits yet'}</span></div>`; }
        if (live && turn.up) out += kv([['Up now', nm(turn.up) + (num(turn.up) === me.id ? ' <b class="hbs-good">(you)</b>' : '')],
                                         turn.backup ? ['Backup', nm(turn.backup) + (num(turn.backup) === me.id ? ' <b class="hbs-good">(you)</b>' : '')] : null]);
        if (live && bonus.next && c.current >= num(bonus.warn_from))
            out += `<div class="hbs-banner">🎯 Bonus hit <b>${int(bonus.next)}</b> in ${int(bonus.next - c.current)}${bonus.name ? ` · taken by <b>${esc(bonus.name)}</b>` : ''}
                ${bonus.pid && c.current === bonus.next - 1 && num(bonus.pid) !== me.id ? '<br><b>Hold - the bonus is theirs</b>' : ''}</div>`;
        // (0.2.18 FIX, user: "Assigning chain bonus doesn't work"): the Hub took the assignment, but the Suite only showed
        // it once the chain was near the bonus - so nothing seemed to happen. Now an assigned bonus always shows here
        // (and as ★ BONUS in the queue); leaders get a Clear button.
        else if (bonus.pid) out += `<div class="hbs-bonusline">★ Bonus hit <b>${bonus.next ? int(bonus.next) : ''}</b> assigned to <b>${esc(bonus.name || '#' + bonus.pid)}</b>${bonus.by ? ` <small>· by ${esc(String(bonus.by).replace(/ \[\d+\]$/, ''))}</small>` : ''}
            ${(S.me || {}).is_leader ? ' <button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cwbonusclr>Clear</button>' : ''}</div>`;
        // QUEUE RUNWAY (0.2.22, user: "Keep the Queue information, but format it professionally"): four labelled stats -
        // hits banked in the queue's energy, regen per hour, how long that lasts at the slowest safe pace (∞ = regen
        // keeps up), and whether the next bonus is within reach of the banked hits
        // QUEUE COVER (0.2.40, user: "Is there a better way to show/represent this in the chain watcher?" -> one headline:
        // how long the queue can hold the chain at the slowest safe pace, until when (TCT / Local - the ⚙ time setting),
        // and why: hits ready, how many watchers can hit now, and whether the next bonus is in reach ("Add the 'Bonus 25
        // in reach' notification to the new headlines. Remove the 'next hit regenerates' line."). Red under 15 min,
        // amber under 30, green above; "regen keeps pace" when the queue's regen alone holds the chain. Replaces the
        // four tiles (hits banked / regen per hour / runway / bonus).
        if (rw) {
            const mins = rw.hours != null ? Math.max(0, Math.round(+rw.hours * 60)) : null;
            const canNow = q.filter(x => x.can_hit !== false && !x.away && !x.inactive && (!x.presence || x.presence === 'active') && (() => { const e = cwEnergy(x); return e && e.cur >= 25; })()).length;
            const lvl = mins == null ? 'ok' : mins < 15 ? 'low' : mins < 30 ? 'warn' : 'ok';
            const span = mins == null ? '' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}`;
            const until = mins == null || !mins ? '' : `until ~${tzClock(Math.floor(cwNow() / 1000) + mins * 60)} ${tzTagH()}`;
            const head = mins == null ? 'Queue covers the chain - regen keeps pace' : mins === 0 ? "Queue can't cover the chain right now" : `Queue covers about ${span}`;
            const bon = bonus.next ? `<span class="${rw.bonus_reachable ? 'y' : 'n'}">bonus ${int(bonus.next)} ${rw.bonus_reachable ? 'in reach ✓' : 'out of reach ✗'}</span>` : '';
            out += `<div class="hbs-cover ${lvl}"><div class="h"><i>${lvl === 'low' ? '⚠' : lvl === 'warn' ? '⏳' : '✓'}</i><b>${head}</b>${until ? `<span>${until}</span>` : ''}</div>
                <div class="d">${int(rw.banked_hits)} hit${num(rw.banked_hits) === 1 ? '' : 's'} ready · ${canNow} of ${q.length} can hit now${bon ? ' · ' + bon : ''}</div></div>`;
        }
        out += `<div class="hbs-actions">${cw.queued ? `<button type="button" class="hbs-btn hbs-ghost" data-cw="leave">Leave queue</button>
                ${hitBtn('chain')}
                <button type="button" class="hbs-btn hbs-ghost" data-cw="target" title="Open a weak target's attack page (level 1-3, inactive 60+ days - same pick as Panic Mode)">🎯 Find target</button>
                <button type="button" class="hbs-btn hbs-ghost" data-cw="away">${(q.find(x => num(x.pid) === me.id) || {}).away ? '↩ Back' : '⏸ Away'}</button>${dmBtnHtml()}`
            : `<button type="button" class="hbs-btn" data-cw="join">Join the queue</button>`}
            ${(S.me || {}).is_leader && (S.me || {}).members ? `<select class="hbs-input" data-cwbonus><option value="">🎯 Assign bonus…</option><option value="clear">Clear</option>
                ${S.me.members.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))   // (0.2.19, user: "Sort bonus chain hit selections alphabetically")
                    .map(m => `<option value="${m.pid}">${esc(m.name)}</option>`).join('')}</select>` : ''}</div></div>`;
        // queue (in the Hub's order - never re-sorted)
        // ⚠ NO ENERGY INFO (0.2.37, user: "an alert should appear on the Chain page when joining the queue"): while you're
        // queued and the Hub has no energy / cooldown reading from you - why (Torn's own error text when the read failed)
        // and what to do. The Hub already lists members without a reading after everyone whose energy is known, and
        // before idle / offline members.
        { const mineQ = q.find(x => num(x.pid) === me.id);
          if (mineQ && !mineQ.stats && (cw.statsErr || !cwStatsCached(600000)))
            out += `<div class="hbs-banner hbs-warnb">⚠ <b>Your energy and cooldowns aren't reaching the queue.</b>
                ${cw.statsErr ? `Torn said: <i>${esc(cw.statsErr)}</i>. ` : ''}Chain Watch reads them with your own key on this device (bars, cooldowns, refills) -
                that needs a <b>Limited Access</b> key or higher, and Torn open in a visible tab. Until then you're listed after members whose energy is known.
                <div class="hbs-actions"><button type="button" class="hbs-btn hbs-mini" data-cw="statsretry">↻ Try again</button></div></div>`; }
        // QUEUE (0.2.18, user: "Bring back some of the UI elements of the chain watching script. Include the Energy Count,
        // Energy Symbol for Refill availability, Energy Can for Booster Cooldown, Drug Cooldown reading ... Improve the
        // queue list UI."): Chain Watch 4.20.6 rows - position, name + tags (UP / backup / ★ BONUS / hitting / away /
        // idle / can't attack), hits available from energy on the right; second line ⚡ energy now/max (the bolt greys
        // out when the daily refill is used), 🌿 drug cooldown and 🥫 booster cooldown (✓ = free). Energy and cooldowns
        // run on from the member's last reading (stats.at). Still in the Hub's order - never re-sorted.
        const qOk = q.filter(x => !x.away && !x.inactive && (!x.presence || x.presence === 'active'));
        const capHits = qOk.reduce((a, x) => { const e = cwEnergy(x); return a + (e ? Math.floor(e.cur / 25) : 0); }, 0);
        out += dmLineHtml();         // (0.2.48) 💩 dumping: confirm line / progress / STOP banner
        out += cwAlTilesHtml(cfg);   // (0.2.47) alert timers + minimum chain, under the chain panel
        out += sec(`Queue · ${q.length}`) + (q.length ? `<div class="hbs-cap${capHits === 0 ? ' low' : capHits < 5 ? ' warn' : ''}">${qOk.length ? `⚡ ~${int(capHits)} hits available · ${qOk.length} online` : '⚠ no watchers online'}</div>`
            + cwQueueHtml(q, st, turn, bonus)   // (0.2.60) podium + "also queued" tiles - see cwQueueHtml
            : '<div class="hbs-hint">Nobody queued.</div>');
        out += retalsHtml();
        out += schedHtml();
        // ⚙ Configure alerts (0.2.3) - the per-alert settings open under the button; 🔔 Test sits inside them
        // (0.2.19, user: "Add Chain Settings button for leadership") leaders: 🛠 Chain settings opens the Leaders Hub's
        // Chain Watch settings page (alert times, min chain, bonus heads-up...) in a new tab - the Hub's own sign-in
        // decides who may save; this only shows the button to leaders
        const cfgUrl = (S.me || {}).is_leader && cfg.edit_url ? String(cfg.edit_url) : '';
        out += `<div class="hbs-actions"><button type="button" class="hbs-btn${alOpen ? '' : ' hbs-ghost'}" data-alopen>⚙ Configure alerts</button>${alOpen ? '' : '<button type="button" class="hbs-btn hbs-ghost" data-cw="test">🔔 Test my alerts</button>'}
            ${(S.me || {}).is_leader ? `<button type="button" class="hbs-btn${cwCfg.open ? '' : ' hbs-ghost'}" data-cwcfgopen>🛠 Chain settings ${cwCfg.open ? '▾' : '▸'}</button>` : ''}</div>`
            + cwCfgHtml(cfg, cfgUrl)
            + alertsCfgHtml();   // (↻ Try live again removed - user, Nov 14 2026)
        // alert times as minutes + seconds (user, Nov 14 2026: "Show alerts as minutes ... 1m 45s, 1m 15s, 45s")
        out += `<div class="hbs-hint" style="margin-top:8px">📜 Your chain summary is on the <b>History</b> tab (••• More).</div>`;   // (0.2.75) was the summary itself - History tab only now
        out += `<div class="hbs-hint">Alerts: ${[cfg.topAlertSeconds, cfg.restAlertSeconds, cfg.thirdAlertSeconds].filter(x => num(x) > 0).map(mSec).join(' / ')} left · min chain ${int(cfg.minChain)}</div>`;   // (0.2.19: "change on the Hub" link -> the 🛠 Chain settings button)
        return out;
    }
    // 🛠 CHAIN SETTINGS (0.2.20, user: "Dropdown for 'Chain Settings' to allow leaders to change the settings in the
    // script."): leaders only. Opens under the button; the same faction-wide settings + checks as the Leaders Hub page
    // (Hub op "cwcfg" -> D1 oc_config 'chainwatch'), and the Hub pushes them to every connected script at once. What
    // you type is kept in a draft while the panel is open, so the Hub's live updates don't wipe it.
    const cwCfg = { open: false, draft: null, saving: false, err: '' };
    const CWCFG_F = [   // [key, label, hint, min, max]
        ['topAlertSeconds', '1st alert', 'seconds left on the timer', 10, 300], ['restAlertSeconds', '2nd alert', 'seconds left', 5, 300],
        ['thirdAlertSeconds', '3rd alert (final)', 'seconds left - also sent while someone is "hitting"', 5, 300],
        ['minChain', 'Minimum chain', 'no alerts (not even "You\'re up") below this count', 0, 100000],
        ['bonusWarnHits', 'Bonus heads-up', 'show the bonus banner this many hits before (0 = off)', 0, 50]];
    function cwCfgHtml(cfg, url) {
        if (!cwCfg.open || !((cw.state || {}).me || {}).is_leader) return '';
        const d = cwCfg.draft || (cwCfg.draft = Object.assign({}, ...CWCFG_F.map(([k]) => ({ [k]: num(cfg[k]) })), { firstAlertPrimaryOnly: !!cfg.firstAlertPrimaryOnly,
            dumpOn: !!cfg.dumpOn, dumpCover: cfg.dumpCover !== false, dumpBuffer: num(cfg.dumpBuffer) || 10 }));   // (0.2.48) 💩 Dumping hits
        return `<div class="hbs-card hbs-cwcfg"><div class="hbs-sub"><b>Faction chain settings</b> - for everyone's Chain Watch. Saved on the Hub and sent to every connected script at once.</div>
            ${CWCFG_F.map(([k, l, h, lo, hi]) => `<label class="hbs-cfgrow"><span><b>${l}</b><small>${h}</small></span>
                <span class="hbs-cfgin"><input class="hbs-input" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" data-cwcfg="${k}" value="${esc(String(d[k]))}">${/Seconds$/.test(k) ? `<small data-cwcfgm="${k}">${mSec(d[k])}</small>` : ''}</span></label>`).join('')}
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="firstAlertPrimaryOnly"${d.firstAlertPrimaryOnly ? ' checked' : ''}> 1st alert to who's up only <small>(off = everyone active in the queue)</small></label>
            <div class="hbs-sub" style="margin-top:8px"><b>💩 Dumping hits</b> - members burning their energy before going offline; the hits before each bonus stay protected.</div>
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="dumpOn"${d.dumpOn ? ' checked' : ''}> Dumping on <small>(shows the 💩 button to queued members)</small></label>
            <label class="hbs-cfgrow"><span><b>Protected hits before a bonus</b><small>nobody can dump into these</small></span>
                <span class="hbs-cfgin"><input class="hbs-input" type="number" inputmode="numeric" min="1" max="100" step="1" data-cwcfg="dumpBuffer" value="${esc(String(d.dumpBuffer))}"></span></label>
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="dumpCover"${d.dumpCover ? ' checked' : ''}> Cover the attack button <small>(dumpers only, inside the protected hits - one tap uncovers it)</small></label>
            ${cwCfg.err ? `<div class="hbs-hint hbs-bad">⚠ ${esc(cwCfg.err)}</div>` : ''}
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-cwcfgsave${cwCfg.saving ? ' disabled' : ''}>${cwCfg.saving ? 'Saving…' : '💾 Save for everyone'}</button>
                <button type="button" class="hbs-btn hbs-ghost" data-cwcfgundo>Undo changes</button></div>
            <div class="hbs-hint">${cfg.set_by ? `Last changed by ${esc(String(cfg.set_by).replace(/ \[\d+\]$/, ''))}${num(cfg.set_at) ? ' · ' + fmtDT(Math.floor(num(cfg.set_at) / 1000)) + ' ' + tzTagH() : ''}` : 'Defaults - nobody has changed them yet.'}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">open on the Hub</a>` : ''}</div></div>`;
    }
    function cwCfgBind() {
        const o = bodyEl.querySelector('[data-cwcfgopen]');
        if (o) o.addEventListener('click', () => { cwCfg.open = !cwCfg.open; cwCfg.draft = null; cwCfg.err = ''; render(true); });
        bodyEl.querySelectorAll('[data-cwcfg]').forEach(i => i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => {
            if (!cwCfg.draft) return; const k = i.dataset.cwcfg;
            cwCfg.draft[k] = i.type === 'checkbox' ? i.checked : i.value === '' ? '' : Number(i.value);
            const m = bodyEl.querySelector(`[data-cwcfgm="${k}"]`); if (m) m.textContent = i.value === '' ? '' : mSec(i.value);
        }));
        const u = bodyEl.querySelector('[data-cwcfgundo]'); if (u) u.addEventListener('click', () => { cwCfg.draft = null; cwCfg.err = ''; render(true); });
        const sv = bodyEl.querySelector('[data-cwcfgsave]'); if (sv) sv.addEventListener('click', async () => {
            const d = cwCfg.draft; if (!d || cwCfg.saving) return;
            // the Hub checks the same rules; checked here too so the leader sees why at once
            const bad = CWCFG_F.find(([k, , , lo, hi]) => d[k] === '' || !Number.isFinite(Number(d[k])) || Number(d[k]) < lo || Number(d[k]) > hi);
            if (bad) { cwCfg.err = `${bad[1]} must be ${bad[3]}-${bad[4]}.`; render(true); return; }
            if (!(d.topAlertSeconds > d.restAlertSeconds && d.restAlertSeconds > d.thirdAlertSeconds)) { cwCfg.err = 'Alerts must go down: 1st > 2nd > 3rd.'; render(true); return; }
            if (!(Number(d.dumpBuffer) >= 1 && Number(d.dumpBuffer) <= 100)) { cwCfg.err = 'Protected hits before a bonus must be 1-100.'; render(true); return; }
            cwCfg.saving = true; cwCfg.err = ''; render(true);
            try {
                const r = await hub('cwcfg', { do: 'put', data: d });   // [HB Suite] Hub API - op "cwcfg" put (leaders: Chain Watch settings)
                if (cw.state && r && r.config) cw.state.config = Object.assign({}, cw.state.config || {}, r.config);   // shows at once (the Hub's push follows)
                cwCfg.draft = null; cwCfg.open = false;
                toast(r && r.pushed === false ? '🛠 Chain settings saved - scripts get them on their next update.' : '🛠 Chain settings saved and sent to everyone.', true);
            } catch (e) { cwCfg.err = (e && e.message) || 'Could not save.'; }
            cwCfg.saving = false; render(true);
        });
    }
    // every Chain Watch button (Chain tab + the pinned tile) goes through here
    // live energy / cooldowns from a member's last stats reading (Chain Watch 4.20.6 liveEnergy / liveCd)
    function cwEnergy(x) {
        const s = x && x.stats; if (!s || s.energyMax == null) return x && x.energy != null ? { cur: num(x.energy), max: null } : null;
        if (x.energy != null) return { cur: num(x.energy), max: num(s.energyMax) };   // the Hub's own projection (hits taken off)
        let cur = num(s.energyCur); const max = num(s.energyMax), inc = num(s.energyInc) || 5, iv = num(s.energyInt) || 600, first = num(s.energyTick) || iv, at = num(s.at);
        if (at && cur < max) { const el = (Date.now() - at) / 1000; if (el >= first) cur = Math.min(max, cur + inc * (1 + Math.floor((el - first) / iv))); }
        return { cur, max };
    }
    const cwCd = (secs, at) => secs == null ? 0 : Math.max(0, num(secs) - Math.floor((Date.now() - num(at)) / 1000));
    const cwFmtCd = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec % 60).padStart(2, '0')}`; };
    const CW_WEED = '<svg class="hbs-ic" viewBox="0 0 24 24" aria-label="drug"><g fill="#5fbf6a"><path d="M12 22C11 14 11 6 12 2C13 6 13 14 12 22Z"/><path d="M12 22C9 15 6 10 3 8C7 10 10 15 12 22Z"/><path d="M12 22C15 15 18 10 21 8C17 10 14 15 12 22Z"/><path d="M12 22C8 17 4 15 1 15C5 16 9 18 12 22Z"/><path d="M12 22C16 17 20 15 23 15C19 16 15 18 12 22Z"/></g><path d="M12 21.5V24" stroke="#7a5230" stroke-width="1.2" fill="none"/></svg>';
    const CW_CAN = '<img class="hbs-ic" src="https://www.torn.com/images/items/555/large.png" alt="booster" loading="lazy" onerror="this.replaceWith(\'🥫\')">';   // Torn's energy can (item 555)
    // =====================================================================
    // ⛓ QUEUE LAYOUT (0.2.60). User's choices, Nov 16 2026: layout "B3" (podium + chips, icons only, a timer only
    // while it counts); "Medical can be shown. No tap behavior."; cooldowns "use decimals until it reaches 1h ...
    // 1.2h 1.1h 1h, 59m, 58m. Don't count seconds."; "Let the dot carry the tag for Online/Idle. Show the Offline tag
    // still. Tags can rotate between members with multiple of them." + "Urgent tags take priority."; "Drop the table,
    // continue with the 'Also Queued' members tiles"; "Only create the ... also-queued when the users exist"; a small
    // "You're #N" note; "Click energy values to switch to 'Hits Available' and show as '5 hits'" (hits = energy / 25
    // rounded down - "Don't account for energy sources that haven't been used yet"); the "⚡ ~N hits available" line
    // above the queue stays.
    //   - still the Hub's order, never re-sorted; nothing here calls Torn or the Hub.
    //   - icons: drug, booster, medical, refill as small currentColor SVGs. class free (green) / cd (amber + timer) /
    //     off (grey: refill used, or the value isn't known - e.g. medical from a script older than 0.2.60).
    //   - a cooldown span carries data-cdend (ms it ends) and is re-timed every 15 s by cwQueueTick (minutes only).
    //   - tags: urgent = can't hit (Hospital / Traveling / Jail + time), HITTING, UP - the first of those is shown
    //     alone. Otherwise BACKUP, ★ BONUS, 💩, Away, Offline, you take turns every 3 s (data-rot, cwQueueTick).
    // =====================================================================
    const CW_ICO = {
        drug: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.6l4.8 4.8" stroke="currentColor" stroke-width="2"/></svg>',
        booster: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="10" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h10M10 2.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        medical: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
        refill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L4.5 13.5h6L9.5 22l9-12h-6z" fill="currentColor"/></svg>' };
    // 1.4h 1.1h 1h 59m 58m ... 1m; '' when over. Never seconds.
    const cwCdTxt = sec => { sec = num(sec); if (!(sec > 0)) return '';
        if (sec < 3570) return Math.max(1, Math.ceil(sec / 60)) + 'm';
        const h = Math.round(sec / 360) / 10; return (h % 1 ? h.toFixed(1) : String(h)) + 'h'; };
    function cwIcons(x) {
        const sT = x.stats, one = (k, title, endMs, known, offWhy) => {
            if (!known) return `<span class="hbs-ci off" title="${title}: ${offWhy}">${CW_ICO[k]}</span>`;
            const left = (endMs - Date.now()) / 1000;
            return left > 0 ? `<span class="hbs-ci cd" title="${title} cooldown" data-cdend="${Math.round(endMs)}">${CW_ICO[k]}<em>${cwCdTxt(left)}</em></span>`
                            : `<span class="hbs-ci free" title="${title}: free">${CW_ICO[k]}</span>`; };
        if (!sT) return ['drug', 'booster', 'medical', 'refill'].map(k => `<span class="hbs-ci off" title="not shared">${CW_ICO[k]}</span>`).join('');
        const at = num(sT.at);
        return one('drug', 'Drug', at + num(sT.drug) * 1000, sT.drug != null, 'not known')
            + one('booster', 'Booster', at + num(sT.booster) * 1000, sT.booster != null, 'not known')
            + one('medical', 'Medical', at + num(sT.medical) * 1000, sT.medical != null, 'not known (their script is older than 0.2.60)')
            + (num(sT.refill) === 1 ? `<span class="hbs-ci free" title="Energy refill available">${CW_ICO.refill}</span>` : `<span class="hbs-ci off" title="Energy refill used">${CW_ICO.refill}</span>`);
    }
    function cwQueueHtml(q, st, turn, bonus) {
        const hitsMode = !!store.get(K.cwHits, false), myIx = me ? q.findIndex(x => num(x.pid) === me.id) : -1;
        const tile = (x, i, pod) => {
            const s0 = st[x.pid] || {}, en = cwEnergy(x), hits = en ? Math.floor(en.cur / 25) : null, mine = !!me && num(x.pid) === me.id;
            const up = num(turn.up) === num(x.pid), bk = num(turn.backup) === num(x.pid), bon = bonus.pid && num(bonus.pid) === num(x.pid);
            const hitting = x.hitting_until && x.hitting_until > cwNow(), cant = x.can_hit === false;
            const pres = x.presence === 'idle' ? 'idle' : ((x.presence && x.presence !== 'active') || x.inactive) ? 'off' : 'on';   // the dot: on / idle / offline
            const urgent = cant ? `<span class="hbs-qt cant">${esc(s0.state || "Can't hit")}${s0.until && num(s0.until) * 1000 > Date.now() ? ` <em data-cdend="${num(s0.until) * 1000}">${cwCdTxt(num(s0.until) - Date.now() / 1000)}</em>` : ''}</span>`
                : hitting ? '<span class="hbs-qt hit">HITTING</span>'
                : up ? `<span class="hbs-qt up">${turn.reason === 'bonus' ? '★ UP · BONUS' : 'UP'}</span>` : '';
            const rest = urgent ? [] : [bk ? '<span class="hbs-qt">BACKUP</span>' : '', bon ? '<span class="hbs-qt bon">★ BONUS</span>' : '',
                x.dump ? `<span class="hbs-qt dmp">💩 ${x.dump.st === 'on' ? int(x.dump.left) + ' left' : 'stopped'}</span>` : '',
                x.away ? '<span class="hbs-qt">Away</span>' : '', pres === 'off' && !x.away ? '<span class="hbs-qt">Offline</span>' : '',
                mine ? '<span class="hbs-qt you">you</span>' : ''].filter(Boolean);
            const tag = urgent || (rest.length > 1 ? `<span class="hbs-rot" data-rot="${rest.length}">${rest.map((t, k) => `<span${k ? ' hidden' : ''}>${t}</span>`).join('')}</span>` : rest[0] || '');
            const enTxt = !en ? '<span class="hbs-qe none">no data</span>'
                : `<span class="hbs-qe" data-cwhits title="Tap to switch between energy and hits">${hitsMode ? `${int(hits)} hit${hits === 1 ? '' : 's'}` : int(en.cur) + (pod ? ' E' : '')}</span>`;
            const cls = `${up ? ' up' : ''}${mine ? ' me' : ''}${cant || pres === 'off' ? ' dim' : ''}`, tip = x.hits ? ` title="${int(x.hits)} hit${num(x.hits) === 1 ? '' : 's'} landed this chain"` : '';
            return pod
                ? `<div class="hbs-pt${cls}"${tip}><div class="hd"><span class="ps">#${i + 1}</span>${tag}</div><b><span class="hbs-dot ${pres}"></span>${esc(x.name)}</b>${enTxt}<div class="ic">${cwIcons(x)}</div></div>`
                : `<div class="hbs-ch${cls}"${tip}><div class="t"><span class="hbs-dot ${pres}"></span><span class="n">${esc(x.name)}</span>${tag}${cant ? '' : enTxt}</div><div class="ic">${cwIcons(x)}</div></div>`;
        };
        return (myIx >= 3 ? `<div class="hbs-qyou">You're #${myIx + 1}</div>` : '')
            + `<div class="hbs-pod">${q.slice(0, 3).map((x, i) => tile(x, i, true)).join('')}</div>`
            + (q.length > 3 ? `<div class="hbs-qsub">Also queued · ${q.length - 3}</div><div class="hbs-chg">${q.slice(3).map((x, i) => tile(x, i + 3, false)).join('')}</div>` : '');
    }
    // every second: rotate the tags (every 3 s) and re-time the cooldowns (every 15 s); a timer that ran out redraws the tab
    let cwRotN = 0, cwQT = 0;
    function cwQueueTick(force) {
        if (collapsed || tab !== 'chain' || !bodyEl) return;
        cwQT++;
        if (force || cwQT % 3 === 0) { if (!force) cwRotN++;
            bodyEl.querySelectorAll('[data-rot]').forEach(r => { const n = num(r.dataset.rot), k = cwRotN % n; [...r.children].forEach((c, i) => { c.hidden = i !== k; }); }); }
        if (force || cwQT % 15 === 0) { let done = false;
            bodyEl.querySelectorAll('[data-cdend]').forEach(e => { const left = (num(e.dataset.cdend) - Date.now()) / 1000, em = e.tagName === 'EM' ? e : e.querySelector('em');
                if (left <= 0) done = true; else if (em) em.textContent = cwCdTxt(left); });
            if (done) cwShow(); }
    }
    setInterval(() => { try { cwQueueTick(false); } catch (e) { /* never break the page */ } }, 1000);
    function cwStatsHtml(x) {
        const s = x.stats; if (!s) return '<span class="n">no energy / cooldown info shared</span>';
        const en = cwEnergy(x), drug = cwCd(s.drug, s.at), boost = cwCd(s.booster, s.at), ref = num(s.refill) === 1;
        return (en ? `<span class="en"><span class="bolt${ref ? '' : ' off'}" title="${ref ? 'Energy refill available' : 'Energy refill used'}">⚡</span>${int(en.cur)}${en.max ? '/' + int(en.max) : ''}</span>` : '')
            + `<span class="${drug > 0 ? 'cd' : 'ok'}" title="Drug cooldown">${CW_WEED}${drug > 0 ? cwFmtCd(drug) : '✓'}</span>`
            + `<span class="${boost > 0 ? 'cd' : 'ok'}" title="Booster cooldown">${CW_CAN}${boost > 0 ? cwFmtCd(boost) : '✓'}</span>`;
    }
    async function cwAction(a, b) {
        // 🎯 FIND TARGET (0.2.27, user approved "a 'Find target' button that opens a weak target (the same pick as Panic Mode)
        // without the panic alert"): your own key, at most 10 profile reads, else a random player - as Panic Mode
        if (a === 'target') { const G = bonusGuard();
            if (G && G.last && !confirm(`The next hit is bonus ${G.next} - assigned to ${G.name}. Find a target anyway?`)) return;
            if (G && !G.last) toast(`⚠ Bonus ${G.next} (${G.name}'s) is ${G.left} hits away.`, false);
            if (b) { b.disabled = true; setTimeout(() => { b.disabled = false; }, 4000); }
            // (0.2.85) during an ongoing war: an easy enemy (warTarget) - else the random weak target as before
            const W = warNow();
            if (W && W.kind === 'ongoing') {
                toast('🎯 Finding an easy war target…');
                const t = await warTarget().catch(e => ({ why: e.message || 'the enemy list could not be read' }));
                if (t && t.pid) { toast(`🎯 War target: ${t.name} · FF ${t.ff.toFixed(2)}`, true); openAttack(t.pid); return; }
                toast(`🎯 No war target (${(t && t.why) || 'none available'}) - opening a random target.`, false);
            } else toast('🎯 Finding a weak target…');
            openPanicTarget(); return; }
        if (a === 'statsretry') { store.set(K.cwStats, null); const st = await cwStats(true); toast(st ? '✓ Energy and cooldowns sent to the queue.' : '⚠ Still not readable: ' + (cw.statsErr || 'no answer'), !!st); render(true); return; }
        if (a === 'retry') { cwDisconnect(); cw.fails = 0; cw.err = ''; cw.token = null; store.set(K.cwTok, null); cw.connecting = false; cwConnect(); return; }
        if (a === 'open') { tab = 'chain'; store.set(K.tab, tab); if (collapsed) setCollapsed(false); else render(); return; }
        const S = cw.state || (cw.state = {}), Q = S.queue || (S.queue = []), mine = Q.find(x => num(x.pid) === me.id);
        if (b) b.disabled = true;
        if (a === 'join') {
            onbSet({ join: true });   // (0.2.32) ✅ onboarding step
            // join carries your stats (contract §2) - the last reading if it's recent, else read once first (as 4.20.6)
            let st = cwStatsCached(600000); if (!st) st = await cwStats(true);
            cwSend(st ? { t: 'join', stats: st } : { t: 'join' }); if (st) cwStats(false);
            if (!st) toast("⚠ Joined - but your energy and cooldowns couldn't be read" + (cw.statsErr ? ': ' + cw.statsErr : '') + '. See the note on the Chain tab.', false);   // (0.2.37)
            if (!mine) { const en = st ? num(st.energyCur) : null, row = { pid: me.id, name: me.name, energy: en, can_hit: true, stats: st, hits: 0, presence: 'active' };
                let at = Q.findIndex(q => q.energy == null || (en != null && num(q.energy) < en)); if (at < 0) at = Q.length; Q.splice(at, 0, row); }
            cw.queued = true; cw.optimistic = { queued: true, at: Date.now() }; store.set(K.cwq, true); cwPresence();
        } else if (a === 'leave') {
            cwSend({ t: 'leave' }); S.queue = Q.filter(x => num(x.pid) !== me.id);
            cw.queued = false; cw.optimistic = { queued: false, at: Date.now() }; store.set(K.cwq, false);
            alLeftQueue();   // (0.2.36 FIX, user: "Leaving the queue does not stop alerts") silence anything sounding / held
        } else if (a === 'hitting') {                                // toggle (both the Chain tab and the pinned tile)
            const on = !(mine && num(mine.hitting_until) > cwNow());
            cwSend({ t: 'hitting', on }); if (mine) mine.hitting_until = on ? cwNow() + 20000 : 0;
            // (0.2.6, user: "'I'm Hitting' should remove Away status")
            if (on && mine && mine.away) { cwSend({ t: 'away', on: false }); mine.away = false; }
            if (on) alStopAll();                                     // you're on it: a sounding alert stops (4.20.6)
            if (pinEl) pinEl.dataset.sig = '';
        }
        else if (a === 'away') { const on = !(mine || {}).away; cwSend({ t: 'away', on }); if (mine) mine.away = on; }
        else if (a === 'test') { cwSend({ t: 'test_alert' }); onbSet({ test: true }); }   // (0.2.32) ✅ onboarding step
        drawChips(); drawPin(); if (!collapsed && tab === 'chain') render(true);
    }
    function chainBind() {
        cwAlTilesTick(); dmBind();
        try { cwQueueTick(true); } catch (e) { /* */ }                                   // (0.2.60) show the tag whose turn it is
        bodyEl.querySelectorAll('[data-cwhits]').forEach(e => e.addEventListener('click', () => { store.set(K.cwHits, !store.get(K.cwHits, false)); render(true); }));   // (0.2.60) energy <-> hits
        bodyEl.querySelectorAll('[data-cw]').forEach(b => b.addEventListener('click', () => cwAction(b.dataset.cw, b)));
        const sel = bodyEl.querySelector('[data-cwbonus]');
        // (0.2.18) the assignment shows at once (optimistic, until the Hub's next update) + a confirmation toast
        const setBonus = pid => { cwSend({ t: 'bonus', pid });
            const S = cw.state || {}, b = S.bonus || (S.bonus = {}), m = pid && ((S.me || {}).members || []).find(x => num(x.pid) === pid);
            b.pid = pid || null; b.name = m ? m.name : null; b.by = me.name;
            toast(pid ? `★ Bonus hit assigned to ${m ? m.name : '#' + pid}` : 'Bonus assignment cleared', false); render(true); };
        if (sel) sel.addEventListener('change', () => { if (!sel.value) return; const v = sel.value; sel.value = ''; sel.blur(); setBonus(v === 'clear' ? null : Number(v)); });
        const bc = bodyEl.querySelector('[data-cwbonusclr]'); if (bc) bc.addEventListener('click', () => setBonus(null));
        retalsBind(); schedBind(); alertsCfgBind(); cwCfgBind(); cvChainBind();
    }

    // =====================================================================
    // 🕵 OC MODULE — your crime + seat, Join, leaders' OC alerts + Notify; the crimes-page highlight of your seat
    // =====================================================================
    let myOc = null, myOcAt = 0;
    // (0.2.89) 7. the check-in's myoc - shared between tabs (only one tab does the check-in)
    function syncMyOc(d) { store.set(K.myOcSync, { at: Date.now(), d }); applyMyOc(d, Date.now()); }
    function applyMyOc(d, at) {
        myOc = d; myOcAt = at;
        const cs = String((myOc && myOc.current && (myOc.current.crime_id || myOc.current.id)) || 0), was = store.get(K.ocCurSig, null);
        if (cs !== was) { store.set(K.ocCurSig, cs); if (was !== null) { store.set(K.ocShareAt, 0); store.set(K.sharePingAt, 0); } }
        try { drawOcPin(); drawTabDots(); } catch (e) { /* not drawn yet */ }
    }
    async function loadMyOc(force) {
        const S = store.get(K.myOcSync, null);                  // a newer reading from the check-in (this or another tab)
        if (!force && S && S.d && num(S.at) > myOcAt && Date.now() - num(S.at) < 170000) { myOc = S.d; myOcAt = num(S.at); return myOc; }
        if (!force && myOc && Date.now() - myOcAt < 60000) return myOc;
        try { myOc = await live('myoc'); myOcAt = Date.now();
            // (0.2.76) OWN CRIME CHANGED (joined, left, completed, gone) -> the pass rates go out on the next share round
            // (within 2 minutes) instead of waiting for the hourly one. The first reading on a device only records it.
            const cs = String((myOc && myOc.current && (myOc.current.crime_id || myOc.current.id)) || 0), was = store.get(K.ocCurSig, null);
            if (cs !== was) { store.set(K.ocCurSig, cs); if (was !== null) { store.set(K.ocShareAt, 0); store.set(K.sharePingAt, 0); } }
        } catch (e) { /* keep the last */ }   // [HB Suite] Hub API — op live "myoc"
        return myOc;
    }
    // 0.2.3 (user: "OC Page should show more crime details about the crime you're in. 'Join Now' Pay per day is the most
    // important. Show the 'Share CPR' option here as well. Sync the option with the settings tab."): op live "myoc" now
    // returns the crime's detail (difficulty, every seat: role, member, planning %, pass rate) and its PAY PER MEMBER PER
    // DAY - the Join Now figure (recruiting crime with an open seat: the planner's pay x its join-now multiplier) or the
    // crime type's normal figure - for the crime you're in AND the seat you're assigned to.
    // PAY PER DAY (0.2.5, user: "Pay per day should show the maximum, not a range. It should also be based off the 'Join
    // Now' amount. Include (est) after Pay Per Day"): the best recorded figure x the crime's join-now multiplier (pay from
    // now until payout - recruiting AND planning crimes), labelled (est)
    const payDay = p => !p || !p.pay_day ? '' : shortMoney(p.pay_day);
    // (0.2.54 FIX, user: "'Pays out in 23h 6m' is wrong. This crime has at least 3 days, 23h 6m remaining ... My role
    // will be finished in that 23h 6m, but not the entire crime. Each role is an additional 24h.") Torn's ready_at only
    // covers the members already in the crime; every open seat adds 24 h of planning once someone takes it. So the
    // earliest the whole crime can be ready = ready_at + 24 h x open seats (later if seats stay empty).
    const ocEarliest = c => num(c.ready_at) ? num(c.ready_at) + Math.max(0, num(c.seats) - num(c.filled)) * 86400 : 0;
    // noWhen (0.2.54, user: 'remove "Pays out in" - That already shows in the "Earliest Ready Time"'): your own crime's
    // pay card has no payout line - the ready line right under it says when
    function payHero(p, readyAt, open, noWhen) {
        if (!p || !p.pay_day) return '';
        // (0.2.44 FIX, user: "'Pays out in ~1.0 days' needs to match the planning time remaining.") when the crime's ready
        // time is known (your current crime), the line counts down to it - the same clock as "Ready in" below; the Hub's
        // estimate in days is only used when there's no ready time yet (an assignment that isn't planning).
        const ra = num(readyAt);
        // (0.2.54) open = the crime still has empty seats: Torn's ready time is then only the EARLIEST it can pay out
        const when = noWhen ? '' : ra ? (ra > nowS() ? `${open ? 'pays out in at least' : 'pays out in'} ~<span data-until="${ra}">${dur(ra - nowS())}</span>` : 'ready to pay out') : p.days != null ? `pays out in ~${(+p.days).toFixed(1)} days` : '';
        // (0.2.54, user: "Can you show the Normal pay per day, and also the users 'Joined At' Pay per day? This should help
        // clarify any discrepancies.") your own crime: the two figures side by side - Normal = the crime type's usual
        // rate; Joined at = the Hub's figure from when you took your seat (p.yours)
        if (p.yours) return `<div class="hbs-pay"><div class="l">💰 Pay per day (est) · per member</div>
            <div class="hbs-pay2"><div><small>Normal</small><b>${p.normal ? shortMoney(p.normal) : '-'}</b></div><div><small>Joined at</small><b>${shortMoney(p.pay_day)}</b></div></div>
            ${when ? `<div class="s">${when}</div>` : ''}</div>`;
        // (0.2.49, user: "The Suite should show YOUR 'Join Now' pay per day when you joined the crime.") p.yours = the
        // Hub worked the figure out from when you took your seat (fixed - it no longer climbs toward the payout)
        const sub = [p.yours ? 'from when you joined' : '', p.est && p.normal && p.normal !== p.pay_day ? `normal ${shortMoney(p.normal)} / day` : '', when].filter(Boolean);
        return `<div class="hbs-pay${p.join_now ? ' jn' : ''}"><div class="l">${p.join_now ? '⚡ JOIN NOW · ' : '💰 '}${p.yours ? 'Your pay' : 'Pay'} per day (est)</div>
            <div class="v">${payDay(p)}<small> / member / day</small></div>
            ${sub.length ? `<div class="s">${sub.join(' · ')}</div>` : ''}</div>`;
    }
    const ocWhen = t => t ? new Date(t * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    function slotsHtml(d) {
        if (!d || !(d.slots || []).length) return '';
        // (0.2.13, user: "Reorganize formatting") one two-line block per seat: role + member, then a planning bar and CPR
        return sec(`Seats · ${d.slots.filter(x => x.pid).length}/${d.slots.length} filled`) + d.slots.map(x => `<div class="hbs-seat${x.you ? ' me' : ''}${x.pid ? '' : ' open'}">
            <div class="t"><b>${esc(x.position)}${x.weight != null ? ` <small class="hbs-wt" title="This role's share of the crime's success (tornprobability role weights)">${x.weight}% weight</small>` : ''}</b><span>${x.pid ? `<a href="https://www.torn.com/profiles.php?XID=${x.pid}">${esc(x.name || String(x.pid))}</a>${x.you ? ' <b class="hbs-good">you</b>' : ''}` : '<i>open seat</i>'}</span></div>
            ${x.pid ? `<div class="b"><i><em style="width:${Math.min(100, Math.round(num(x.progress)))}%"></em></i><small>planning ${Math.round(num(x.progress))}%</small>${x.rate != null ? `<small><b>${x.rate}%</b> CPR</small>` : ''}</div>` : ''}</div>`).join('');
    }
    async function ocHtml() {
        const [MY, O] = await Promise.all([loadMyOc(true), readOpt('m', 'db/crimes.json')]);
        const cur = MY && MY.current, as = MY && MY.assignment;
        let out = '';
        if (cur && CMP()) out += ocCmHero(cur);   // (0.2.62) compact-mode card
        else if (cur) out += `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">${esc(cur.crime)}</span><span class="hbs-chip">${esc(cur.status)}</span></div>
            ${payHero(cur.pay, 0, false, true)}
            ${rsTiles([[esc(cur.position), 'Your role'], [cur.rate != null ? cur.rate + '%' : '-', 'Your CPR'], [cur.difficulty != null ? esc(String(cur.difficulty)) : '-', 'Difficulty'],
                  [`${cur.filled}/${cur.seats}`, 'Filled'], [Math.round(cur.progress) + '%', 'Your planning'], [cur.success != null ? Math.round(cur.success) + '%' : '-', cur.success_kind === 'weighted' ? 'Team success · weighted' : 'Team success']])}
            ${cur.ready_at ? `<div class="hbs-ocready">⏱ ${num(cur.filled) < num(cur.seats) ? 'Earliest Ready Time:' : 'Ready in'} <b><span data-until="${ocEarliest(cur)}">-</span></b><small>${ocWhen(ocEarliest(cur))}</small></div>` : ''}
            ${''/* (0.2.54, user: 'Remove the "Expires" comment.') the recruiting crime's expiry line is gone */}
            ${slotsHtml(cur)}
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${OC_LINK(cur.crime_id)}">Open the crime</a></div></div>`;
        if (as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id)))
            out += `<div class="hbs-card hbs-alert"><div class="hbs-r1"><span class="hbs-name">📌 Assigned: ${esc(as.crime)}</span>${as.rate != null ? `<span class="hbs-chip">${Math.round(as.rate)}% CPR</span>` : ''}</div>
                ${as.changed ? `<div class="hbs-hint">↻ Your assignment changed${as.changed.from ? ` from <b>${esc(as.changed.from)}</b>` : ''} - this is the one to join now.</div>` : ''}
                ${payHero(as.pay, as.ready_at)}
                <div class="hbs-sub">Role <b>${esc(as.position)}</b>${as.weight != null ? ` <small class="hbs-wt">${as.weight}% weight</small>` : ''}${as.difficulty != null ? ` · difficulty ${esc(String(as.difficulty))}` : ''}${as.succ != null ? ` · team success ${Math.round(as.succ)}%` : ''}</div>
                ${as.leave ? `<div class="hbs-banner">↪ Leave <b>${esc(as.leave.crime)}</b> (${esc(as.leave.position)}) first - your planning there hasn't started and this seat pays more.</div>` : ''}
                ${as.kind !== 'live' ? '<div class="hbs-hint">Waiting for this crime to be spawned.</div>' : ''}
                ${as.detail ? (CMP() ? cFold('ocasg', '💺', 'Seats', `<small>${as.detail.slots.filter(x => x.pid).length}/${as.detail.slots.length} filled</small>`, slotsHtml(as.detail).replace(/^<div class="hbs-sec">[^<]*<\/div>/, ''), false) : slotsHtml(as.detail)) : ''}
                ${as.kind === 'live' && as.crime_id ? `<div class="hbs-actions"><a class="hbs-btn" href="${OC_LINK(as.crime_id)}">${as.pay && as.pay.join_now ? '⚡ Join now' : 'Go to the crime'}</a></div>` : ''}</div>`;
        if (!cur && !(as && !as.joined)) out += `<div class="hbs-card"><div class="hbs-sub">You're not in a crime and nothing is assigned right now. The Hub re-plans every few minutes.</div></div>`;
        // 🕵 Share CPR - the same switch as ⚙ → Share from this script → OC pass rates (one Hub setting, op share_set)
        const sh = store.get(K.share, {}) || {};
        out += CMP() ? cFold('occpr', '🕵️', 'Share CPR', sh.oc ? '<span class="hbs-foldme">On</span>' : '<small>Off</small>',
                `<div class="hbs-actions"><button type="button" class="hbs-btn${sh.oc ? '' : ' hbs-ghost'}" data-occpr>${sh.oc ? '✓ On - tap to turn off' : 'Off - tap to turn on'}</button></div>
                <div class="hbs-hint">Your checkpoint pass rate per role, read on this device, so leaders and the planner can put you in the roles you pass best. Same setting as ⚙ sharing.</div>
                <div class="hbs-msg" data-occprmsg></div>`, false)
            : `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🕵️ Share CPR (OC pass rates)</span>
            <button type="button" class="hbs-btn${sh.oc ? '' : ' hbs-ghost'}" data-occpr>${sh.oc ? '✓ On' : 'Off'}</button></div>
            <div class="hbs-hint">Your checkpoint pass rate per role, read on this device when the Hub finds a new crime, so leaders and the planner can put you in the roles you pass best. Same setting as ⚙ sharing.</div>
            <div class="hbs-msg" data-occprmsg></div></div>`;
        const mine = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
        const okN = mine.filter(c => String(c.status).toLowerCase() === 'successful').length, earned = mine.reduce((a, c) => a + num(c.share), 0);
        // (0.2.9, user: "Loans above Your OC Summary") the leaders' block is built here; its 🧰 Loans card goes in now,
        // the rest (Notify / delayed / paused) stays at the bottom
        const leadHtml = (me.leader || me.loans) ? await ocLeadersHtml() : '';   // (0.2.62) loan staff get the 🧰 Loans card only
        if (me.leader || me.loans) out += ocLoansOut;
        out += await ocRecentHtml();   // (0.2.68) ✅ Recently completed
        // (0.2.75) "Your OC summary" + "Latest crimes" live on the History tab only
        out += `<div class="hbs-hint" style="margin-top:8px">📜 Your OC summary and latest crimes are on the <b>History</b> tab (••• More).</div>`;
        if (me.leader) out += leadHtml;
        return out;
    }
    function ocBind() {
        if (me.leader || me.loans) ocLeadersBind();
        const b = bodyEl.querySelector('[data-occpr]'); if (!b) return;
        b.addEventListener('click', async () => {
            const m = bodyEl.querySelector('[data-occprmsg]'); b.disabled = true; if (m) m.textContent = 'Saving…';
            try {
                // [HB Suite] Hub API — op "share_get" then "share_set": flip OC pass rates, keep every other sharing choice
                const g = await hub('share_get'), st = Object.assign({ bs: 'off', ws: 'off', ready: false, oc: false, cw: false }, g.settings || {});
                const v = { bs: st.bs, ws: st.ws, ready: false, oc: !st.oc, cw: false };
                const r = await hub('share_set', v);
                store.set(K.share, r.settings || v);
                if (v.oc) { store.set(K.ocTag, ''); shareTick(true); }   // send your pass rates now
                render(true);
            } catch (e) { b.disabled = false; if (m) m.textContent = e.message; }
        });
    }
    // ⚡ INSTANT JOIN / LEAVE (0.2.70) — see build_patch_0270.py. ocMeSoon() is called when a button is pressed on the
    // crimes page; ocMeCheck reads the member's own crime and reports a change.
    let ocMeT = null, ocMeAt = 0;
    const ocMeAllowed = () => !!me && !!getKey() && (store.get(K.share, null) || { oc: true }).oc !== false;
    function ocMeSoon() {
        if (ocMeT || !ocMeAllowed()) return;
        ocMeT = setTimeout(() => { ocMeT = null; ocMeCheck(false); }, Math.max(3000, 20000 - (Date.now() - ocMeAt)));
    }
    async function ocMeCheck(again) {
        if (!ocMeAllowed()) return;
        ocMeAt = Date.now();
        try {
            // [HB Suite] Torn API — instant join / leave: the member's OWN current crime (v2 user/organizedcrime, 1 call,
            // only after a button press on the crimes page; once more 32 s later if Torn's answer hadn't changed)
            const d = await tornGet('https://api.torn.com/v2/user/organizedcrime');
            const has = d && ('organizedCrime' in d || 'organizedcrime' in d); if (!has) return;   // an answer we don't understand is never reported
            const c = d.organizedCrime !== undefined ? d.organizedCrime : d.organizedcrime;
            const crime = c && typeof c === 'object' && num(c.id) > 0 ? c : null;
            const seat = crime ? (crime.slots || []).find(sl => sl.user && num(sl.user.id) === num(me.id)) : null;
            const sig = crime && seat ? crime.id + ':' + seat.position : '0';
            if (sig === store.get(K.ocMeSig, null)) {                 // nothing new (or Torn's cached answer): look once more
                if (!again && !ocMeT) ocMeT = setTimeout(() => { ocMeT = null; ocMeCheck(true); }, 32000);
                return;
            }
            // [HB Suite] Hub API — op "oc_feed" me: the member's own crime (or null = in no crime); no key
            const r = await hub('oc_feed', { do: 'me', crime: crime && seat ? crime : null });
            if (r && r.ok && !r.throttled) { store.set(K.ocMeSig, sig); try { liveClear(); } catch (e) { /* not set up yet */ } myOcAt = 0; ocPinTick();
                store.set(K.ocShareAt, 0); store.set(K.sharePingAt, 0); shareTick(true); }   // (0.2.71) + your pass rates now, not at the next 5-minute round
        } catch (e) { /* Torn / the Hub didn't answer - the crime list catches up within a minute anyway */ }
    }
    // the crimes page: outline YOUR assigned crime + seat (pure class toggling - nothing is clicked for you)
    let ocPageT = null;
    function ocPageWatch() {
        if (!modOn('ocpage') || !/factions\.php/.test(location.href)) return;
        // (0.2.70) a button pressed on the crimes page (not in this panel), tab focused + visible -> check the own crime
        document.addEventListener('click', e => {
            if (!/tab=crimes/.test(location.hash) || !pageScrapeAllowed()) return;
            const b = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
            if (!b || b.closest('#hbs-panel, .torn-launcher')) return;
            ocMeSoon();
        }, true);
        // (0.2.74) a Join button inside a disabled crime's card is never pressed - mouse, touch or keyboard
        document.addEventListener('click', e => {
            const b = e.target && e.target.closest ? e.target.closest('.hbs-ocdis [class*="joinButton"]') : null;
            if (b) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
        // the crime card (smallest box holding seats) around an element of it
        const cardOf = el => { let box = el; for (let i = 0; i < 12 && box; i++) { if (box.querySelector && box.querySelector('[class*="slotBody___"]')) return box; box = box.parentElement; } return null; };
        // (0.2.74) DISABLED CRIMES: cards of a switched-off crime that still have a Join button and that you're not in
        const markDisabled = names => {
            const off = new Set((names || []).map(norm)), want = new Set();
            if (off.size) document.querySelectorAll('[class*="panelTitle"]').forEach(t => {
                if (!off.has(norm(t.textContent))) return;
                const card = cardOf(t.parentElement); if (!card || !card.querySelector('[class*="joinButton"]')) return;
                const mine = me && [...card.querySelectorAll('a[href*="XID="]')].some(a => { const m = /XID=(\d+)/.exec(a.getAttribute('href') || ''); return m && num(m[1]) === num(me.id); });
                if (!mine) want.add(card);
            });
            document.querySelectorAll('.hbs-ocdis').forEach(n => { if (!want.has(n)) n.classList.remove('hbs-ocdis'); });
            want.forEach(n => { if (!n.classList.contains('hbs-ocdis')) n.classList.add('hbs-ocdis'); });
        };
        // (0.2.74) YOUR CRIME ON TOP: CSS `order` on the row of Torn's list that holds your crime (the child whose parent
        // has 2+ children with a crime title) - no DOM move; `null` puts everything back
        const topRow = inner => { let el = inner; while (el && el.parentElement) { const p = el.parentElement; let n = 0, isRow = false;
            for (const c of p.children) if (c.querySelector && c.querySelector('[class*="panelTitle"]')) { n++; if (c === el) isRow = true; }
            if (n >= 2 && isRow) return el; el = p; } return null; };
        const pinTop = card => { try {
            const keep = card ? topRow(card) : null;
            document.querySelectorAll('[data-hbs-octop]').forEach(el => { if (el !== keep) { el.style.removeProperty('order'); el.removeAttribute('data-hbs-octop'); } });
            document.querySelectorAll('[data-hbs-ocflex]').forEach(c => { if (!keep || c !== keep.parentElement) { c.style.removeProperty('display'); c.style.removeProperty('flex-direction'); c.removeAttribute('data-hbs-ocflex'); } });
            if (!keep) return;
            const box = keep.parentElement, disp = String(getComputedStyle(box).display || '');
            if (!/flex|grid/.test(disp)) { box.style.display = 'flex'; box.style.flexDirection = 'column'; box.setAttribute('data-hbs-ocflex', '1'); }   // both honour `order`
            if (keep.getAttribute('data-hbs-octop') !== '1') { keep.style.order = '-1'; keep.setAttribute('data-hbs-octop', '1'); }
        } catch (e) { /* never let a page quirk break Torn */ } };
        const run = async () => {
            if (!/tab=crimes/.test(location.hash)) { markDisabled([]); pinTop(null); return; }
            const MY = await loadMyOc(false), as = MY && MY.assignment;
            document.querySelectorAll('.hbs-ocseat,.hbs-occard').forEach(n => n.classList.remove('hbs-ocseat', 'hbs-occard'));
            markDisabled(MY && MY.disabled);
            const aRoot = as && as.crime_id ? document.getElementById('crime-history-root-' + as.crime_id) : null;
            pinTop(aRoot ? cardOf(aRoot) : null);
            if (!as || as.joined || !as.crime_id) return;
            const root = aRoot; if (!root) return;
            let card = root; for (let i = 0; i < 10 && card && !card.querySelector('[class*="slotBody___"]'); i++) card = card.parentElement;
            if (!card) return;
            card.classList.add('hbs-occard');
            // (0.2.74) the seat: exact title, else the role without its "#n" (an open seat first)
            const clean = t => norm(t).replace(/\s+\d+%?$/, ''), base = t => clean(String(t).replace(/#\s*\d+/g, ''));
            const slots = [...card.querySelectorAll('[class*="slotBody___"]')].map(b => b.closest('[class*="slot___"]') || b.parentElement).filter(Boolean);
            const titled = (slot, f, want) => [...slot.querySelectorAll('*')].some(x => (x.textContent || '').length <= 40 && f(x.textContent) === want);
            let seat = slots.find(sl => titled(sl, clean, clean(as.position)));
            if (!seat) { const same = slots.filter(sl => titled(sl, base, base(as.position))); seat = same.find(sl => sl.querySelector('[class*="joinButton"]')) || same[0]; }
            if (seat) seat.classList.add('hbs-ocseat');
        };
        const sched = () => { clearTimeout(ocPageT); ocPageT = setTimeout(run, 400); };
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', sched); sched();
    }

    // =====================================================================
    // 🤝 RECRUIT MODULE (leaders) — the Hub's shared Recruitment list (Recruit Scout sends recruits there)
    // =====================================================================
    let rcFilter = 'open';
    // 📋 the Hub's shared Recruitment list (0.2.8: the "📋 Hub list" view of the Recruit tab - suite_recruit.js)
    // 📋 HUB LIST, PAGED (0.2.23, user: "Once the Hub list becomes large, it would probably cause the script to crash if
    // we don't limit the entries"): the Hub sends 30 recruits per call (op "rc" page - best score first, counts for each
    // filter) instead of the whole list (up to 10,000) on every redraw. Pages already loaded are kept in memory and
    // redrawn without asking again; scrolling to the end loads the next 30. A change you make updates the row here at
    // once; ↻ (or 2 minutes, or a new filter) starts again from the top.
    const rcPg = { filter: null, rows: [], total: 0, counts: null, me: {}, loading: false, at: 0, err: '' };
    async function rcPage(reset) {
        if (rcPg.loading) return;
        rcPg.loading = true;
        try {
            const off = reset ? 0 : rcPg.rows.length;
            const d = await hub('rc', { do: 'page', filter: rcFilter, offset: off, limit: 30 });   // [HB Suite] Hub API — op "rc" page (leaders, 30 rows)
            if (reset) rcPg.rows = [];
            const have = new Set(rcPg.rows.map(r => num(r.pid)));
            rcPg.rows.push(...(d.recruits || []).filter(r => !have.has(num(r.pid))));
            rcPg.total = num(d.total); rcPg.counts = d.counts || rcPg.counts; rcPg.me = d.me || rcPg.me; rcPg.filter = rcFilter; rcPg.at = Date.now(); rcPg.err = '';
        } catch (e) { rcPg.err = e.message || 'Could not load the Hub list.'; if (reset) rcPg.filter = rcFilter; }
        rcPg.loading = false;
    }
    async function rcHubHtml() {
        if (rcPg.filter !== rcFilter || !rcPg.at || Date.now() - rcPg.at > 120000) await rcPage(true);
        const L = rcPg.rows, my = rcPg.me || {}, C = rcPg.counts || {};
        const lab = (k, l) => [k, `${l}${C[k] != null ? ' · ' + int(C[k]) : ''}`];
        return chips('rcf', [lab('open', 'Open'), lab('mine', 'Claimed by me'), lab('unclaimed', 'Unclaimed'), lab('all', 'All')], rcFilter)
            + `<div class="hbs-rstool"><span class="hbs-hint">${int(rcPg.total)} recruits · best score first · shared with every leader</span><button type="button" class="hbs-btn hbs-ghost hbs-mini" data-rcref>↻</button></div>`
            + (rcPg.err ? `<div class="hbs-hint hbs-bad">${esc(rcPg.err)}</div>` : '')
            + (L.length ? L.map(r => { const x = r.data || {}, fit = x.fit || {};
                return `<div class="hbs-card"><div class="hbs-r1"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${r.pid}">${esc(r.name)} [${r.pid}]</a>
                    <span class="hbs-chip">${fit.pct != null ? 'score ' + Math.round(fit.pct) : '-'}</span></div>
                    ${rsDataTiles(x)}${x.factionName ? `<div class="hbs-hint">In ${esc(x.factionName)}</div>` : ''}
                    <div class="hbs-sub">Status <b>${esc(r.status)}</b>${r.claim_name ? ` · claimed by <b>${esc(r.claim_name)}</b>` : ''}</div>
                    ${r.note ? `<div class="hbs-detail">📝 ${esc(r.note)}</div>` : ''}
                    <div class="hbs-actions">${num(r.claim_pid) === num(my.id) ? `<button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="unclaim">Unclaim</button>`
                        : `<button type="button" class="hbs-btn" data-rc="${r.pid}" data-ra="claim"${r.claim_name ? ` data-take="${esc(r.claim_name)}"` : ''}>Claim</button>`}
                        <select class="hbs-input" data-rcs="${r.pid}">${['new', 'contacted', 'joined', 'declined'].map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
                        <button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="note">📝</button>
                        <a class="hbs-btn hbs-ghost" href="https://www.torn.com/messages.php#/p=compose&XID=${r.pid}">✉</a>
                        <button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="remove">✕</button></div>
                    <div class="hbs-msg" data-msg="rc${r.pid}"></div></div>`; }).join('') + pgMore('rc', L.length, rcPg.total, rcPg.loading)
                : '<div class="hbs-empty">No recruits here.</div>');
    }
    function rcHubBind() {
        bindChips('rcf', v => { rcFilter = v; });
        const rf = bodyEl.querySelector('[data-rcref]'); if (rf) rf.addEventListener('click', () => { rcPg.at = 0; render(true); });
        pgBind(async () => { await rcPage(false); render(true); });   // next 30 from the Hub
        // (0.2.23) a change updates the loaded row here (no full reload of the list)
        const local = (pid, body) => { const i = rcPg.rows.findIndex(r => num(r.pid) === pid); if (i < 0) return; const r = rcPg.rows[i], my = rcPg.me || {};
            if (body.action === 'claim') { r.claim_pid = my.id; r.claim_name = my.name; }
            else if (body.action === 'unclaim') { r.claim_pid = null; r.claim_name = null; }
            else if (body.action === 'status') r.status = body.status;
            else if (body.action === 'note') r.note = body.note;
            else if (body.action === 'remove') { rcPg.rows.splice(i, 1); rcPg.total = Math.max(0, rcPg.total - 1); } };
        const act = async (pid, body) => { const m = msgIn('rc' + pid);
            try { await hub('rc', { do: 'update', body: Object.assign({ pid }, body) }); local(pid, body); render(true); }   // [HB Suite] Hub API — op "rc" update
            catch (e) { if (m) m.textContent = e.message; } };
        bodyEl.querySelectorAll('[data-rc]').forEach(b => b.addEventListener('click', () => {
            const pid = Number(b.dataset.rc), a = b.dataset.ra;
            if (a === 'claim' && b.dataset.take && !confirm(`Take this recruit over from ${b.dataset.take}?`)) return;
            if (a === 'remove' && !confirm('Remove this recruit from the list?')) return;
            if (a === 'note') { const n = prompt('Shared note (everyone in leadership sees it):', ''); if (n == null) return; act(pid, { action: 'note', note: n }); return; }
            if (a === 'remove' && rsPool[pid]) { rsPool[pid][9] = 1; rsPoolSave(); }   // (0.2.10) shared don't-contact list
            act(pid, { action: a });
        }));
        bodyEl.querySelectorAll('[data-rcs]').forEach(s => s.addEventListener('change', () => {
            const pid = Number(s.dataset.rcs); if (rsPool[pid]) { rsPool[pid][9] = ['declined', 'joined'].includes(s.value) ? 1 : 0; rsPoolSave(); }   // (0.2.10)
            act(pid, { action: 'status', status: s.value }); }));
    }

    // =====================================================================
    // ••• MORE — every other tab, as a grid (keeps the tab bar to 5 buttons on phones)
    // =====================================================================
    function moreHtml() {
        const lead = !!(me && me.leader);
        const grid = list => `<div class="hbs-more">${list.map(t => `<button type="button" data-gotab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('')}</div>`;
        const rest = tabsOrdered().filter(t => !inBar(t.id) && !tabHidden(t.id) && (tabOk(t.id) || (t.href && (!t.lead || lead))));
        return sec('Faction') + grid(rest.filter(t => !t.lead))
            + (lead && rest.some(t => t.lead) ? sec('Leaders') + grid(rest.filter(t => t.lead)) : '')
            + `<div class="hbs-hint">Rearrange or hide tabs: ⚙ → Layout.</div>`;
    }

    // =====================================================================
    // LAYOUT (0.2.0, user: "Allow users to rearrange their own tabs and layouts. Hide/show certain panels, like 'My
    // Organized Crimes' on the Home page"). Per device (K.layout):
    //   order  - every tab's order (the bar and the ••• More grid both follow it)
    //   bar    - which tabs sit in the bottom bar (max 4; ••• More is always the 5th)
    //   hide   - tabs left out of the More grid (still reachable from the chips / links)
    // (0.2.1: the Home panel show / hide / reorder was REVERTED - user: "Revert the panel show/hide functions. We'll
    // revisit this later." The tab layout stays.)
    // =====================================================================
    const BAR_MAX = 4;
    const LAY_DEF = () => ({ order: [], bar: TABS.filter(t => t.main && t.id !== 'more').map(t => t.id), hide: [] });
    let LAY = null;
    const lay = () => LAY || (LAY = LAY_DEF());   // (0.2.15) Layout settings removed (user) - the default order / bar, saved layouts ignored
    const laySave = () => { store.set(K.layout, LAY); buildTabs(); markTab(); };
    function tabsOrdered() {
        const ids = TABS.map(t => t.id).filter(id => id !== 'more'), ord = (lay().order || []).filter(id => ids.includes(id));
        ids.forEach(id => { if (!ord.includes(id)) ord.push(id); });
        return ord.map(id => TABS.find(t => t.id === id));
    }
    const inBar = id => id === 'more' || (lay().bar || []).includes(id);
    const tabHidden = id => (lay().hide || []).includes(id);
    // the bar: up to BAR_MAX of your chosen tabs (in your order) + ••• More
    const barTabs = () => tabsOrdered().filter(t => inBar(t.id) && (tabOk(t.id) || (t.href && (!t.lead || !!(me && me.leader))))).slice(0, BAR_MAX).concat([TABS.find(t => t.id === 'more')]);
    // ⚙ → Layout box (redraws itself only, so the rest of ⚙ isn't reloaded)
    function layoutBox(box) {
        const L = lay(), lead = !!(me && me.leader);
        const mv = (kind, id, d) => `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-lmv="${kind}" data-id="${id}" data-d="${d}">${d < 0 ? '↑' : '↓'}</button>`;
        const tabs = tabsOrdered().filter(t => !t.lead || lead).filter(t => !t.mod || modOn(t.mod));
        const nBar = tabs.filter(t => inBar(t.id)).length;
        box.innerHTML = `<div class="hbs-sec">Layout (this device)</div>
            <div class="hbs-hint">Tabs: ↑↓ to reorder · <b>Bar</b> = in the bottom bar (up to ${BAR_MAX}, ••• More is always last) · <b>Show</b> = listed in ••• More.</div>
            ${tabs.map(t => `<div class="hbs-lay"><span>${t.icon} ${esc(t.label)}${t.lead ? ' <small>leaders</small>' : ''}</span>
                <label><input type="checkbox" data-lbar="${t.id}"${inBar(t.id) ? ' checked' : ''}${!inBar(t.id) && nBar >= BAR_MAX ? ' disabled' : ''}> Bar</label>
                <label><input type="checkbox" data-lshow="${t.id}"${tabHidden(t.id) ? '' : ' checked'}${inBar(t.id) ? ' disabled' : ''}> Show</label>
                ${mv('tab', t.id, -1)}${mv('tab', t.id, 1)}</div>`).join('')}
            <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-lreset>Reset layout</button></div>`;
        const redraw = () => { laySave(); layoutBox(box); };
        box.querySelectorAll('[data-lmv]').forEach(b => b.addEventListener('click', () => {
            const id = b.dataset.id, d = Number(b.dataset.d);
            const list = tabsOrdered().map(t => t.id), i = list.indexOf(id), j = i + d;
            if (i < 0 || j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            LAY.order = list;
            redraw();
        }));
        box.querySelectorAll('[data-lbar]').forEach(c => c.addEventListener('change', () => {
            const id = c.dataset.lbar; LAY.bar = (LAY.bar || []).filter(x => x !== id); if (c.checked) LAY.bar.push(id);
            if (c.checked) LAY.hide = (LAY.hide || []).filter(x => x !== id); redraw();
        }));
        box.querySelectorAll('[data-lshow]').forEach(c => c.addEventListener('change', () => {
            const id = c.dataset.lshow; LAY.hide = (LAY.hide || []).filter(x => x !== id); if (!c.checked) LAY.hide.push(id); redraw();
        }));
        box.querySelector('[data-lreset]').addEventListener('click', () => { LAY = LAY_DEF(); redraw(); });
    }

    // (🗂 OC Management / 🖼 Panel Editor / 🧮 Payout calculator: Hub links since 0.2.1 - see TABS href / hrefTab)

    // =====================================================================
    // IMAGES OPEN FULL SIZE (0.2.0, user: "Any Images shown in the Suite should be clickable so they open the
    // individual .png files"): tapping a picture in the panel opens the image file itself in a new tab; a drawn
    // picture (receipt canvas) opens as a PNG. Where the browser won't open a new tab (some PDA set-ups), it's shown
    // full size over the page instead, with Save. Small icons (< 40 px) are left alone.
    // =====================================================================
    function showFull(url) {
        let ov = document.getElementById('hbs-full');
        if (!ov) { ov = el('div'); ov.id = 'hbs-full'; document.body.appendChild(ov);
            ov.addEventListener('click', e => { if (!e.target.closest('a')) ov.style.display = 'none'; }); }
        ov.innerHTML = `<div><img src="${esc(url)}" alt=""><a href="${esc(url)}" download="heart-breakers.png" target="_blank" rel="noopener">⬇ Save PNG</a><span>✕ tap to close</span></div>`;
        ov.style.display = 'flex';
    }
    document.addEventListener('click', e => {
        const t = e.target, pic = t && t.closest && t.closest('#hbs-panel img, #hbs-panel canvas');
        if (!pic) return;
        const r = pic.getBoundingClientRect(); if (r.width < 40 && r.height < 40) return;
        e.preventDefault(); e.stopPropagation();
        if (pic.tagName === 'IMG') { const w = window.open(pic.currentSrc || pic.src, '_blank'); if (!w) showFull(pic.currentSrc || pic.src); return; }
        try { pic.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b); const w = window.open(u, '_blank'); if (!w) showFull(u); }, 'image/png'); }
        catch (x) { /* a picture drawn from another site can't be exported */ }
    }, true);

    // ---- old standalone scripts still installed? (their page markers) - the matching suite feature steps aside ----
    function oldScripts() {
        const out = [];
        if (document.querySelector('meta[name="hb-script"][content="Heart Breakers Hub"], #hbx-panel')) out.push('Heart Breakers Hub');
        if (document.getElementById('ocopt-launcher') || document.getElementById('ocopt-panel')) out.push('Torn OC Payout Optimizer');
        if ([...document.querySelectorAll('.torn-launcher')].some(n => /chain watch/i.test(n.dataset.dockLabel || ''))) out.push('Faction Chain Watch');
        if ([...document.querySelectorAll('.torn-launcher')].some(n => /recruit scout/i.test(n.dataset.dockLabel || ''))) out.push('Torn Recruit Scout');
        return out;
    }

    // =====================================================================
    // ↩ RETALS (0.2.1, user: "Include retals") — ported from Faction Chain Watch 4.20.6 (RETALIATION LIST). The Hub
    // finds the retals (faction attacks on its key) and pushes them; this shows them for queued members, one row per
    // enemy (the latest-expiring attack), claimed targets last, sort by timer or FFScouter fair-fight, an FF range
    // filter, a hide-for-me-only, and per row: ⚔ attack · 💬 paste an alert into faction chat (you press send) ·
    // 📢 call / ✋ release. A chime + toast when a new target appears while you're on another tab / the panel's closed.
    // FFScouter (optional): your own FFScouter key, kept on this device only (⚙ → Chain Watch); one batched call per
    // minute at most, 5 min cache - same as 4.20.6.
    // =====================================================================
    const RETAL_WINDOW_MS = 300000, CALL_TTL_MS = 90000;
    const rtExpiry = r => num(r.expires_at) || (num(r.ts) + RETAL_WINDOW_MS);                   // ms, Hub clock
    const rtCaller = r => !r || !r.call_by ? null : (r.call_at && cwNow() - num(r.call_at) > CALL_TTL_MS ? null : r.call_by);
    const ffKey = () => String(store.get(K.ffKey, '') || '').trim();
    const ffCache = () => store.get(K.ffCache, {}) || {};
    const groupFF = g => { const c = ffCache()[String(g.attacker_id)]; return c && c.ff != null ? Number(c.ff) : null; };
    function rtGroups() {
        const map = new Map(), now = cwNow();
        ((cw.state || {}).retals || []).forEach(r => {
            if (!r || r.done || rtExpiry(r) <= now) return;
            const k = String(r.attacker_id), exp = rtExpiry(r); let g = map.get(k);
            if (!g) map.set(k, { attacker_id: r.attacker_id, attacker_name: r.attacker_name, faction: r.attacker_faction, rep: r, expiry: exp, ids: [r.id], count: 1, caller: null, callerId: null });
            else { g.ids.push(r.id); g.count++; if (exp > g.expiry) { g.expiry = exp; g.rep = r; } }
        });
        // always soonest-expiring first (user, Nov 14 2026: "All retals should be sorted by timer by default" - the
        // Timer / FF sort buttons were removed); claimed targets last
        const all = (cw.state.retals || []);
        const groups = [...map.values()];
        groups.forEach(g => { const c = rtCaller(g.rep); if (c) { g.caller = c; g.callerId = g.rep.id; return; }
            for (const id of g.ids) { const cc = rtCaller(all.find(x => String(x.id) === String(id))); if (cc) { g.caller = cc; g.callerId = id; break; } } });
        return groups.sort((a, b) => { const ac = a.caller ? 1 : 0, bc = b.caller ? 1 : 0; if (ac !== bc) return ac - bc;
            return a.expiry - b.expiry; });
    }
    // hide-for-me (never sent to the Hub), keyed by attacker + the expiry it was hidden at (a newer attack re-shows)
    function rtVisible() {
        const hid = store.get(K.rtHide, {}) || {}, now = cwNow(), F = store.get(K.rtFf, {}) || {}, mn = parseFloat(F.min), mx = parseFloat(F.max);
        let changed = false; Object.keys(hid).forEach(k => { if (num(hid[k]) < now) { delete hid[k]; changed = true; } }); if (changed) store.set(K.rtHide, hid);
        let hidden = 0, filtered = 0;
        const visible = rtGroups().filter(g => {
            if (hid[String(g.attacker_id)] != null && g.expiry <= num(hid[String(g.attacker_id)])) { hidden++; return false; }
            const ff = groupFF(g);
            if (ff != null && ((!isNaN(mn) && ff < mn) || (!isNaN(mx) && ff > mx))) { filtered++; return false; }
            return true;
        });
        return { visible, hidden, filtered };
    }
    function ffBadge(id) {
        if (!ffKey()) return '';
        const c = ffCache()[String(id)]; if (!c) return '';
        const cls = c.ff == null ? '' : c.ff < 1.5 ? ' hbs-ffe' : c.ff < 2.5 ? ' hbs-ffm' : ' hbs-ffh';
        return `<span class="hbs-ff${cls}" title="FFScouter fair fight">FF ${c.ff != null ? Number(c.ff).toFixed(2) : '?'}${c.est ? ' · ' + esc(c.est) : ''}</span>`;
    }
    let ffBusy = false, ffAt = 0;
    function refreshFF(ids) {
        const key = ffKey(); if (!key || !ids.length || ffBusy || Date.now() - ffAt < 60000) return;
        const C = ffCache(), now = Date.now(), need = ids.filter(id => { const c = C[String(id)]; return !c || now - num(c.at) > 300000; });
        if (!need.length) return;
        ffBusy = true; ffAt = now;
        // [HB Suite] FFScouter API — fair-fight + stat estimates for the retal targets (your own FFScouter key, this device)
        const url = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${need.slice(0, 205).join(',')}`;
        const done = txt => { ffBusy = false; let rows = null; try { rows = JSON.parse(txt); } catch (e) { return; }
            if (!Array.isArray(rows)) return;
            const F = ffCache(); rows.forEach(r => { if (r && r.player_id != null) F[String(r.player_id)] = { ff: r.fair_fight, est: r.bs_estimate_human || '', at: Date.now() }; });
            const ks = Object.keys(F); if (ks.length > 300) ks.sort((a, b) => num(F[a].at) - num(F[b].at)).slice(0, ks.length - 300).forEach(k => delete F[k]);
            store.set(K.ffCache, F); cwShow(); };
        try {
            if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(url)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(() => { ffBusy = false; }); return; }
            GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000, onload: r => done(r.responseText), onerror: () => { ffBusy = false; }, ontimeout: () => { ffBusy = false; } });
        } catch (e) { ffBusy = false; }
    }
    // paste into faction chat WITHOUT sending (the member presses Enter - Torn's one click = one action rule)
    function pasteIntoChat(text) {
        const box = document.querySelector('[class*="faction"] textarea') || document.querySelector('[class*="chat-app"] textarea, [class*="chatBox"] textarea, [class*="chat_"] textarea')
            || document.querySelector('textarea[class*="textarea___"]') || document.querySelector('#chatRoot textarea');
        if (!box) return false;
        box.focus();
        try { const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value'); if (d && d.set) d.set.call(box, text); else box.value = text; } catch (e) { box.value = text; }
        box.dispatchEvent(new Event('input', { bubbles: true })); box.focus();
        return true;
    }
    // FOLD BAR (0.2.19, user: "The Chain Watching Schedule dropdown needs a better visual indication and formatting.
    // Retals needs to be a dropdown and collapsible."): one full-width tappable bar - icon + title, a short live summary
    // on the right (count / next timer / your shift), and a chevron that turns when open. Used by ↩ Retals + 🗓 Schedule.
    const cwFold = (attr, icon, title, meta, open, alert) => `<button type="button" class="hbs-fold${open ? ' open' : ''}${alert ? ' alert' : ''}" ${attr} aria-expanded="${open}">
        <span class="ic">${icon}</span><span class="tt">${title}</span><span class="mt">${meta || ''}</span><span class="cv">▸</span></button>`;
    const rtOpen = () => !!store.get(K.rtOpen, false);           // ↩ Retals: closed by default, remembered per device
    function retalsHtml() {
        if (!cw.queued) return cwFold('data-rtfold', '↩', 'Retals', '<small>join the queue to see</small>', rtOpen(), false)
            + (rtOpen() ? `<div class="hbs-foldb"><div class="hbs-hint">Join the queue to see retaliation targets (as in Chain Watch).</div></div>` : '');
        const { visible, hidden, filtered } = rtVisible(), F = store.get(K.rtFf, {}) || {}, hasFf = !!ffKey();
        if (ffKey()) refreshFF(rtGroups().map(g => g.attacker_id));
        // summary on the bar: how many targets + the soonest one's timer, so a closed bar still says "act now"
        const soon = visible.length ? Math.min(...visible.map(g => num(g.expiry))) : 0;
        const meta = visible.length ? `<b class="hbs-foldn">${visible.length}</b> ⏱ <span data-exp="${cwLocal(soon)}" data-zero="gone">-</span>` : '<small>none right now</small>';
        let out = cwFold('data-rtfold', '↩', 'Retals', meta, rtOpen(), visible.length > 0);
        if (!rtOpen()) return out;
        out += `<div class="hbs-foldb">`
            + `<div class="hbs-rtc">
               ${hasFf ? `<span class="hbs-rtff">FF range <input class="hbs-input" data-rtff="min" inputmode="decimal" placeholder="min" value="${esc(F.min || '')}"> –
                 <input class="hbs-input" data-rtff="max" inputmode="decimal" placeholder="max" value="${esc(F.max || '')}"></span>` : ''}</div>`;
        const BG = bonusGuard();   // (0.2.27) bonus guard
        out += visible.length ? visible.map(g => {
            const mineCall = g.caller && String(g.caller) === String(me.name), left = g.expiry - cwNow();
            return `<div class="hbs-rt${left < 60000 ? ' hbs-rtsoon' : ''}${g.caller ? ' hbs-rtcalled' : ''}">
                <div class="hbs-r1"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${g.attacker_id}" target="_blank" rel="noopener">${esc(g.attacker_name || 'Unknown')}</a>
                    ${ffBadge(g.attacker_id)}${g.count > 1 ? `<span class="hbs-tag" title="${g.count} attacks from this enemy">×${g.count}</span>` : ''}
                    ${g.caller ? `<span class="hbs-tag">📢 ${mineCall ? 'you' : esc(g.caller)}</span>` : ''}
                    <span class="hbs-chip">⏱ <span data-exp="${cwLocal(g.expiry)}" data-zero="gone">-</span></span></div>
                ${BG ? `<div class="hbs-bguard">⚠ Bonus hit ${int(BG.next)} is ${esc(BG.name)}'s - ${BG.last ? '<b>the next hit is the bonus</b>' : BG.left + ' hits away'}</div>` : ''}
                <div class="hbs-actions"><a class="hbs-btn${BG ? ' hbs-warnbtn' : ''}" href="https://www.torn.com/page.php?sid=attack&user2ID=${g.attacker_id}" target="_blank" rel="noopener"${BG && BG.last ? ' data-bguard="1"' : ''}>⚔ Attack</a>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="say" data-aid="${g.attacker_id}" title="Paste an alert into faction chat (you press send)">💬</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="${mineCall ? 'release' : 'call'}" data-rid="${esc(mineCall ? (g.callerId || g.rep.id) : g.rep.id)}">${mineCall ? '✋ Release' : g.caller ? '🔒 Take over' : '📢 Call'}</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="hide" data-aid="${g.attacker_id}" data-exp2="${g.expiry}" title="Hide for you only">🙈</button></div></div>`;
        }).join('') : `<div class="hbs-hint">No retaliation targets right now - watching incoming attacks.</div>`;
        if (filtered) out += `<a href="#" class="hbs-hint" data-rta="clearff" style="display:block">${filtered} filtered by FF · clear</a>`;
        if (hidden) out += `<a href="#" class="hbs-hint" data-rta="unhide" style="display:block">${hidden} hidden by you · show</a>`;
        return out + '</div>';
    }
    function retalsBind() {
        // (0.2.27) the hit right before someone else's bonus: ask first (cancel = no attack page)
        bodyEl.querySelectorAll('[data-bguard]').forEach(a => a.addEventListener('click', e => { const G = bonusGuard();
            if (G && G.last && !confirm(`The next hit is bonus ${G.next} - assigned to ${G.name}. Attack anyway?`)) { e.preventDefault(); e.stopPropagation(); } }));
        const fb = bodyEl.querySelector('[data-rtfold]'); if (fb) fb.addEventListener('click', () => { store.set(K.rtOpen, !rtOpen()); render(true); });
        bodyEl.querySelectorAll('[data-rtff]').forEach(i => i.addEventListener('change', () => {
            const F = store.get(K.rtFf, {}) || {}; F[i.dataset.rtff] = i.value.trim(); store.set(K.rtFf, F); render(true); }));
        bodyEl.querySelectorAll('[data-rta]').forEach(b => b.addEventListener('click', e => {
            e.preventDefault();
            const a = b.dataset.rta, R = (cw.state || {}).retals || [];
            if (a === 'call' || a === 'release') {
                const r = R.find(x => String(x.id) === b.dataset.rid);
                cwSend({ t: 'retal', id: b.dataset.rid, action: a });
                if (r) { r.call_by = a === 'call' ? me.name : null; r.call_at = a === 'call' ? cwNow() : 0; }   // optimistic
            } else if (a === 'say') {
                const g = rtGroups().find(x => String(x.attacker_id) === b.dataset.aid); if (!g) return;
                const c = ffCache()[String(g.attacker_id)] || {};
                const msg = `⚔ Retaliation Target\n${g.attacker_name} [${g.attacker_id}]\nEst. Battle Stats: ${c.est || 'unknown'}\nAttack: https://www.torn.com/page.php?sid=attack&user2ID=${g.attacker_id}`;
                if (pasteIntoChat(msg)) toast('Retaliation pasted into chat - press Enter to send.');
                else copyText(msg).then(ok => toast(ok ? 'No chat box open - copied instead.' : 'Open faction chat, then try again.'));
                return;
            } else if (a === 'hide') { const h = store.get(K.rtHide, {}) || {}; h[b.dataset.aid] = num(b.dataset.exp2); store.set(K.rtHide, h); }
            else if (a === 'unhide') store.set(K.rtHide, {});
            else if (a === 'clearff') store.set(K.rtFf, {});
            render(true);
        }));
    }
    // new-target chime (queued, and you're not looking at the Chain tab)
    let rtLastN = null;                                         // null = not counted yet (no chime for targets already there on load)
    function rtChime() {
        if (!cw.queued) { rtLastN = null; return; }
        const n = rtVisible().visible.length;
        if (rtLastN != null && n > rtLastN && (collapsed || tab !== 'chain' || document.hidden) && isAlertTab()) alEngage('retal', 0, false, { text: `↩ Retaliation target available (${n})` });   // 🔔 configurable (0.2.3)
        rtLastN = n;
    }

    // =====================================================================
    // 🗓 CHAIN WATCHING SCHEDULE (0.2.1, user: "Chain watching schedule in the chain. Same as the old script") — ported
    // from Faction Chain Watch 4.20.6 (contract §10 + the schedule-script addendum): the schedule comes with the chain
    // room's state (`schedule` {shifts, mine_ids, max_shifts}); booking / cancelling go over the same connection
    // (shift_add {start, minutes, role} · shift_cancel {id} · shift_remove {id} - leaders). The Hub enforces every
    // rule (48 h window, 30-min steps, up to 6 h, 2 shifts each, one role per slot) and says why in a notice.
    // Times are TCT (= UTC) slots of 30 minutes; the grid never moves - TCT / Local only changes the printed clock.
    // ⚡ Claim: one tap books the next open 30 minutes (Primary first). The energy line is an ESTIMATE from your last
    // stats reading (regen + daily refill + one Xanax; boosters not counted) - the Hub keeps its own.
    // =====================================================================
    // "TCT" is drawn by CSS (.hbs-tct::before), not as text: a page-wide TCT -> local time converter (e.g. the user's
    // Torn TCT → Local Time script) otherwise rewrote the Suite's own TCT labels / times into "EST" (user, Nov 14 2026:
    // "Chain schedule shows TCT as EST ... Any time conversions should be TCT to Local, Local being the local device's
    // timezone"). TCT / Local here is the Suite's own switch; Local = this device's time zone.
    const TCT = '<span class="hbs-tct" aria-label="TCT"></span>';
    const SCHED_ROLES = [['primary', 'Primary'], ['backup', 'Backup'], ['backup2', '2nd backup']];
    const SLOT_SEC = 1800, SCHED_WINDOW_H = 48, SCHED_MAX_MIN = 360, WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sch = { open: false, day: 0, slot: null, len: 30, role: 'primary' };
    // TCT is always 24 h (Torn's own format); the 12 h / 24 h choice applies to Local only and is kept when you switch
    // TCT -> Local -> TCT (user, Nov 14 2026: "When selecting TCT, only allow 24h. Options persist when switching")
    const schLocal = () => store.get(K.schTz, 'tct') === 'local', sch24 = () => !schLocal() || store.get(K.schHr, '24') !== '12';
    const minutesOf = s => num(s && s.minutes) > 0 ? num(s.minutes) : num(s && s.hours) * 60;
    function clockHM(h, m, compact) { const p = n => String(n).padStart(2, '0'); if (sch24()) return `${p(h)}:${p(m)}`;
        const pm = h >= 12; let hh = h % 12; if (!hh) hh = 12; return `${hh}:${p(m)}${compact ? (pm ? 'p' : 'a') : (pm ? ' PM' : ' AM')}`; }
    const tzClock = (sec, compact) => { const d = new Date(sec * 1000); return clockHM(schLocal() ? d.getHours() : d.getUTCHours(), schLocal() ? d.getMinutes() : d.getUTCMinutes(), compact); };
    const dayStart = i => { const d = new Date(cwNow() + i * 86400000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000); };
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabel = i => { const d = new Date(dayStart(i) * 1000); return i === 0 ? `Today ${d.getUTCDate()}` : `${WD[d.getUTCDay()]} ${d.getUTCDate()}`; };
    // the day tabs: name on top, the date under it (user, Nov 14 2026: "Show the date under Today / Sun / Mon")
    const dayChip = i => { const d = new Date(dayStart(i) * 1000); return `<span class="hbs-day">${i === 0 ? 'Today' : WD[d.getUTCDay()]}<small>${MO[d.getUTCMonth()]} ${d.getUTCDate()}</small></span>`; };
    const curSlot = () => { const n = Math.floor(cwNow() / 1000); return n - (n % SLOT_SEC); };
    const winEnd = () => Math.floor(cwNow() / 1000) + SCHED_WINDOW_H * 3600;
    const inWindow = t => t + SLOT_SEC > Math.floor(cwNow() / 1000) && t <= winEnd();
    const dayCount = () => { let n = 1; while (n < 4 && dayStart(n) <= winEnd()) n++; return n; };
    const shifts = () => { const S = (cw.state || {}).schedule; return S && Array.isArray(S.shifts) ? S.shifts : []; };
    const spans = (s, t) => t >= num(s.start) && t < num(s.start) + minutesOf(s) * 60;
    const myShifts = () => shifts().filter(s => num(s.pid) === me.id).sort((a, b) => num(a.start) - num(b.start));
    const maxShifts = () => num(((cw.state || {}).schedule || {}).max_shifts) || 2;
    const atLimit = () => myShifts().length >= maxShifts();
    const roleTaken = (start, mins, role) => { for (let i = 0; i < Math.max(1, Math.round(mins / 30)); i++) { const t = start + i * SLOT_SEC; if (shifts().some(s => s.role === role && spans(s, t))) return true; } return false; };
    const myOverlap = (start, mins) => { for (let i = 0; i < Math.max(1, Math.round(mins / 30)); i++) { const t = start + i * SLOT_SEC, s = myShifts().find(x => spans(x, t)); if (s) return s.role; } return null; };
    const roleLabel = r => (SCHED_ROLES.find(x => x[0] === r) || [r, r])[1];
    const span = (st, mins) => `${tzClock(st)}–${tzClock(st + mins * 60)}`;
    const fmtLen = m => { const h = Math.floor(m / 60), r = m % 60; return !h ? `${r}m` : r ? `${h}h${r}` : `${h}h`; };
    const dayOf = st => { for (let d = 0; d < 4; d++) if (st >= dayStart(d) && st < dayStart(d) + 86400) return dayLabel(d); const x = new Date(st * 1000); return `${WD[x.getUTCDay()]} ${x.getUTCDate()}`; };
    const coverCls = t => { let p = false, b = false; shifts().forEach(s => { if (spans(s, t)) { if (s.role === 'primary') p = true; else b = true; } }); return p ? 'p' : b ? 'b' : 'o'; };
    function estHits(start, mins) {
        const need = Math.ceil(mins / 5), c = store.get(K.cwStats, null), s = c && c.s;
        if (!s || !s.energyMax) return { est: null, need };
        const inc = num(s.energyInc) || 5, intv = num(s.energyInt) || 600, max = num(s.energyMax), toStart = start - num(c.at) / 1000;
        let e = num(s.energyCur); if (toStart > 0 && e < max) e = Math.min(max, e + inc * Math.floor(toStart / intv));
        const later = Math.floor(start / 86400) > Math.floor(cwNow() / 86400000);
        const total = e + inc * Math.floor(mins * 60 / intv) + (num(s.refill) === 1 || later ? max : 0) + (num(s.drug) - Math.max(0, toStart) <= 0 ? 250 : 0);
        return { est: Math.floor(total / 25), need };
    }
    function nextClaim() {
        const now = curSlot(), end = winEnd();
        for (let t = now; t <= end; t += SLOT_SEC) { if (myShifts().some(x => spans(x, t))) continue;
            const r = SCHED_ROLES.find(([k]) => !shifts().some(s => s.role === k && spans(s, t))); if (r) return { t, role: r[0] }; }
        return null;
    }
    function shiftAdd(start, mins, role) {
        if (atLimit()) { toast(`You already have ${maxShifts()} shifts - cancel one to book another.`); return; }
        const ov = myOverlap(start, mins); if (ov) { toast(`You're already ${roleLabel(ov)} for part of that time - one role per time slot.`); return; }
        cwSend({ t: 'shift_add', start, minutes: mins, role });
        const S = (cw.state.schedule = cw.state.schedule || { shifts: [], max_shifts: 2 }), e = estHits(start, mins);   // optimistic (4.20.6)
        (S.shifts = S.shifts || []).push({ id: 'tmp-' + start + '-' + role, pid: me.id, name: me.name, start, minutes: mins, role, est_hits: e.est, need_hits: e.need });
        toast('Shift request sent…');
    }
    function shiftDrop(id, mine) {
        cwSend({ t: mine ? 'shift_cancel' : 'shift_remove', id });
        const S = cw.state.schedule; if (S && S.shifts) S.shifts = S.shifts.filter(s => String(s.id) !== String(id));
    }
    function schedHtml() {
        const S = (cw.state || {}).schedule;
        const mine = myShifts();
        // (0.2.19) fold bar: booked count + your next shift (or "none booked") on the right
        const nB = S ? shifts().length : 0, my1 = mine.slice().sort((a, b) => num(a.start) - num(b.start))[0];
        let out = cwFold('data-sch="toggle"', '🗓', 'Chain watching schedule',
            S ? `${my1 ? `<span class="hbs-foldme">${roleLabel(my1.role)} ${dayOf(my1.start).replace(/^Today \d+$/, 'today')} ${tzClock(my1.start)}</span>` : '<small>you: none booked</small>'} <b class="hbs-foldn">${nB}</b>` : '<small>loading…</small>',
            sch.open, false);
        out += '<div class="hbs-foldb' + (sch.open ? '' : ' shut') + '">';
        // ⚡ claim (always visible)
        if (S) {
            const nx = atLimit() ? null : nextClaim();
            out += `<div class="hbs-actions">${mine.length ? mine.map(m => `<span class="hbs-tag hbs-green">${roleLabel(m.role)} ${dayOf(m.start)} ${span(m.start, minutesOf(m))}</span>`).join(' ') : ''}
                ${nx ? `<button type="button" class="hbs-btn" data-sch="claim" data-t="${nx.t}" data-role="${nx.role}">⚡ Claim ${nx.t === curSlot() ? 'now' : 'next · ' + dayOf(nx.t).replace(/^Today \d+$/, 'today') + ' ' + tzClock(nx.t)} · ${roleLabel(nx.role)}</button>`
                    : atLimit() ? `<span class="hbs-hint">You have ${maxShifts()} shifts booked.</span>` : `<span class="hbs-hint">Every slot is filled for the next 48 hours.</span>`}</div>`;
        } else out += `<div class="hbs-hint">Loading the schedule from the Hub…</div>`;
        if (!sch.open || !S) return out + '</div>';
        // my shifts with Cancel + energy check
        if (mine.length) out += mine.map(m => { const ok = m.est_hits == null || num(m.est_hits) >= num(m.need_hits);
            return `<div class="hbs-li"><span><b>${roleLabel(m.role)}</b> · ${dayOf(m.start)} ${span(m.start, minutesOf(m))}${m.est_hits == null ? '' : ok ? ' · ✓ energy' : ` · ⚠ ${m.est_hits}/${m.need_hits} hits`}</span>
                <button type="button" class="hbs-btn hbs-ghost" data-sch="cancel" data-id="${esc(String(m.id))}">Cancel</button></div>`; }).join('');
        out += `<div class="hbs-rtc">${chips('schtz', [['tct', TCT], ['local', 'Local']], schLocal() ? 'local' : 'tct')}${schLocal() ? chips('schhr', [['12', '12h'], ['24', '24h']], sch24() ? '24' : '12') : '<div class="hbs-chips"><button type="button" class="hbs-on" disabled title="Torn time is always 24 h">24h</button></div>'}</div>`;
        const dc = dayCount(); if (sch.day >= dc) sch.day = 0;
        out += chips('schday', [...Array(dc).keys()].map(d => [String(d), dayChip(d)]), String(sch.day));
        // the grid: two half-day bars of 24 × 30-min cells (green = Primary covered, amber = backup only)
        [0, 24].forEach(base => {
            out += `<div class="hbs-hint">${tzClock(dayStart(sch.day) + base * SLOT_SEC)} – ${tzClock(dayStart(sch.day) + (base + 24) * SLOT_SEC)}</div><div class="hbs-slots">`;
            for (let i = 0; i < 24; i++) { const t = dayStart(sch.day) + (base + i) * SLOT_SEC, ok = inWindow(t);
                out += `<button type="button" class="hbs-slot hbs-s${coverCls(t)}${ok ? '' : ' hbs-past'}${sch.slot === t ? ' hbs-on' : ''}"${ok ? ` data-sch="slot" data-t="${t}"` : ' disabled'}>${tzClock(t, true)}</button>`; }
            out += '</div>';
        });
        out += `<div class="hbs-hint"><span class="hbs-key hbs-sp"></span>Primary covered <span class="hbs-key hbs-sb"></span>backup only <span class="hbs-key hbs-so"></span>open</div>`;
        // booking form
        if (sch.slot != null && !atLimit()) {
            const e = estHits(sch.slot, sch.len), ok = e.est == null || e.est >= e.need, ov = myOverlap(sch.slot, sch.len), taken = roleTaken(sch.slot, sch.len, sch.role);
            out += `<div class="hbs-card"><div class="hbs-sub">Booking <b>${dayOf(sch.slot)} ${span(sch.slot, sch.len)}</b> ${schLocal() ? 'Local' : TCT}</div>
                ${chips('schlen', [...Array(SCHED_MAX_MIN / 30).keys()].map(i => [String((i + 1) * 30), fmtLen((i + 1) * 30)]), String(sch.len))}
                <div class="hbs-chips">${SCHED_ROLES.map(([k, l]) => { const tk = roleTaken(sch.slot, sch.len, k);
                    return `<button type="button" data-sch="role" data-role="${k}" class="${sch.role === k ? 'hbs-on' : ''}"${tk ? ' disabled' : ''}>${l}${tk ? ' ✕' : ''}</button>`; }).join('')}</div>
                <div class="hbs-hint ${ok ? 'hbs-good' : 'hbs-bad'}">${e.est == null ? 'Energy estimate needs a stats reading - it comes once Chain Watch connects.' : `${ok ? '✓' : '⚠'} est ~${e.est} hits vs ${e.need} needed - ${ok ? 'covers it' : 'short'} (estimate only)`}</div>
                ${ov ? `<div class="hbs-hint hbs-bad">⚠ You're already ${roleLabel(ov)} for part of that time - one role per time slot.</div>` : ''}
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-sch="book"${ov || taken ? ' disabled' : ''}>Book shift</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-sch="back">Back</button></div></div>`;
        }
        // everyone's upcoming shifts
        const up = shifts().slice().sort((a, b) => num(a.start) - num(b.start)), lead = !!((cw.state.me || {}).is_leader);
        out += sec(`Booked · ${up.length}`) + (up.length ? up.map(s => { const mineS = num(s.pid) === me.id, ok = s.est_hits == null || num(s.est_hits) >= num(s.need_hits);
            return `<div class="hbs-li${mineS ? ' hbs-me' : ''}"><span><b>${roleLabel(s.role)}</b> ${s.pid ? `<a href="#" data-prof="${num(s.pid)}">${esc(s.name || '')}</a>` : esc(s.name || '')} · ${dayOf(s.start)} ${span(s.start, minutesOf(s))}
                <span class="${ok ? 'hbs-good' : 'hbs-bad'}">${s.est_hits == null ? '' : ok ? '✓' : `⚠ ${s.est_hits}/${s.need_hits}`}</span></span>
                ${mineS || lead ? `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-sch="${mineS ? 'cancel' : 'remove'}" data-id="${esc(String(s.id))}" title="${mineS ? 'Cancel your shift' : 'Remove this shift'}">✕</button>` : ''}</div>`; }).join('')
            : '<div class="hbs-hint">No shifts booked yet.</div>');
        return out + '</div>';
    }
    function schedBind() {
        bindChips('schtz', v => store.set(K.schTz, v)); bindChips('schhr', v => store.set(K.schHr, v));
        bindChips('schday', v => { sch.day = Number(v); sch.slot = null; });
        bindChips('schlen', v => { sch.len = Number(v); if (roleTaken(sch.slot, sch.len, sch.role)) { const f = SCHED_ROLES.find(r => !roleTaken(sch.slot, sch.len, r[0])); if (f) sch.role = f[0]; } });
        bodyEl.querySelectorAll('[data-sch]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.sch;
            if (a === 'toggle') sch.open = !sch.open;
            else if (a === 'claim') shiftAdd(Number(b.dataset.t), 30, b.dataset.role);
            else if (a === 'slot') { if (atLimit()) { toast(`You already have ${maxShifts()} shifts - cancel one to book another.`); return; }
                sch.slot = Number(b.dataset.t); sch.len = 30; sch.role = (SCHED_ROLES.find(r => !roleTaken(sch.slot, 30, r[0])) || SCHED_ROLES[0])[0]; }
            else if (a === 'role') sch.role = b.dataset.role;
            else if (a === 'book') { if (roleTaken(sch.slot, sch.len, sch.role)) { toast('That role is already taken for part of that time.'); return; } shiftAdd(sch.slot, sch.len, sch.role); sch.slot = null; }
            else if (a === 'back') sch.slot = null;
            else if (a === 'cancel') shiftDrop(b.dataset.id, true);
            else if (a === 'remove') { if (!confirm('Remove this member\'s shift?')) return; shiftDrop(b.dataset.id, false); }
            render(true);
        }));
    }

    // =====================================================================
    // 📌 PINNED CHAIN TILE (0.2.1, user: "Pinned Tiles for Chain Watching on all tabs"): a slim Chain Watch strip under
    // the status chips on every tab except ⛓ Chain - the timer, who's up, your place, and Join / I'm hitting - shown
    // while a chain is live or you're in the queue. Off in ⚙ → Display.
    // =====================================================================
    let pinEl = null;
    // "I'm hitting" state (user, Nov 14 2026: the pinned tile's Hitting didn't update the Chain tab's button) - ONE
    // source (your queue row's hitting_until) and ONE button builder for both places: "⚔ I'm hitting now" / while it
    // stands "✋ Hitting · 18s" (tap to clear), like Chain Watch 4.20.6. Tapping toggles it (hitting {on}).
    const hittingUntil = () => { const q = ((cw.state || {}).queue || []).find(x => num(x.pid) === me.id); return q && num(q.hitting_until) > cwNow() ? num(q.hitting_until) : 0; };
    function hitBtn(where) {
        const u = hittingUntil(), attr = where === 'pin' ? 'data-pin' : 'data-cw';
        return u ? `<button type="button" class="hbs-btn hbs-hitting" ${attr}="hitting" title="Tap to clear">✋ Hitting · <span data-exp="${cwLocal(u)}" data-zero="0s">-</span></button>`
                 : `<button type="button" class="hbs-btn" ${attr}="hitting">⚔ ${where === 'pin' ? 'Hitting' : "I'm hitting now"}</button>`;
    }
    // 📌 OC ASSIGNMENT TILE (0.2.26, user: "If you're not in a crime, add a pinned alert tile for your assigned crime."):
    // under the status chips on every tab except 🕵 OC (and ⚙) while you have an OC assignment and aren't in a crime -
    // the crime, your role (+ its weight), the pay per day (est) and Join (opens the crime on Torn) or "waiting to be
    // spawned". Tapping the tile opens the OC tab. From the cached op live "myoc" (re-read at most once a minute).
    let ocPinEl = null;
    function drawOcPin() {
        if (!ocPinEl) return;
        const M = typeof myOc !== 'undefined' ? myOc : null, as = M && M.assignment;
        const on = me && modOn('oc') && tab !== 'oc' && !showSettings && as && !as.joined && !(M && M.current);
        if (!on) { ocPinEl.style.display = 'none'; ocPinEl.innerHTML = ''; delete ocPinEl.dataset.sig; return; }
        const live = as.kind === 'live' && as.crime_id, p = as.pay || {};
        const sig = [as.crime, as.position, as.crime_id, as.kind, p.pay_day, p.join_now, as.changed && as.changed.from].join('|');
        ocPinEl.style.display = '';
        if (ocPinEl.dataset.sig === sig) return;
        ocPinEl.dataset.sig = sig;
        ocPinEl.innerHTML = `<div class="hbs-pin-l" data-ocpin="open"><b>📌 OC assigned</b>
            <span class="hbs-pin-t">${esc(as.crime)}</span>${as.changed ? `<span class="hbs-pin-s">↻ changed${as.changed.from ? ' from ' + esc(as.changed.from) : ''}</span>` : ''}
            <span class="hbs-pin-s">${esc(as.position)}${as.weight != null ? ` · ${as.weight}% weight` : ''}${p.pay_day ? ` · ${p.join_now ? '⚡ ' : ''}${payDay(p)}/day (est)` : ''}</span></div>
            <div class="hbs-pin-b">${live ? `<a class="hbs-btn" href="${OC_LINK(as.crime_id)}">Join</a>` : '<span class="hbs-hint">waiting to be spawned</span>'}</div>`;
    }
    // (0.2.87) minimized too: every minute open, every 3 minutes minimized (see build_patch_0287.py)
    let ocPinMinAt = 0;
    const ocPinTick = () => { if (!me || document.hidden || !modOn('oc')) return;
        // (0.2.89) 7. the check-in brings this every 2-5 minutes: ask separately only when that reading is ~3 min old
        const S = store.get(K.myOcSync, null); if (S && Date.now() - num(S.at) < 170000) { if (num(S.at) > myOcAt) { applyMyOc(S.d, num(S.at)); } return; }
        if (collapsed) { if (Date.now() - ocPinMinAt < 175000) return; ocPinMinAt = Date.now(); }
        loadMyOc(false).then(() => { drawOcPin(); drawTabDots(); }, () => {}); };
    setInterval(ocPinTick, 60000); setTimeout(ocPinTick, 2500);   // + once soon after load, so the tile shows without visiting 🕵 OC
    // 🔴 TAB DOTS (0.2.31, user approved: "small dots on Chain / OC tabs when something needs you (you're up, assignment
    // waiting), so you see it from any tab"): ⛓ Chain - you're up in a live chain at / above the minimum chain;
    // 🕵 OC - you have an assignment and aren't in a crime. Not shown on the tab you're on; if that tab isn't in the
    // bar the dot goes on ••• More. Redrawn with the pinned tiles (every render / chain update / minute).
    function drawTabDots() {
        if (!tabsEl || !me) return;
        const S = cw.state || {}, c = cwChain(), t = S.turn || {};
        const M = typeof myOc !== 'undefined' ? myOc : null, as = M && M.assignment;
        const need = { chain: modOn('chain') && cw.queued && c.current > 0 && num(t.up) === me.id && c.current >= num((S.config || {}).minChain),
                       oc: modOn('oc') && !!(as && !as.joined && !(M && M.current)) };
        const want = {};
        Object.keys(need).forEach(id => { if (!need[id] || (tab === id && !showSettings)) return;
            want[tabsEl.querySelector(`button[data-tab="${id}"]`) ? id : 'more'] = true; });
        tabsEl.querySelectorAll('button[data-tab]').forEach(b => { const on = !!want[b.dataset.tab] && !b.querySelector('.hbs-badge'); let d = b.querySelector('.hbs-tdot');
            if (on && !d) { d = el('i', 'hbs-tdot'); b.appendChild(d); } else if (!on && d) d.remove(); });
    }
    function drawPin() {
        drawOcPin();   // (0.2.26) the OC assignment tile redraws with the chain tile (tab changes, renders)
        drawTabDots(); // (0.2.31)
        if (!pinEl) return;
        const on = modOn('chain') && uiOpt('pin') && tab !== 'chain' && !showSettings && cw.state && me;
        const c = on ? cwChain() : {}, live = c.current > 0;
        // (0.2.6 fix, user: "The Pinned Tile ... ends up disappearing after you hit the Hitting button") hiding emptied
        // the tile but kept its signature, so showing it again with the same state skipped the redraw -> an empty bar
        if (!on || (!live && !cw.queued)) { pinEl.style.display = 'none'; pinEl.innerHTML = ''; delete pinEl.dataset.sig; return; }
        const S = cw.state, turn = S.turn || {}, q = S.queue || [], i = q.findIndex(x => num(x.pid) === me.id);
        const who = pid => esc(((q.find(x => num(x.pid) === num(pid)) || {}).name) || '');
        const sig = [live, c.current, Math.round(num(c.expires_at) / 1000), turn.up, turn.backup, i, cw.queued, q.length, hittingUntil()].join('|');
        pinEl.style.display = '';
        if (pinEl.dataset.sig === sig) return;          // the timer itself ticks via data-exp
        pinEl.dataset.sig = sig;
        pinEl.innerHTML = `<div class="hbs-pin-l" data-pin="open"><b>⛓ ${live ? int(c.current) : '-'}</b>
            ${live ? `<span class="hbs-pin-t" data-cwexp data-exp="${cwLocal(c.expires_at)}">-</span>` : '<span class="hbs-hint">no chain</span>'}
            <span class="hbs-pin-s">${turn.up ? `Up: ${num(turn.up) === me.id ? '<b class="hbs-good">you</b>' : who(turn.up)}` : ''}${cw.queued ? ` · you #${i + 1}${num(turn.backup) === me.id ? ' (backup)' : ''}` : ` · ${q.length} queued`}</span></div>
            <div class="hbs-pin-b">${cw.queued ? hitBtn('pin') : `<button type="button" class="hbs-btn" data-pin="join">Join</button>`}</div>`;
        tickEl(pinEl);
    }

    // =====================================================================
    // 🔴 ALERT BADGES (0.2.1, leaders): the number of leader alerts (the same count as 🔔 Alerts: unpaid wars, idle
    // recruits, OC / spawn alerts, low reliability, members still to notify) on ••• More, on the Alerts button and
    // on the launcher. Refreshed every 3 minutes while Torn is visible (op live "spawn" + Hub files, cached).
    // =====================================================================
    // SEEN (user, Nov 14 2026: "Notifications should disappear once you've seen them"): the badge counts only alerts
    // you haven't seen - opening 🔔 Alerts marks everything on it seen (K.alertSeen); a new or changed alert counts again.
    let alertN = 0, alertKeys = [], badgeAt = 0;
    const alertsUnseen = () => { const seen = new Set(store.get(K.alertSeen, []) || []); return alertKeys.filter(k => !seen.has(k)).length + relNewIds().length; };
    function alertsSeen() { store.set(K.alertSeen, alertKeys.slice(0, 300)); relMarkSeen(); drawBadges(); }
    // 🛡 LOW RELIABILITY - WHEN IT ALERTS (0.2.35, user: "When these members drop in score, they keep alerting leaders. They
    // should only alert when they drop in a full ranking. When they re-alert, it should be clear which users are creating
    // the alert and why."): the 🔴 badge counts a low-reliability member only when they're NEW on the list or their GRADE
    // got worse (E -> F) since you last opened 🔔 Alerts - a score moving inside the same grade is silent. K.relSeen keeps
    // {member id: grade rank you last saw}; leaving the list forgets them (coming back alerts again). The first time
    // (nothing stored) the current list is taken as seen, so nobody alerts just because of this update.
    // relWhy keeps this page-load's reasons so the "why" stays on screen after the alerts are marked seen.
    const REL_RANK = sc => { const i = GRADES.findIndex(g => (sc || 0) >= g[0]); return i < 0 ? GRADES.length - 1 : i; };   // S=0 ... F=6
    let relNow = {}, relWhy = {};                             // {id: {rank, score}} on the list now · {id: {from, to, score}}
    function relTrack(bad) {
        relNow = {}; bad.forEach(([id, v]) => { relNow[id] = { rank: REL_RANK(v.reliability.score), score: v.reliability.score }; });
        let seen = store.get(K.relSeen, null);
        if (!seen || typeof seen !== 'object') { seen = {}; Object.keys(relNow).forEach(id => { seen[id] = relNow[id].rank; }); store.set(K.relSeen, seen); }
        Object.keys(relNow).forEach(id => { const r = relNow[id].rank;
            if (seen[id] == null) relWhy[id] = { from: null, to: r, score: relNow[id].score };
            else if (r > seen[id]) relWhy[id] = { from: seen[id], to: r, score: relNow[id].score }; });
        Object.keys(relWhy).forEach(id => { if (!relNow[id] || relNow[id].rank < relWhy[id].to) delete relWhy[id]; });   // off the list / improved
    }
    const relNewIds = () => { const seen = store.get(K.relSeen, null) || {}; return Object.keys(relNow).filter(id => seen[id] == null || relNow[id].rank > seen[id]); };
    function relMarkSeen() { const seen = {}; Object.keys(relNow).forEach(id => { seen[id] = relNow[id].rank; }); store.set(K.relSeen, seen); }
    const relWhyText = id => { const w = relWhy[id]; if (!w) return ''; const L = r => GRADES[r][1];
        return w.from == null ? `new on the list at ${L(w.to)}` : `dropped ${L(w.from)} → ${L(w.to)}`; };
    async function refreshBadges(force) {
        if (!me || !me.leader || document.hidden) return;
        // (0.2.89) 7. with the check-in's alerts_v the list is re-read when it changes (refreshBadges(true)), else every 15 min
        if (!force && Date.now() - badgeAt < (store.get(K.alertsV, '') ? 900000 : 180000)) return;
        badgeAt = Date.now();
        try { await alertsHtml(); } catch (e) { return; }   // [HB Suite] Hub API — op live "spawn" (via the Alerts tab's own reads)
        drawBadges();
    }
    function drawBadges() {
        const n = me && me.leader ? alertsUnseen() : 0, txt = n > 99 ? '99+' : String(n);
        const put = (host, cls) => { if (!host) return; let b = host.querySelector('.hbs-badge');
            if (!n) { if (b) b.remove(); return; }
            if (!b) { b = el('span', 'hbs-badge' + (cls ? ' ' + cls : '')); host.appendChild(b); } b.textContent = txt; };
        if (tabsEl) put(tabsEl.querySelector('button[data-tab="more"]'));
        if (bodyEl) put(bodyEl.querySelector('.hbs-more button[data-gotab="alerts"]'));
        if (launcher) put(launcher, 'hbs-lb');
    }
    setInterval(() => refreshBadges(false), 30000);

    // =====================================================================
    // DISPLAY OPTIONS (0.2.1): 🗜 compact mode (smaller cards / text - handy on PDA) and the 📌 pinned chain tile.
    // Per device (K.ui).
    // =====================================================================
    const UI_DEF = { compact: true, pin: true };             // (0.2.78) compact is the default layout everywhere (0.2.72: Torn PDA only)
    // (0.2.72) Torn PDA, once per device: an already-saved choice is switched to compact too (the member can switch it
    // back off in ⚙ → Display afterwards - that choice then sticks)
    if (isPDA() && !store.get(K.uiPdaMig, 0)) { store.set(K.uiPdaMig, 1); store.set(K.ui, Object.assign({}, store.get(K.ui, {}) || {}, { compact: true })); }
    const uiOpt = k => Object.assign({}, UI_DEF, store.get(K.ui, {}) || {})[k];
    function applyUi() { if (panel) panel.classList.toggle('hbs-compact', !!uiOpt('compact')); drawPin(); }

    // =====================================================================
    // ⬆ UPDATE BANNER (0.2.1): when the Hub's 🧩 Scripts directory lists "Heart Breakers Suite" with a newer version
    // than this one, a banner offers the install link (dismiss = hidden until the next version). Checked at most every
    // 6 hours (op live "scripts" - Greasy Fork's version when the listing links there).
    // =====================================================================
    const cmpVer = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };
    let updEl = null;
    async function checkUpdate() {
        const U = store.get(K.upd, {}) || {};
        if (!U.at || Date.now() - num(U.at) > 30 * 60e3) {   // (0.2.39) fallback only - the Hub pushes the version (updFromHub)
            try { const d = await live('scripts');                     // [HB Suite] Hub API — op live "scripts" (the Scripts directory)
                const x = (d.scripts || []).find(s => /heart breakers suite/i.test(s.name || ''));
                const U2 = store.get(K.upd, {}) || {}, v = x ? String(x.version || '') : '';
                Object.assign(U2, { at: Date.now(), ver: U2.ver && (!v || cmpVer(v, U2.ver) < 0) ? U2.ver : v, url: (x && x.install_url) || U2.url || '' }); store.set(K.upd, U2);
            } catch (e) { /* next time */ }
        }
        drawUpdate();
    }
    // HUB PUSH (0.2.39): the Chain Watch room's state / sync carries {latest, required} (gate/suite_version.js, written
    // when a version is published). A newer `latest` or a changed `required` updates the banner at once.
    const SUITE_INSTALL = 'https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.user.js';
    function updFromHub(sv) {
        const U = store.get(K.upd, {}) || {}, lat = String(sv.latest || ''), req = String(sv.required || '');
        if (!/^\d+(\.\d+)*$/.test(lat) || (req && !/^\d+(\.\d+)*$/.test(req))) return;
        if (U.ver === lat && (U.req || '') === req && U.url) return;
        if (U.ver && cmpVer(lat, U.ver) < 0 && (U.req || '') === req) return;      // never step back to an older "latest"
        Object.assign(U, { at: Date.now(), ver: U.ver && cmpVer(lat, U.ver) < 0 ? U.ver : lat, req, url: U.url || SUITE_INSTALL }); store.set(K.upd, U);
        drawUpdate();
    }
    // how far behind: same major.minor -> the difference in the last number; an older minor / major = far behind
    const verBehind = (mine, latest) => { const a = String(mine).split('.').map(Number), b = String(latest).split('.').map(Number);
        return (a[0] || 0) !== (b[0] || 0) || (a[1] || 0) !== (b[1] || 0) ? 99 : Math.max(0, (b[2] || 0) - (a[2] || 0)); };
    function drawUpdate() {
        if (!updEl) return;
        const U = store.get(K.upd, {}) || {};
        const newer = U.ver && cmpVer(U.ver, VERSION) > 0;
        // (0.2.39, user: "Add the Stronger banner for further out of date scripts. A 'required version' banner when any
        // major updates are pushed.") required = this Suite is older than the version leaders marked required;
        // strong = 3+ versions behind. Both are red and can't be dismissed; required also says so.
        const required = !!(U.req && cmpVer(VERSION, U.req) < 0), strong = newer && verBehind(VERSION, U.ver) >= 3;
        if (required || strong) {
            updEl.style.display = ''; updEl.className = 'hbs-upd hbs-updreq';
            const to = newer ? U.ver : U.req;
            updEl.innerHTML = required
                ? `⛔ <b>Update required</b> - Suite v${esc(to)} has an important fix (you're on v${VERSION}). <a class="hbs-btn hbs-mini" href="${esc(U.url || SUITE_INSTALL)}" target="_blank" rel="noopener">Update now</a>`
                : `⚠ <b>Your Suite is ${verBehind(VERSION, U.ver) >= 99 ? 'far' : verBehind(VERSION, U.ver) + ' versions'} behind</b> (v${VERSION} → v${esc(U.ver)}) - fixes you're missing. <a class="hbs-btn hbs-mini" href="${esc(U.url || SUITE_INSTALL)}" target="_blank" rel="noopener">Update now</a>`;
            return;
        }
        updEl.className = 'hbs-upd';
        const show = newer && U.dismissed !== U.ver;
        updEl.style.display = show ? '' : 'none';
        if (show) updEl.innerHTML = `⬆ Suite <b>v${esc(U.ver)}</b> is out ${U.url ? `- <a href="${esc(U.url)}" target="_blank" rel="noopener">install</a>` : '- see 🧩 Scripts'} <button type="button" data-upd="x" title="Hide until the next version">✕</button>`;
    }

    // =====================================================================
    // 💾 SETTINGS BACKUP + SYNC (0.2.1, user: "Settings Backup, include an option to upload settings to the Hub to
    // share between devices"). What's included: module switches, tab layout, display options, retal sort / FF range,
    // schedule clock choices, sharing choices. NEVER included: your Torn API key, your FFScouter key, sign-ins, caches.
    //   Copy / paste a backup code (base64 JSON), or ⬆ save to / ⬇ load from the Hub (op prefs_put / prefs_get -
    //   your own settings only).
    // =====================================================================
    const SYNC_KEYS = () => [K.mods, K.layout, K.ui, K.rtSort, K.rtFf, K.schTz, K.schHr, K.tab, K.alerts, K.rsRate];   // (0.2.18) recruit criteria = shared ⚙ Criteria; 🛰 collector = this device only
    function prefsCollect() { const o = { v: 1, suite: VERSION, at: Date.now(), s: {} }; SYNC_KEYS().forEach(k => { const v = store.get(k, undefined); if (v !== undefined) o.s[k] = v; }); return o; }
    function prefsApply(o) {
        if (!o || typeof o !== 'object' || !o.s || typeof o.s !== 'object') throw new Error("That isn't a Suite settings backup.");
        const ok = SYNC_KEYS();
        Object.keys(o.s).forEach(k => { if (ok.includes(k)) store.set(k, o.s[k]); });
        Object.keys(MOD).forEach(k => delete MOD[k]); Object.assign(MOD, MOD_DEF, store.get(K.mods, {}) || {});
        LAY = null; tab = store.get(K.tab, 'home');
        buildTabs(); applyUi(); cwWatch();
    }
    const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(String(t).trim())));
    function backupBox(box) {
        box.innerHTML = `<div class="hbs-sec">Backup & sync (display, alerts, recruit settings)</div>
            <div class="hbs-hint">Never includes your API key or FFScouter key.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-bk="up">⬆ Save to the Hub</button><button type="button" class="hbs-btn hbs-ghost" data-bk="down">⬇ Load from the Hub</button>
                <button type="button" class="hbs-btn hbs-ghost" data-bk="copy">📋 Copy backup code</button></div>
            <textarea class="hbs-input" data-bkcode placeholder="Paste a backup code here, then Restore"></textarea>
            <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-bk="restore">Restore from code</button></div>
            <div class="hbs-msg" data-bkmsg></div>`;
        const m = box.querySelector('[data-bkmsg]');
        box.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', async () => {
            const a = b.dataset.bk; m.textContent = '…';
            try {
                if (a === 'up') { const r = await hub('prefs_put', { data: prefsCollect() });          // [HB Suite] Hub API — op prefs_put (own settings)
                    m.innerHTML = `Saved to the Hub ✓ ${fmtDT(Math.floor(num(r.updated) / 1000))} ${tzTagH()} - use ⬇ Load on your other device.`; }
                else if (a === 'down') { const r = await hub('prefs_get');                            // [HB Suite] Hub API — op prefs_get (own settings)
                    if (!r.data) { m.textContent = 'Nothing saved on the Hub yet - use ⬆ Save on the device you want to copy.'; return; }
                    if (!confirm(`Replace this device's layout / module / display settings with the ones saved ${fmtDT(Math.floor(num(r.updated) / 1000))} (Torn time)?`)) { m.textContent = ''; return; }
                    prefsApply(r.data); m.textContent = 'Loaded ✓'; }
                else if (a === 'copy') { const ok = await copyText(b64e(JSON.stringify(prefsCollect()))); m.textContent = ok ? 'Backup code copied ✓ - paste it on the other device.' : "Couldn't copy."; }
                else if (a === 'restore') { const t = box.querySelector('[data-bkcode]').value; if (!t.trim()) { m.textContent = 'Paste a backup code first.'; return; }
                    prefsApply(JSON.parse(b64d(t))); m.textContent = 'Restored ✓'; }
            } catch (e) { m.textContent = e.message || "That didn't work."; }
        }));
    }
    // ⚙ → Display + Chain Watch extras (compact mode, pinned tile, FFScouter key)
    function displayBox(box) {
        const U = Object.assign({}, UI_DEF, store.get(K.ui, {}) || {});
        box.innerHTML = `<div class="hbs-sec">Display (this device)</div>
            <label class="hbs-ck hbs-ckx"><input type="checkbox" data-ui="compact"${U.compact ? ' checked' : ''}> 🗜 Compact mode - smaller cards and text</label>
            <label class="hbs-ck hbs-ckx"><input type="checkbox" data-ui="pin"${U.pin ? ' checked' : ''}> 📌 Pinned Chain Watch tile on every tab</label>
            <div class="hbs-tzrow"><span><b>🕒 Times shown in</b><small>Every clock time and date in the Suite - the same switch as on the chain watching schedule.</small></span>
                <span class="hbs-tzset" data-tzset><span class="hbs-chips">${[['tct', '<span class="hbs-tct" aria-label="TCT"></span>'], ['local', 'Local']].map(([v, l]) => `<button type="button" data-v="${v}" class="${(tzLocal() ? 'local' : 'tct') === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>
                ${tzLocal() ? `<span class="hbs-chips">${[['12', '12h'], ['24', '24h']].map(([v, l]) => `<button type="button" data-hr="${v}" class="${(store.get(K.schHr, '24') === '12' ? '12' : '24') === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>` : ''}</span></div>
`;
        const tz = box.querySelector('[data-tzset]');
        if (tz) tz.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.v) store.set(K.schTz, b.dataset.v); else if (b.dataset.hr) store.set(K.schHr, b.dataset.hr);
            displayBox(box); });
        box.querySelectorAll('[data-ui]').forEach(c => c.addEventListener('change', () => { const u = Object.assign({}, UI_DEF, store.get(K.ui, {}) || {}); u[c.dataset.ui] = c.checked; store.set(K.ui, u); applyUi(); }));
    }

    // the 20 s "I'm hitting" flag running out -> both buttons go back without waiting for the next Hub message
    setInterval(() => { const u = hittingUntil(); if (cw.lastHit && !u) { cw.lastHit = 0; if (pinEl) pinEl.dataset.sig = ''; drawPin();
        if (!collapsed && tab === 'chain' && !cwBusy()) render(true); } else if (u) cw.lastHit = u; }, 1000);

    // =====================================================================
    // 🔔 CHAIN WATCH ALERTS (0.2.3, user: "Alerts for Chain watch need reworked. Pull the same alerts from the old
    // script, add 'Configure Alerts' button with options for each alert and how often they repeat.") — ported from
    // Faction Chain Watch 4.20.6 "My alerts": the Hub TIMES every alert and sends it (`alert` kind timer / up / test
    // / shift_start, and `panic` at 30 s + 15 s); this device delivers it the way the member chose.
    //   Alerts (each: on / off · tone · how often it repeats while it stands · vibrate · flash):
    //     a1 Alert 1 (first warning)  a2 Alert 2  a3 Alert 3 (final - still fires while someone's "hitting")
    //     up "You're up"  panic Panic (30 s / 15 s)  shift Shift started  retal New retal target
    //   Device-wide: volume, desktop notification (tab hidden), TornPDA notification / alarm (most urgent), keep the
    //   screen awake while queued, and PANIC MODE (opt-in, off by default): at Panic, open a weak target's attack
    //   page (level 1-3, inactive 60+ days, not in the faction - scouted with your own key, max 10 tries, else a
    //   random one) - same as Chain Watch 4.20.6.
    // Rules kept from 4.20.6: only the most urgent alert sounds (Panic > 3 > 2 > 1 / up); a repeating alert stops at
    // once when the chain's count changes, the chain dies, the timer is back above the 1st alert, you tap I'm hitting
    // or your hit lands, and after 2 minutes at most; Alerts 1-2 are held while someone's hitting (alerts_paused);
    // "You're up" waits until the timer is inside the 1st-alert window; with several Torn tabs only one alerts (the
    // focused one, else the most recent).
    // =====================================================================
    // seconds -> "1m 45s" / "45s" (user, Nov 14 2026: "Show alerts as minutes")
    const mSec = v => { v = Math.max(0, Math.round(num(v))); const m = Math.floor(v / 60), r = v % 60; return m ? `${m}m${r ? ' ' + r + 's' : ''}` : `${r}s`; };
    const AL_TONES = [['soft', 'Soft'], ['classic', 'Classic'], ['urgent', 'Urgent'], ['chime', 'Chime'], ['pulse', 'Pulse'], ['siren', 'Siren']];
    const AL_REPEAT = [[0, 'Once'], [3, 'Every 3 s'], [5, 'Every 5 s'], [10, 'Every 10 s'], [15, 'Every 15 s'], [30, 'Every 30 s']];
    const AL_KINDS = [  // [key, label, default tone, default repeat (s), level]
        ['a1', 'Alert 1 · first warning', 'soft', 3, 1], ['a2', 'Alert 2 · second warning', 'classic', 3, 2], ['a3', 'Alert 3 · final warning', 'urgent', 3, 3],
        ['panic', 'Panic · 30s / 15s left', 'siren', 3, 4], ['up', "You're up", 'chime', 0, 1], ['shift', 'Your shift started', 'chime', 0, 0], ['retal', 'New retal target', 'pulse', 0, 0]];
    const AL_DEF = () => ({ vol: 80, desktop: false, pdaNotif: true, pdaAlarm: false, wake: true, panicMode: false,
        k: Object.fromEntries(AL_KINDS.map(([k, , tone, rep]) => [k, { on: true, tone, repeat: rep, vibrate: true, flash: true }])) });
    function alCfg() { const s = store.get(K.alerts, null) || {}, d = AL_DEF(); const o = Object.assign(d, s, { k: Object.assign({}, d.k) });
        Object.keys(d.k).forEach(k => { o.k[k] = Object.assign({}, d.k[k], (s.k || {})[k] || {}); });
        // (0.2.6, user: "'You're Up' Alert should only fire once by default") settings saved before 0.2.6 had it repeating
        // every 3 s - moved to Once one time; a repeat you pick afterwards is kept (upOnce marks it done)
        if (!o.upOnce) { o.k.up.repeat = 0; o.upOnce = true; }
        return o; }
    const alSave = c => store.set(K.alerts, c);

    // ---- sound (Web Audio, no files - CSP-safe, same on desktop + PDA) ----
    let alCtx = null;
    function alAudio() { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; if (!alCtx) alCtx = new C();
        if (alCtx.state === 'suspended') alCtx.resume().catch(() => {}); return alCtx; } catch (e) { return null; } }
    ['click', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, function unlock() { alAudio(); window.removeEventListener(ev, unlock, true); }, true));
    function note(ctx, f, at, dur, pk, wave) { try { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave || 'triangle'; o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination); const t0 = ctx.currentTime + at, p = Math.max(pk, 0.0002);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(p, t0 + 0.012); g.gain.exponentialRampToValueAtTime(p * 0.55, t0 + dur * 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.start(t0); o.stop(t0 + dur + 0.04); } catch (e) { /* no audio */ } }
    const voice = (ctx, f, at, dur, pk, w) => { note(ctx, f, at, dur, pk, w); note(ctx, f * 1.004, at, dur, pk * 0.45, w); };
    // the six tones of Chain Watch 4.20.6; urgent adds the high stab
    function alSound(tone, urgent, volPct) {
        const ctx = alAudio(); if (!ctx) return;
        const pk = 0.32 * Math.max(0, Math.min(1, (volPct == null ? alCfg().vol : volPct) / 100)); if (pk <= 0.0005) return;
        if (tone === 'soft') { voice(ctx, 1046.5, 0, 0.28, pk * 0.9, 'sine'); voice(ctx, 783.99, 0.15, 0.34, pk * 0.9, 'sine'); if (urgent) voice(ctx, 1318.5, 0.40, 0.26, pk, 'sine'); }
        else if (tone === 'urgent') { [880, 659.25, 880, 659.25].forEach((f, i) => voice(ctx, f, i * 0.13, 0.11, pk, 'sawtooth')); if (urgent) { voice(ctx, 1046.5, 0.56, 0.12, pk, 'sawtooth'); voice(ctx, 1318.5, 0.70, 0.18, pk, 'sawtooth'); } }
        else if (tone === 'chime') { [659.25, 830.61, 987.77].forEach((f, i) => voice(ctx, f, i * 0.11, 0.17, pk * 0.92, 'triangle')); if (urgent) voice(ctx, 1318.5, 0.36, 0.22, pk, 'triangle'); }
        else if (tone === 'pulse') { [740, 740, 740].forEach((f, i) => voice(ctx, f, i * 0.16, 0.08, pk, 'square')); if (urgent) { voice(ctx, 740, 0.48, 0.08, pk, 'square'); voice(ctx, 740, 0.60, 0.10, pk, 'square'); } }
        else if (tone === 'siren') { [622.25, 932.33, 622.25, 932.33].forEach((f, i) => voice(ctx, f, i * 0.16, 0.15, pk, 'sawtooth')); if (urgent) { voice(ctx, 932.33, 0.64, 0.14, pk, 'sawtooth'); voice(ctx, 1244.5, 0.80, 0.20, pk, 'sawtooth'); } }
        else { voice(ctx, 783.99, 0, 0.14, pk, 'triangle'); voice(ctx, 1046.5, 0.12, 0.14, pk, 'triangle'); voice(ctx, 1318.5, 0.24, 0.22, pk, 'triangle'); if (urgent) voice(ctx, 1568, 0.46, 0.22, pk, 'triangle'); }
    }
    const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* unsupported */ } };
    const origTitle = document.title; let titleT = null;
    function flashTitle(text, ms) { clearInterval(titleT); let on = false; titleT = setInterval(() => { document.title = on ? origTitle : text; on = !on; }, 900);
        setTimeout(() => { clearInterval(titleT); titleT = null; document.title = origTitle; }, ms || 10000); }
    function flashPanel() { [panel, launcher].forEach(n => { if (!n) return; n.classList.add('hbs-alerting'); setTimeout(() => n.classList.remove('hbs-alerting'), 2600); }); }

    // ---- one alert tab when several Torn tabs are open (focused wins, else the most recently active) ----
    const TAB_ID = Math.random().toString(36).slice(2);
    function tabBeat() { try { const now = Date.now(), cur = JSON.parse(localStorage.getItem('hbs_alert_tab') || 'null');
        const focused = !document.hidden;   // (0.2.21) a VISIBLE tab - document.hasFocus() is false in some webviews (TornPDA)
        if (focused || !cur || now - cur.at > 4000 || cur.id === TAB_ID) localStorage.setItem('hbs_alert_tab', JSON.stringify({ id: TAB_ID, at: now, f: focused })); } catch (e) { /* no storage */ } }
    setInterval(tabBeat, 1500); ['focus', 'visibilitychange'].forEach(ev => window.addEventListener(ev, tabBeat));
    function isAlertTab() { try { const cur = JSON.parse(localStorage.getItem('hbs_alert_tab') || 'null'); return !cur || Date.now() - cur.at > 4000 || cur.id === TAB_ID || !document.hidden; } catch (e) { return true; } }

    // ---- notifications ----
    function alText(kind, info) {
        info = info || {};
        if (kind === 'up') return info.reason === 'bonus' ? "★ You're up - take the bonus hit!" : "⚔ You're up - hit now!";
        if (kind === 'shift') return info.text || 'Your chain watch shift has started - join the queue.';
        if (kind === 'retal') return info.text || '↩ Retaliation target available';
        if (kind === 'test') return info.text || "Test alert - this is how you'll be alerted.";
        if (kind === 'panic') return `🚨 PANIC - ${mSec(info.seconds || 0)} left on chain #${int(info.chain || cwChain().current)}!`;
        return `🚨 Chain #${int(info.chain || cwChain().current)} - ${info.seconds ? mSec(info.seconds) + ' left, ' : ''}hit now!`;
    }
    function pdaCall(name, args) { try { if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') return window.flutter_inappwebview.callHandler(name, args); } catch (e) { /* no handler */ } return null; }
    function notifyOut(kind, info, urgent) {
        const C = alCfg(), text = alText(kind, info);
        if (C.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            try { const n = new Notification('⛓ Chain Watch', { body: text, tag: 'hbs-alert', renotify: true }); n.onclick = () => { try { window.focus(); n.close(); } catch (e) { /* */ } }; } catch (e) { /* */ }
        }
        if (isPDA()) {
            if (C.pdaNotif) { pdaCall('showToast', { text: text.slice(0, 120), seconds: 5, clickClose: true, bgColor: { r: 17, g: 19, b: 24, a: 1 }, textColor: { r: 255, g: 180, b: 84, a: 1 } });
                pdaCall('scheduleNotification', { id: 4820, title: '⛓ Chain Watch', subtitle: text.slice(0, 140), timestamp: Date.now() + 1000, overwriteID: true, launchNativeToast: false }); }
            if (C.pdaAlarm && urgent) pdaCall('setAlarm', { timestamp: Date.now() + 1000, vibrate: true, sound: true, message: text.slice(0, 120), id: 4821 });
        }
    }

    // ---- the repeating controller: only the most urgent alert sounds ----
    let alLoop = null, alLevel = 0, alStop = null, alKind = null;
    function alStopAll() { clearInterval(alLoop); alLoop = null; clearTimeout(alStop); alStop = null; alLevel = 0; alKind = null; alFlashUntil = 0; }
    // ⏱ MINIMIZED ICON (0.2.34, user: chain timer on the minimized icon - "This should also flash and alert when the alerts
    // go out. Just like the old Chain Watch script."): while the panel is minimized the launcher shows the live chain
    // timer (amber under the 1st-alert time, red under 30 s), turns red while you're up, and FLASHES for as long as an
    // alert is sounding (10 s for a one-shot alert; faster for Panic). Sound / vibration are the alert's own - they
    // already play whether the panel is open or minimized. Updated once a second; nothing is read from Torn or the Hub.
    let alFlashUntil = 0, alFlashLvl = 0;
    // LEFT THE QUEUE (0.2.36, user: "Leaving the queue does not stop alerts"): leaving stops a sounding / repeating alert
    // and the held "You're up" at once, and chain alerts that still arrive (already on their way, or waiting on the
    // Hub for a polling device) are not sounded. "Not queued" = this device's own flag (set the moment you join / leave)
    // AND the Hub's list both say so - so a join that hasn't reached the Hub yet, or a queue joined on another device,
    // still alerts.
    const alNotQueued = () => !cw.queued && !store.get(K.cwq, false);
    function alLeftQueue() { alStopAll(); alUpHeld = null; if (launcher) launcher.classList.remove('hbs-l-flash', 'hbs-l-panic'); }
    setInterval(() => {
        if (!launcher) return;
        let t = launcher.querySelector('.hbs-ltime');
        const c = cwChain(), live = !!(me && modOn('chain') && c.current > 0 && cw.state && num(c.expires_at) > 0);
        const left = live ? Math.max(0, Math.floor((num(c.expires_at) - cwNow()) / 1000)) : 0;
        if (!live) { if (t) t.remove(); launcher.classList.remove('hbs-l-up'); }
        else {
            if (!t) { t = el('span', 'hbs-ltime'); launcher.appendChild(t); }
            const txt = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
            if (t.textContent !== txt) t.textContent = txt;
            t.className = 'hbs-ltime' + (left <= 30 ? ' red' : left <= topAlertS() ? ' amber' : '');
            const up = cw.queued && num(((cw.state || {}).turn || {}).up) === me.id && c.current >= num(((cw.state || {}).config || {}).minChain);
            launcher.classList.toggle('hbs-l-up', !!up);
        }
        const fl = Date.now() < alFlashUntil;
        launcher.classList.toggle('hbs-l-flash', fl); launcher.classList.toggle('hbs-l-panic', fl && alFlashLvl >= 4);
    }, 1000);
    // (0.2.21: a restored page-load snapshot counts too) (0.2.22: not once the timer has run out - 3 s grace for clock drift;
    // the Hub is asked to confirm the chain is dead, and nothing sounds meanwhile)
    const chainAlive = () => { const c = cwChain(); return c.current > 0 && !!cw.state && num(c.expires_at) - cwNow() > (cwVerifyAt ? 0 : -3000); };   // once the Suite has asked the Hub to confirm: no grace
    // ALERT LOG (0.2.21, user: "None of the alerts are firing for the Suite Chain Watch. Test Alert seems to be working
    // fine"): every alert / panic the Hub sends this device, and what the Suite did with it - sounded, or why not.
    // Shown under ⚙ Configure alerts → 🔍 Alert check (with the Hub's own log for leaders). This device only.
    const alLog = [];
    function alNote(m, result) {
        alLog.push({ at: Date.now(), t: m.t, kind: m.kind || m.t, stage: num(m.stage), chain: num(m.chain), sec: num(m.seconds), result });
        if (alLog.length > 30) alLog.shift();
        if (alOpen && tab === 'chain' && !cwBusy()) render(true);
    }
    const leftS = () => { const c = cwChain(); return c.current > 0 ? (num(c.expires_at) - cwNow()) / 1000 : null; };
    const topAlertS = () => num(((cw.state || {}).config || {}).topAlertSeconds) || 90;
    function alEngage(kind, level, urgent, info) {
        const C = alCfg(), A = C.k[kind]; if (!A || !A.on) return;
        if (alLoop && level < alLevel) return;                     // a more urgent alert is already sounding
        if (alLoop && level === alLevel && alKind === kind) return;
        alStopAll(); alLevel = level; alKind = kind;
        const ring = () => {
            if (level && !chainAlive()) { alStopAll(); return; }
            if (level && alNotQueued()) { alStopAll(); return; }   // (0.2.36) left the queue mid-alert
            // (0.2.21) no "timer back above the 1st alert" stop here any more - it could silence an alert before its
            // first sound when this device's timer read differed from the Hub's; a landed hit (count change) still
            // stops it (alWatch), as do I'm hitting and the 2-minute cap
            alSound(A.tone, urgent);
            if (A.vibrate) buzz(urgent ? [200, 100, 200, 100, 200] : [180, 90, 180]);
        };
        ring();
        alFlashLvl = level; alFlashUntil = Date.now() + (A.repeat > 0 && level ? 120000 : 10000);   // (0.2.34) flash the minimized icon
        if (launcher) { launcher.classList.add('hbs-l-flash'); launcher.classList.toggle('hbs-l-panic', level >= 4); }
        // (0.2.43, user: "Open immediately when alerts fire.") the ⛶ compact tab opens itself so I'm hitting is right there
        try { if (cvGet().on) { cvSig = ''; cvDraw(); } } catch (e) { /* compact view */ }
        if (A.repeat > 0 && level) { alLoop = setInterval(ring, A.repeat * 1000); alStop = setTimeout(alStopAll, 120000); }   // hard cap 2 min
        else alLevel = 0;
        if (A.flash) { flashPanel(); flashTitle(level >= 4 ? '🚨 PANIC!' : kind === 'up' ? "⚔ YOU'RE UP!" : level ? '🚨 CHAIN LOW!' : '🔔 ' + alText(kind, info).slice(0, 30), 10000); }
        toast(alText(kind, info), level >= 2 || kind === 'up');
        notifyOut(kind, info, urgent);
    }
    // a Hub `alert` message
    function cwHubAlert(m) {
        const kind = m.kind, stage = num(m.stage);
        if (kind === 'test') { const A = alCfg().k.a1; alSound(A.tone, false); if (A.vibrate) buzz([180, 90, 180]); flashPanel(); toast(alText('test', m), true); notifyOut('test', m, false); return; }
        if (kind !== 'test' && !isAlertTab()) { alNote(m, 'not sounded - another Torn tab is the alert tab'); return; }
        if ((kind === 'timer' || kind === 'up') && alNotQueued()) { alNote(m, "not sounded - you're not in the queue"); return; }   // (0.2.36)
        if (kind === 'shift_start') { alEngage('shift', 0, false, { text: m.text }); alNote(m, 'sounded'); return; }
        // (0.2.19 FIX, user: "Confirm alerts are firing correctly. I don't believe they are."): the Hub sends "You're up"
        // ONCE, the moment you become #1 - usually right after a hit, with ~5 min on the timer. It was dropped here when
        // the timer was above the 1st alert, so it almost never sounded. Now it's HELD and goes off once the timer
        // enters the 1st-alert window - as long as you're still the one up (cleared if someone else becomes #1).
        if (kind === 'up') { const rem = leftS();
            if (rem != null && rem > topAlertS()) { alUpHeld = m; alNote(m, `held until ${mSec(topAlertS())} left`); return; }
            alUpHeld = null; alEngage('up', 1, false, m); alNote(m, 'sounded'); return; }
        if (kind !== 'timer') { alNote(m, 'ignored (unknown kind)'); return; }
        // (0.2.21 FIX) stale = a hit has landed since the Hub sent it (this device sees a higher count). It used to be
        // dropped when this device's timer read was above the 1st alert, and when the Suite only had its page-load
        // snapshot - both could silently drop every alert.
        if (num(m.chain) && cwChain().current > num(m.chain)) { alNote(m, `not sounded - chain already at ${cwChain().current}`); return; }
        if (!chainAlive()) { alNote(m, 'not sounded - the chain timer has run out'); return; }
        cw.state = cw.state || {};
        const stages = [num((cw.state.config || {}).topAlertSeconds), num((cw.state.config || {}).restAlertSeconds), num((cw.state.config || {}).thirdAlertSeconds)].filter(x => x > 0).length || 3;
        const final = stage >= 3 || m.most_urgent || stage >= stages;
        const paused = (cw.state.alerts_paused && num(cw.state.alerts_paused.until) > cwNow()) || (cw.state.queue || []).some(q => num(q.hitting_until) > cwNow());
        if (!final && paused) { alNote(m, "not sounded - someone's hitting"); return; }   // alerts 1-2 held while someone's hitting; the final one still fires
        const ak = final ? 'a3' : stage >= 2 ? 'a2' : 'a1';
        alNote(m, alCfg().k[ak].on ? (alLoop && alLevel > (final ? 3 : stage >= 2 ? 2 : 1) ? 'not sounded - a more urgent alert is sounding' : 'sounded') : 'off in your alert settings');
        alEngage(ak, final ? 3 : stage >= 2 ? 2 : 1, final, m);
    }
    let alUpHeld = null;                                           // a "You're up" waiting for the 1st-alert window
    setInterval(() => {
        if (!alUpHeld) return;
        const S = cw.state || {}, up = num((S.turn || {}).up);
        if (!chainAlive() || (up && up !== me.id)) { alUpHeld = null; return; }   // no longer yours
        const rem = leftS(); if (rem == null || rem > topAlertS()) return;
        const m = alUpHeld; alUpHeld = null;
        if (isAlertTab()) { alEngage('up', 1, false, m); alNote(m, 'sounded (held "You\'re up")'); }
    }, 1000);
    // a Hub `panic` message (30 s, then 15 s) - one-shot per chain lap
    let panicLap = { chain: -1, s1: false, s2: false };
    function cwHubPanic(m) {
        // (0.2.21) the Hub only sends Panic to queued members - no local "am I queued" check (it could lag the Hub)
        if (!isAlertTab()) { alNote(m, 'not sounded - another Torn tab is the alert tab'); return; }
        if (alNotQueued()) { alNote(m, "not sounded - you're not in the queue"); return; }   // (0.2.36)
        const count = num(m.chain) || cwChain().current;
        if (cwChain().current > count) { alNote(m, `not sounded - chain already at ${cwChain().current}`); return; }
        if (!chainAlive()) { alNote(m, 'not sounded - the chain timer has run out'); return; }
        if (panicLap.chain !== count) panicLap = { chain: count, s1: false, s2: false };
        const first = num(m.seconds) > 15; if (first ? panicLap.s1 : panicLap.s2) { alNote(m, 'duplicate'); return; } if (first) panicLap.s1 = true; else panicLap.s2 = true;
        alNote(m, alCfg().k.panic.on ? 'sounded' + (alCfg().panicMode ? ' + Panic Mode target' : '') : 'off in your alert settings');
        alEngage('panic', 4, true, { seconds: m.seconds, chain: count });
        if (alCfg().panicMode) openPanicTarget();
    }
    // PANIC MODE: open a weak target (your own key, at most 10 profile reads, then a random id) - as Chain Watch 4.20.6
    const panicId = () => 1000000 + Math.floor(Math.random() * 2400001);
    async function openPanicTarget() {
        let id = null;
        for (let i = 0; i < 10 && !id && getKey(); i++) {
            const x = panicId();
            try {
                // [HB Suite] Torn API — Panic Mode: one random player's profile (alive, level 1-3, inactive 60+ days, not us)
                const d = await tornGet(`https://api.torn.com/user/${x}?selections=profile`);
                const ok = d && d.status && d.status.state === 'Okay', lvl = num(d && d.level) || 999, la = num(d && d.last_action && d.last_action.timestamp);
                if (ok && lvl >= 1 && lvl <= 3 && la && Date.now() / 1000 - la > 60 * 86400 && !(d.faction && num(d.faction.faction_id) === FACTION_ID)) id = x;
            } catch (e) { /* next */ }
        }
        openAttack(id || panicId());
    }
    // (0.2.85) open a player's attack page (new tab where the browser allows; PDA: same page)
    function openAttack(id) {
        const url = `https://www.torn.com/page.php?sid=attack&user2ID=${id}`;
        try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, { active: true, insert: true, setParent: true }); return; } } catch (e) { /* fall through */ }
        try { if (window.open(url, '_blank')) return; } catch (e) { /* fall through */ }
        location.assign(url);
    }
    // (0.2.85) ⛓🎯 WAR TARGET - see the 0.2.85 changelog. Returns {pid, name, ff} or {why}.
    const WAR_TARGET_FF_MAX = 2.0, WAR_TARGET_POOL = 5;
    async function warTarget() {
        const W = warNow(); if (!W || W.kind !== 'ongoing') return { why: 'no war on' };
        if (!ffKey()) return { why: 'no FFScouter key in ⚙' };
        const fid = num(W.opponent_id);
        if (wt.fid !== fid) { wt.fid = fid; wt.mem = null; wt.memAt = 0; }
        if (!wt.mem || Date.now() - wt.memAt > 30000) {
            let r = null;
            // [HB Suite] Hub API — op "war_feed" get: the enemy faction list other Suites already read (no Torn call)
            try { r = await hub('war_feed', { do: 'get', fid }); } catch (e) { r = null; }
            if (r && r.members && !r.read) wt.mem = r.members;
            else {
                // [HB Suite] Torn API — Chain Watch 🎯 Target in a war: the enemy faction's members + status (your key; only
                // when the Hub's shared list is over 30 s old and no other Suite is reading it)
                const d = await tornGet(`https://api.torn.com/faction/${fid}?selections=basic`);
                wt.mem = Object.entries((d && d.members) || {}).map(([pid, m]) => ({ pid: num(pid), name: m.name || '#' + pid, level: num(m.level),
                    state: String((m.status || {}).state || ''), until: num((m.status || {}).until), la: String((m.last_action || {}).status || '') }));
                // [HB Suite] Hub API — op "war_feed" put: that list, for every other Suite (names, levels, status - no key)
                if (r && r.read && wt.mem.length) hub('war_feed', { do: 'put', fid, members: wt.mem }).catch(() => {});
            }
            wt.memAt = Date.now();
        }
        if (!wt.mem || !wt.mem.length) return { why: 'the enemy list is empty' };
        let C = store.get(K.warFF, null) || {};
        const wst = num(W.start);
        if (num(C.fid) !== fid || num(C.war) !== wst || wt.mem.some(x => !(C.m || {})[x.pid])) { await warFF(); C = store.get(K.warFF, null) || {}; }
        const F = (num(C.fid) === fid && C.m) || {};
        const ok = wt.mem.filter(x => x.state === 'Okay').map(x => Object.assign({}, x, { ff: F[x.pid] && F[x.pid].ff != null ? Number(F[x.pid].ff) : null }))
            .filter(x => x.ff != null && x.ff <= WAR_TARGET_FF_MAX).sort((a, b) => a.ff - b.ff).slice(0, WAR_TARGET_POOL);
        if (!ok.length) return { why: wt.ffErr || `nobody available at FF ${WAR_TARGET_FF_MAX.toFixed(1)} or lower` };
        return ok[Math.floor(Math.random() * ok.length)];
    }
    // stop a sounding alert when the count moves (hit / break / reset) or you're hitting
    let alLastCount = null;
    function alWatch() { const c = cwChain().current; if (alLastCount != null && c !== alLastCount) { alStopAll(); panicLap = { chain: -1, s1: false, s2: false }; } alLastCount = c; }

    // ---- keep the screen awake while queued ----
    let wakeLock = null;
    function wakeSync() {
        try {
            const want = cw.queued && alCfg().wake && !document.hidden && 'wakeLock' in navigator;
            if (want && !wakeLock) navigator.wakeLock.request('screen').then(w => { wakeLock = w; w.addEventListener('release', () => { wakeLock = null; }); }).catch(() => { wakeLock = null; });
            else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; }
        } catch (e) { wakeLock = null; }
    }
    setInterval(wakeSync, 5000); document.addEventListener('visibilitychange', wakeSync);

    // ---- ⚙ Configure alerts (Chain tab) ----
    let alOpen = false;
    function alertsCfgHtml() {
        if (!alOpen) return '';
        const C = alCfg(), sel = (attr, opts, v) => `<select class="hbs-input" ${attr}>${opts.map(([o, l]) => `<option value="${o}"${String(o) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        const perm = typeof Notification === 'undefined' ? 'n/a' : Notification.permission;
        return `<div class="hbs-card hbs-alcfg">
            <div class="hbs-sub"><b>Every alert</b> - turn it on / off, pick its tone (▶ to hear it) and how often it repeats while it stands. Stored on this device.</div>
            ${AL_KINDS.map(([k, label]) => { const A = C.k[k];
                return `<div class="hbs-alrow"><label class="hbs-ck"><input type="checkbox" data-al="${k}.on"${A.on ? ' checked' : ''}> <b>${label}</b></label>
                    <div class="hbs-row">${sel(`data-al="${k}.tone"`, AL_TONES, A.tone)}<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-alplay="${k}">▶</button>
                    ${k === 'shift' || k === 'retal' ? '' : sel(`data-al="${k}.repeat"`, AL_REPEAT, A.repeat)}</div>
                    <div class="hbs-row"><label class="hbs-ck"><input type="checkbox" data-al="${k}.vibrate"${A.vibrate ? ' checked' : ''}> Vibrate</label>
                    <label class="hbs-ck"><input type="checkbox" data-al="${k}.flash"${A.flash ? ' checked' : ''}> Flash</label></div></div>`; }).join('')}
            <div class="hbs-sec">This device</div>
            <div class="hbs-row"><span class="hbs-hint">Volume</span><input type="range" min="0" max="100" step="5" data-alg="vol" value="${C.vol}"><span class="hbs-hint" data-alvol>${C.vol}%</span></div>
            <label class="hbs-ck"><input type="checkbox" data-alg="desktop"${C.desktop ? ' checked' : ''}> Desktop notification (when Torn is in the background)${perm === 'denied' ? ' - blocked in the browser' : ''}</label>
            ${isPDA() ? `<label class="hbs-ck"><input type="checkbox" data-alg="pdaNotif"${C.pdaNotif ? ' checked' : ''}> TornPDA notification</label>
            <label class="hbs-ck"><input type="checkbox" data-alg="pdaAlarm"${C.pdaAlarm ? ' checked' : ''}> TornPDA alarm (final alert + Panic)</label>` : ''}
            <label class="hbs-ck"><input type="checkbox" data-alg="wake"${C.wake ? ' checked' : ''}> Keep the screen awake while queued</label>
            <label class="hbs-ck"><input type="checkbox" data-alg="panicMode"${C.panicMode ? ' checked' : ''}> 🚨 Panic Mode - at Panic, open a weak target's attack page</label>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-cw="test">🔔 Test my alerts</button>
                <button type="button" class="hbs-btn hbs-ghost" data-alpanictest>🚨 Test Panic Mode</button><button type="button" class="hbs-btn hbs-ghost" data-alreset>Reset alerts</button></div>
            ${alCheckHtml()}</div>`;
    }
    // 🔍 ALERT CHECK (0.2.21): what reached this device + (leaders) the Hub's own view - why it is / isn't alerting,
    // the queue as the Hub sees it (who's connected how), and the last 30 alerts it sent and to whom
    const tAgo = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago'; };
    const alLabel = x => x.kind === 'panic' || x.t === 'panic' ? `Panic ${mSec(x.sec || (x.stage === 2 ? 15 : 30))}` : x.kind === 'timer' ? `Alert ${x.stage}` : x.kind === 'up' ? "You're up" : x.kind;
    function alCheckHtml() {
        const D = cw.diag, lead = !!((cw.state || {}).me || {}).is_leader;
        let out = `<div class="hbs-sec">🔍 Alert check</div>
            <div class="hbs-hint">Connection: <b>${cw.ws && cw.ws.readyState === 1 ? 'live socket' : cw.syncT ? 'polling (no socket)' : 'not connected'}</b> · ${cw.queued ? 'in the queue' : 'not queued'} · this tab ${isAlertTab() ? '<b>is</b>' : 'is <b>not</b>'} the alert tab</div>
            <div class="hbs-sub"><b>Received on this device</b> (since this page loaded)</div>`
            + (alLog.length ? `<div class="hbs-allog">${alLog.slice().reverse().map(x => `<div><span>${tAgo(x.at)}</span><b>${esc(alLabel(x))}</b> #${int(x.chain)}<em>${esc(x.result)}</em></div>`).join('')}</div>`
                : '<div class="hbs-hint">Nothing yet - no chain alerts have reached this page.</div>');
        if (lead) {
            out += `<div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-aldiag>${D ? '↻ Ask the Hub again' : 'Ask the Hub what it sent'}</button></div>`;
            if (D) out += `<div class="hbs-sub"><b>The Hub</b> (${tAgo(cwLocal(D.now))}): ${esc(D.why)}</div>
                <div class="hbs-hint">Chain ${int(D.chain)}${D.left != null ? ` · ${mSec(D.left)} left` : ''}${D.src ? ` (from ${esc(D.src)})` : ''} · alerts at ${esc((D.stages || []).map(mSec).join(' / '))} · min chain ${int(D.min_chain)} · ${int(D.sockets)} live + ${int(D.sync_devices)} polling</div>
                <div class="hbs-hint${D.api_err ? ' hbs-bad' : ''}">Torn API (Hub's own read${D.api_read_at ? ', ' + tAgo(cwLocal(D.api_read_at)) : ''}): ${D.api_err ? '⚠ failed - ' + esc(D.api_err)
                    : D.api ? `chain ${int(D.api.cur)}${D.api.cur > 0 ? ' · ' + mSec(D.api.left) + ' left' : ''}` : 'no answer yet'}${D.api_low ? ` · ⚠ ${int(D.api_low)} lower-than-known answer${D.api_low === 1 ? '' : 's'} ignored` : ''}${D.page_at ? ' · last page reading ' + tAgo(cwLocal(D.page_at)) : ''}</div>
                ${(D.queue || []).length ? `<div class="hbs-allog">${D.queue.map(q => `<div><b>${esc(q.name)}</b><em>${q.via === 'ws' ? 'live' : q.via === 'sync' ? 'polling' : '⚠ not connected'}${q.can_hit ? '' : ' · can\'t attack'}${q.away ? ' · away' : ''}${q.presence !== 'active' ? ' · ' + esc(q.presence) : ''}</em></div>`).join('')}</div>` : ''}
                <div class="hbs-sub"><b>Sent by the Hub</b> (last ${(D.log || []).length})</div>
                ${(D.log || []).length ? `<div class="hbs-allog">${D.log.slice().reverse().map(x => `<div><span>${tAgo(cwLocal(x.at))}</span><b>${esc(alLabel(x))}</b> #${int(x.chain)}${x.left != null ? ` · ${x.left}s` : ''}<em>→ ${x.to.map(t => esc(t.name || '#' + t.pid) + (t.via === 'ws' ? '' : t.via === 'held' ? ' (poll)' : ' ⚠')).join(', ') || 'nobody'}</em></div>`).join('')}</div>`
                    : '<div class="hbs-hint">The Hub hasn\'t sent any alerts since it last restarted.</div>'}`;
        }
        return out;
    }
    function alertsCfgBind() {
        const dg = bodyEl.querySelector('[data-aldiag]'); if (dg) dg.addEventListener('click', () => { cwSend({ t: 'diag' }); toast('Asking the Hub…'); });
        const t = bodyEl.querySelector('[data-alopen]'); if (t) t.addEventListener('click', () => { alOpen = !alOpen; render(true); });
        bodyEl.querySelectorAll('[data-al]').forEach(i => i.addEventListener('change', () => {
            const [k, f] = i.dataset.al.split('.'), C = alCfg();
            C.k[k][f] = i.type === 'checkbox' ? i.checked : f === 'repeat' ? Number(i.value) : i.value; alSave(C);
            if (f === 'tone') alSound(i.value, k === 'panic' || k === 'a3');
        }));
        bodyEl.querySelectorAll('[data-alplay]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.alplay; alSound(alCfg().k[k].tone, k === 'panic' || k === 'a3'); }));
        bodyEl.querySelectorAll('[data-alg]').forEach(i => i.addEventListener(i.type === 'range' ? 'input' : 'change', () => {
            const C = alCfg(), k = i.dataset.alg; C[k] = i.type === 'checkbox' ? i.checked : Number(i.value); alSave(C);
            if (k === 'vol') { const v = bodyEl.querySelector('[data-alvol]'); if (v) v.textContent = i.value + '%'; }
            if (k === 'desktop' && i.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted')
                Notification.requestPermission().then(p => { if (p !== 'granted') { const c2 = alCfg(); c2.desktop = false; alSave(c2); i.checked = false; } });
            if (k === 'wake') wakeSync();
        }));
        const vr = bodyEl.querySelector('[data-alg="vol"]'); if (vr) vr.addEventListener('change', () => alSound(alCfg().k.a1.tone, false));
        // 🚨 Test Panic Mode (0.2.6, user: "Allow 'Test Panic Mode' Test Panic Alert and open random target"): the Panic
        // alert as you set it (tone, vibrate, flash, notification) + opens a target's attack page exactly like Panic Mode
        const pt = bodyEl.querySelector('[data-alpanictest]'); if (pt) pt.addEventListener('click', () => {
            const A = alCfg().k.panic; alSound(A.tone, true); if (A.vibrate) buzz([200, 100, 200, 100, 200]);
            if (A.flash) { flashPanel(); flashTitle('🚨 PANIC TEST', 5000); }
            toast('🚨 Panic test - opening a target…', true); notifyOut('test', { text: '🚨 Panic Mode test' }, true);
            pt.disabled = true; openPanicTarget().finally(() => { pt.disabled = false; });
        });
        const rs = bodyEl.querySelector('[data-alreset]'); if (rs) rs.addEventListener('click', () => { if (confirm('Put every alert back to the defaults?')) { alSave(AL_DEF()); render(true); } });
    }


    // =====================================================================
    // ⛶ COMPACT VIEW (0.2.42, user: "Create a 'Compact' view that is best for TornPDA ... focus mainly on the chain timer,
    // your position and the I'm Hitting button" -> "Provide an option for the Original and Smaller Open/Close. All should
    // be side mounted and minimize on click, with the small timer still showing as a clickable Open button. This needs
    // to be vertically adjustable ... Allow left and right mounting. The option for this should be located on the Chain
    // page as a 'Compact View' button.")
    //   - An edge tab (#hbs-compact) mounted on the left or right edge, shown INSTEAD of the round launcher while the
    //     Suite is minimized and Compact view is on. Closed = the small timer (tap = open). Open = timer, your position
    //     and I'm hitting / Join queue; a tap anywhere else on the open card closes it again; ⤢ opens the full Suite.
    //   - Two sizes: Original ('l') and Smaller ('s'). Drag it up / down (pointer events, touch-action none) - the
    //     height is remembered and kept on screen. Per device: K.cwCompact {on, size, side, y, open}.
    //   - Timer amber under the 1st alert, red under 30 s; green edge when you're up, amber when you're backup; flashes
    //     while an alert sounds (the same alFlashUntil as the launcher). Redrawn once a second from what the Suite
    //     already has - no extra Torn / Hub reads.
    // =====================================================================
    // (0.2.46, user: "No Smaller, Closed chain watch compact view. That's way too small. Clicking any of the chain watch
    // compact views should reopen the chain watch panel.") Three views now, picked on the Chain tab - Original ('l'),
    // Smaller ('s') and Timer only ('t' = the old Original closed tab); the tiny Smaller-closed tab is gone and there is
    // no tap-to-open/close any more: a tap anywhere but the button opens the full Suite on the Chain tab. `open` in the
    // saved settings is no longer used. Timer only still shows the Original card while an alert is flashing (0.2.43's
    // "Open immediately when alerts fire"), so I'm hitting is one tap away.
    const CV_DEF = { on: false, size: 'l', side: 'right', y: 140, open: true };
    const cvGet = () => Object.assign({}, CV_DEF, store.get(K.cwCompact, {}) || {});
    function cvSet(p) { store.set(K.cwCompact, Object.assign(cvGet(), p)); cvSig = ''; cvDraw(); }
    let cvEl = null, cvSig = '';
    const cvShown = () => { const C = cvGet(); return !!(C.on && collapsed && me && modOn('chain')); };
    function cvEnsure() {
        if (cvEl) return;
        cvEl = el('div'); cvEl.id = 'hbs-compact'; cvEl.style.touchAction = 'none';
        document.body.appendChild(cvEl);
        // drag up / down, or tap (under 6 px of movement): the button acts, ⤢ opens the Suite, anything else opens / closes
        let d = null;
        cvEl.addEventListener('pointerdown', e => { if (e.button) return; d = { y: e.clientY, top: cvEl.getBoundingClientRect().top, moved: false, id: e.pointerId, t: e.target };
            try { cvEl.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
        cvEl.addEventListener('pointermove', e => { if (!d || e.pointerId !== d.id) return; const dy = e.clientY - d.y;
            if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return; d.moved = true; e.preventDefault();
            cvEl.style.top = cvClampY(d.top + dy) + 'px'; });
        const up = e => { if (!d || e.pointerId !== d.id) return; const was = d; d = null;
            try { cvEl.releasePointerCapture(e.pointerId); } catch (x) { /* */ }
            if (was.moved) { store.set(K.cwCompact, Object.assign(cvGet(), { y: Math.round(cvEl.getBoundingClientRect().top) })); return; }
            const b = was.t && was.t.closest ? was.t.closest('[data-cv]') : null, a = b ? b.dataset.cv : '';
            if (a !== 'hit' && a !== 'join') { setCollapsed(false); tab = 'chain'; store.set(K.tab, tab); render(); cvDraw(); return; }
            if (a === 'hit' || a === 'join') { cwAction(a === 'hit' ? 'hitting' : 'join').then(() => { cvSig = ''; cvDraw(); }, () => {}); cvSig = ''; setTimeout(cvDraw, 60); return; }
            };
        cvEl.addEventListener('pointerup', up); cvEl.addEventListener('pointercancel', () => { d = null; });
        window.addEventListener('resize', () => { if (cvEl && cvShown()) cvEl.style.top = cvClampY(cvGet().y) + 'px'; });
    }
    const cvClampY = y => Math.max(6, Math.min(Math.max(6, window.innerHeight - (cvEl ? cvEl.offsetHeight : 60) - 6), num(y)));
    function cvDraw() {
        const show = cvShown();
        if (launcher) launcher.classList.toggle('hbs-cvhide', show);     // the edge tab stands in for the round launcher
        if (!show) { if (cvEl) cvEl.style.display = 'none'; cvSig = ''; return; }
        cvEnsure();
        const C = cvGet(), S = cw.state || {}, c = cwChain(), live = c.current > 0 && num(c.expires_at) > 0;
        const left = live ? Math.max(0, Math.floor((num(c.expires_at) - cwNow()) / 1000)) : 0;
        const txt = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        const t = S.turn || {}, upMe = cw.queued && num(t.up) === me.id, bkMe = cw.queued && !upMe && num(t.backup) === me.id;
        const hitU = hittingUntil(), flash = Date.now() < alFlashUntil;
        const tcls = !live ? 'dim' : left <= 30 ? 'red' : left <= topAlertS() ? 'amber' : '';
        const posS = cw.queued ? '#' + (cw.queuePos || '?') : '–';
        const posL = !cw.queued ? 'Not queued' : upMe ? "You're up" : `You're #${cw.queuePos || '?'}${bkMe ? ' · backup' : ''}`;
        const btn = !cw.queued ? `<button type="button" class="b" data-cv="join">Join queue</button>`
            : `<button type="button" class="b${hitU ? ' on' : ''}" data-cv="hit">${hitU ? '✋ Hitting' : "⚔ I'm hitting"}</button>`;
        const size = C.size === 't' && flash ? 'l' : C.size, open = size !== 't';
        const sig = [size, C.side, txt, tcls, posL, !!hitU, live ? c.current : 0, flash, upMe, bkMe].join('|');
        cvEl.style.display = '';
        cvEl.className = `cv-${open ? size : 'l'} cv-${C.side}${open ? ' open' : ''}${upMe ? ' up' : bkMe ? ' bk' : ''}${flash ? ' flash' : ''}${flash && alFlashLvl >= 4 ? ' panic' : ''}`;
        if (sig === cvSig) return;
        cvSig = sig;
        cvEl.title = 'Open Chain Watch';
        cvEl.innerHTML = !open
            ? `<div class="t ${tcls}">${txt}</div><div class="p">${posS}</div>`
            : size === 'l'
                ? `<div class="s">${live ? 'Chain ' + int(c.current) : 'No live chain'}</div>
                   <div class="t ${tcls}">${txt}</div><div class="pl"><span>${posL}</span></div>${btn}`
                : `<div class="r"><span class="t ${tcls}">${txt}</span><span class="pl"><span>${posS}</span></span></div>${btn}`;
        cvEl.style.top = cvClampY(C.y) + 'px';
    }
    setInterval(() => { if (cvGet().on || cvEl) cvDraw(); }, 1000);
    // the "Compact View" button + its options on the Chain tab
    let cvOptOpen = false;
    function cvChainHtml() {
        const C = cvGet();
        const pick = (k, opts) => `<span class="hbs-chips" data-cvset="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(C[k]) === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>`;
        return `<div class="hbs-actions"><button type="button" class="hbs-btn${cvOptOpen ? '' : ' hbs-ghost'}" data-cvopt>⛶ Compact View ${cvOptOpen ? '▾' : '▸'}</button></div>`
            + (cvOptOpen ? `<div class="hbs-card hbs-cvopt"><div class="hbs-sub">A small tab on the edge of the screen with the chain timer, your position and the I'm hitting button - shown while the Suite is minimized. Tap it to open Chain Watch, drag it up or down.</div>
                <div class="hbs-cfgrow"><span><b>View</b></span>${pick('size', [['l', 'Original'], ['s', 'Smaller'], ['t', 'Timer only']])}</div>
                <div class="hbs-cfgrow"><span><b>Side</b></span>${pick('side', [['left', 'Left'], ['right', 'Right']])}</div>
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-cvgo>${C.on ? 'Switch to compact view now' : 'Turn on compact view'}</button>
                    ${C.on ? '<button type="button" class="hbs-btn hbs-ghost" data-cvoff>Turn off</button>' : ''}</div>
                <div class="hbs-hint">${C.on ? 'On - minimizing the Suite shows the compact tab instead of the round icon.' : 'Off - minimizing the Suite shows the round icon.'}</div></div>` : '');
    }
    function cvChainBind() {
        const o = bodyEl.querySelector('[data-cvopt]'); if (o) o.addEventListener('click', () => { cvOptOpen = !cvOptOpen; render(true); });
        bodyEl.querySelectorAll('[data-cvset]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return;
            cvSet({ [g.dataset.cvset]: b.dataset.v }); render(true); }));
        const go = bodyEl.querySelector('[data-cvgo]'); if (go) go.addEventListener('click', () => { cvSet({ on: true, open: true }); setCollapsed(true); cvDraw(); });
        const off = bodyEl.querySelector('[data-cvoff]'); if (off) off.addEventListener('click', () => { cvSet({ on: false }); render(true); });
    }

    // =====================================================================
    // 💩 DUMPING HITS (0.2.48, user: "a 'Dumping hits' function. This is for users who join the queue, but need to dump
    // their energy quickly before going offline ... protects the chain bonuses towards expected targets")
    //   User's choices: buffer = leader-set, in the same Chain settings section as Dumping on/off; "Warnings only, cover
    //   the button but uncover it on clicking with a warning"; anyone in the queue may dump; told automatically when
    //   dumping reopens after a bonus; the cover applies "Only [to] those marked as dumping"; the cover keeps its own
    //   leader switch; "Faster count is fine. Send updates frequently as a dumper so the chain remains accurate";
    //   "The button to dump should be much smaller footprint. Maybe even a poop icon".
    //   - 💩 icon button at the end of the queue button row (only when leaders have dumping on and you're queued).
    //     Tap -> the Hub answers with an allowance ({t:'dump', kind:'offer'}) -> one confirm line -> Start.
    //   - While dumping: a slim progress line; the icon is lit, tap it to stop. Others see "💩 N left" on your row and
    //     you are outside the #1 / #2 order (Hub).
    //   - Count: +1 each time the chain count goes up while you're on an attack page (reported to the Hub at once);
    //     the Hub's stop_at chain count is the hard limit either way. While dumping the script syncs every 3 s.
    //   - STOP (kind 'stop'): red banner + sound; the queue row stays "stopped" until that bonus is taken, then the Hub
    //     sends kind 'reopen'. Finishing with no energy left (kind 'done', finished) leaves the queue for you.
    //   - Attack-page cover (config.dumpCover, dumpers only - dumping or stopped): while the chain is inside the
    //     protected hits and you aren't the assigned bonus hitter, Torn's Start fight / Join fight button is covered by
    //     #hbs-dmcover. One tap uncovers it for this page and leaves a warning. Nothing is ever pressed for the user;
    //     the page is only looked at while the tab is focused and visible. Mirror of the state in K.cwDump so the cover
    //     works on a fresh attack page before the Hub's first answer.
    //   No Torn API calls. Hub messages: {t:'dump', do:'ask'|'start'|'hit'|'stop'}.
    // =====================================================================
    const dm = { offer: null, asking: false, msg: '', stop: null, uncovered: false, warnUntil: 0 };
    const dmGet = () => store.get(K.cwDump, null) || {};
    const dmSet = p => store.set(K.cwDump, Object.assign(dmGet(), p));
    const dmCfg = () => (cw.state && cw.state.config) || {};
    const dmMine = () => { const r = me && ((cw.state || {}).queue || []).find(x => num(x.pid) === me.id); return (r && r.dump) || null; };
    const dmOnAttack = () => /[?&]sid=attack\b/.test(location.search) || /loader\.php/.test(location.pathname) && /sid=attack/.test(location.href);
    function dmBtnHtml() {
        if (!cw.queued || !dmCfg().dumpOn) return '';
        const d = dmMine(), lit = (d && d.st === 'on') || dm.offer || dm.asking;
        return `<button type="button" class="hbs-btn hbs-ghost hbs-dmbtn${lit ? ' on' : ''}" data-dm="toggle" title="${d && d.st === 'on' ? 'Stop dumping' : 'Dump energy - burn your hits fast before going offline (bonus hits stay protected)'}">💩</button>`;
    }
    function dmLineHtml() {
        if (!cw.queued || !dmCfg().dumpOn) return '';
        const d = dmMine(), S = dmGet();
        if (d && d.st === 'on') { const done = Math.max(num(d.done), num(S.done));
            return `<div class="hbs-dmline"><span>💩 <b>${int(done)} / ${int(d.allow)}</b></span><i><em style="width:${Math.min(100, Math.round(done / Math.max(1, num(d.allow)) * 100))}%"></em></i><small>stop at ${int(d.stop_at)}</small></div>`; }
        // (0.2.53 FIX, user: "This 'Dump' alert never disappears when the chain dies.") the STOP banner only shows while
        // the Hub still lists you as a dumper - when the chain ends (or the bonus is taken) the Hub drops that and the
        // banner goes with it; before, a STOP remembered by the script stayed up for ever
        if (d && (d.st === 'stopped' || dm.stop)) return `<div class="hbs-dmstop"><b>STOP · bonus protected</b><span>${esc((dm.stop && dm.stop.text) || S.stopText || `Hits before the bonus at ${int((d || {}).bonus)} are reserved.`)}</span><small>You'll be told when dumping opens again.</small></div>`;
        if (dm.offer) return `<div class="hbs-dmline"><span>Dump <b>${int(dm.offer.allow)} hit${num(dm.offer.allow) === 1 ? '' : 's'}</b> · stop at ${int(dm.offer.stop_at)}</span><button type="button" class="hbs-btn" data-dm="start">Start</button><button type="button" class="hbs-btn hbs-ghost" data-dm="cancel" title="Cancel">✕</button></div>`;
        if (dm.asking) return `<div class="hbs-dmline"><span>Asking the Hub…</span></div>`;
        if (dm.msg) return `<div class="hbs-dmline"><span>💩 ${esc(dm.msg)}</span><button type="button" class="hbs-btn hbs-ghost" data-dm="cancel" title="Dismiss">✕</button></div>`;
        return '';
    }
    function dmBind() {
        bodyEl.querySelectorAll('[data-dm]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.dm, d = dmMine();
            if (a === 'toggle') {
                if (d && d.st === 'on') { cwSend({ t: 'dump', do: 'stop' }); store.set(K.cwDump, null); dm.msg = 'Stopped dumping.'; }   // [HB Suite] Hub - Chain Watch message "dump" stop
                else if (dm.offer || dm.asking) { dm.offer = null; dm.asking = false; }
                else { dm.msg = ''; dm.asking = true; cwSend({ t: 'dump', do: 'ask' });                                                // [HB Suite] Hub - Chain Watch message "dump" ask
                    setTimeout(() => { if (dm.asking) { dm.asking = false; dm.msg = 'No answer from the Hub - try again.'; cwShow(); } }, 12000); }
            } else if (a === 'start') { if (!dm.offer) return;
                dmSet({ done: 0, last: num(cwChain().current), st: 'on', stopText: '' }); dm.offer = null; dm.asking = true;
                setTimeout(() => { if (dm.asking) { dm.asking = false; cwShow(); } }, 12000);
                cwSend({ t: 'dump', do: 'start' });                                                                                    // [HB Suite] Hub - Chain Watch message "dump" start
            } else if (a === 'cancel') { dm.offer = null; dm.asking = false; dm.msg = ''; }
            render(true);
        }));
    }
    // messages {t:'dump', kind} from the Hub (cwIn)
    function dmIn(m) {
        dm.asking = false;
        if (m.kind === 'offer') { dm.offer = m; dm.msg = ''; }
        else if (m.kind === 'refused') { dm.offer = null; dm.msg = m.text || 'Not right now.'; toast('💩 ' + dm.msg, false); }
        else if (m.kind === 'started') { dm.offer = null; dm.stop = null; dm.msg = '';
            dmSet({ st: 'on', done: 0, last: num(m.chain) || num(cwChain().current), bonus: num(m.bonus), buffer: num(m.buffer), stopText: '' });
            toast(`💩 Dumping - ${int(m.allow)} hit${num(m.allow) === 1 ? '' : 's'}, stop at chain ${int(m.stop_at)}.`, true); }
        else if (m.kind === 'stop') { dm.stop = { text: m.text || 'STOP - bonus protected.' }; dmSet({ st: 'stopped', bonus: num(m.bonus), buffer: num(m.buffer), stopText: dm.stop.text });
            alertMe('🛑 ' + dm.stop.text, true); try { alSound('urgent', true); } catch (e) { /* audio blocked */ } }
        else if (m.kind === 'done') { dm.stop = null; dm.msg = m.text || 'Dump finished.'; store.set(K.cwDump, null); toast('💩 ' + dm.msg, true);
            // out of energy and finished: off the queue, as designed ("it leaves the queue for you, since you're going offline")
            if (m.finished && cw.queued) { try { cwAction('leave'); } catch (e) { /* */ } } }
        else if (m.kind === 'reopen') { dm.stop = null; dm.msg = m.text || 'Dumping is open again.'; store.set(K.cwDump, null); alertMe('💩 ' + dm.msg, true); }
        cwShow();
    }
    // count + keep the Hub fresh while dumping (every 500 ms; a sync every 3 s)
    let dmSyncAt = 0;
    setInterval(() => {
        try {
            if (!me || !modOn('chain')) return;
            const d = dmMine(), S = dmGet();
            if (d && (d.st !== S.st || S.cover !== (dmCfg().dumpCover !== false))) dmSet({ st: d.st, bonus: num(d.bonus), buffer: num(dmCfg().dumpBuffer), cover: dmCfg().dumpCover !== false });                       // mirror for the next page load
            if (!d && cw.state && !dm.asking) {                                                     // the Hub no longer lists us as dumping
                if (S.st) store.set(K.cwDump, null);
                if (dm.stop) { dm.stop = null; cwShow(); }                                          // (0.2.53) chain over / bonus taken: STOP banner off
            }
            if (d && d.st === 'on') {
                const cur = num(cwChain().current), last = num(S.last);
                if (cur > last) {
                    const p = { last: cur };
                    if (last > 0 && dmOnAttack() && !document.hidden) { p.done = Math.max(num(S.done), num(d.done)) + 1;
                        cwSend({ t: 'dump', do: 'hit', done: p.done }); }                           // [HB Suite] Hub - Chain Watch message "dump" hit (your count)
                    dmSet(p); cwShow();
                } else if (!last && cur) dmSet({ last: cur });
                if (Date.now() - dmSyncAt > 3000) { dmSyncAt = Date.now(); cwSyncSoon(); }          // "Send updates frequently as a dumper"
            }
            dmCover();
        } catch (e) { /* never break the page */ }
    }, 500);
    // the attack-page cover
    let dmCovEl = null, dmWarnEl = null;
    function dmCoverWanted() {
        if (dm.uncovered || !dmOnAttack() || !pageScrapeAllowed()) return null;
        const S = dmGet(), d = dmMine(), g = dmCfg(), have = !!cw.state;
        if (!(have ? d : S.st)) return null;                                                        // dumpers only (dumping or stopped)
        if (have ? g.dumpCover === false || !g.dumpOn : S.cover === false) return null;
        let cur = num(cwChain().current);
        if (!cur) { const sn = store.get(K.cwSnap, null); if (sn && sn.chain && Date.now() - num(sn.at) < 120000) cur = num(sn.chain.current); }
        if (!(cur > 0)) return null;
        const b = (cw.state || {}).bonus || {}, buf = num(g.dumpBuffer) || num(S.buffer) || 10;
        let next = num(b.next) || num(S.bonus); if (next === 10) next = 25;       // (0.2.54, user: "Exempt 10 bonus from dump protection.")
        if (!next || next <= cur || next - cur > buf) return null;
        if (b.pid && me && num(b.pid) === me.id) return null;                                       // you ARE the bonus hitter
        return { cur, next, name: b.name || '' };
    }
    function dmFindBtn() {
        const els = document.querySelectorAll('button, [role="button"], input[type="submit"]');
        for (const x of els) { if (x.closest('#hbs-panel, #hbs-compact, #hbs-dmcover')) continue;
            const t = (x.textContent || x.value || '').trim(); if (!/^(start|join) fight$/i.test(t)) continue;
            const r = x.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return r; }
        return null;
    }
    function dmCover() {
        const w = dmCoverWanted(), r = w ? dmFindBtn() : null;
        if (dmWarnEl && Date.now() > dm.warnUntil) { dmWarnEl.remove(); dmWarnEl = null; }
        if (!w || !r) { if (dmCovEl) { dmCovEl.remove(); dmCovEl = null; } return; }
        if (!dmCovEl) {
            dmCovEl = el('div'); dmCovEl.id = 'hbs-dmcover'; document.body.appendChild(dmCovEl);
            dmCovEl.addEventListener('click', e => { e.preventDefault(); e.stopPropagation();
                dm.uncovered = true; if (dmCovEl) { dmCovEl.remove(); dmCovEl = null; }
                const x = dmCoverWanted.last || {};
                dmWarnEl = el('div'); dmWarnEl.id = 'hbs-dmwarn'; dmWarnEl.innerHTML = `<b>Uncovered.</b> Chain ${int(x.cur)} of ${int(x.next)}. Only hit if leaders asked you to. The cover returns on the next attack page.`;
                document.body.appendChild(dmWarnEl); dm.warnUntil = Date.now() + 20000; });
        }
        dmCoverWanted.last = w;
        const W = Math.max(r.width + 16, 230), H = Math.max(r.height + 16, 74), vw = window.innerWidth;
        dmCovEl.style.cssText = `left:${Math.max(4, Math.min(vw - W - 4, r.left + r.width / 2 - W / 2))}px;top:${Math.max(4, r.top + r.height / 2 - H / 2)}px;width:${W}px;min-height:${H}px;`;
        const html = `<b>🛡 Bonus protected · chain ${int(w.cur)} of ${int(w.next)}</b><span>This hit could take the bonus${w.name ? ` - the assigned hitter is ${esc(w.name)}` : ''}.</span><u>Tap to uncover the attack button</u>`;
        if (dmCovEl._h !== html) { dmCovEl.innerHTML = html; dmCovEl._h = html; }
        const hh = dmCovEl.offsetHeight; if (hh > H) dmCovEl.style.top = Math.max(4, r.top + r.height / 2 - hh / 2) + 'px';   // the text wrapped: keep it centred on the button
    }
    // =====================================================================
    // 0.2.4 MODULES (Nov 14 2026, user's list):
    //   🕵 OC tab → Leaders: the 📣 Notify list (with the last contact time), ⏰ delayed crimes, ⏸ paused planning and
    //      🧰 LOANS - the OC Optimizer 1.76.0 Loans system: "To loan" (members missing their seat's item - from the Hub's
    //      crimes, no member call) and "Unused loans" (utilities loaned to a member who needs them for no OC - read with
    //      YOUR key on Refresh: faction/?selections=utilities `loaned_to`), with the same Torn-rules-safe page helpers:
    //      on the faction Armoury page the rows to act on are outlined (green = loan, red = retrieve); Loan / Retrieve
    //      scroll to the row and open Torn's own form (Loan fills the member) - YOU press Torn's LOAN / Yes.
    //   💾 view state: tab, open member profile, open cards, ⚙ open and the scroll position of each tab survive a page
    //      reload and closing / reopening the panel (K.view).
    //   👤 any member's name in the Suite opens their profile here ("← Back" returns to where you were).
    // =====================================================================

    // ---------- 💾 view state ----------
    const VIEW0 = (() => { try { return store.get(K.view, null) || {}; } catch (e) { return {}; } })();
    let profileBack = VIEW0.back || null;           // the tab a profile was opened from (null = Members)
    let viewHoldUntil = 0, viewUserScrolled = false;
    const viewKey = () => showSettings ? 'settings' : tab + (tab === 'members' && profileId ? ':' + profileId : '');
    function viewSave() {
        const v = store.get(K.view, null) || {};
        v.pid = profileId || null; v.back = profileBack || null; v.open = Object.assign({}, open); v.set = !!showSettings;
        v.scroll = v.scroll || {};
        store.set(K.view, v);
    }
    let viewScrollT = null;
    function viewOnScroll() {
        if (Date.now() < viewHoldUntil || !bodyEl) return;
        viewUserScrolled = true;
        clearTimeout(viewScrollT);
        viewScrollT = setTimeout(() => { const v = store.get(K.view, null) || {}; v.scroll = v.scroll || {};
            v.scroll[viewKey()] = Math.round(bodyEl.scrollTop); store.set(K.view, v); }, 250);
    }
    const viewHold = () => { viewHoldUntil = Date.now() + 900; viewUserScrolled = false; };
    // after a full (non-quiet) render: back to where you were on this tab (again a moment later - images / late cards)
    function viewRestore() {
        viewSave();
        const want = num(((store.get(K.view, null) || {}).scroll || {})[viewKey()]);
        viewHoldUntil = Date.now() + 900;
        if (!want) return;
        bodyEl.scrollTop = want;
        setTimeout(() => { if (!viewUserScrolled && bodyEl.scrollTop < want) { viewHoldUntil = Date.now() + 300; bodyEl.scrollTop = want; } }, 450);
    }

    // ---------- 👤 member names -> their Suite profile ----------
    function isMemberId(id) {
        const c = cache['m:db/members.json'], M = c && c.data;
        return !!(M && (M.members || []).some(m => num(m.id) === num(id)));
    }
    function openProfile(pid) {
        if (!(tab === 'members' && profileId)) profileBack = tab === 'members' ? null : tab;
        profileId = Number(pid); tab = 'members'; store.set(K.tab, tab); showSettings = false;
        viewSave(); render(); bodyEl.scrollTop = 0;
    }
    function closeProfile() {
        profileId = null;
        if (profileBack && tabOk(profileBack)) { tab = profileBack; store.set(K.tab, tab); }
        profileBack = null; viewSave(); render();
    }

    // ---------- ⚔ your war summary (War tab) ----------
    async function warSummaryHtml() {
        const W = await readOpt('m', 'db/wars.json');
        const mine = ((W && W.wars) || []).map(w => (w.m || []).find(r => num(r[0]) === me.id)).filter(Boolean);
        const n = mine.length, hits = mine.reduce((a, r) => a + num(r[1]), 0), resp = mine.reduce((a, r) => a + num(r[2]), 0);
        return `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">⚔ Your war summary</span></div>
            ${n ? '<div class="hbs-ctiles">' + tiles([[int(n), 'Wars involved'], [int(hits), 'Total war hits'], [int(resp), 'Total respect'],
                [(hits / n).toFixed(1), 'Avg hits / war'], [int(resp / n), 'Avg respect / war']]) + '</div>'
                : '<div class="hbs-hint">No ranked wars on record for you yet.</div>'}</div>`;
    }

    // ---------- 🕵 OC tab → Leaders ----------
    let ocLead = null;                               // the last op live "spawn" reply (leaders)
    const loanIgnored = () => new Set(store.get(K.loanIgn, []) || []);
    const loanRead = () => store.get(K.loanCache, null) || {};
    function loanWrite(p) { const c = Object.assign(loanRead(), p); store.set(K.loanCache, c); return c; }
    let loanView = 'toloan', loanBusy = false, loanErr = '';
    // (0.2.79) lay the Hub's loaned-utilities list over the local one. force = the answer to our own page report.
    function loanFromHub(S, N, force) {
        const C = loanRead(), at = num(S.loaned_at), v = num(S.loaned_v);
        if (!at || !Array.isArray(S.loaned)) return false;
        if (!force && C.usrc === 'hub' && v <= num(C.uv)) return false;             // nothing new (or an older, remembered answer)
        if (!force && C.usrc === 'me' && num(C.uts) > at) return false;             // your own Refresh is newer
        loanWrite({ unused: S.loaned.filter(e => e && (N.byId[e.pid] || {}).current !== false).map(e => ({ pid: num(e.pid), name: nameOf(N, e.pid), iid: num(e.iid), item: e.item || '#' + e.iid })),
            uts: at, usrc: 'hub', uv: v });
        return true;
    }
    async function ocLeadersHtml() {
        // [HB Suite] Hub API — op "live" what "spawn" (leaders): Notify list, delayed / paused crimes, missing items
        // (0.2.62, user: "Open Loans tab to Heart Stoppers+HR+Leadership roles.") non-leader loan staff read what "loans":
        // just the two loan lists (missing / needs) - [HB Suite] Hub API — op "live" what "loans"
        ocLead = await live(me.leader ? 'spawn' : 'loans').catch(() => null);
        const S = ocLead || {}, N = await names().catch(() => ({ byId: {} }));
        const pl = (pid, name) => `<a href="#" data-prof="${pid}">${esc(name || nameOf(N, pid))}</a>`;
        let out = sec('Leaders');
        // 📣 NOTIFY - same list + buttons as 🔔 Alerts (shared contact log, timestamped)
        const NT = S.oc_notify || [];
        notifyList = NT; notifyTplS = S.notify_tpl || null;
        const todo = NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position)).length;
        const lastAt = c => c && c.at ? ` · last contact ${new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
        out += cmCard('ocntf', '📣', 'Notify (no OC script)', `<b class="hbs-foldn">${todo}</b><small>to do</small>`, todo > 0, `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">📣 Notify (no OC script)</span><span class="hbs-chip">${todo} to do</span></div>`
            + (NT.length ? `<div class="hbs-hint">They can't see their OC seat. ✉️ opens the mail with the subject and message filled in; 💬 opens their profile - tap Chat and the message is typed in. You press Send. ✓ just logs it. Every leader sees the contact.</div>`
                + ntfListHtml(NT, x => pl(x.pid, x.name), 0)     // (0.2.81) grouped, one-line rows
                + '<div class="hbs-hint" data-ntfmsg></div>'
            : '<div class="hbs-hint">✅ Nobody to notify.</div>') + '</div>');
        // ⏰ DELAYED - ready crimes held up by a member
        const D = S.delays || [];
        out += cmCard('ocdel', '⏰', 'Delayed crimes', `<b class="hbs-foldn">${D.length}</b>`, D.length > 0, `<div class="hbs-card ${D.length ? 'hbs-red' : ''}"><div class="hbs-r1"><span class="hbs-name">⏰ Delayed crimes</span><span class="hbs-chip">${D.length}</span></div>`
            + (D.length ? D.map(d => `<div class="hbs-li"><span><a href="${OC_LINK(d.crime_id)}"><b>${esc(d.crime)}</b></a> #${esc(d.crime_id)}
                    ${(d.members || []).map(m => `<br>${pl(m.pid, m.name)} · ${esc(m.position)} - <b class="hbs-bad">${esc(m.reason)}</b>`).join('')}</span>
                    <span>${d.since ? `late ${dur((Date.now() - num(d.since)) / 1000)}` : ''}</span></div>`).join('')
                : '<div class="hbs-hint">✅ No ready crime is held up.</div>') + '</div>');
        // ⏸ PAUSED - everyone finished planning, a seat is still open
        const P = S.paused || [];
        out += cmCard('ocpau', '⏸️', 'Paused planning', `<b class="hbs-foldn">${P.length}</b>`, false, `<div class="hbs-card ${P.length ? 'hbs-alert' : ''}"><div class="hbs-r1"><span class="hbs-name">⏸️ Paused planning</span><span class="hbs-chip">${P.length}</span></div>`
            + (P.length ? P.map(c => `<div class="hbs-li"><span><a href="${OC_LINK(c.crime_id)}"><b>${esc(c.crime)}</b></a> #${esc(c.crime_id)} · ${c.filled}/${c.seats} filled
                    <br><span style="opacity:.75">open: ${esc((c.open || []).join(', ') || '?')}${c.expired_at ? ` · expires ${new Date(c.expired_at * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span></span></div>`).join('')
                : '<div class="hbs-hint">✅ No crime is waiting on an empty seat.</div>') + '</div>');
        // 🧰 LOANS (OC Optimizer) - To loan (Hub) / Unused loans (your key, on Refresh)
        const missing = Array.isArray(S.missing) ? S.missing : (loanRead().missing || []);
        // (0.2.15 FIX, user: "Some entries were showing up that were actively used by crimes ... when I was ignoring certain
        // entries, they would show up in between items"): every Ignore / tab redraw re-reads the Hub; when that read
        // failed (or came back without the lists) the saved "needs" were overwritten with an EMPTY list, so tools in use
        // briefly counted as unused. Now the lists are only replaced by a good answer.
        if (ocLead && Array.isArray(S.needs)) loanWrite({ missing, needs: S.needs, mts: Date.now() });
        if (ocLead && Array.isArray(S.loaned)) loanFromHub(S, N);    // (0.2.79) the Hub's own 15-minute utilities reading
        loanHighlight();
        const C = loanRead(), ig = loanIgnored(), unused = (C.unused || []).filter(e => !ig.has(e.pid + ':' + e.iid) && !(C.needs || []).includes(e.pid + ':' + e.iid));
        const onArm = onArmoury();
        // (0.2.9) the Loans card is handed back separately (ocLoansOut) - the OC tab shows it above Your OC summary
        const before = out; out = '';
        out += `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🧰 Loans</span></div>
            ${chips('loanv', [['toloan', `To loan · ${missing.length}`], ['unused', `Unused loans${C.unused ? ' · ' + unused.length : ''}`]], loanView)}
            <div class="hbs-hint">${onArm ? `You're on the Armoury: rows to <b style="color:#7cfc9a">loan</b> / <b style="color:#ff7a70">retrieve</b> are outlined. Loan opens Torn's form with the member filled in, Retrieve opens Torn's confirm - you press Torn's own LOAN / Yes.`
                : `Open your faction <a href="https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&sub=utilities&start=0">Armoury → Utilities</a>, then press Loan / Retrieve here to jump to the row.`}</div>`;
        if (loanView === 'toloan') out += missing.length ? missing.map(m => `<div class="hbs-li"><span><b>${esc(m.item || '#' + m.item_id)}</b> → ${pl(m.pid, m.name)}
                <br><span style="opacity:.75">${esc(m.crime)} #${esc(m.crime_id)} · ${esc(m.position)} · ${esc(m.status)}</span></span>
                <button type="button" class="hbs-btn" data-loan="loan" data-iid="${m.item_id}" data-pid="${m.pid}" data-name="${esc(m.name)}">Loan</button></div>`).join('')
            : '<div class="hbs-hint">✅ Every member in a crime has their item.</div>';
        else {
            out += `<div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-loanref${loanBusy ? ' disabled' : ''}>${loanBusy ? 'Reading…' : '↻ Refresh'}</button>
                ${ig.size ? `<button type="button" class="hbs-btn hbs-ghost" data-loanreset>Reset ignored (${ig.size})</button>` : ''}</div>
                ${C.uts ? `<div class="hbs-hint">Checked ${ago(Math.floor(C.uts / 1000))}${C.usrc === 'hub' ? ' by the Hub - it reads every 15 minutes, and right away when an item seat empties' : C.usrc === 'me' ? ' with your key' : ''} · utilities only (temporary items ignored)</div>` : '<div class="hbs-hint">The Hub reads the loaned utilities every 15 minutes. Refresh reads them once with your key (needs faction API access).</div>'}
                ${loanErr ? `<div class="hbs-msg">${esc(loanErr)}</div>` : ''}`;
            out += C.unused ? (unused.length ? unused.map(e => `<div class="hbs-li"><span><b>${esc(e.item)}</b> · loaned to ${pl(e.pid, e.name)}<br><span style="opacity:.75">not needed for any OC</span></span>
                <span style="white-space:nowrap"><button type="button" class="hbs-btn" data-loan="retrieve" data-iid="${e.iid}" data-pid="${e.pid}" data-name="${esc(e.name)}">Retrieve</button>
                <button type="button" class="hbs-btn hbs-ghost" data-loanign="${e.pid}:${e.iid}">Ignore</button></span></div>`).join('')
                : '<div class="hbs-hint">✅ No loaned utilities that nobody needs.</div>') : '';
        }
        ocLoansOut = cmCard('ocloan', '🧰', 'Loans', `<b class="hbs-foldn">${missing.length}</b><small>to loan${C.unused ? ' · ' + unused.length + ' unused' : ''}</small>`, missing.length > 0, out + '</div>') + await ocDeployedHtml() + ocSharingHtml();   // (0.2.23) 🚀 Deployed crimes + 📡 Sharing folds under 🧰 Loans
        return before;
    }
    let ocLoansOut = '';
    // 💬 NOTIFY CHAT FILL (0.2.23, user: "'Notify' for OCs should also create the message for you, like the Recruitment
    // tab does"): 💬 opens the member's profile; when you open the chat with them there, the new chat box gets the
    // message typed in for you (it's still copied as a fallback). You press Enter / Send - nothing is sent for you.
    function ocChatFill() {
        const P = store.get(K.chatFill, null);
        if (!P || Date.now() - num(P.at) > 180000) return;
        if (!/profiles\.php/.test(location.href) || !new RegExp('XID=' + P.pid + '(\\D|$)').test(location.href)) return;
        const vis = e => !!(e && e.getClientRects().length);
        const before = new Set([...document.querySelectorAll('textarea')]);
        let n = 0;
        const t = setInterval(() => {
            if (++n > 240) { clearInterval(t); return; }                       // 3 minutes
            if (document.hidden) return;
            const ta = [...document.querySelectorAll('textarea')].find(x => !before.has(x) && vis(x) && !x.closest('#hbs-panel') && !x.value);
            if (!ta) return;
            clearInterval(t); store.set(K.chatFill, null);
            rsSetInput(ta, P.text); try { ta.focus(); } catch (e) { /* */ }
            toast('💬 Message typed in for you - check it and press Enter to send.', true);
        }, 750);
    }
    setTimeout(ocChatFill, 0);
    // 🚀 DEPLOYED CRIMES (0.2.23, user: "Show Deployed Crimes in the OC Tab within a dropdown. Put this under the Loans
    // tab. This should only be seen by leadership."): the live OC plan's teams (Hub op live "deployed", leaders only -
    // the same teams as OC Management → 🚀 Deployed). Closed by default (remembered per device); read from the Hub only
    // while it's open, at most once a minute.
    const ocDep = { at: 0, d: null, err: '' };
    const ocDepOpen = () => !!store.get(K.ocDepOpen, false);
    const ocShareOpen = () => !!store.get(K.ocShareOpen, false);
    // 📡 SHARING (0.2.23, user: "Create a 'Sharing' dropdown also for members who are sharing their CPR rates. Only
    // visible by leadership."): every current member - sharing their checkpoint pass rates with the Hub (and when they
    // last did) or not. From the same Hub read as 🚀 Deployed crimes; closed by default, remembered per device.
    function ocSharingHtml() {
        if (!(me && me.leader)) return '';
        const open = ocShareOpen(), L = (ocDep.d && ocDep.d.sharing) || null;
        const yes = L ? L.filter(x => x.sharing).sort((a, b) => num(b.last) - num(a.last)) : [], no = L ? L.filter(x => !x.sharing) : [];
        const meta = L ? `<b class="hbs-foldn">${yes.length}</b><small>of ${L.length}</small>` : '<small>tap to load</small>';
        let out = cwFold('data-ocshare', '📡', 'Sharing CPR rates', meta, open, false);
        if (!open) return out;
        if (!L) return out + `<div class="hbs-foldb"><div class="hbs-hint">${ocDep.busy ? 'Loading…' : ocDep.err ? esc(ocDep.err) : 'Not available right now.'}</div></div>`;
        // (0.2.56, user: 'Add a "Notify" button next to the "No Script" users on the "Not Sharing CPR" list. Add a "Last
        // Notified" timestamp.') no-script members get ✉ Notify (a pre-filled Torn mail asking them to install the Suite -
        // you press Send) and "notified x ago by Leader" underneath, shared between leaders (Hub op "cprnote")
        const NT = (ocDep.d && ocDep.d.cpr_notified) || {};
        const noScr = x => !x.sharing && !x.off && !x.script;
        const noteOf = x => { const n = NT[String(x.pid)]; return n && n.ts ? `<small class="nt">notified ${ago(Math.floor(num(n.ts) / 1000))}${n.by ? ' by ' + esc(n.by) : ''}</small>` : ''; };
        // (0.2.77) the Suite version that member's script last reported - amber when older than this Suite
        const verCmp = (a, b) => { const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number); return (A[0] - B[0]) || (A[1] - B[1]) || (A[2] - B[2]); };
        const verTag = x => x.ver ? ` <small style="color:${verCmp(x.ver, VERSION) < 0 ? '#FFB454' : '#8a93a3'};font-weight:normal" title="Suite version${x.pda ? ' · Torn PDA' : ''}">v${esc(x.ver)}${x.pda ? ' 📱' : ''}</small>` : '';
        const row = (x, ok) => `<div class="hbs-depm"><a href="#" data-prof="${num(x.pid)}">${esc(x.name)}</a>${verTag(x)}${!ok && noScr(x) ? `<button type="button" class="hbs-btn hbs-cprn" data-cprnote="${num(x.pid)}" data-name="${esc(x.name)}" title="Open a Torn mail to ${esc(x.name)} with the Suite's install link filled in - you press Send">✉ Notify</button>` : ''}
            <span class="s ${ok ? 'ok' : 'no'}">${ok ? (x.last ? '✓ ' + ago(Math.floor(num(x.last) / (num(x.last) > 1e12 ? 1000 : 1))) : '✓ sharing')
                // (0.2.55, user's fix 2) why not: they switched OC pass rates off / their script runs but hasn't sent a rate yet / no script seen
                : x.off ? '✕ script running · sharing off' : x.script ? '… script running · no rates yet' : '✕ no script'}</span>${!ok && noScr(x) ? noteOf(x) : ''}</div>`;
        return out + `<div class="hbs-foldb"><div class="hbs-hint">Members whose script (or opt-in key) sends their checkpoint pass rates to the Hub, so the planner can seat them in roles they pass. Rates themselves aren't shown. The time is when their script last sent them (when their crime changes, a new crime appears, or once an hour while it runs). The small number is their Suite version.</div>
            <div class="hbs-sec">Sharing · ${yes.length}</div>${yes.length ? yes.map(x => row(x, true)).join('') : '<div class="hbs-hint">Nobody yet.</div>'}
            <div class="hbs-sec">Not sharing · ${no.length}</div>${no.length ? no.map(x => row(x, false)).join('') : '<div class="hbs-hint">✅ Everyone shares.</div>'}</div>`;
    }
    const SUITE_GF = 'https://greasyfork.org/en/scripts/605562-heart-breakers-suite';
    const INVITE_DEFAULT = {
        subject: 'Please install the Heart Breakers Suite',
        mail: 'Hi {name},\n\nHeart Breakers now runs on one script: the **Heart Breakers Suite**. It shows your Organized Crime assignment, Chain Watch and more, and shares your OC pass rates with the Hub so leaders can seat you in the roles you pass best.\n\n'
            + 'Please install it here: [Heart Breakers Suite]({scripts})\n\nThanks! 💗' };
    async function cprNotify(pid, name) {
        // (0.2.56, user: "Add an editor for the text to the hub.") the wording leaders saved on OC Management -> Notify ->
        // "Edit the script invite" (live "deployed" invite_tpl {subject, mail}); blank = INVITE_DEFAULT (keep in step
        // with the page). Fill-ins {name} {scripts} {hub}.
        const T = (ocDep.d && ocDep.d.invite_tpl) || {};
        const fill = t => String(t).replace(/\{(name|scripts|hub)\}/g, (m, k) => k === 'name' ? String(name || '') : k === 'scripts' ? SUITE_GF : HUB_BASE + '/m/');
        const md = fill(T.mail || INVITE_DEFAULT.mail), subject = mdPlain(fill(T.subject || INVITE_DEFAULT.subject));
        const html = mdHtml(md), text = mdPlain(md);
        store.set(K.mailFill, { pid: Number(pid), subject, html, text, at: Date.now() });   // filled into Torn's compose page (rsMailFill) - never sent for you
        await copyRich(html, text).catch(() => false);
        // [HB Suite] Hub API — op "cprnote": record that you notified this member (leaders; shown to every leader)
        hub('cprnote', { pid: Number(pid) }).then(r => { if (ocDep.d) { ocDep.d.cpr_notified = ocDep.d.cpr_notified || {}; ocDep.d.cpr_notified[String(pid)] = { ts: (r && r.ts) || Date.now(), by: (r && r.by) || (me && me.name) || '' }; }
            if (!collapsed && tab === 'oc') render(true); }, () => {});
        toast('Opening the mail - subject and message are filled in; check it and press Send. (Also copied.)', true);
        const url = `https://www.torn.com/messages.php#/p=compose&XID=${Number(pid)}`;
        const w = window.open(url, '_blank'); if (!w) location.href = url;   // PDA / popup blocked: same tab
    }
    const DEP_ST = { needs_spawn: ['needs spawning', 'hbs-red'], recruiting: ['recruiting', 'hbs-green'], spawned: ['spawned', ''] };
    async function ocDeployedHtml() {
        if (!(me && me.leader)) return '';
        const open = ocDepOpen();
        // (0.2.24, user: "Clicking ... 'Sharing CPR Rates' and 'Deployed Crimes' it takes a moment to respond"): the read
        // runs in the BACKGROUND - the fold opens at once (with "Loading…" the first time) and fills in when the Hub answers
        if ((open || ocShareOpen()) && !ocDep.busy && (!ocDep.d || Date.now() - ocDep.at > 60000)) {   // one read feeds both folds
            ocDep.busy = true;
            live('deployed').then(d => { ocDep.d = d; ocDep.err = ''; }, e => { ocDep.err = e.message || 'Could not read the plan.'; })   // [HB Suite] Hub API — op "live" what "deployed" (leaders: the live OC plan's teams)
                .then(() => { ocDep.at = Date.now(); ocDep.busy = false; if (tab === 'oc' && !collapsed && !cwBusy()) render(true); });
        }
        const T = (ocDep.d && ocDep.d.teams) || [], need = T.filter(t => t.status === 'needs_spawn').length;
        const meta = ocDep.d ? `<b class="hbs-foldn">${T.length}</b>${need ? ` <small class="hbs-bad">${need} to spawn</small>` : ''}` : '<small>tap to load</small>';
        let out = cwFold('data-ocdep', '🚀', 'Deployed crimes', meta, open, need > 0);
        if (!open) return out;
        out += '<div class="hbs-foldb">' + (!ocDep.d && ocDep.busy ? '<div class="hbs-hint">Loading the plan…</div>' : '') + (ocDep.err ? `<div class="hbs-hint hbs-bad">${esc(ocDep.err)}</div>` : '')
            + (ocDep.d && ocDep.d.plan_ts ? `<div class="hbs-hint">Plan deployed ${ago(Math.floor(num(ocDep.d.plan_ts) / 1000))} · ${T.length} team${T.length === 1 ? '' : 's'}</div>` : '');
        out += T.length ? T.map(t => { const st = DEP_ST[t.status] || [t.status || '?', ''], M = t.members || [], joined = M.filter(m => m.joined).length, nOpen = (t.open || []).filter(o => !o.taken_by).length;
            
            return `<div class="hbs-card hbs-dep"><div class="hbs-r1"><span class="hbs-name">${t.crime_id ? `<a href="${OC_LINK(t.crime_id)}">${esc(t.crime)}</a> <small>#${esc(String(t.crime_id))}</small>` : esc(t.crime)}</span>
                    <span class="hbs-tag ${st[1]}">${st[0]}</span></div>
                <div class="hbs-sub">${t.difficulty != null ? `Difficulty ${esc(String(t.difficulty))} · ` : ''}${joined}/${M.length} joined${nOpen ? ` · <b class="hbs-bad">${nOpen} unfilled</b>` : ''}${t.success && t.success.chance != null ? ` · 🎲 ${(+t.success.chance).toFixed(1)}% calculated` : ''}${t.success_weighted != null ? ` · ${(+t.success_weighted).toFixed(1)}% weighted` : ''}${t.pay_day_max ? ` · ~$${big(t.pay_day_max)}/day (est)` : ''}</div>
                ${M.map(m => `<div class="hbs-depm t"><span class="r">${esc(m.slot || m.position)}${m.weight != null ? `<small class="hbs-wt">${m.weight}% weight</small>` : ''}</span><span class="n"><a href="#" data-prof="${num(m.pid)}">${esc(m.name)}</a>
                    <span class="s ${m.joined ? 'ok' : m.queued ? 'q' : 'no'}">${m.joined ? '✓ joined' : m.queued ? '⏳ queued' + (m.free_at ? (() => { const f = num(m.free_at) > 1e12 ? num(m.free_at) : num(m.free_at) * 1000; return f > Date.now() ? ' · free in ' + dur((f - Date.now()) / 1000) : ' · free now'; })() : '') : '✕ not joined'}</span></span>
                    ${m.rate != null ? `<span class="p">${Math.round(m.rate)}%</span>` : ''}</div>`).join('')}
                ${(t.open || []).map(o => `<div class="hbs-depm t open"><span class="r">${esc(o.position)}${o.weight != null ? `<small class="hbs-wt">${o.weight}% weight</small>` : ''}</span>
                    <span class="n">${o.taken_by ? `<a href="#" data-prof="${num(o.taken_by.pid)}">${esc(o.taken_by.name)}</a><span class="s q">seated · not on the plan</span>`
                        : `<i>unfilled</i><span class="s no">nobody assigned${o.item && o.item.name ? ' · needs ' + esc(o.item.name) : ''}</span>`}</span><span class="p"></span></div>`).join('')}</div>`; }).join('')
            : (ocDep.d ? '<div class="hbs-hint">No teams in the deployed plan.</div>' : '');
        return out + '</div>';
    }
    function ocLeadersBind() {
        bodyEl.querySelectorAll('[data-chips="loanv"] button').forEach(b => b.addEventListener('click', () => { loanView = b.dataset.v || b.dataset.val || b.value; render(true); }));
        bodyEl.querySelectorAll('[data-loan]').forEach(b => b.addEventListener('click', () => armouryAct(b.dataset.loan, Number(b.dataset.iid), Number(b.dataset.pid), b.dataset.name)));
        bodyEl.querySelectorAll('[data-loanign]').forEach(b => b.addEventListener('click', () => { const s = loanIgnored(); s.add(b.dataset.loanign); store.set(K.loanIgn, [...s]); render(true); }));
        const rs = bodyEl.querySelector('[data-loanreset]'); if (rs) rs.addEventListener('click', () => { if (confirm('Show every ignored loan again?')) { store.set(K.loanIgn, []); render(true); } });
        const rf = bodyEl.querySelector('[data-loanref]'); if (rf) rf.addEventListener('click', loanRefresh);
        const dp = bodyEl.querySelector('[data-ocdep]'); if (dp) dp.addEventListener('click', () => { const o = !ocDepOpen(); store.set(K.ocDepOpen, o); if (o) ocDep.at = 0; render(true); });   // (0.2.23)
        bodyEl.querySelectorAll('[data-cprnote]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); cprNotify(b.dataset.cprnote, b.dataset.name); }));   // (0.2.56) ✉ Notify a no-script member
        const sh = bodyEl.querySelector('[data-ocshare]'); if (sh) sh.addEventListener('click', () => { const o = !ocShareOpen(); store.set(K.ocShareOpen, o); if (o && !ocDep.d) ocDep.at = 0; render(true); });
    }
    // Unused loans: ONE v1 call with your key - every utility's loaned_to (comma list of member ids)
    async function loanRefresh() {
        if (loanBusy) return; loanBusy = true; loanErr = ''; render(true);
        try {
            // (0.2.89) 4. the Hub's list first: under 3 minutes old = used as is, no Torn call
            liveClear();
            // [HB Suite] Hub API — op live "spawn" / "loans": the Hub's loaned-utilities list (+ its age)
            const S = await live(me.leader ? 'spawn' : 'loans').catch(() => null), N0 = await names().catch(() => ({ byId: {} }));
            if (S && num(S.loaned_at) && Date.now() - num(S.loaned_at) < 180000) { loanFromHub(S, N0, true); loanBusy = false; loanHighlight(); render(true); return; }
            const [d, N] = await Promise.all([
                // [HB Suite] Torn API — Loans: faction utilities with loaned_to (leaders, on Refresh only)
                tornGet('https://api.torn.com/faction/?selections=utilities'), names()]);
            const out = [];
            Object.keys(d || {}).forEach(k => { const arr = d[k]; if (!Array.isArray(arr)) return;
                arr.forEach(it => {
                    if (!it || it.loaned_to == null || it.loaned_to === 0 || it.loaned_to === '0' || it.loaned_to === '') return;
                    const iid = num(it.ID != null ? it.ID : it.id != null ? it.id : it.item_id);
                    String(it.loaned_to).split(',').forEach(tok => { const pid = parseInt(String(tok).trim(), 10);
                        if (!pid || !(N.byId[pid] || {}).current) return;           // ex-members ignored
                        out.push({ pid, name: nameOf(N, pid), iid, item: it.name || '#' + iid }); });
                }); });
            loanWrite({ unused: out, uts: Date.now(), usrc: 'me' });   // (0.2.79) usrc: kept until the Hub has a newer reading
            // (0.2.89) 4. the Hub's copy was outdated: hand it these rows for every loan staff member
            // [HB Suite] Hub API — op "loans_put": the loaned utilities [{pid, iid, item}] (ids + item names only)
            hub('loans_put', { rows: out.map(e => ({ pid: e.pid, iid: e.iid, item: e.item })) }).catch(() => {});
        } catch (e) { loanErr = 'Couldn\'t read the armoury: ' + e.message; }
        loanBusy = false; loanHighlight(); render(true);
    }
    // ---- the faction Armoury page (read only while Torn is focused + visible; nothing is ever clicked to finish) ----
    const onArmoury = () => /factions\.php/.test(location.href) && /tab=armou?ry/i.test(location.hash + location.href);
    function armRows() { return [...document.querySelectorAll('.img-wrap[data-itemid]')].map(iw => ({ el: iw.parentElement, iid: parseInt(iw.dataset.itemid, 10) })).filter(r => r.el && r.iid); }
    function rowPid(r) {
        const h = r.el.querySelector('.retrieve-cont input[name="user"]'); if (h && h.value) { const m = h.value.match(/\[(\d+)\]/); if (m) return +m[1]; }
        const a = r.el.querySelector('.loaned a[href*="XID="]'); if (a) { const m = a.href.match(/XID=(\d+)/); if (m) return +m[1]; }
        return null;
    }
    const rowAvail = r => { const l = r.el.querySelector('.loaned'); return !!l && /available/i.test(l.textContent) && !r.el.querySelector('.loaned a[href*="XID="]'); };
    function loanHighlight() {
        try {
            document.querySelectorAll('.hbs-arm-loan,.hbs-arm-retr').forEach(n => n.classList.remove('hbs-arm-loan', 'hbs-arm-retr'));
            if (!onArmoury() || !pageScrapeAllowed()) return;
            const C = loanRead(), ig = loanIgnored(), retr = {};
            const inUse = new Set(C.needs || []);                        // (0.2.15) a tool someone's crime needs is never "retrieve"
            (C.unused || []).filter(e => !ig.has(e.pid + ':' + e.iid) && !inUse.has(e.pid + ':' + e.iid)).forEach(e => { (retr[e.iid] = retr[e.iid] || new Set()).add(e.pid); });
            const need = new Set((C.missing || []).map(m => m.item_id));
            armRows().forEach(r => { const pid = rowPid(r);
                if (pid != null) { if (retr[r.iid] && retr[r.iid].has(pid)) r.el.classList.add('hbs-arm-retr'); }
                else if (rowAvail(r) && need.has(r.iid)) r.el.classList.add('hbs-arm-loan'); });
            loanSeenScan();                                             // (0.2.79)
        } catch (e) { /* Torn's page changed - the list still guides */ }
    }
    // (0.2.79) 🧰 WHAT THE ARMOURY PAGE SHOWS -> THE HUB. Only reached from loanHighlight, i.e. on the Armoury with Torn
    // focused + visible (pageScrapeAllowed), loan staff only, and only with the Utilities tab open. Reads the rows
    // already on the page (item id + who it's loaned to) - nothing is clicked, no Torn call.
    //   seen  on loan on the page, not in the Hub's list (someone just pressed Loan)
    //   gone  was on loan on this same page a moment ago, now isn't, and the item is still listed (a Retrieve)
    // Sent at most every 3 s and each pair once per page visit. [HB Suite] Hub API — op "loans_seen"
    let loanSeenPrev = null, loanSeenPage = '', loanSeenAt = 0, loanSeenBusy = false;
    const loanSeenSent = new Set();
    function loanSeenScan() {
        if (!me || !(me.leader || me.loans)) return;
        const li = document.querySelector('#faction-armoury-tabs li.utilities, ul.armory-main-tab li.utilities');
        if (li ? !li.classList.contains('ui-tabs-active') : !/sub=utilities/.test(location.hash)) { loanSeenPrev = null; return; }
        const rows = armRows(); if (!rows.length) return;
        const C = loanRead(); if (C.usrc !== 'hub' && !C.uv) return;                  // no Hub list on this device yet
        const now = new Set(), ids = new Set();
        rows.forEach(r => { ids.add(r.iid); const pid = rowPid(r); if (pid) now.add(pid + ':' + r.iid); });
        const page = (location.hash.match(/start=\d+/) || [''])[0];
        const known = new Set((C.unused || []).map(e => e.pid + ':' + e.iid));
        const seen = [...now].filter(k => !known.has(k) && !loanSeenSent.has('s' + k));
        const gone = (loanSeenPrev && loanSeenPage === page) ? [...loanSeenPrev].filter(k => !now.has(k) && ids.has(+k.split(':')[1]) && !loanSeenSent.has('g' + k)) : [];
        loanSeenPrev = now; loanSeenPage = page;
        if ((!seen.length && !gone.length) || loanSeenBusy || Date.now() - loanSeenAt < 3000) { if (gone.length) gone.forEach(k => loanSeenPrev.add(k)); return; }   // gone rows wait for the next scan
        loanSeenBusy = true; loanSeenAt = Date.now();
        seen.forEach(k => loanSeenSent.add('s' + k)); gone.forEach(k => { loanSeenSent.add('g' + k); loanSeenSent.delete('s' + k); });
        seen.forEach(k => loanSeenSent.delete('g' + k));
        const pair = k => ({ pid: +k.split(':')[0], iid: +k.split(':')[1] });
        hub('loans_seen', { seen: seen.slice(0, 200).map(pair), gone: gone.slice(0, 200).map(pair) })
            .then(async d => { if (d && Array.isArray(d.loaned)) { const N = await names().catch(() => ({ byId: {} }));
                if (loanFromHub(d, N, true) && !collapsed && tab === 'oc') render(true); } })
            .catch(() => { /* the Hub's own read catches up */ })
            .then(() => { loanSeenBusy = false; });
    }
    function setNative(input, v) {
        try { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v); } catch (e) { input.value = v; }
        ['input', 'keydown', 'keyup', 'change'].forEach(t => { try { input.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) { /* */ } });
    }
    // Loan / Retrieve: scroll to the row and open Torn's own form (one tap = one action) - you press LOAN / Yes
    // (0.2.50, user: "Clicking 'Retrieve' while not on the armory/utilities tab should take you there. It should also
    // disable the 'Hide Loaned Items' so you can see and retrieve the items.") Retrieve away from Armoury -> Utilities
    // (or with the item not on the open Armoury tab) OPENS Armoury -> Utilities and, once the rows are there, scrolls
    // to the loaned copy and pulses it - that tap's one action is the navigation, so Torn's Retrieve is NOT pressed;
    // tap Retrieve again for that. Every Retrieve tap also switches "Hide loaned items" off (K.armHide), since a hidden
    // row can't be seen or retrieved.
    // (0.2.52, user: "Needs to link: https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&sub=utilities&start=0")
    const ARM_UTIL = '#/tab=armoury&sub=utilities&start=0';
    // (0.2.61, user: '"Loan" button for OCs should also take you to the same armory/utilities page as the Retrieve one.')
    // mode 'loan' does the same trip: opens Armoury -> Utilities, selects the tab, then highlights a copy of the item
    // that ISN'T out on loan. Torn's Loan button is not pressed on that tap - tap Loan again for that.
    function armGoRetrieve(iid, pid, mode) {
        mode = mode === 'loan' ? 'loan' : 'retrieve';
        toast(`Opening Armoury → Utilities - tap ${mode === 'loan' ? 'Loan' : 'Retrieve'} again once the item is highlighted.`, true);
        if (/factions\.php/.test(location.pathname) && /step=your/.test(location.search)) location.hash = ARM_UTIL;   // Torn's own tab switch
        else { try { sessionStorage.setItem('hbs_arm_go', JSON.stringify({ iid, pid, mode, at: Date.now() })); } catch (e) { /* */ }
            location.href = 'https://www.torn.com/factions.php?step=your&type=1' + ARM_UTIL; return; }
        armFindLoaned(iid, pid, 0, mode);
    }
    // (0.2.54 FIX, user: "This isnt correctly opening the utilities tab. It might need to be manually selected when
    // the armory opens." + the page's HTML) Torn lands on the armoury's Deposit tab whatever the address says. The
    // tabs are a jQuery-UI list: #faction-armoury-tabs li.utilities (ui-tabs-active when open) > a.ui-tabs-anchor
    // [href="#tab=armoury&sub=utilities"]. So after opening the armoury the Utilities tab is selected by pressing that
    // anchor (once per Retrieve tap; still only navigation - Torn's Retrieve is never pressed here).
    let armTabTried = false;
    function armOpenUtilTab() {
        const li = document.querySelector('#faction-armoury-tabs li.utilities, ul.armory-main-tab li.utilities');
        if (!li) return false;                                   // the armoury hasn't drawn yet
        if (li.classList.contains('ui-tabs-active')) return true;
        if (!armTabTried) { const a = li.querySelector('a.ui-tabs-anchor, a'); if (a) { armTabTried = true; a.click(); } }
        return false;
    }
    function armFindLoaned(iid, pid, n, mode) {
        const loan = mode === 'loan';
        if (!n) armTabTried = false;
        if (pageScrapeAllowed() && /factions\.php/.test(location.pathname)) { try { armOpenUtilTab(); } catch (e) { /* Torn's page changed */ } }
        if (n > 60) { toast(loan ? 'Couldn\'t find a free copy of that item on Armoury → Utilities - it may be in another category, or every copy is out on loan.' : 'Couldn\'t find that loaned copy on Armoury → Utilities - it may be in another category.', true); return; }
        setTimeout(() => {
            const row = onArmoury() && pageScrapeAllowed() ? armRows().filter(r => r.iid === iid).find(r => loan ? !rowPid(r) : rowPid(r) === pid) : null;
            if (!row) return armFindLoaned(iid, pid, n + 1, mode);
            try { armFilterApply(); } catch (e) { /* */ }
            row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
            loanHighlight(); toast(loan ? 'Item highlighted - tap Loan again to fill in the member.' : 'Item highlighted - tap Retrieve again to open Torn\'s confirm.');
        }, 300);
    }
    try { const g = JSON.parse(sessionStorage.getItem('hbs_arm_go') || 'null'); sessionStorage.removeItem('hbs_arm_go');   // arrived from another page
        if (g && Date.now() - g.at < 30000) setTimeout(() => armFindLoaned(Number(g.iid), Number(g.pid), 0, g.mode), 1200); } catch (e) { /* */ }
    function armouryAct(mode, iid, pid, name) {
        if (mode === 'retrieve') {
            if (store.get(K.armHide, false)) { store.set(K.armHide, false); try { armFilterApply(); } catch (e) { /* */ } }   // show loaned rows
            if (!onArmoury() || !armRows().some(r => r.iid === iid && rowPid(r) === pid)) {
                if (!(onArmoury() && /sub=utilities/i.test(location.hash))) { armGoRetrieve(iid, pid); return; }
            }
        }
        // (0.2.61) Loan away from Armoury -> Utilities (or with the item not on the open Armoury tab): go there first
        if (mode === 'loan' && (!onArmoury() || !armRows().some(r => r.iid === iid)) && !(onArmoury() && /sub=utilities/i.test(location.hash))) { armGoRetrieve(iid, pid, 'loan'); return; }
        if (!onArmoury()) { toast('Open your faction Armoury → Utilities first, then tap this again.', true); return; }
        const rows = armRows().filter(r => r.iid === iid);
        if (!rows.length) { toast('That item isn\'t on this Armoury tab - open Utilities (or its category) and try again.', true); return; }
        const label = String(name || '').replace(/\s*\[\d+\]$/, '') + ' [' + pid + ']';
        if (mode === 'retrieve') {
            const row = rows.find(r => rowPid(r) === pid); if (!row) { toast('That loaned copy isn\'t on this tab.', true); return; }
            row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
            const b = row.el.querySelector('.item-action [data-role="retrieve"]');
            if (b && b.offsetParent !== null) { b.click(); toast('Confirm in Torn\'s pop-up (Yes).'); } else toast('Row found - tap Torn\'s Retrieve, then Yes.', true);
            loanWatch('retrieve', iid, pid, 0); return;
        }
        const row = rows.find(rowAvail) || rows.find(r => rowPid(r) == null) || rows[0];
        row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
        const b = row.el.querySelector('.item-action [data-role="loan"]');
        if (!b || b.offsetParent === null) { toast('Row found - tap Torn\'s Loan; member: ' + label, true); return; }
        b.click();
        let n = 0; const fill = () => { const f = row.el.querySelector('.loan-cont input[name="user"], .loan-cont input.ac-search');
            if (!f || f.offsetParent === null) { if (++n < 10) setTimeout(fill, 180); else toast('Type the member yourself: ' + label, true); return; }
            f.focus(); setNative(f, label); toast('Member filled (' + label + ') - pick them if a list shows, then press LOAN.'); };
        fill(); loanWatch('loan', iid, pid, 0);
    }
    // the row's loaned state flipped -> drop it from the list (watches the page you're on for ~25 s)
    function loanWatch(mode, iid, pid, t) {
        if (t > 25) return;
        setTimeout(() => {
            if (onArmoury() && pageScrapeAllowed()) {
                const has = armRows().filter(r => r.iid === iid).some(r => rowPid(r) === pid);
                if ((mode === 'retrieve' && !has) || (mode === 'loan' && has)) {
                    const C = loanRead();
                    if (mode === 'loan') loanWrite({ missing: (C.missing || []).filter(m => !(m.item_id === iid && m.pid === pid)) });
                    else loanWrite({ unused: (C.unused || []).filter(e => !(e.iid === iid && e.pid === pid)) });
                    loanHighlight(); if (!collapsed && tab === 'oc') render(true); return;
                }
            }
            loanWatch(mode, iid, pid, t + 1);
        }, 1000);
    }
    // outline again when you switch Armoury tabs / Torn redraws (leaders only, cheap: class toggles)
    let loanPageT = null;
    function loanPageWatch() {
        if (!/factions\.php/.test(location.href)) return;
        const sched = () => { clearTimeout(loanPageT); loanPageT = setTimeout(() => { if (me && (me.leader || me.loans)) loanHighlight(); }, 500); };
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', sched); window.addEventListener('focus', sched); sched();
    }

    // =====================================================================
    // ⛓ YOUR CHAIN SUMMARY (0.2.6, user: "Chain Tab: Provide a brief player chain summary at the bottom. Chain Hits,
    // Highest Chain Bonus, etc.") - from the Hub's db/chains.json: every chain (10+) with each member's hits / respect /
    // retals, and (since the Hub's 0.2.6 update) the bonus hits "b": [[chain number, member id, respect]].
    // =====================================================================
    async function chainSummaryHtml() {
        const C = await readOpt('m', 'db/chains.json');
        const L = ((C && C.chains) || []).map(c => [c, (c.m || []).find(r => num(r[0]) === me.id)]).filter(x => x[1]);
        if (!L.length) return sec('⛓ Your chain summary') + '<div class="hbs-hint">No chains on record for you yet.</div>';
        const hits = L.reduce((a, [, r]) => a + num(r[1]), 0), resp = L.reduce((a, [, r]) => a + num(r[2]), 0), rets = L.reduce((a, [, r]) => a + num(r[3]), 0);
        const most = L.reduce((a, x) => num(x[1][1]) > num(a[1][1]) ? x : a, L[0]);
        const bon = ((C && C.chains) || []).flatMap(c => (c.b || []).filter(b => num(b[1]) === me.id));
        const top = bon.reduce((a, b) => num(b[0]) > num(a) ? num(b[0]) : a, 0);
        const hasB = ((C && C.chains) || []).some(c => Array.isArray(c.b));
        return sec('⛓ Your chain summary') + `<div class="hbs-card"><div class="hbs-ctiles">${tiles([
            [int(hits), 'Chain hits', `${int(L.length)} chains`], [(hits / L.length).toFixed(1), 'Avg hits / chain'], [int(resp), 'Respect'],
            [int(rets), 'Retaliations'], [int(most[1][1]), 'Most in a chain', `${int(most[0].length)}-hit chain`],
            hasB ? [top ? int(top) : '-', 'Highest bonus', bon.length ? `${int(bon.length)} bonus hit${bon.length === 1 ? '' : 's'}` : 'none yet'] : null])}</div></div>`;
    }

    // =====================================================================
    // 🔎 RECRUIT SCOUT IN THE SUITE (0.2.8, user: "Import Recruitment script, including the scanning page for users. I
    // noticed there was only a 1k limit of users. Can that be increased, even if we dump most data except their userID
    // and level? How feasible would it be to offload this data to the HUB ... for later searching?" - picked: leaders
    // only, a 25,000-player pool on the device, and a SHARED Hub pool).
    // Ported from Torn Recruit Scout 0.6.1 (checks, criteria + must-haves, fit %, FFScouter battle stats, 7-day activity
    // check, message template copied as rich text, Send to Hub / auto-send). What changed for the size limit:
    //   🗃 POOL  (K.rsPool, up to RS_POOL_MAX = 25,000) - ONE small row per scanned player:
    //            pid -> [name, level, fac (faction id, 0 none, null unknown), lastAction s, checked ms, pct, verdict, added ms,
    //                    contacted ms (0.2.9 - by ANY leader, from the Hub)]
    //            verdict: f fit · n near · x fail · e excluded · '' not checked. When full, the oldest never-checked
    //            rows make room. Every scan + every check result is also sent to the HUB POOL (op "rcpool", leaders):
    //            one leader's check spares every other leader the same Torn call, and the pool can be searched later
    //            ("Load from Hub").
    //   🔎 SCOUT LIST (K.rsDb, up to RS_DETAIL_MAX = 1,000) - the full Recruit Scout data (stats, battle stats,
    //            activity, notes) ONLY for players who fit / nearly fit or that you shortlist. A failed / excluded
    //            player drops to its pool row.
    // Scan page reads the page you're on (every profiles.php?XID= link, + the level printed next to it when the page
    // shows one, e.g. Advanced Search) - NO Torn call. "Check next" quick-checks pool players (1 Torn call each, v1
    // profile,personalstats) after asking the Hub which ones another leader checked in the last RS_SHARED_FRESH hours
    // (those are taken from the Hub, no call). Calls are spaced by your Recruit calls/min (⚙ in this tab, default 50)
    // on top of the Suite's shared Torn budget. Keys never leave the device; the Hub gets only the rows above.
    // OUTREACH (Torn rules): Message copies the text and opens Torn's compose page - you press Send.
    // 0.2.10 (user picked #2-#6 of the suggestions): FREE ACTIVITY checks - current streak + average play per day
    // (lifetime time played ÷ account age); PER-DAY EFFORT - respect / attacks won / refills per day of account age;
    // a WEIGHTED SCORE (each check has a weight in ⚙ Criteria; pass = full weight, near miss = half, fail / unknown = 0)
    // instead of passed/total - it sorts the list, decides fit (≥ fitScore) / near (≥ nearScore) and the Hub auto-send;
    // must-haves still exclude; SHARED DON'T-CONTACT: anyone declined, joined or removed on the Hub list is hidden from
    // every leader's pool (Hub op rcpool "dnc"); BATTLE STATS RANGE - min AND max (0 = no limit). All from the one
    // quick-check call - no extra Torn API use.
    // 0.2.9 (user's list): 🗃 Pool comes first; ⇪ Export pool / scout list to the Hub (op rcpool "merge" - with the full
    // snapshot for scout-list players; the Hub keeps whichever check is newer and trims old snapshots to id + level);
    // "Check all" (every pool player matching the filters); the ACTIVITY CHECK IS REMOVED (up to 10 calls a player -
    // "Too many API calls"); CONTACTED is shared: ✉ Message stamps the player on the Hub (op rcpool "contact") and
    // "Hide contacted" (on by default) leaves out anyone any leader messaged; ⚙ Criteria isn't redrawn while you edit;
    // cards laid out as tiles for phones.
    // =====================================================================
    const RS_POOL_MAX = 25000, RS_DETAIL_MAX = 1000, RS_SHARED_FRESH = 24, RS_QUICK_V = 3;
    const RS_TTL = { quick: 6 * 3600e3, ff: 24 * 3600e3, ffNone: 6 * 3600e3 };
    const RS_NEAR = 0.15;
    const RS_CRIT0 = { minLevel: 15, minBs: 500000, maxBs: 0, minRwHits: 1, maxLastActionHrs: 24, requireNoFaction: true,
        minXanPerDay: 0, minRespect: 0, skipHospHrs: 0, must: { fac: true }, enemyFlag: 50,
        // 0.2.10 - free activity + per-day effort checks (0 = off), score thresholds, weight per check
        minStreak: 0, minAvgHrs: 0, minRespDay: 0, minAtkDay: 0, minRefDay: 0, fitScore: 75, nearScore: 50,
        w: { lvl: 1, bs: 3, rw: 2, la: 2, fac: 2, xpd: 1, resp: 1, stk: 1, avg: 1, rpd: 1, apd: 1, fpd: 1 } };
    // (label, criteria field, step) of every scored check, in the order ⚙ Criteria lists them
    // [key, name, criteria field, step, what the number is] - 0.2.11: short names, the unit under the box
    const RS_CHECKS = [['lvl', 'Level', 'minLevel', 0, 'at least'], ['bs', 'Battle stats (est.)', 'minBs', 50000, ''], ['rw', 'Ranked war hits', 'minRwHits', 0, 'at least'],
        ['la', 'Last seen', 'maxLastActionHrs', 0, 'within (hours)'], ['fac', 'No faction', 'requireNoFaction', 0, ''], ['stk', 'Current streak', 'minStreak', 0, 'at least (days)'],
        ['avg', 'Play time / day', 'minAvgHrs', 0.5, 'at least (hours)'], ['xpd', 'Xanax / day', 'minXanPerDay', 0.1, 'at least'], ['resp', 'Respect earned', 'minRespect', 1000, 'at least'],
        ['rpd', 'Respect / day', 'minRespDay', 0.5, 'at least'], ['apd', 'Attacks won / day', 'minAtkDay', 0.1, 'at least'], ['fpd', 'Refills / day', 'minRefDay', 0.05, 'at least']];
    const RS_TPL0 = "Hi {name}! I'm recruiting for Heart Breakers. We're an active ranked-war faction and you look like a great fit. Interested in joining? Happy to answer any questions.";
    const rsCrit = () => { const s = store.get(K.rsCrit, {}) || {}; return Object.assign({}, RS_CRIT0, s, { w: Object.assign({}, RS_CRIT0.w, s.w || {}) }); };
    const perDay = (q, k) => (q && q[k] != null && q.age > 0) ? q[k] / q.age : null;        // lifetime total ÷ account age
    const rsTpl = () => store.get(K.rsTpl, '') || RS_TPL0;
    const RS_SUBJ0 = 'Heart Breakers is recruiting';                                    // (0.2.12) mail subject template
    const rsSubj = () => store.get(K.rsSubj, '') || RS_SUBJ0;
    const rsRate = () => Math.max(10, Math.min(90, num(store.get(K.rsRate, 50)) || 50));
    const rsHubAuto = () => store.get(K.rsHubAuto, true) !== false;
    const rsHubPct = () => Math.max(0, Math.min(100, num(store.get(K.rsHubPct, 75))));
    const rsFf = () => String(store.get(K.ffKey, '') || '').trim();                 // the Suite's FFScouter key (⚙)

    // ---- storage (debounced writes - the pool can be ~1.5 MB) ----
    // LEADERS-ONLY LOADING (0.2.31, user: split leader-only parts "only if its still contained within the same script"):
    // the scout list and the 25,000-player pool used to be read from storage and parsed on EVERY page load for EVERY
    // member. Now they start empty and rsLeaderLoad() reads them once - when the Suite knows you're a leader (setMe) or
    // the Recruit tab opens. Nothing is written back before that (rsLoaded), so a member's device can't blank them.
    let rsDb = { v: 1, candidates: {} }, rsLoaded = false;
    // BIG STORAGE (0.2.73) - see build_patch_0273.py. RS_BIG = the script's storage is the page's localStorage (Torn
    // PDA / no GM storage), so the pool + scout list go to IndexedDB. rsBigReady = IndexedDB has been read and merged
    // (always true where RS_BIG is off). rsStoreErr = the last failed save, shown on the Recruit tab.
    const RS_BIG = (typeof PDA_httpGet === 'function' || typeof GM_setValue !== 'function') && typeof indexedDB !== 'undefined';
    let rsBigReady = !RS_BIG, rsBigWant = false, rsStoreErr = '';
    let rsIdbP = null;
    const rsIdb = () => rsIdbP || (rsIdbP = new Promise((res, rej) => {
        const q = indexedDB.open('hbs', 1);
        q.onupgradeneeded = () => { try { q.result.createObjectStore('kv'); } catch (e) { /* already there */ } };
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error || new Error('database not available')); q.onblocked = () => rej(new Error('database blocked'));
    }));
    const rsIdbGetAll = keys => rsIdb().then(db => new Promise((res, rej) => {
        const out = {}, tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv');
        keys.forEach(k => { const g = st.get(k); g.onsuccess = () => { out[k] = g.result; }; });
        tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => rej(tx.error || new Error('read failed'));
    }));
    const rsIdbPut = pairs => rsIdb().then(db => new Promise((res, rej) => {   // {key: value}; value undefined = delete
        const tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
        Object.keys(pairs).forEach(k => { if (pairs[k] === undefined) st.delete(k); else st.put(pairs[k], k); });
        tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => rej(tx.error || new Error('save failed'));
    }));
    const rsStoreFail = e => { rsStoreErr = String((e && (e.name === 'QuotaExceededError' ? 'this device is out of storage space' : e.message || e.name)) || 'save failed'); console.warn(LOG, 'recruit storage:', rsStoreErr); };
    // small-storage write that REPORTS a failure (store.set swallows it) - the non-IndexedDB path
    const rsSmallSet = (k, v) => { try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return true; } localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { rsStoreFail(e); return false; } };
    function rsLeaderLoad() {
        if (rsLoaded) return; rsLoaded = true;
        const d = store.get(K.rsDb, null); if (d && d.candidates) rsDb = d;
        rsPoolLoad();
        if (RS_BIG) rsBigLoad();
    }
    // (0.2.73) IndexedDB over the old localStorage copies, then everything into IndexedDB and the old copies removed
    async function rsBigLoad() {
        try {
            const keys = [K.rsDb].concat(Array.from({ length: RS_SHARDS }, (_, i) => rsShardKey(i)));
            const got = await rsIdbGetAll(keys);
            const legacyDb = Object.keys(rsDb.candidates || {}).length, legacyPool = Object.keys(rsPool).length;
            // what's in memory now = the old page-storage copy (first run only - it is removed below) + anything added
            // on this page while IndexedDB was being read: both are laid OVER the IndexedDB copy
            const bd = got[K.rsDb];
            if (bd && bd.candidates) rsDb = Object.assign({}, bd, rsDb, { candidates: Object.assign({}, bd.candidates, rsDb.candidates || {}) });
            const merged = {};
            for (let i = 0; i < RS_SHARDS; i++) { const sh = got[rsShardKey(i)]; if (sh && typeof sh === 'object') Object.assign(merged, sh); }
            rsPool = Object.assign(merged, rsPool);
            rsShardSaved.fill('');                                  // every shard is written to IndexedDB once
            rsBigReady = true;
            await rsBigWrite(true);
            // the old page-storage copies: removed only after IndexedDB holds everything
            if (legacyDb || legacyPool) { try { localStorage.removeItem(K.rsDb); localStorage.removeItem(K.rsPool); for (let i = 0; i < RS_SHARDS; i++) localStorage.removeItem(rsShardKey(i)); } catch (e) { /* stays */ } }
            rsStoreErr = '';
        } catch (e) { rsBigReady = true; rsStoreFail(e); }          // IndexedDB unusable: carry on with what page storage had
        if (!collapsed && tab === 'recruit' && rsView !== 'set') render(true);
    }
    let rsBigBusy = null;
    function rsBigWrite(withDb) {                                   // changed pool shards (+ the scout list) -> IndexedDB
        if (!rsBigReady) { rsBigWant = true; return Promise.resolve(false); }
        const pairs = {}, parts = Array.from({ length: RS_SHARDS }, () => ({})), js = [];
        for (const id in rsPool) parts[rsShardOf(id)][id] = rsPool[id];
        parts.forEach((p, i) => { const j = JSON.stringify(p); js[i] = j; if (j !== rsShardSaved[i]) pairs[rsShardKey(i)] = p; });
        if (withDb) pairs[K.rsDb] = rsDb;
        if (!Object.keys(pairs).length) return Promise.resolve(true);
        const run = () => rsIdbPut(pairs).then(() => { parts.forEach((p, i) => { if (rsShardKey(i) in pairs) rsShardSaved[i] = js[i]; }); rsStoreErr = ''; return true; }, e => { rsStoreFail(e); return false; });
        rsBigBusy = (rsBigBusy || Promise.resolve()).then(run, run);
        return rsBigBusy;
    }
    // POOL STORAGE IN SHARDS (0.2.27, user approved "Shrink the device pool's storage"): the pool used to be ONE value
    // (up to 25,000 rows, ~1-2 MB) rewritten on every scan / check. Now it's 16 values by player id (K.rsPool + '_0'..15);
    // a save writes only the shards whose contents changed. An old single-value pool is moved over once.
    const RS_SHARDS = 16, rsShardKey = i => K.rsPool + '_' + i, rsShardOf = id => Number(id) % RS_SHARDS;
    const rsShardSaved = new Array(RS_SHARDS).fill('');        // what each shard last looked like on disk
    let rsPool = {};
    function rsPoolLoad() {
        const old = store.get(K.rsPool, null);
        for (let i = 0; i < RS_SHARDS; i++) { const sh = store.get(rsShardKey(i), null); if (sh && typeof sh === 'object') { Object.assign(rsPool, sh); rsShardSaved[i] = JSON.stringify(sh); } }
        if (old && typeof old === 'object' && Object.keys(old).length) { Object.assign(rsPool, old); setTimeout(() => { rsPoolWrite(); store.set(K.rsPool, null); }, 0); }
    }
    function rsPoolWrite() {
        if (!rsLoaded) return;                                  // (0.2.31) never write a pool that wasn't read
        if (RS_BIG) { rsBigWrite(false); return; }              // (0.2.73) Torn PDA: IndexedDB
        const parts = Array.from({ length: RS_SHARDS }, () => ({}));
        for (const id in rsPool) parts[rsShardOf(id)][id] = rsPool[id];
        let ok = true;
        parts.forEach((p, i) => { const j = JSON.stringify(p); if (j !== rsShardSaved[i]) { if (rsSmallSet(rsShardKey(i), p)) rsShardSaved[i] = j; else ok = false; } });
        if (ok) rsStoreErr = '';
    }
    let rsSaveT = null, rsPoolT = null;
    const rsDbWrite = () => { if (!rsLoaded) return; if (RS_BIG) { rsBigWrite(true); return; } if (rsSmallSet(K.rsDb, rsDb)) rsStoreErr = ''; };   // (0.2.73) the scout list, now
    const rsSave = () => { if (!rsLoaded) return; clearTimeout(rsSaveT); rsSaveT = setTimeout(() => { rsSaveT = null; rsDbWrite(); }, RS_BIG ? 200 : 500); };
    const rsPoolSave = () => { clearTimeout(rsPoolT); rsPoolT = setTimeout(() => { rsPoolT = null; rsPoolWrite(); }, RS_BIG ? 200 : 800); };   // (0.2.27) changed shards only
    // (0.2.73) leaving / hiding the page: anything still waiting for its delayed save is written now
    const rsFlush = () => { if (!rsLoaded) return; if (rsPoolT) { clearTimeout(rsPoolT); rsPoolT = null; rsPoolWrite(); } if (rsSaveT) { clearTimeout(rsSaveT); rsSaveT = null; rsDbWrite(); } };
    window.addEventListener('pagehide', rsFlush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rsFlush(); });
    const VCODE = { fit: 'f', near: 'n', fail: 'x', excl: 'e', '': '' }, VNAME = { f: 'fit', n: 'near', x: 'fail', e: 'excl', '': '' };
    const poolN = () => Object.keys(rsPool).length;
    function poolPut(pid, name, level) {          // a scanned player -> pool (true = new)
        pid = String(pid);
        const r = rsPool[pid];
        if (r) { if (name && !r[0]) r[0] = name; if (level != null && r[1] == null) r[1] = level; return false; }
        if (poolN() >= RS_POOL_MAX) {             // make room: the oldest never-checked rows go first
            const old = Object.keys(rsPool).filter(k => !rsPool[k][4]).sort((a, b) => rsPool[a][7] - rsPool[b][7]).slice(0, 500);
            if (!old.length) return false;
            old.forEach(k => { delete rsPool[k]; });
        }
        rsPool[pid] = [name || '', level == null ? null : level, null, 0, 0, null, '', Date.now(), 0, 0];   // [9] don't-contact (0.2.10)
        return true;
    }

    // ---- criteria (Recruit Scout 0.6.1, unchanged) ----
    const xanPerDay = q => (q && q.xan != null && q.age > 0) ? q.xan / q.age : null;
    function rsEvaluate(c) {
        const cr = rsCrit(), q = c.quick, out = [];
        const nearMin = (v, min) => v >= min ? 'pass' : (v >= min * (1 - RS_NEAR) ? 'near' : 'fail');
        if (cr.minLevel > 0) out.push({ key: 'lvl', label: 'Lvl', value: q ? q.level : '?', state: q ? nearMin(q.level, cr.minLevel) : 'unknown' });
        // battle stats RANGE (0.2.10, user: "make it a stat range that you can set"): min and/or max, 0 = no limit;
        // within 15% outside the range = near miss
        if (cr.minBs > 0 || cr.maxBs > 0) { const bs = c.ff && c.ff.bs != null ? c.ff.bs : null;
            let st = 'unknown';
            if (bs != null) { st = cr.minBs > 0 ? nearMin(bs, cr.minBs) : 'pass';
                if (st === 'pass' && cr.maxBs > 0 && bs > cr.maxBs) st = bs <= cr.maxBs * (1 + RS_NEAR) ? 'near' : 'fail'; }
            out.push({ key: 'bs', label: 'BS', value: bs == null ? (c.ff ? 'no est.' : (rsFf() ? '?' : 'no key')) : ((c.ff.bsHuman || big(bs)) + ' est'), state: st }); }
        if (cr.minRwHits > 0) { const rw = q ? q.rwHits : null; out.push({ key: 'rw', label: 'RW hits', value: rw == null ? '?' : big(rw), state: rw == null ? 'unknown' : nearMin(rw, cr.minRwHits) }); }
        if (cr.maxLastActionHrs > 0) { let st = 'unknown', val = '?';
            if (q && q.lastActionTs) { const h = (Date.now() / 1000 - q.lastActionTs) / 3600; st = h <= cr.maxLastActionHrs ? 'pass' : (h <= cr.maxLastActionHrs * 2 ? 'near' : 'fail'); val = ago(q.lastActionTs); }
            out.push({ key: 'la', label: 'Seen', value: val, state: st }); }
        if (cr.requireNoFaction) out.push({ key: 'fac', label: 'Faction', value: q ? (q.factionId ? q.factionName || ('#' + q.factionId) : 'none') : '?', state: q ? (q.factionId ? 'fail' : 'pass') : 'unknown' });
        if (cr.minXanPerDay > 0) { const x = xanPerDay(q); out.push({ key: 'xpd', label: 'Xan/day', value: x == null ? '?' : x.toFixed(2), state: x == null ? 'unknown' : nearMin(x, cr.minXanPerDay) }); }
        if (cr.minRespect > 0) { const r = q ? q.respect : null; out.push({ key: 'resp', label: 'Respect', value: r == null ? '?' : big(r), state: r == null ? 'unknown' : nearMin(r, cr.minRespect) }); }
        // 0.2.10 - free activity (#2) + per-day effort (#3): all from the quick check's one call
        if (cr.minStreak > 0) { const v = q ? q.streak : null; out.push({ key: 'stk', label: 'Streak', value: v == null ? '?' : int(v) + 'd', state: v == null ? 'unknown' : nearMin(v, cr.minStreak) }); }
        if (cr.minAvgHrs > 0) { const v = perDay(q, 'activity'); out.push({ key: 'avg', label: 'Play/day', value: v == null ? '?' : dur(v), state: v == null ? 'unknown' : nearMin(v / 3600, cr.minAvgHrs) }); }
        if (cr.minRespDay > 0) { const v = perDay(q, 'respect'); out.push({ key: 'rpd', label: 'Resp/day', value: v == null ? '?' : v.toFixed(1), state: v == null ? 'unknown' : nearMin(v, cr.minRespDay) }); }
        if (cr.minAtkDay > 0) { const v = perDay(q, 'attacksWon'); out.push({ key: 'apd', label: 'Wins/day', value: v == null ? '?' : v.toFixed(2), state: v == null ? 'unknown' : nearMin(v, cr.minAtkDay) }); }
        if (cr.minRefDay > 0) { const v = perDay(q, 'refills'); out.push({ key: 'fpd', label: 'Refills/day', value: v == null ? '?' : v.toFixed(2), state: v == null ? 'unknown' : nearMin(v, cr.minRefDay) }); }
        out.forEach(e => { e.w = Math.max(0, num(cr.w[e.key] != null ? cr.w[e.key] : 1)); });
        const must = cr.must || {}; out.forEach(e => { e.must = !!must[e.key]; });
        return out;
    }
    function rsExclusion(c, ev) {
        const q = c.quick; if (q && /federal/i.test(q.state || '')) return 'Federal jail';
        const cr = rsCrit();
        if (q && cr.skipHospHrs > 0 && /hospital/i.test(q.state || '') && q.stateUntil) { const h = (q.stateUntil - Date.now() / 1000) / 3600; if (h > cr.skipHospHrs) return `In hospital ${Math.round(h)}h`; }
        const bad = (ev || rsEvaluate(c)).filter(e => e.must && (e.state === 'fail' || e.state === 'near'));
        return bad.length ? 'Must-have: ' + bad.map(e => e.label).join(', ') : '';
    }
    function rsFit(c) {
        const ev = rsEvaluate(c), n = s => ev.filter(e => e.state === s).length;
        return { ev, pass: n('pass'), near: n('near'), fail: n('fail'), total: ev.length, excluded: c.quick ? rsExclusion(c, ev) : '', mustPending: ev.some(e => e.must && e.state === 'unknown') };
    }
    // WEIGHTED SCORE 0-100 (0.2.10, #4): pass = the check's full weight, near miss = half, fail / unknown = nothing
    const rsPct = c => { const f = rsFit(c), W = f.ev.reduce((a, e) => a + e.w, 0);
        return W ? Math.round(1000 * f.ev.reduce((a, e) => a + e.w * (e.state === 'pass' ? 1 : e.state === 'near' ? 0.5 : 0), 0) / W) / 10 : 0; };
    const rsVerdict = c => { if (!c.quick) return ''; const f = rsFit(c); if (f.excluded) return 'excl';
        const sc = rsPct(c), cr = rsCrit(); return sc >= num(cr.fitScore) ? 'fit' : sc >= num(cr.nearScore) ? 'near' : 'fail'; };

    // ---- Torn calls: the Suite's shared budget + this module's own calls/min ----
    let rsLast = 0, rsBlocked = 0, rsStop = false;
    async function rsTorn(url) {
        for (let attempt = 0; attempt < 4; attempt++) {
            for (;;) { if (rsStop) throw new Error('stopped'); const at = Math.max(rsLast + 60000 / rsRate(), rsBlocked); if (Date.now() >= at) break; await sleep(Math.min(at - Date.now(), 1000)); }
            rsLast = Date.now();
            try { return await tornGet(url); }
            catch (e) { if (/too many/i.test(e.message || '')) { rsBlocked = Date.now() + 60000; rsSay('Torn rate limit hit - pausing 60s…'); continue; } throw e; }
        }
        throw new Error('Torn rate limit - try again later.');
    }
    async function rsQuick(id) {
        // [HB Suite] Torn API — Recruit Scout quick check: one player's profile + personal stats (v1, 1 call)
        const d = await rsTorn(`https://api.torn.com/user/${id}?selections=profile,personalstats`);
        const ps = d.personalstats || {}, fac = d.faction || {}, la = d.last_action || {}, st = d.status || {};
        const g = k => ps[k] == null ? null : num(ps[k]);
        return { name: d.name || '', level: num(d.level), age: num(d.age), factionId: num(fac.faction_id), factionName: fac.faction_name || '',
            lastActionTs: num(la.timestamp), state: st.state || '', stateUntil: num(st.until), respect: g('respectforfaction'),
            friends: d.friends == null ? null : num(d.friends), enemies: d.enemies == null ? null : num(d.enemies),
            rwHits: g('rankedwarhits'), xan: g('xantaken'), refills: g('refills'), attacksWon: g('attackswon'), activity: g('useractivity'),
            streak: g('activestreak'), bestStreak: g('bestactivestreak'), v: RS_QUICK_V, at: Date.now() };
    }
    // FFScouter battle-stat estimates: one batched call for up to 200 players
    const rsFfNeeded = c => !!(c && c.quick) && (!c.ff || Date.now() - c.ff.at > (c.ff.bs == null ? RS_TTL.ffNone : RS_TTL.ff));
    let rsFfNote = '';
    async function rsFlushFf(ids) {
        const key = rsFf(); if (!key) { rsFfNote = 'Battle stats: add your FFScouter key in ⚙ (Suite settings).'; return; }
        ids = ids.filter(id => rsFfNeeded(rsDb.candidates[id]));
        let found = 0, none = 0;
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            try {
                // [HB Suite] FFScouter API — Recruit Scout: battle-stat estimates for up to 200 scouted players (your FFScouter key)
                const rows = await new Promise((res, rej) => { const u = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${chunk.join(',')}`;
                    const done = t => { try { res(JSON.parse(t)); } catch (e) { rej(new Error('FFScouter: bad response')); } };
                    if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(u)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(() => rej(new Error('FFScouter unreachable'))); return; }
                    if (typeof GM_xmlhttpRequest === 'function') { GM_xmlhttpRequest({ method: 'GET', url: u, timeout: 20000, onload: r => done(r.responseText), onerror: () => rej(new Error('FFScouter unreachable')) }); return; }
                    fetch(u).then(r => r.text()).then(done).catch(() => rej(new Error('FFScouter unreachable'))); });
                if (!Array.isArray(rows)) throw new Error('FFScouter: ' + ((rows && (rows.error && (rows.error.message || rows.error))) || rows.message || 'unexpected answer'));
                const got = new Set();
                rows.forEach(r => { const c = r && rsDb.candidates[String(r.player_id)]; if (!c) return; got.add(String(r.player_id));
                    if (r.bs_estimate == null) none++; else found++;
                    c.ff = { bs: r.bs_estimate == null ? null : num(r.bs_estimate), bsHuman: r.bs_estimate_human || '', ff: r.fair_fight == null ? null : num(r.fair_fight), at: Date.now() }; });
                chunk.forEach(id => { if (!got.has(id) && rsDb.candidates[id]) { rsDb.candidates[id].ff = { bs: null, at: Date.now() }; none++; } });
            } catch (e) { rsFfNote = 'Battle stats: ' + e.message; return; }
            if (i + 200 < ids.length) await sleep(10000);
        }
        if (ids.length) rsFfNote = `Battle stats: ${found} found${none ? `, ${none} with no estimate` : ''}.`;
        rsSave();
    }

    // ---- 🗃 Hub pool (op "rcpool", leaders) ----
    // [HB Suite] Hub API — op "rcpool": the shared recruit pool (add scans / check results, look up, search)
    const rsHub = (b) => hub('rcpool', b);
    async function rsHubAdd(list) { for (let i = 0; i < list.length; i += 500) await rsHub({ do: 'add', players: list.slice(i, i + 500) }).catch(() => {}); }
    let rsHubOut = [], rsHubOutT = null;           // check results go up in batches
    // (0.2.9) a check result as a Hub pool row - with the full snapshot ("store more detailed information when it's supplied")
    function rsMergeRow(c) {
        const q = c.quick || {};
        return { pid: Number(c.id), name: c.name || q.name || '', level: q.level, fac: q.factionId, la: q.lastActionTs, state: q.state,
            bs: c.ff && c.ff.bs != null ? Math.round(c.ff.bs) : null, pct: rsPct(c), verdict: rsVerdict(c), checked: q.at || null,
            contacted: c.contactedAt || (rsPool[c.id] && rsPool[c.id][8]) || null, data: c.quick ? rsPayload(c, false).data : null };
    }
    function rsHubResult(c) {
        rsHubOut.push(rsMergeRow(c));
        clearTimeout(rsHubOutT); rsHubOutT = setTimeout(rsHubFlush, rsHubOut.length >= 100 ? 0 : 4000);
    }
    async function rsHubFlush() { const l = rsHubOut.splice(0, 200); if (l.length) await rsHub({ do: 'merge', players: l }).catch(() => {}); if (rsHubOut.length) rsHubFlush(); }
    // a Hub row -> the local pool (another leader's check, or "Load from Hub")
    function rsAdopt(r) {
        const pid = String(r.pid); if (!rsPool[pid] && !poolPut(pid, r.name, r.level)) return;
        const p = rsPool[pid]; p[0] = r.name || p[0]; if (r.level != null) p[1] = num(r.level);
        if (r.contacted && num(r.contacted) > num(p[8])) p[8] = num(r.contacted);       // (0.2.9) contacted by any leader
        if (r.dnc != null) p[9] = r.dnc ? 1 : 0;                                         // (0.2.10) shared don't-contact list
        if (r.checked && num(r.checked) > num(p[4])) { p[2] = r.fac == null ? null : num(r.fac); p[3] = num(r.la); p[4] = num(r.checked); p[5] = r.pct == null ? null : num(r.pct); p[6] = VCODE[r.verdict || ''] || ''; }
    }

    // ---- the scout list (full data) ----
    const rsN = () => Object.keys(rsDb.candidates).length;
    function rsNew(id, name) { return { _new: true, id: String(id), name: name || '', addedAt: Date.now(), quick: null, ff: null, deep: null, shortlisted: false, contacted: false, contactedAt: 0, note: '', error: '' }; }
    // after a quick check: the pool row gets the verdict; full data stays only for fits / near fits / shortlisted
    function rsSettle(c) {
        const v = rsVerdict(c), p = rsPool[c.id] || (poolPut(c.id, c.name, c.quick && c.quick.level), rsPool[c.id]);
        if (p) { const q = c.quick; p[0] = c.name || p[0]; p[1] = q.level; p[2] = q.factionId; p[3] = q.lastActionTs; p[4] = q.at; p[5] = rsPct(c); p[6] = VCODE[v]; }
        const keep = c.shortlisted || v === 'fit' || v === 'near';
        // (_new = not on the scout list before this check; the run puts it there while FFScouter fills it in)
        if (keep && c._new && rsN() > RS_DETAIL_MAX) { delete rsDb.candidates[c.id]; rsSay(`Scout list full (${RS_DETAIL_MAX}) - ${c.name || c.id} kept in the pool only.`); }
        else if (keep) { delete c._new; rsDb.candidates[c.id] = c; } else delete rsDb.candidates[c.id];
        rsHubResult(c); rsPoolSave(); rsSave();
    }

    // ---- work queue ----
    const rsQ = []; let rsRunning = false, rsProg = { done: 0, total: 0 }, rsStatus = '', rsErr = false;
    function rsSay(t, err) { rsStatus = t || ''; rsErr = !!err; const n = bodyEl && bodyEl.querySelector('[data-rsstatus]'); if (n) { n.textContent = rsStatus; n.classList.toggle('hbs-bad', rsErr); } }
    let rsDrawT = null; const rsRedraw = () => { if (rsDrawT) return; rsDrawT = setTimeout(() => { rsDrawT = null; if (!collapsed && tab === 'recruit' && rsView !== 'hub' && rsView !== 'set' && !cwBusy()) render(true); }, 1500); };
    function rsEnqueue(type, id) { id = String(id); if (rsQ.some(t => t.type === type && t.id === id)) return false; rsQ.push({ type, id }); rsProg.total++; return true; }
    async function rsRun() {
        if (rsRunning || !rsQ.length) return;
        if (!getKey()) { rsSay('Add your Torn API key in ⚙ first.', true); return; }
        rsRunning = true; rsStop = false; if (rsView !== 'set') render(true);
        const ffIds = [], runIds = new Set();
        try {
            while (rsQ.length && !rsStop) {
                const t = rsQ.shift();
                const c = rsDb.candidates[t.id] || rsNew(t.id, (rsPool[t.id] || [])[0]);
                rsSay(`Checking ${rsProg.done + 1}/${rsProg.total}…`);
                try {
                    if (t.type === 'quick' || !(c.quick && c.quick.v === RS_QUICK_V && Date.now() - c.quick.at < RS_TTL.quick)) {
                        c.quick = await rsQuick(c.id); if (c.quick.name) c.name = c.quick.name; c.error = '';
                        if (rsFfNeeded(c)) ffIds.push(c.id);
                    }
                    rsDb.candidates[c.id] = c; runIds.add(c.id);       // FFScouter writes into the list; rsSettle trims it
                } catch (e) {
                    if (e.message === 'stopped') break;
                    if (/key|access/i.test(e.message || '')) { rsSay(e.message, true); rsQ.length = 0; break; }
                    c.error = e.message || 'Check failed.'; if (rsDb.candidates[c.id]) rsDb.candidates[c.id] = c;
                }
                rsProg.done++;
                if (ffIds.length >= 200) { const ids = ffIds.splice(0); await rsFlushFf(ids); ids.forEach(id => { const x = rsDb.candidates[id]; if (x && x.quick && x.id !== c.id) rsSettle(x); }); }
                if (c.quick && !c.error) rsSettle(c);
                rsRedraw();
            }
            if (ffIds.length) { const ids = ffIds.splice(0); await rsFlushFf(ids); ids.forEach(id => { const x = rsDb.candidates[id]; if (x && x.quick && runIds.has(id)) rsSettle(x); }); }
            if (!rsStop && !rsErr) rsSay(`Done - ${rsProg.done} checked.`);
            if (!rsStop) await rsAutoHub();
            if (rsStop) rsSay('Stopped.');
        } finally { rsRunning = false; rsQ.length = 0; rsProg = { done: 0, total: 0 }; rsSave(); rsPoolSave(); rsHubFlush(); if (rsView !== 'set') render(true); }
    }

    // ---- Scan page: every player link on the page you're on (+ the level printed beside it) - no Torn call ----
    // the player links on the page you're looking at -> Map(id -> {name, level, fac}) - no Torn call.
    //   level: printed in the link's row (user lists, hospital / jail / bounties, Advanced Search) - best effort
    //   fac:   (0.2.13, user: "Most users sometimes show a faction icon near their namebar when they are in a faction")
    //          the row links a faction (factions.php?step=profile&ID=) -> that faction's id
    // passive = the background collector: also leaves out chat windows, players showing a faction icon and current
    // Heart Breakers members (Scan page keeps them, marked in a faction, so the pool filters still hide them)
    function rsCollect(passive) {
        rsLeaderLoad();   // (0.2.31)
        const found = new Map();
        const cur = (() => { const c = cache['m:db/members.json'], M = c && c.data; return new Set(((M && M.members) || []).filter(m => m.current).map(m => String(m.id))); })();
        document.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
            if (a.closest('#hbs-panel')) return;
            if (passive && a.closest('#chatRoot, [id*="chat" i], [class*="chat" i]')) return;      // chat windows: skipped
            const m = a.href.match(/XID=(\d+)/); if (!m) return;
            const name = (a.textContent || '').trim().replace(/\s*\[\d+\]\s*$/, '');
            let lvl = null, fac = null;
            const row = a.closest('li, tr, [class*="row"], [class*="user-info"]');
            if (row && row.textContent.length < 600) {
                const lv = row.querySelector('[class*="level"] .value, [class*="level"]');
                const t = (lv && lv.textContent) || row.textContent, mm = t.match(/(?:Level|Lvl\.?|LV)\s*:?\s*(\d{1,3})\b/i) || (lv && t.match(/\b(\d{1,3})\b/));
                if (mm && num(mm[1]) >= 1 && num(mm[1]) <= 100) lvl = num(mm[1]);
                const fl = row.querySelector('a[href*="factions.php?step=profile"]'), fm = fl && fl.href.match(/ID=(\d+)/i);
                if (fm) fac = num(fm[1]);
            }
            if (passive && (fac || cur.has(m[1]))) return;
            const was = found.get(m[1]);
            if (!was || (!was.name && name) || (was.level == null && lvl != null) || (was.fac == null && fac))
                found.set(m[1], { name: name || (was && was.name) || '', level: lvl != null ? lvl : (was && was.level), fac: fac || (was && was.fac) || null });
        });
        if (me) found.delete(String(me.id));
        return found;
    }
    // add to the device pool (+ the Hub pool); returns how many were new
    function rsPoolAdd(found, onlyNew) {
        let added = 0; const up = [];
        found.forEach((v, id) => {
            const isNew = poolPut(id, v.name, v.level); if (isNew) added++;
            const p = rsPool[id]; if (p && v.fac && p[2] == null) p[2] = v.fac;           // a faction icon = in a faction
            if (p && (isNew || !onlyNew)) up.push({ pid: Number(id), name: v.name, level: v.level });
        });
        if (found.size) { rsPoolSave(); rsDncAt = 0; }                  // (0.2.10) re-read the don't-contact list for new rows
        if (up.length) rsHubAdd(up);
        return added;
    }
    function rsScan() {
        const found = rsCollect(false), added = rsPoolAdd(found, false);
        rsSay(found.size ? `Found ${found.size} players - ${added} new in the pool (${int(poolN())} / ${int(RS_POOL_MAX)}), sent to the Hub pool.` : 'No player links on this page.', !found.size);
        render(true);
    }

    // 🛰 BACKGROUND COLLECTOR (0.2.13, user: "Is it possible to scrape the names/IDs/level of players who you come across on
    // each page with this in the background? ... Off by default. Skip faction pages and any chat windows."). Leaders,
    // Recruit module on, switch in 🗃 Pool (K.rsPassive, OFF by default). Reads ONLY the page you're on and ONLY while
    // the Torn tab is focused and visible (pageScrapeAllowed) - no Torn request, nothing clicked. Faction pages are
    // skipped, and so are chat windows, players showing a faction icon and current members (rsCollect passive).
    // New players go into the device pool at once; to the Hub pool in batches (every 60 s, only players new to this
    // device). Torn redraws parts of pages all the time, so the page is re-read at most every 4 s after a change.
    // 0.2.14 FIX (user: "This isn't detecting new users when I scroll through pages on the user search. It works on page
    // 1, but not on the pages after."): Torn's user search swaps pages WITHOUT adding new elements - it rewrites the
    // existing rows (links, text) in place and changes the address with pushState, so neither the childList observer
    // nor hashchange fired. Now: the observer also watches href / text changes, the address is checked every 2 s, and
    // a 5 s backstop re-reads the page while the switch is on. New players go into the device pool AT ONCE (the count
    // moves as you page); only the Hub upload is batched (every 60 s).
    let rsPassT = null, rsPassN = 0, rsPassUp = [], rsPassSentAt = 0, rsPassUrl = '', rsPassSig = '';
    const rsPassOn = () => !!store.get(K.rsPassive, false) && !!me && !!me.leader && modOn('recruit');
    function rsPassRun() {
        rsPassT = null;
        if (!rsPassOn() || !pageScrapeAllowed() || /factions\.php/.test(location.href)) return;
        const found = rsCollect(true);
        const sig = [...found.keys()].join(','); if (sig === rsPassSig && !rsPassUp.length) return;   // same page as last time
        rsPassSig = sig;
        let added = 0;
        found.forEach((v, id) => {
            if (rsPool[id]) { const p = rsPool[id]; if (v.level != null && p[1] == null) p[1] = v.level; return; }
            if (poolPut(id, v.name, v.level)) { added++; rsPassUp.push({ pid: Number(id), name: v.name, level: v.level }); }
        });
        if (added) { rsPassN += added; rsPoolSave(); rsDncAt = 0; if (!collapsed && tab === 'recruit' && rsView === 'pool') render(true); }
        if (rsPassUp.length && Date.now() - rsPassSentAt >= 60000) { rsPassSentAt = Date.now(); rsHubAdd(rsPassUp.splice(0)); }
        else if (rsPassUp.length) setTimeout(rsPassSoon, 60000 - (Date.now() - rsPassSentAt) + 50);
    }
    function rsPassSoon() { if (!rsPassT) rsPassT = setTimeout(rsPassRun, 1500); }
    function rsPassWatch() {
        if (rsPassWatch.on) return; rsPassWatch.on = true;
        new MutationObserver(() => { if (rsPassOn()) rsPassSoon(); })
            .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] });
        ['hashchange', 'popstate', 'focus', 'visibilitychange'].forEach(ev => window.addEventListener(ev, () => { if (rsPassOn()) rsPassSoon(); }));
        setInterval(() => { if (!rsPassOn()) return; if (location.href !== rsPassUrl) { rsPassUrl = location.href; rsPassSoon(); } }, 2000);
        setInterval(() => { if (rsPassOn()) rsPassSoon(); }, 5000);                               // backstop
        rsPassSoon();
    }

    // ⚔ FROM THE FACTION ATTACK LOG (0.2.15, user: "Offer an option to pull from the faction attack logs. Cache history so
    // new searches don't pull the same old results"). Players who attacked us or were attacked by us (not Heart Breakers)
    // -> the pool with their LEVEL and FACTION from the log (0 = no faction - known without a check). Your key, needs
    // faction API access. v2 faction/attacks, oldest first from where the last pull stopped (K.rsAtk {to, at, n}); the
    // first pull starts 7 days back. At most RS_ATK_PAGES pages (100 attacks each) per tap - tap again to continue.
    const RS_ATK_PAGES = 10;
    async function rsPullAttacks() {
        if (rsRunning) return;
        const st = store.get(K.rsAtk, null) || {};
        let from = num(st.to) ? num(st.to) + 1 : Math.floor(Date.now() / 1000) - 7 * 86400, last = num(st.to) || 0, pages = 0, attacks = 0, more = false;
        const found = new Map(), seen = new Set();
        rsRunning = true; rsStop = false; rsSay('Reading the faction attack log…'); render(true);
        try {
            for (; pages < RS_ATK_PAGES; ) {
                // [HB Suite] Torn API — Recruit: one page of the faction attack log (v2 faction/attacks, 100 attacks, oldest first)
                const d = await rsTorn(`https://api.torn.com/v2/faction/attacks?limit=100&sort=ASC&from=${from}`);
                const L = (d && d.attacks) || []; pages++;
                let fresh = 0;
                L.forEach(a => {
                    if (!a || seen.has(a.id)) return; seen.add(a.id); fresh++; attacks++;
                    last = Math.max(last, num(a.ended || a.started));
                    [a.attacker, a.defender].forEach(p => {
                        if (!p || !p.id) return;                                         // stealthed attacker
                        const fid = p.faction && p.faction.id ? num(p.faction.id) : 0;
                        if (fid === FACTION_ID || (me && num(p.id) === me.id)) return;
                        found.set(String(p.id), { name: p.name || '', level: p.level != null ? num(p.level) : null, fac: fid });
                    });
                });
                rsSay(`Reading the faction attack log… ${int(attacks)} attacks`);
                if (L.length < 100 || !fresh) break;
                from = last;                                                             // same second: duplicates skipped by id
                if (pages >= RS_ATK_PAGES) more = true;
            }
            let added = 0;
            found.forEach((v, id) => { if (poolPut(id, v.name, v.level)) added++; const p = rsPool[id]; if (p) { if (v.level != null) p[1] = v.level; if (!p[4]) p[2] = v.fac; } });
            if (found.size) { rsPoolSave(); rsDncAt = 0; rsHubAdd([...found].map(([id, v]) => ({ pid: Number(id), name: v.name, level: v.level }))); }
            store.set(K.rsAtk, { to: last || num(st.to), at: Date.now(), n: num(st.n) + attacks });
            rsSay(`Attack log: ${int(attacks)} new attacks read, ${int(found.size)} outside players (${int(added)} new in the pool, ${int([...found.values()].filter(v => !v.fac).length)} with no faction).${more ? ' More waiting - tap again.' : ''}`);
        } catch (e) { rsSay('Attack log: ' + e.message, true); }
        finally { rsRunning = false; render(true); }
    }

    // ---- 🗃 pool filters + "Check next N" (asks the Hub first: a player checked by any leader in the last 24 h isn't re-read) ----
    let rsPf = Object.assign({ lmin: '', lmax: '', nofac: true, todo: true, nocont: true }, store.get(K.rsPf, {}) || {});
    const rsContacted = id => { const p = rsPool[id], c = rsDb.candidates[id]; return !!((p && p[8]) || (c && c.contactedAt)); };
    const rsDnc = id => !!(rsPool[id] && rsPool[id][9]);
    // the shared don't-contact list, refreshed at most every 5 minutes while the Recruit tab is open
    let rsDncAt = 0;
    async function rsDncSync() {
        if (Date.now() - rsDncAt < 300000) return; rsDncAt = Date.now();
        try { const r = await rsHub({ do: 'dnc' }); const set = new Set((r.pids || []).map(String));
            Object.keys(rsPool).forEach(id => { rsPool[id][9] = set.has(id) ? 1 : 0; }); rsPoolSave(); } catch (e) { rsDncAt = 0; }
    }
    const rsPoolRows = () => Object.entries(rsPool).filter(([, p]) => {
        if (rsPf.lmin !== '' && (p[1] == null || p[1] < num(rsPf.lmin))) return false;
        if (rsPf.lmax !== '' && (p[1] == null || p[1] > num(rsPf.lmax))) return false;
        if (rsPf.nofac && p[2] != null && p[2] !== 0) return false;
        if (rsPf.todo && p[4] && Date.now() - p[4] < RS_TTL.quick) return false;
        if (rsPf.nocont && p[8]) return false;                                          // (0.2.9) messaged by a leader
        if (p[9]) return false;                                                         // (0.2.10) declined / joined / removed on the Hub list
        return true; });
    async function rsCheckNext(n) {
        const pick = rsPoolRows().sort((a, b) => num(b[1][1]) - num(a[1][1]) || b[1][7] - a[1][7]).slice(0, n).map(([id]) => id);
        if (!pick.length) { rsSay('Nobody in the pool matches - scan a page or load from the Hub.'); return; }
        // (0.2.9 "Check all": n = Infinity - every matching pool player; the Hub is asked 500 at a time)
        rsSay('Asking the Hub who was checked already…');
        let shared = 0;
        try {
            const rows = [];
            for (let i = 0; i < pick.length; i += 500) rows.push(...((await rsHub({ do: 'get', pids: pick.slice(i, i + 500).map(Number) })).rows || []));
            rows.forEach(x => { if (x.contacted || x.dnc) rsAdopt(x);        // a leader messaged / declined them meanwhile
                if (x.checked && Date.now() - num(x.checked) < RS_SHARED_FRESH * 3600e3) { rsAdopt(x); shared++; } });
        } catch (e) { /* Hub unreachable: check them all */ }
        const todo = pick.filter(id => !(rsPool[id] && rsPool[id][4] && Date.now() - rsPool[id][4] < RS_SHARED_FRESH * 3600e3) && !(rsPf.nocont && rsContacted(id)) && !rsDnc(id));
        rsPoolSave();
        if (!todo.length) { rsSay(`All ${pick.length} were checked by a leader in the last ${RS_SHARED_FRESH} h - taken from the Hub (no Torn calls).`); render(true); return; }
        if (!confirm(`Check ${todo.length} players?${shared ? `\n(${shared} more were already checked by a leader - taken from the Hub.)` : ''}\nUses ${todo.length} Torn API calls (~${Math.ceil(todo.length / rsRate())} min at ${rsRate()}/min).`)) { render(true); return; }
        todo.forEach(id => rsEnqueue('quick', id)); rsRun();
    }
    // ⇪ EXPORT (0.2.9, user: "Add an option to export each list (Scout + Pool) to the hub"): every row of the list ->
    // the Hub pool (op rcpool "merge", 200 a call). The Hub keeps the newer check per player; scout-list players carry
    // their full snapshot. Nothing is read from Torn.
    async function rsExport(which) {
        const rows = which === 'scout' ? Object.values(rsDb.candidates).filter(c => c.quick).map(rsMergeRow)
            : Object.entries(rsPool).map(([id, p]) => ({ pid: Number(id), name: p[0], level: p[1], fac: p[4] ? p[2] : null, la: p[4] ? p[3] : null,
                checked: p[4] || null, pct: p[4] ? p[5] : null, verdict: VNAME[p[6]] || '', contacted: p[8] || null }));
        if (!rows.length) { rsSay('Nothing to export.'); return; }
        if (!confirm(`Export ${rows.length} players from your ${which === 'scout' ? 'scout list' : 'pool'} to the Hub pool?\nNo Torn API calls.`)) return;
        let done = 0;
        try { for (let i = 0; i < rows.length; i += 200) { await rsHub({ do: 'merge', players: rows.slice(i, i + 200) }); done += Math.min(200, rows.length - i); rsSay(`Exporting… ${int(done)} / ${int(rows.length)}`); } }
        catch (e) { rsSay(`Export stopped at ${int(done)}: ${e.message}`, true); return; }
        rsHubStatsAt = 0; rsSay(`Exported ${int(done)} players to the Hub pool.`); render(true);
    }
    let rsHubOff = 0, rsHubTot = null;
    async function rsLoadHub(more) {
        rsHubOff = more ? rsHubOff : 0;
        rsSay('Searching the Hub pool…');
        try {
            const r = await rsHub({ do: 'search', lvl_min: rsPf.lmin === '' ? null : num(rsPf.lmin), lvl_max: rsPf.lmax === '' ? null : num(rsPf.lmax),
                fac: rsPf.nofac ? 'none' : 'any', checked: rsPf.todo ? 'stale' : 'any', stale_days: 1, uncontacted: !!rsPf.nocont, sort: 'level', limit: 500, offset: rsHubOff });
            (r.rows || []).forEach(rsAdopt); rsHubOff += (r.rows || []).length; rsHubTot = r.total; rsPoolSave();
            rsSay(`Loaded ${int((r.rows || []).length)} from the Hub pool (${int(rsHubOff)} of ${int(r.total)} matching).`);
        } catch (e) { rsSay(e.message, true); }
        render(true);
    }

    // ---- Send to Hub (the shared Recruitment list - same /rc/push as Recruit Scout; no key sent) ----
    function rsPayload(c, manual) {
        const q = c.quick || {}, f = rsFit(c);
        return { pid: Number(c.id), name: c.name || '', manual: !!manual, data: {
            level: q.level, age: q.age, factionId: q.factionId, factionName: q.factionName, lastActionTs: q.lastActionTs, rwHits: q.rwHits, xan: q.xan, refills: q.refills,
            attacksWon: q.attacksWon, streak: q.streak, bestStreak: q.bestStreak, lifeAvgSec: q.activity != null && q.age > 0 ? Math.round(q.activity / q.age) : null,
            bs: c.ff ? c.ff.bs : null, bsHuman: c.ff ? (c.ff.bsHuman || '') : '', ff: c.ff ? c.ff.ff : null,
            activity: null, respect: q.respect, friends: q.friends, enemies: q.enemies, xpd: xanPerDay(q),
            fit: { pass: f.pass, total: f.total, pct: rsPct(c), checks: f.ev.map(e => ({ key: e.key, label: e.label, value: String(e.value), state: e.state })) },
            checkedAt: q.at || null, ver: 'Suite ' + VERSION } };
    }
    const rsDataTs = c => Math.max(c.quick ? c.quick.at : 0, c.ff ? c.ff.at : 0);
    async function rsSendHub(list, manual) {
        list = list.filter(c => c && c.quick); let sent = 0, removed = 0;
        for (let i = 0; i < list.length; i += 100) {
            const chunk = list.slice(i, i + 100);
            // [HB Suite] Hub API — POST /rc/push: scouted recruits to the leaders' Recruitment list (your pid + faction, no key)
            const r = await postTo('/rc/push', { pid: me.id, faction: FACTION_ID, recruits: chunk.map(c => rsPayload(c, manual)) });
            const gone = new Set((r.removed || []).map(String));
            chunk.forEach(c => { if (gone.has(c.id)) { c.hubRemoved = true; removed++; } else { c.hubAt = Date.now(); c.hubRemoved = false; sent++; } });
        }
        rsSave(); return { sent, removed };
    }
    async function rsAutoHub() {
        if (!rsHubAuto()) return;
        const due = Object.values(rsDb.candidates).filter(c => { if (!c.quick || c.hubRemoved || rsPct(c) < rsHubPct() || (c.hubAt && c.hubAt >= rsDataTs(c))) return false;
            const f = rsFit(c); return !f.excluded && !f.mustPending; });
        if (!due.length) return;
        try { const r = await rsSendHub(due, false); rsSay(`Done - ${r.sent} sent to the Hub's Recruitment list (score ${rsHubPct()}+)${r.removed ? `, ${r.removed} skipped (removed on the Hub)` : ''}.`); }
        catch (e) { rsSay(e.message, true); }
    }

    // ---- Message: the template, copied as rich text (line breaks + clickable links), then Torn's compose page ----
    function rsMsg(c) {
        const q = c.quick || {}, bs = c.ff && c.ff.bs != null ? (c.ff.bsHuman || big(c.ff.bs)) : '';
        const fill = t => t.replace(/\{name\}/g, c.name || 'there').replace(/\{level\}/g, q.level || '').replace(/\{id\}/g, c.id).replace(/\{bs\}/g, bs);
        const text = fill(rsTpl()), subject = fill(rsSubj());
        const html = String(text).replace(/\r\n?/g, '\n').split('\n').map(l => esc(l).replace(/https?:\/\/[^\s<]+/g, u => { const tail = (u.match(/[).,!?;:]+$/) || [''])[0], url = tail ? u.slice(0, -tail.length) : u; return `<a href="${url}">${url}</a>${tail}`; })).join('<br>');
        // (0.2.9) contacted is shared: stamped on the Hub pool so no leader messages them again by mistake
        const p = rsPool[c.id] || (poolPut(c.id, c.name, c.quick && c.quick.level), rsPool[c.id]); if (p) p[8] = Date.now();
        // (0.2.16 FIX, user: "their name disappears on the initial suite tab, but their name still shows on the new tab"):
        // the contacted stamp was saved a moment AFTER the compose tab opened (debounced saves), so the Suite in the new
        // tab loaded the old lists. Now it's marked and written to storage straight away, BEFORE the tab opens.
        c.contacted = true; c.contactedAt = Date.now();
        clearTimeout(rsPoolT); clearTimeout(rsSaveT); rsPoolT = rsSaveT = null; rsPoolWrite(); rsDbWrite();
        rsHub({ do: 'contact', pid: Number(c.id), name: c.name || '' }).catch(() => {});
        // (0.2.12) the compose page fills itself in (subject + message) - see rsMailFill; the clipboard copy stays as the fallback
        store.set(K.mailFill, { pid: Number(c.id), subject, html, text, at: Date.now() });
        copyRich(html, text).then(ok => { rsSay(`Opening the mail to ${c.name || c.id} - subject and message are filled in for you; check it and press Send yourself.${ok ? ' (Also copied, in case the page needs a paste.)' : ''}`); });
        const w = window.open(`https://www.torn.com/messages.php#/p=compose&XID=${c.id}`, '_blank'); if (!w) location.href = `https://www.torn.com/messages.php#/p=compose&XID=${c.id}`;
    }

    // ⚙ SHARED SETTINGS (0.2.17, user: "Share recruitment settings among leaders. Alert when changes are made."): the
    // criteria (checks, limits, weights, must-haves, score thresholds), the mail subject + message and the Hub-list
    // auto-send live on the Hub (op "rcset") for every leader. Calls per minute and the collector switch stay per device.
    //   - read when the Recruit tab opens (at most once a minute) and with the leaders' alert refresh (every 3 min)
    //   - a newer copy is applied at once; when another leader saved it you get a toast + a 🔔 Alerts line saying who
    //     changed what (old -> new), shown for 48 h (K.rsSetNote) and in ⚙ Criteria
    //   - Save in ⚙ Criteria uploads; if someone saved after you opened the form you're asked before overwriting
    const RS_SHARED_KEYS = [[K.rsCrit, 'crit'], [K.rsTpl, 'tpl'], [K.rsSubj, 'subj'], [K.rsHubAuto, 'hubAuto'], [K.rsHubPct, 'hubPct']];
    const rsSetLocal = () => Object.fromEntries(RS_SHARED_KEYS.map(([k, n]) => [n, store.get(k, null)]));
    // what changed, in words ("Min level 15 → 20", "weight BS 3 → 5", "message text")
    function rsSetDiff(a, b) {
        a = a || {}; b = b || {}; const out = [], A = a.crit || {}, B = b.crit || {};
        const name = Object.fromEntries(RS_CHECKS.map(c => [c[2], c[1]]));
        Object.assign(name, { maxBs: 'Max battle stats', fitScore: 'Fit score', nearScore: 'Near score', enemyFlag: 'Enemy flag', skipHospHrs: 'Skip hospital (h)', minBs: 'Min battle stats' });
        Object.keys(Object.assign({}, A, B)).forEach(k => {
            if (k === 'w' || k === 'must') return;
            if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) out.push(`${name[k] || k} ${A[k] == null ? '-' : A[k]} → ${B[k] == null ? '-' : B[k]}`); });
        const lab = Object.fromEntries(RS_CHECKS.map(c => [c[0], c[1]]));
        Object.keys(Object.assign({}, A.w, B.w)).forEach(k => { const x = (A.w || {})[k], y = (B.w || {})[k]; if (x !== y) out.push(`weight ${lab[k] || k} ${x == null ? '-' : x} → ${y == null ? '-' : y}`); });
        Object.keys(Object.assign({}, A.must, B.must)).forEach(k => { const x = !!(A.must || {})[k], y = !!(B.must || {})[k]; if (x !== y) out.push(`${lab[k] || k} ${y ? 'now a must' : 'no longer a must'}`); });
        if ((a.tpl || '') !== (b.tpl || '')) out.push('message text'); if ((a.subj || '') !== (b.subj || '')) out.push('mail subject');
        if (a.hubAuto !== b.hubAuto || a.hubPct !== b.hubPct) out.push('Hub-list auto-send');
        return out;
    }
    let rsSetAtTry = 0;
    async function rsSyncSettings(force) {
        if (!me || !me.leader || (!force && Date.now() - rsSetAtTry < 60000)) return;
        rsSetAtTry = Date.now();
        let r; try { r = await hub('rcset', { do: 'get' }); } catch (e) { return; }      // [HB Suite] Hub API — op "rcset" get (leaders)
        if (!r || !r.data || num(r.updated) <= num(store.get(K.rsSetAt, 0))) return;
        const before = rsSetLocal();
        RS_SHARED_KEYS.forEach(([k, n]) => store.set(k, r.data[n] == null ? (k === K.rsCrit ? {} : k === K.rsHubAuto ? true : k === K.rsHubPct ? 75 : '') : r.data[n]));
        store.set(K.rsSetAt, num(r.updated));
        // verdicts follow the new criteria
        Object.values(rsDb.candidates).forEach(c => { if (c.quick && rsPool[c.id]) { rsPool[c.id][5] = rsPct(c); rsPool[c.id][6] = VCODE[rsVerdict(c)]; } }); rsPoolSave();
        if (num(r.by_pid) !== me.id && store.get(K.rsSetAt0, 0)) {                // (not on the very first download)
            const diff = rsSetDiff(before, r.data);
            store.set(K.rsSetNote, { by: r.by || 'A leader', at: num(r.updated), diff: diff.slice(0, 12) });
            toast(`⚙ Recruit settings changed by ${r.by || 'a leader'}${diff.length ? ': ' + diff.slice(0, 3).join(', ') + (diff.length > 3 ? '…' : '') : ''}`, true);
        }
        store.set(K.rsSetAt0, 1);
        if (!collapsed && tab === 'recruit' && rsView !== 'set') render(true);
    }
    async function rsUploadSettings(force) {
        const r = await hub('rcset', { do: 'put', data: rsSetLocal(), base: num(store.get(K.rsSetAt, 0)), force: !!force });   // [HB Suite] Hub API — op "rcset" put
        if (r && r.conflict) {
            if (!confirm(`${r.by || 'Another leader'} changed the shared recruit settings after you opened them (${fmtDT(Math.floor(num(r.updated) / 1000))} ${tzTag()}).\nSave yours over theirs?`)) {
                store.set(K.rsSetAt, 0); await rsSyncSettings(true); return false; }
            return rsUploadSettings(true);
        }
        store.set(K.rsSetAt, num(r.updated)); store.set(K.rsSetAt0, 1); return true;
    }

    // ✉ MAIL PRE-FILL (0.2.12, user: "When messaging recruits, is it possible to paste the copied text into the
    // Subject/Body? Still require the user to send."). ✉ Message saves {pid, subject, html, text} (K.mailFill, 10 min)
    // and opens Torn's compose page for that player. When the Suite loads on messages.php#/p=compose&XID=<that pid>,
    // it waits (up to 20 s, only while the tab is visible) for the compose form and types the subject + message into
    // Torn's own fields - it NEVER presses Send (Torn rules: the member sends). The pending entry is used once.
    // Fields are found by meaning, not exact class names (Torn's compose markup isn't documented):
    //   subject - input[name=subject] / any text input whose name, id or placeholder says "subject"
    //   message - a TinyMCE iframe body, a contenteditable editor, or a textarea in the form
    // If a field can't be found, the clipboard copy made on tap is still there to paste.
    function rsSetInput(el, v) {
        try { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); } catch (e) { el.value = v; }
        ['input', 'keyup', 'change'].forEach(t => { try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) { /* */ } });
    }
    function rsMailFill() {
        const P = store.get(K.mailFill, null);
        if (!P || Date.now() - num(P.at) > 600000) return;
        if (!/messages\.php/.test(location.href) || !/compose/i.test(location.hash) || !new RegExp('XID=' + P.pid + '(\\D|$)').test(location.hash)) return;
        let tries = 0, gotS = false, gotB = false;
        const vis = e => !!(e && e.getClientRects().length);
        const run = () => {
            if (document.hidden) { setTimeout(run, 800); return; }
            const subj = [...document.querySelectorAll('input[type="text"], input:not([type])')].find(i => vis(i) && !i.closest('#hbs-panel')
                && /subject/i.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')));
            if (subj && !gotS) { rsSetInput(subj, P.subject); gotS = true; }
            if (!gotB) {
                const ifr = [...document.querySelectorAll('iframe')].find(f => { try { return vis(f) && f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable; } catch (e) { return false; } });
                const ce = [...document.querySelectorAll('[contenteditable="true"]')].find(e => vis(e) && !e.closest('#hbs-panel') && !e.closest('[class*="chat"]'));
                const ta = [...document.querySelectorAll('textarea')].find(t => vis(t) && !t.closest('#hbs-panel') && !t.closest('[class*="chat"]'));
                if (ifr) { const b = ifr.contentDocument.body; b.innerHTML = P.html; b.dispatchEvent(new Event('input', { bubbles: true })); gotB = true; }
                else if (ce) { ce.focus(); ce.innerHTML = P.html; ce.dispatchEvent(new Event('input', { bubbles: true })); gotB = true; }
                else if (ta) { rsSetInput(ta, P.text); gotB = true; }
            }
            if (gotS && gotB || ++tries > 25) {
                store.set(K.mailFill, null);
                toast(gotS || gotB ? `✉ ${gotS && gotB ? 'Subject and message' : gotS ? 'Subject' : 'Message'} filled in - check it and press Send.${gotS && gotB ? '' : ' Paste the rest (it was copied).'}`
                    : '✉ Couldn\'t find the mail form - paste the copied message.', !(gotS && gotB));
                return;
            }
            setTimeout(run, 800);
        };
        setTimeout(run, 600);
    }
    window.addEventListener('hashchange', rsMailFill);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rsMailFill); else setTimeout(rsMailFill, 0);

    // =====================================================================
    // 🤝 RECRUIT TAB: 🗃 Pool · 🔎 Scout · 📋 Hub list · ⚙ Criteria   (0.2.9: Pool first - user)
    // =====================================================================
    let rsView = store.get(K.rsView, 'pool'), rsList = 'all', rsSort = store.get(K.rsSort, 'fit');
    // PAGED LISTS (0.2.23, user: "'Recruiting' tab should only show 30 listings at a time, as you scroll down that list
    // increases. With so many entries its causing a bit of lag."): 🗃 Pool, 🔎 Scout and 📋 Hub list draw 30 rows; a
    // marker at the end loads the next 30 when it scrolls into view (IntersectionObserver on the panel body) or when
    // its "Show more" button is tapped. The count resets to 30 when you change view / filter / sort.
    const RS_PAGE = 30;
    const rsShow = { pool: RS_PAGE, scout: RS_PAGE };
    const rsShowReset = () => { rsShow.pool = RS_PAGE; rsShow.scout = RS_PAGE; };
    const pgMore = (key, shown, total, loading) => shown < total
        ? `<div class="hbs-pgmore" data-pgmore="${key}"><button type="button" class="hbs-btn hbs-ghost"${loading ? ' disabled' : ''}>${loading ? 'Loading…' : `Show ${Math.min(RS_PAGE, total - shown)} more`}</button><small>${int(shown)} of ${int(total)} · scroll for more</small></div>`
        : (total > RS_PAGE ? `<div class="hbs-pgend">All ${int(total)} shown</div>` : '');
    let pgIO = null;
    function pgBind(onMore) {
        if (pgIO) { try { pgIO.disconnect(); } catch (e) { /* */ } pgIO = null; }
        const el = bodyEl.querySelector('[data-pgmore]'); if (!el) return;
        let fired = false; const go = () => { if (fired) return; fired = true; if (pgIO) { pgIO.disconnect(); pgIO = null; } onMore(el.dataset.pgmore); };
        const b = el.querySelector('button'); if (b) b.addEventListener('click', go);
        if ('IntersectionObserver' in window) {
            try { pgIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) go(); }, { root: bodyEl, rootMargin: '0px 0px 400px 0px' }); pgIO.observe(el); } catch (e) { pgIO = null; }
        }
    }
    async function recruitHtml() {
        rsLeaderLoad();                                         // (0.2.31) safety net - normally done when you sign in as a leader
        if (!modOn('recruit')) return `<div class="hbs-empty">The Recruit module is off - turn it on in ⚙.</div>`;
        rsSyncSettings();                                                               // (0.2.17) shared settings
        const head = chips('rsv', [['pool', `🗃 Pool · ${int(poolN())}`], ['scout', `🔎 Scout · ${int(rsN())}`], ['hub', '📋 Hub list'], ['set', '⚙ Criteria']], rsView)
            + `<div class="hbs-actions"><button type="button" class="hbs-btn" data-rs="scan">Scan page</button>
                ${rsRunning ? `<button type="button" class="hbs-btn hbs-ghost" data-rs="stop">■ Stop</button>` : ''}</div>
            <div class="hbs-hint${rsErr ? ' hbs-bad' : ''}" data-rsstatus>${esc(rsStatus)}</div>${rsFfNote ? `<div class="hbs-hint">${esc(rsFfNote)}</div>` : ''}
            ${rsStoreErr ? `<div class="hbs-hint hbs-bad">⚠ The pool / scout list couldn't be saved on this device (${esc(rsStoreErr)}) - what you see may be gone after leaving this page.</div>` : ''}
            ${RS_BIG && !rsBigReady ? '<div class="hbs-hint">Loading your saved pool and scout list…</div>' : ''}`;
        if (rsView === 'hub') return head + await rcHubHtml();
        if (rsView === 'set') return head + rsSetHtml();
        if (rsView === 'scout') return head + rsScoutHtml();
        return head + await rsPoolHtml();
    }
    function recruitBind() {
        bindChips('rsv', v => { rsView = v; store.set(K.rsView, v); rsShowReset(); });
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="scan"]', rsScan); on('[data-rs="stop"]', () => { rsStop = true; rsQ.length = 0; rsSay('Stopping…'); });
        if (rsView === 'hub') { rcHubBind(); return; }
        if (rsView === 'set') { rsSetBind(); return; }
        if (rsView === 'scout') { rsScoutBind(); return; }
        rsPoolBind();
    }

    // ---- shared look (0.2.9, user: "Format entries to be easier to read on mobile"): a 3-column tile grid ----
    // value on top, small label under it; check chips above; buttons below in an even grid
    const rsTiles = rows => `<div class="hbs-rsg">${rows.filter(Boolean).map(([v, l, cls]) => `<div${cls ? ` class="${cls}"` : ''}><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    // the detail a Hub row / list entry carries (rcClean fields) as tiles
    function rsDataTiles(x) {
        if (!x) return '';
        if (x.compact) return `<div class="hbs-hint">Older entry - only the level was kept (Lvl ${x.level != null ? int(x.level) : '?'}).</div>`;
        const b2 = v => v == null ? '-' : esc(big(v));
        return rsTiles([[x.level != null ? int(x.level) : '-', 'Level'], [x.bsHuman ? esc(x.bsHuman) : x.bs != null ? b2(x.bs) : '-', 'Battle stats'],
            [b2(x.rwHits), 'RW hits'], [x.lastActionTs ? ago(x.lastActionTs) : '-', 'Last seen'], [b2(x.respect), 'Respect'], [b2(x.attacksWon), 'Attacks won'],
            [x.xpd != null ? (+x.xpd).toFixed(2) : '-', 'Xanax / day'], [x.streak != null ? int(x.streak) + 'd' : '-', 'Streak'], [x.age != null ? int(x.age) + 'd' : '-', 'Account age'],
            [x.lifeAvgSec != null ? dur(x.lifeAvgSec) : '-', 'Avg / day'], [b2(x.refills), 'Refills'], [x.enemies != null ? `${b2(x.friends)} / ${b2(x.enemies)}` : '-', 'Friends / enemies']]);
    }

    // ---- 🗃 Pool ----
    let rsHubStats = null, rsHubStatsAt = 0;
    async function rsPoolHtml() {
        await rsDncSync();
        if (Date.now() - rsHubStatsAt > 60000) { rsHubStatsAt = Date.now(); rsHubStats = await rsHub({ do: 'stats' }).catch(() => rsHubStats); }
        const rows = rsPoolRows(), all = Object.values(rsPool), H = rsHubStats || {};
        const V = { f: '<span class="hbs-tag hbs-green">fit</span>', n: '<span class="hbs-tag">near</span>', x: '<span class="hbs-tag hbs-red">no fit</span>', e: '<span class="hbs-tag hbs-red">excluded</span>' };
        const mins = n => Math.ceil(n / rsRate());
        return `<div class="hbs-card">${rsTiles([[int(all.length), `on device / ${big(RS_POOL_MAX)}`], [int(all.filter(p => p[4]).length), 'checked'],
                [int(all.filter(p => p[6] === 'f' || p[6] === 'n').length), 'fit / near'], [H.total != null ? int(H.total) : '-', 'Hub pool'],
                [H.total != null ? int(H.checked) : '-', 'Hub checked'], [H.total != null ? int(H.contacted) : '-', 'contacted']])}
            <label class="hbs-ck hbs-rspass"><input type="checkbox" data-rspass${store.get(K.rsPassive, false) ? ' checked' : ''}> 🛰 Collect players from pages I visit${store.get(K.rsPassive, false) ? ` · ${int(rsPassN)} this session` : ''}</label>
            <div class="hbs-hint">Background, no API calls: only the page you're on while Torn is focused. Skips faction pages, chat, players showing a faction icon and our members.</div>
            <div class="hbs-row"><span class="hbs-hint">Level</span><input class="hbs-input" style="width:64px" inputmode="numeric" data-rspf="lmin" placeholder="min" value="${esc(rsPf.lmin)}">
                <input class="hbs-input" style="width:64px" inputmode="numeric" data-rspf="lmax" placeholder="max" value="${esc(rsPf.lmax)}"></div>
            <label class="hbs-ck"><input type="checkbox" data-rspf="nofac"${rsPf.nofac ? ' checked' : ''}> No faction (or not checked yet)</label>
            <label class="hbs-ck"><input type="checkbox" data-rspf="todo"${rsPf.todo ? ' checked' : ''}> Not checked in the last 6 h</label>
            <label class="hbs-ck"><input type="checkbox" data-rspf="nocont"${rsPf.nocont ? ' checked' : ''}> Hide anyone a leader already contacted</label>
            <div class="hbs-hint"><b>${int(rows.length)}</b> match on this device.</div>
            <div class="hbs-rsbtns">${[25, 50, 100, 250].map(n => `<button type="button" class="hbs-btn${n === 50 ? '' : ' hbs-ghost'}" data-rsnext="${n}"${rsRunning ? ' disabled' : ''}>Check ${n}</button>`).join('')}
                <button type="button" class="hbs-btn hbs-ghost" data-rsnext="all"${rsRunning || !rows.length ? ' disabled' : ''}>Check all · ${int(rows.length)}${rows.length ? ` (~${mins(rows.length)} min)` : ''}</button></div>
            ${(() => { const A = store.get(K.rsAtk, null); return `<div class="hbs-rsbtns"><button type="button" class="hbs-btn hbs-ghost" data-rs="atk"${rsRunning ? ' disabled' : ''}>⚔ Pull from attack logs</button></div>
                <div class="hbs-hint">${A && A.to ? `Read up to ${fmtDT(A.to)} ${tzTagH()} (${int(A.n)} attacks so far) - the next pull continues from there.` : 'Players who attacked us or we attacked (not our members), with their level and faction. Uses your key (faction API access), up to 10 calls a tap; first pull = the last 7 days.'}</div>`; })()}
            <div class="hbs-rsbtns"><button type="button" class="hbs-btn hbs-ghost" data-rs="hubload">⇩ Load from Hub</button>
                ${rsHubTot != null && rsHubOff < rsHubTot ? `<button type="button" class="hbs-btn hbs-ghost" data-rs="hubmore">⇩ Next 500 (${int(rsHubOff)}/${int(rsHubTot)})</button>` : ''}
                <button type="button" class="hbs-btn hbs-ghost" data-rs="exppool">⇪ Export pool to Hub</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="poolclear">Clear device pool</button></div>
            <div class="hbs-hint">Scan page adds players (ID, name, level when the page shows it) - no Torn call. Scans and check results also go to the shared Hub pool: a player any leader checked in the last ${RS_SHARED_FRESH} h isn't read again, and anyone a leader messaged is marked contacted for everyone.</div></div>`
            + rows.sort((a, b) => num(b[1][1]) - num(a[1][1]) || b[1][7] - a[1][7]).slice(0, rsShow.pool).map(([id, p]) => `<div class="hbs-rsrow">
                <div class="t"><a href="https://www.torn.com/profiles.php?XID=${id}" target="_blank" rel="noopener">${esc(p[0] || '#' + id)}</a> <small>[${id}]</small>${V[p[6]] ? ' ' + V[p[6]] : ''}</div>
                <div class="s">${p[1] != null ? `<b>Lvl ${p[1]}</b>` : 'Lvl ?'}${p[2] ? ' · in a faction' : p[4] ? ' · no faction' : ''}${p[5] != null ? ` · ${Math.round(p[5])}% of checks` : ''}
                    · ${p[4] ? 'checked ' + ago(Math.floor(p[4] / 1000)) : 'not checked'}${p[8] ? ` · <span class="hbs-bad">✉ contacted ${ago(Math.floor(p[8] / 1000))}</span>` : ''}</div></div>`).join('')
            + pgMore('pool', Math.min(rsShow.pool, rows.length), rows.length);   // (0.2.23) 30 at a time
    }
    function rsPoolBind() {
        bodyEl.querySelectorAll('[data-rspf]').forEach(i => i.addEventListener('change', () => { rsPf[i.dataset.rspf] = i.type === 'checkbox' ? i.checked : i.value.replace(/\D/g, ''); store.set(K.rsPf, rsPf); rsHubTot = null; rsShowReset(); render(true); }));
        pgBind(k => { rsShow[k] += RS_PAGE; render(true); });   // (0.2.23)
        const ps = bodyEl.querySelector('[data-rspass]'); if (ps) ps.addEventListener('change', () => { store.set(K.rsPassive, ps.checked); if (ps.checked) { rsPassWatch(); rsPassSoon(); } render(true); });
        bodyEl.querySelectorAll('[data-rsnext]').forEach(b => b.addEventListener('click', () => rsCheckNext(b.dataset.rsnext === 'all' ? Infinity : Number(b.dataset.rsnext))));
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="atk"]', rsPullAttacks);
        on('[data-rs="hubload"]', () => rsLoadHub(false)); on('[data-rs="hubmore"]', () => rsLoadHub(true)); on('[data-rs="exppool"]', () => rsExport('pool'));
        on('[data-rs="poolclear"]', () => { if (!confirm(`Clear the ${int(poolN())} players in this device's pool? The Hub pool and your scout list stay.`)) return; rsPool = {}; rsPoolWrite(); rsSay('Device pool cleared.'); render(true); });
    }

    // ---- 🔎 Scout list (full cards) ----
    const RS_SORTS = { fit: 'Best score', bs: 'Battle stats', rw: 'RW hits', xpd: 'Xanax / day', resp: 'Respect', lvl: 'Level', added: 'Newest' };   // (0.2.15) + Xanax / day
    function rsScoutHtml() {
        let L = Object.values(rsDb.candidates);
        const tot = L.length;
        if (rsList === 'fits') L = L.filter(c => c.quick && rsVerdict(c) === 'fit');
        else if (rsList === 'short') L = L.filter(c => c.shortlisted);
        if (rsPf.nocont) L = L.filter(c => !rsContacted(c.id) || c.shortlisted);          // shortlisted stay visible
        L = L.filter(c => !rsDnc(c.id) || c.shortlisted);                                 // (0.2.10) don't-contact list
        const key = c => { if (!c.quick) return [2, 0]; const f = rsFit(c), q = c.quick, sc = rsPct(c);
            const k = { bs: -(c.ff && c.ff.bs || 0), rw: -(q.rwHits || 0), xpd: -(xanPerDay(q) || 0), resp: -(q.respect || 0), lvl: -(q.level || 0), added: -(c.addedAt || 0) }[rsSort];
            return [f.excluded ? 1 : 0].concat(k == null ? [-sc, f.fail] : [k, -sc]); };   // (0.2.10) Best fit = highest score
        L.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
        return chips('rsl', [['all', `All · ${tot}`], ['fits', 'Fits'], ['short', '★ Shortlist']], rsList)
            // toolbar (0.2.11): Sort by on its own line, then the two actions side by side
            + `<div class="hbs-rstool"><label class="hbs-rsfld"><span>Sort by</span><select class="hbs-input" data-rssort>${Object.keys(RS_SORTS).map(k => `<option value="${k}"${k === rsSort ? ' selected' : ''}>${RS_SORTS[k]}</option>`).join('')}</select></label>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="ffall">↻ Update battle stats</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="expscout">⇪ Export list to Hub</button></div>
            <label class="hbs-ck"><input type="checkbox" data-rsnocont${rsPf.nocont ? ' checked' : ''}> Hide contacted players</label>
            <div class="hbs-hint">Fits and near fits from your checks (up to ${int(RS_DETAIL_MAX)}). Players who don't fit stay in 🗃 Pool only.</div>`
            + (L.length ? L.slice(0, rsShow.scout).map(rsCard).join('') + pgMore('scout', Math.min(rsShow.scout, L.length), L.length)   // (0.2.23) 30 at a time
                : `<div class="hbs-empty">${tot ? 'Nobody in this view.' : 'Open a page with players (e.g. Advanced Search, no faction), tap <b>Scan page</b>, then 🗃 Pool → <b>Check</b>.'}</div>`);
    }
    function rsCard(c) {
        const q = c.quick, f = rsFit(c), cr = rsCrit(), MARK = { pass: '✓', near: '~', fail: '✕', unknown: '?' };
        const enemies = q && q.enemies != null && num(cr.enemyFlag) > 0 && q.enemies >= num(cr.enemyFlag);
        const pct = q ? Math.round(rsPct(c)) : 0;                                         // (0.2.10) weighted score
        const ct = c.contactedAt || (rsPool[c.id] && rsPool[c.id][8]) || 0;
        const vd = rsVerdict(c);
        return `<div class="hbs-card hbs-rscard ${!q ? '' : vd === 'fit' ? 'hbs-green' : vd === 'near' ? 'hbs-alert' : 'hbs-red'}" data-rsid="${esc(c.id)}">
            <div class="hbs-rshd"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${esc(c.id)}" target="_blank" rel="noopener">${esc(c.name || 'Player ' + c.id)}</a>
                <small>[${esc(c.id)}]</small>${c.shortlisted ? ' <span class="hbs-tag">★</span>' : ''}
                <div class="hbs-rsfit"><i style="width:${pct}%"></i></div><small>${q ? `score <b>${pct}</b> · ${f.pass} / ${f.total} checks passed` : 'not checked'}</small></div>
            ${enemies ? `<div class="hbs-banner">⚠ ${esc(big(q.enemies))} enemies</div>` : ''}${f.excluded ? `<div class="hbs-banner">⛔ ${esc(f.excluded)}</div>` : ''}
            ${f.ev.length ? `<div class="hbs-rsck">${f.ev.map(e => `<span class="${e.state}${e.must ? ' must' : ''}" title="weight ${e.w}">${MARK[e.state]} ${esc(e.label)} ${esc(e.value)}</span>`).join('')}</div>` : ''}
            ${q ? rsDataTiles(rsPayload(c, false).data) : ''}
            ${c.shortlisted ? `<input class="hbs-input" data-rsnote maxlength="300" placeholder="Note…" value="${esc(c.note || '')}" style="width:100%;margin-top:6px">` : ''}
            <div class="hbs-rsact"><button type="button" class="hbs-btn" data-rsa="msg">✉ Message</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rsa="star">${c.shortlisted ? '★ Listed' : '☆ Shortlist'}</button>
                ${q ? '<button type="button" class="hbs-btn hbs-ghost" data-rsa="hub">⇪ Hub list</button>' : ''}
                <button type="button" class="hbs-btn hbs-ghost" data-rsa="${c.error ? 'retry' : 'del'}">${c.error ? '↻ Retry' : '✕ Remove'}</button></div>
            <div class="hbs-hint">${[c.hubRemoved ? '<span class="hbs-bad">Removed on the Hub list - ⇪ adds them back</span>' : c.hubAt ? `<span class="hbs-good">✓ On the Hub list · ${ago(Math.floor(c.hubAt / 1000))}</span>` : '',
                ct ? `<span class="hbs-bad">✉ Contacted ${ago(Math.floor(ct / 1000))}</span>` : '', c.error ? `<span class="hbs-bad">${esc(c.error)}</span>` : ''].filter(Boolean).join(' · ')}</div></div>`;
    }
    function rsScoutBind() {
        bindChips('rsl', v => { rsList = v; rsShowReset(); });
        pgBind(k => { rsShow[k] += RS_PAGE; render(true); });   // (0.2.23)
        const ss = bodyEl.querySelector('[data-rssort]'); if (ss) ss.addEventListener('change', () => { rsSort = ss.value; store.set(K.rsSort, rsSort); rsShowReset(); render(true); });
        const nc = bodyEl.querySelector('[data-rsnocont]'); if (nc) nc.addEventListener('change', () => { rsPf.nocont = nc.checked; store.set(K.rsPf, rsPf); render(true); });
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="expscout"]', () => rsExport('scout'));
        on('[data-rs="ffall"]', async () => { rsSay('Fetching battle stats…'); const ids = Object.keys(rsDb.candidates); await rsFlushFf(ids);
            ids.forEach(id => { const c = rsDb.candidates[id]; if (c && c.quick) rsSettle(c); }); rsSay(rsFfNote); render(true); });
        bodyEl.querySelectorAll('[data-rsa]').forEach(b => b.addEventListener('click', () => {
            const c = rsDb.candidates[b.closest('[data-rsid]').dataset.rsid]; if (!c) return;
            const a = b.dataset.rsa;
            if (a === 'retry') { if (rsEnqueue('quick', c.id)) rsRun(); }
            else if (a === 'star') { c.shortlisted = !c.shortlisted; rsSave(); render(true); }
            else if (a === 'msg') { rsMsg(c); render(true); }
            else if (a === 'hub') rsSendHub([c], true).then(r => { rsSay(r.sent ? `${c.name || c.id} is on the Hub's Recruitment list.` : 'Not sent.', !r.sent); render(true); }).catch(e => rsSay(e.message, true));
            else if (a === 'del') { delete rsDb.candidates[c.id]; rsSave(); render(true); }
        }));
        bodyEl.querySelectorAll('[data-rsnote]').forEach(i => i.addEventListener('change', () => { const c = rsDb.candidates[i.closest('[data-rsid]').dataset.rsid]; if (c) { c.note = i.value.slice(0, 300); rsSave(); } }));
    }

    // ---- ⚙ Criteria / template / Hub / calls per minute (never redrawn while open - see render()) ----
    function rsSetHtml() {
        const cr = rsCrit(), m = cr.must || {};
        const numIn = (k, step, v) => `<input class="hbs-input" type="number" min="0" inputmode="decimal" ${step ? `step="${step}"` : ''} data-rsc="${k}" value="${v != null ? v : cr[k]}">`;
        // one block per scored check (0.2.11, user: "Format this information to be better viewed"):
        //   name ........................ [must]
        //   [limit box] (unit)    [weight box]      (battle stats: [min] [max] [weight])
        const box = (lab, input) => `<label class="hbs-rsfld"><span>${lab}</span>${input}</label>`;
        const row = ([key, label, field, step, unit]) => `<div class="hbs-rscrit">
            <div class="h"><b>${label}</b><label class="hbs-rsmust"><input type="checkbox" data-rsm="${key}"${m[key] ? ' checked' : ''}> must</label></div>
            <div class="f${key === 'bs' ? ' f3' : ''}">${key === 'fac' ? `<label class="hbs-rsfld hbs-rsfldck"><span>required</span><input type="checkbox" data-rsc="requireNoFaction"${cr.requireNoFaction ? ' checked' : ''}></label>`
                : key === 'bs' ? box('min', numIn('minBs', step)) + box('max (0 = none)', numIn('maxBs', step)) : box(unit + ' (0 = off)', numIn(field, step))}
              ${box('weight', `<input class="hbs-input" type="number" min="0" max="10" inputmode="numeric" data-rsw="${key}" value="${cr.w[key] != null ? cr.w[key] : 1}">`)}</div></div>`;
        const plain = (label, input) => `<div class="hbs-rsset"><span>${label}</span>${input}</div>`;
        const N = store.get(K.rsSetNote, null), at = num(store.get(K.rsSetAt, 0));
        const shared = `<div class="hbs-hint">🔗 Shared with every leader${at ? ` · last saved ${fmtDT(Math.floor(at / 1000))} ${tzTagH()}` : ' · not saved to the Hub yet'}.${N && Date.now() - N.at < 48 * 3600e3 ? `<br><b>${esc(N.by)}</b> changed: ${esc((N.diff || []).join(', ') || 'settings')}` : ''}</div>`;
        return `<div class="hbs-card">${shared}${sec('Recruit checks')}
            ${RS_CHECKS.map(row).join('')}
            <div class="hbs-hint"><b>Weight</b> = how much a check counts toward the score (pass = full weight, near miss = half, 0 = ignore).
                <b>must</b> = failing it excludes the player. Federal jail is always skipped. Per-day numbers = lifetime total ÷ account age (no extra API calls).</div>
            ${sec('Score')}${plain('Fit at score ≥', numIn('fitScore'))}${plain('Near fit at score ≥', numIn('nearScore'))}
            <div class="hbs-hint">Fits and near fits stay in 🔎 Scout; below that they stay in 🗃 Pool only. The list sorts by score.</div>
            ${sec('Other')}${plain('Flag enemies at (info only)', numIn('enemyFlag'))}${plain('Skip if in hospital over (hrs)', numIn('skipHospHrs'))}
            ${sec('Message template')}<label class="hbs-rsfld"><span>Subject</span><input class="hbs-input" data-rssubj maxlength="80" style="text-align:left" value="${esc(rsSubj())}"></label>
            <label class="hbs-rsfld" style="margin-top:6px"><span>Message</span><textarea class="hbs-input" data-rstpl style="width:100%;min-height:90px;text-align:left">${esc(rsTpl())}</textarea></label>
            <div class="hbs-hint">Placeholders (subject and message): {name} {level} {bs} {id}. ✉ Message opens the mail with both filled in - you press Send.</div>
            ${sec("Hub's Recruitment list")}
            <label class="hbs-ck"><input type="checkbox" data-rshub${rsHubAuto() ? ' checked' : ''}> Send players to the Hub list after checks</label>
            ${plain('…when the score is at least', `<input class="hbs-input" type="number" min="0" max="100" data-rspct value="${rsHubPct()}">`)}
            <div class="hbs-hint">Players declined, joined or removed on the Hub list are hidden from every leader's pool.</div>
            ${sec('API usage')}${plain('Recruit Torn calls per minute', `<input class="hbs-input" type="number" min="10" max="90" data-rsrate value="${rsRate()}">`)}
            <div class="hbs-hint">Your key allows 100 calls a minute shared by every script. Each check = 1 call.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-rs="setsave">Save</button></div></div>`;
    }
    function rsSetBind() {
        const b = bodyEl.querySelector('[data-rs="setsave"]'); if (!b) return;
        b.addEventListener('click', () => {
            const next = { must: {} };
            bodyEl.querySelectorAll('[data-rsc]').forEach(i => { next[i.dataset.rsc] = i.type === 'checkbox' ? i.checked : Math.max(0, Number(i.value) || 0); });
            bodyEl.querySelectorAll('[data-rsm]').forEach(i => { if (i.checked) next.must[i.dataset.rsm] = true; });
            next.w = {}; bodyEl.querySelectorAll('[data-rsw]').forEach(i => { next.w[i.dataset.rsw] = Math.max(0, Math.min(10, Number(i.value) || 0)); });
            store.set(K.rsCrit, next);
            const t = bodyEl.querySelector('[data-rstpl]').value.trim(); store.set(K.rsTpl, t === RS_TPL0 ? '' : t);
            const sj = bodyEl.querySelector('[data-rssubj]').value.trim(); store.set(K.rsSubj, sj === RS_SUBJ0 ? '' : sj);
            store.set(K.rsHubAuto, bodyEl.querySelector('[data-rshub]').checked);
            store.set(K.rsHubPct, Math.max(0, Math.min(100, Number(bodyEl.querySelector('[data-rspct]').value) || 0)));
            store.set(K.rsRate, Math.max(10, Math.min(90, Number(bodyEl.querySelector('[data-rsrate]').value) || 50)));
            // verdicts follow the new criteria (pool rows of players with full data)
            Object.values(rsDb.candidates).forEach(c => { if (c.quick && rsPool[c.id]) { rsPool[c.id][5] = rsPct(c); rsPool[c.id][6] = VCODE[rsVerdict(c)]; } });
            rsPoolSave();
            rsSay('Saving to the Hub for every leader…');
            rsUploadSettings(false).then(ok => { rsSay(ok ? 'Criteria saved - shared with every leader.' : 'Not saved - you now have the other leader\'s settings.', !ok); if (ok) { rsView = 'scout'; store.set(K.rsView, rsView); } render(true); })
                .catch(e => { rsSay('Saved on this device, but not on the Hub: ' + e.message, true); render(true); });
        });
    }

    // =====================================================================
    // 📦 ARMORY LOAN FILTER (0.2.18, user: "Add Loan filter to the armory page") - the "Armory Loan Filter" script, in the
    // Suite. On Torn's own faction armory page (factions.php #/tab=armoury) a small bar above the item list:
    //   [ ] Hide loaned items   ·  N hidden
    // Rule (the user's, from the old script): a row is AVAILABLE when its loaned cell reads "Available"; any other
    // value = out on loan. Never keyed off the Give / Loan / Retrieve buttons (stackable tabs show all three on every
    // row). Rows are only hidden / shown (a class) - nothing is clicked or requested. Remembered per device (K.armHide).
    // Torn loads tabs and pages by AJAX, so the filter re-applies when the list changes (MutationObserver, debounced).
    // The 🧰 Loans outlines (green / red) are unaffected - an outlined row that's loaned out is hidden with the rest.
    // =====================================================================
    const onArmouryTab = () => /factions\.php/.test(location.href) && /tab=armou?ry/i.test(location.hash);
    let armFT = null;
    function armFilterApply() {
        armFT = null;
        const on = !!store.get(K.armHide, false);
        document.querySelectorAll('.hbs-armhide').forEach(li => { if (!on) li.classList.remove('hbs-armhide'); });
        if (!onArmouryTab()) { document.querySelectorAll('.hbs-armbar').forEach(b => b.remove()); return; }
        const lists = [...document.querySelectorAll('ul.item-list')].filter(ul => ul.querySelector(':scope > li .loaned'));
        lists.forEach(ul => {
            let hidden = 0;
            ul.querySelectorAll(':scope > li').forEach(li => {
                const cell = li.querySelector('.loaned'); if (!cell) return;
                const loaned = !/\bavailable\b/i.test(cell.textContent || '');
                li.classList.toggle('hbs-armhide', on && loaned);
                if (on && loaned) hidden++;
            });
            // the bar sits right above the list (one per list)
            let bar = ul.previousElementSibling && ul.previousElementSibling.classList.contains('hbs-armbar') ? ul.previousElementSibling : null;
            if (!bar) {
                bar = document.createElement('div'); bar.className = 'hbs-armbar';
                bar.innerHTML = `<label><input type="checkbox" data-armhide> Hide loaned items</label><span data-armn></span>`;
                ul.parentNode.insertBefore(bar, ul);
                bar.querySelector('[data-armhide]').addEventListener('change', e => { store.set(K.armHide, e.target.checked); armFilterApply(); });
            }
            bar.querySelector('[data-armhide]').checked = on;
            bar.querySelector('[data-armn]').textContent = on ? `${hidden} loaned item${hidden === 1 ? '' : 's'} hidden` : '';
        });
    }
    function armFilterWatch() {
        if (!/factions\.php/.test(location.href) || armFilterWatch.on) return; armFilterWatch.on = true;
        const soon = () => { if (!armFT) armFT = setTimeout(armFilterApply, 300); };
        new MutationObserver(muts => { if (muts.some(m => !(m.target.closest && m.target.closest('.hbs-armbar, #hbs-panel')))) soon(); })
            .observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', soon); soon();
    }
    armFilterWatch();

    const VIEWS = {
        chain: { html: chainHtml, bind: chainBind }, oc: { html: ocHtml, bind: ocBind }, recruit: { html: recruitHtml, bind: recruitBind },
        more: { html: moreHtml }, alerts: { html: alertsHtml, bind: alertsSeen },
        announce: { html: async () => { const h = await annHtml(); annMsg = ''; return h; }, bind: annBind },   // (0.2.66) leaders
        home: { html: async () => armHomeLine() + await homeHtml(), bind: homeBind },   // (0.2.78) + the leaders' armory line boards: { html: boardsHtml, bind: boardsBind },
        me: { html: () => profileHtml(me.id, true), bind: profileBind },
        members: { html: membersHtml, bind: membersBind }, wars: { html: warTabHtml, bind: warTabBind },
        history: { html: historyHtml, bind: () => bindChips('hs', v => { histSec = v; }) },   // (0.2.64) past wars + war / chain / OC summaries
        news: { html: newsHtml, bind: () => bindChips('ns', v => { newsSec = v; }) },
        payouts: { html: payoutsHtml }, scripts: { html: scriptsHtml },

        stats: { html: statsHtml, bind: () => { bindChips('sk', v => { statsKind = v; }); bindChips('ss', v => { statsSort = v; }); } },
        armory: { html: armoryHtml, bind: () => { bindChips('as', v => { armSec = v; }); bindChips('ap', v => { armPeriod = v; }); bindChips('ao', v => { armSort = v; }); armBind(); } },
    };

    // ---------------------------------------------------------------------
    // SETTINGS — the API key (kept on this device; the Hub never gets it)
    // ---------------------------------------------------------------------
    function renderSettings() {
        const pda = isPDA(), key = pda ? '' : String(store.get(K.key, '') || '');
        bodyEl.innerHTML = `
            <div class="hbs-sec">API keys</div>
            <div class="hbs-hint" style="opacity:.85">For Heart Breakers members. ${pda ? "Using <b>TornPDA's API key</b> - nothing to enter."
                : 'Paste your Torn API key - a <b>Limited Access</b> key is needed (a Public key can\'t read your energy, cooldowns or OC pass rates).'} The key stays on this device: the script asks Torn who you are
                and sends the Hub only your name, ID and faction.</div>
            ${pda ? '' : `<label class="hbs-rsfld" style="margin-top:6px"><span>Torn API key <b style="color:#FFB454">· Limited Access key needed</b></span><input class="hbs-input hbs-secret" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" data-key maxlength="16" placeholder="Limited Access API key (16 characters)" value="${esc(key)}" style="text-align:left"></label>`}
            <label class="hbs-rsfld" style="margin-top:6px"><span>FFScouter key (optional - fair-fight on retals, battle stats for recruiting)</span>
                <input class="hbs-input hbs-secret" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" data-ffkey placeholder="FFScouter key" value="${esc(ffKey())}" style="text-align:left"></label>
            <div class="hbs-hint">Both keys stay on this device - never sent to the Hub.</div>
            <div class="hbs-actions">
                <button type="button" class="hbs-btn" data-x="save">${pda ? 'Sign in' : 'Save & sign in'}</button>
                ${key ? '<button type="button" class="hbs-btn hbs-ghost" data-x="forget">Remove key from this device</button>' : ''}
            </div>
            <div class="hbs-msg" data-xmsg>${me ? `Signed in as <b>${esc(me.name)}</b> (${esc(me.position)}${me.leader ? ' - leader tools on' : ''}).` : ''}</div>
            <div data-sharebox></div>
            <div data-dispbox></div>
            <div data-bkbox></div>
            ${(() => { const o = oldScripts(); return o.length ? `<div class="hbs-banner">⚠ <b>Old scripts still installed:</b> ${o.map(esc).join(', ')}.<br>
                The Suite replaces them - uninstall them in Tampermonkey (or TornPDA → Userscripts) so the same features don't run twice.</div>` : ''; })()}`;
        const msgEl = bodyEl.querySelector('[data-xmsg]');
        bodyEl.querySelector('[data-x="save"]').onclick = async () => {
            const inp = bodyEl.querySelector('[data-key]');
            // (0.2.15) the FFScouter key is saved with the Torn key (both "API keys")
            const ffi = bodyEl.querySelector('[data-ffkey]');
            if (ffi && ffi.value.trim() !== ffKey()) { store.set(K.ffKey, ffi.value.trim()); store.set(K.ffCache, {}); ffAt = 0; rsFfNote = ''; }
            if (inp) {
                const v = inp.value.trim();
                if (!/^[A-Za-z0-9]{16}$/.test(v)) { msgEl.textContent = 'An API key is 16 letters and numbers.'; return; }
                store.set(K.key, v);
            }
            store.set(K.session, null); setMe(null);
            Object.keys(cache).forEach(k => delete cache[k]);
            msgEl.textContent = 'Signing in…';
            try {
                await signIn();
                msgEl.innerHTML = `Signed in ✓ as <b>${esc(me.name)}</b> (${esc(me.position)}${me.leader ? ' - leader tools on' : ''}).`;
                setStatus('');
            } catch (e) { msgEl.textContent = e.message; }
        };
        { const db = bodyEl.querySelector('[data-dispbox]'); if (db) displayBox(db); const bb = bodyEl.querySelector('[data-bkbox]'); if (bb && me) backupBox(bb); }
        drawPin();
        const fg = bodyEl.querySelector('[data-x="forget"]');
        if (fg) fg.onclick = () => { store.set(K.key, ''); store.set(K.session, null); store.set(K.share, null); setMe(null); renderSettings(); setStatus('Key removed from this device.'); };
        if (getKey()) shareSettingsBox();
    }

    // ---- ⚙ Share from this script (v2.1.0) ----
    async function shareSettingsBox() {
        const box = bodyEl.querySelector('[data-sharebox]'); if (!box) return;
        if (!box.innerHTML.trim()) box.innerHTML = '<div class="hbs-sec">Share from this script</div>';   // (0.2.27) no "Loading…" - just the heading until the Hub answers
        let g;
        // [HB Suite] Hub API — op "share_get": this member's script-sharing settings
        try { g = await hub('share_get'); } catch (e) { box.innerHTML = `<div class="hbs-sec">Share from this script</div><div class="hbs-msg">${esc(e.message)}</div>`; return; }
        const st = Object.assign({ bs: 'off', ws: 'off', ready: false, oc: false, cw: false }, g.settings || {});
        store.set(K.share, st);
        const sel = (k, v) => `<select class="hbs-input" data-sh="${k}">${[['off', 'Off'], ['leaders', 'Leaders'], ['faction', 'Faction']]
            .map(([x, l]) => `<option value="${x}"${v === x ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        const onoff = (k, v, on) => `<select class="hbs-input" data-sh="${k}"><option value="0"${v ? '' : ' selected'}>Off</option><option value="1"${v ? ' selected' : ''}>${on}</option></select>`;
        // the same five options as the Hub's My data & sharing, same wording
        const opt = (icon, title, what, ctl) => `<div class="hbs-item"><div class="hbs-row"><span style="flex:1"><b>${icon} ${title}</b></span><span style="flex:0 0 118px">${ctl}</span></div>
            <div class="hbs-hint">${what}</div></div>`;
        box.innerHTML = `<div class="hbs-sec">Share from this script</div>
            <div class="hbs-hint" style="opacity:.85">The same options as the Hub's <a href="${HUB_BASE}/m/my-data.html" target="_blank" rel="noopener">My data & sharing</a>,
                but your key is <b>never uploaded</b>: this script reads Torn on this device and sends only the results. It only updates while the script is running.</div>
            ${opt('🕵️', 'OC pass rates', 'Your checkpoint pass rate per organized crime role - checked every few minutes while this script runs (on unless you switch it off), so leaders\' Team Builder and the Suite can put you in the roles you pass best.', onoff('oc', st.oc, 'On'))}
            ${opt('💪', 'Battle stats', 'Strength, defense, speed, dexterity - read once a day (the first time the script runs after 00:00 TCT) so your gains are tracked.', sel('bs', st.bs))}
            ${opt('🧰', 'Work stats', 'Manual labor, intelligence, endurance - read once a day.', sel('ws', st.ws))}
            <div class="hbs-hint">Sharing on the Hub too? The two are combined.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-shsave>Save sharing</button></div>
            <div class="hbs-msg" data-shmsg>${g.last && (g.last.bs || g.last.ws || g.last.rd_at) ? 'Last sent: ' + [g.last.bs || g.last.ws ? 'stats ' + (g.last.bs || g.last.ws) : '',
                ''].filter(Boolean).join(' · ') : ''}</div>`;
        box.querySelector('[data-shsave]').onclick = async () => {
            const m = box.querySelector('[data-shmsg]');
            const val = k => box.querySelector(`[data-sh="${k}"]`).value;
            const v = { bs: val('bs'), ws: val('ws'), ready: false, oc: val('oc') === '1', cw: false };     // chain timer: Chain Watch's job (2.3.0)
            m.textContent = 'Saving…';
            try {
                // [HB Suite] Hub API — op "share_set": save what to share from the script (all off = the Hub deletes it)
                const r = await hub('share_set', v);
                store.set(K.share, r.settings);
                const was = store.get(K.shareDay, '');
                if (v.bs !== 'off' || v.ws !== 'off') store.set(K.shareDay, '');         // send today's stats now
                if (v.oc) store.set(K.ocTag, '');                                        // send your OC pass rates now
                m.textContent = (v.bs === 'off' && v.ws === 'off' && !v.oc) ? 'Saved ✓ - nothing is shared from this script; what it sent was deleted.'
                    : 'Saved ✓ - sharing runs while the script is active.';
                if (!was || v.bs !== 'off' || v.ws !== 'off' || v.oc) shareTick(true);
            } catch (e) { m.textContent = e.message; }
        };
    }

    // ---------------------------------------------------------------------
    // SHARING LOOP (v2.1.0) — runs while Torn is open and visible, panel open or not, ONLY when this member turned
    // something on (cached in K.share; nothing at all reaches the Hub otherwise). See SHARING in the notes.
    // ---------------------------------------------------------------------
    let shareTimer = null, shareBusy = false;
    // (0.2.89) 9. while the Hub can push changes (Chain Watch connection open) the routine check-in is every 5 minutes
    const pingEvery = () => (cw && cw.ws && cw.ws.readyState === 1 && cw.busOk) ? 300000 : SHARE_PING_MS;
    const tctDay = () => new Date().toISOString().slice(0, 10);
    async function shareTick(now) {
        clearTimeout(shareTimer); shareTimer = null;
        // (0.2.55, user: "Switch all sharing an API key to 'On' for CPR rates.") once per device: the saved copy of the
        // sharing settings is dropped, so a script that had everything off asks the Hub again - where OC pass rates
        // are now on for everyone (switching it off afterwards sticks, the Hub keeps that choice)
        if (!store.get(K.shareMig, 0)) { store.set(K.shareMig, 1); store.set(K.share, null); }
        // (0.2.55) no saved choice = OC pass rates ON (the Hub's default too); stats stay off until chosen
        const st = store.get(K.share, null) || { bs: 'off', ws: 'off', ready: false, oc: true, cw: false };
        if (st && st.ready && getKey()) {                           // (0.2.45) War Readiness removed: switch it off on the Hub, once
            try { const r = await hub('share_set', { bs: st.bs || 'off', ws: st.ws || 'off', ready: false, oc: !!st.oc, cw: false });   // [HB Suite] Hub API — op "share_set" (turns off the removed War readiness share)
                store.set(K.share, r.settings || Object.assign({}, st, { ready: false })); } catch (e) { /* next run */ }
            st.ready = false;                                       // (in memory too - never loops if the Hub call failed)
        }
        if (!st || !getKey() || (st.bs === 'off' && st.ws === 'off' && !st.oc)) return;          // not sharing: stop
        let next = SHARE_PING_MS;
        // (0.2.55) no longer only while the tab is visible - these are API reads, not page reading - but only one tab
        // does the work: the "last done" times are shared between tabs
        if (!shareBusy) {
            shareBusy = true;
            try {
                // stats: once a day (the first run after 00:00 TCT)
                if ((st.bs !== 'off' || st.ws !== 'off') && store.get(K.shareDay, '') !== tctDay()) {
                    // [HB Suite] Torn API — sharing: own battle + work stats (once a day)
                    const d = await tornGet('https://api.torn.com/user/?selections=battlestats,workstats');
                    const day = tctDay(), body = {};
                    if (st.bs !== 'off') body.bs = [day, d.strength, d.defense, d.speed, d.dexterity].map((x, i) => i ? Math.round(num(x)) : x);
                    if (st.ws !== 'off') body.ws = [day, d.manual_labor, d.intelligence, d.endurance].map((x, i) => i ? Math.round(num(x)) : x);
                    // [HB Suite] Hub API — op "share_push": today's stats (numbers only)
                    await hub('share_push', body);
                    store.set(K.shareDay, day);
                }
                if (st.oc && Date.now() - num(store.get(K.sharePingAt, 0)) > pingEvery() - 20000) {
                    store.set(K.sharePingAt, Date.now());
                    // [HB Suite] Hub API — op "share_ping": is a leader watching War Readiness? a new crime? (also refreshes the
                    // settings)
                    // [HB Suite] Hub API — op "share_ping": the regular check-in; (0.2.77) + this Suite's version / PDA flag
                    // (0.2.89) 7. sync: 1 = add my OC tile data + (leaders) the alert list's signature; 10. torn = this
                    // device's Torn read counts since the last check-in (numbers only)
                    const tc = Object.assign({}, tornCount); Object.keys(tornCount).forEach(k => delete tornCount[k]);
                    const p = await hub('share_ping', { v: VERSION, pda: isPDA(), sync: 1, torn: tc });
                    if (p.myoc) syncMyOc(p.myoc);
                    if (p.alerts_v != null && me && me.leader && p.alerts_v !== store.get(K.alertsV, '')) { store.set(K.alertsV, p.alerts_v); refreshBadges(true); }
                    const ps = p.settings || st;
                    if (p.settings) store.set(K.share, p.settings);
                    if (p.feed_free) feedAsk();        // (0.2.69) nobody is feeding the crime list - offer this script
                    // (0.2.55) every OC_SHARE_MS, or at once when the Hub found a new crime (its tag changed)
                    if (ps.oc && ((p.oc_tag && p.oc_tag !== store.get(K.ocTag, '')) || Date.now() - num(store.get(K.ocShareAt, 0)) > OC_SHARE_MS - 20000)) {
                        store.set(K.ocShareAt, Date.now());
                        // [HB Suite] Torn API — sharing: own OC pass rates (v2 user/organizedcrimes - every 5 min while the script runs, 1 call)
                        const d = await tornGet('https://api.torn.com/v2/user/organizedcrimes');
                        const rows = [];
                        (d.organizedcrimes || []).forEach(c => (c.slots || []).forEach(sl => {
                            if (sl.user || typeof sl.checkpoint_pass_rate !== 'number') return;      // only open roles carry YOUR rate
                            rows.push([c.name, (sl.position_info && sl.position_info.label) || sl.position, Math.round(sl.checkpoint_pass_rate)]);
                        }));
                        // [HB Suite] Hub API — op "share_push": the pass rates [[crime, role, rate], ...]
                        // (0.2.55) sent even when empty: the Hub then records that this member's script checked just now
                        await hub('share_push', { oc: rows });
                        if (p.oc_tag) store.set(K.ocTag, p.oc_tag);
                    }
                }
            } catch (e) { console.warn(LOG, 'sharing:', e.message); }
            shareBusy = false;
        }
        shareTimer = setTimeout(shareTick, next);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !shareTimer) shareTick(); });

    // ---------------------------------------------------------------------
    // 🛰 CRIME FEED (0.2.69) — see the build note in build_patch_0269.py. The Hub picks ONE script at a time; that
    // script reads the faction's crimes every FEED_MS and uploads the list. Lease: the Hub drops a feeder that hasn't
    // answered for 150 s (K.feedOn mirrors that here), so closing Torn simply hands the job to the next script.
    // ---------------------------------------------------------------------
    const FEED_MS = 60000, FEED_LEASE_MS = 150000, FEED_NO_MS = 6 * 3600e3;
    let feedBusy = false;
    const feedAllowed = () => !!getKey() && (store.get(K.share, null) || { oc: true }).oc !== false && num(store.get(K.feedNo, 0)) < Date.now();
    const feedMine = () => num(store.get(K.feedOn, 0)) > Date.now();
    async function feedAsk() {
        if (feedMine() || !feedAllowed()) return;
        try {
            // [HB Suite] Hub API — op "oc_feed" ask: may this script be the crime feeder? (no data sent)
            const r = await hub('oc_feed', { do: 'ask' });
            if (r && r.feed) { store.set(K.feedOn, Date.now() + FEED_LEASE_MS); feedTick(); }
        } catch (e) { /* next share_ping */ }
    }
    async function feedTick() {
        if (feedBusy || !feedMine()) return;
        if (!feedAllowed()) { store.set(K.feedOn, 0); hub('oc_feed', { do: 'stop' }).catch(() => {}); return; }   // switched off: give it back
        if (Date.now() - num(store.get(K.feedAt, 0)) < FEED_MS - 2000) return;      // this or another tab read it under a minute ago
        feedBusy = true; store.set(K.feedAt, Date.now());
        try {
            // (0.2.89) 5. FEEDER BACKUP: ask the Hub first (keeps the lease); a reading its own key made under a minute
            // ago (completed crimes: 3 minutes) isn't read again
            // [HB Suite] Hub API — op "oc_feed" beat: keep the feeder job + when the Hub last read each list itself
            const hb = await hub('oc_feed', { do: 'beat' }).catch(() => null);
            if (hb && hb.feed === false) { store.set(K.feedOn, 0); feedBusy = false; return; }
            const ha = (hb && hb.hub_at) || {}, fresh = (k, ms) => num(ha[k]) && Date.now() - num(ha[k]) < ms;
            if (hb) store.set(K.feedOn, Date.now() + FEED_LEASE_MS);
            if (fresh('crimes', 60000)) { feedBusy = false; return; }
            // [HB Suite] Torn API — crime feed: the faction's recruiting + planning crimes (v2 faction/crimes, 1 call a
            // minute, ONLY while the Hub has picked this script as the feeder)
            const d = await tornGet('https://api.torn.com/v2/faction/crimes?cat=available&limit=100&sort=ASC');
            // [HB Suite] Hub API — op "oc_feed" put: the crime list (no key; the Hub blanks this member's own open-slot rates)
            const body = { do: 'put', crimes: Array.isArray(d.crimes) ? d.crimes : [] };
            // (0.2.71) FEEDER EXTRAS - each in its own try: a failed extra never holds the crime list back
            if (!fresh('now', 60000)) try {
                // [HB Suite] Torn API — crime feed extra: the faction's chain + wars (v2 faction, 1 call a minute, feeder only)
                const n = await tornGet('https://api.torn.com/v2/faction?selections=chain,wars');
                if (n && (n.chain !== undefined || n.wars !== undefined)) body.now = { chain: n.chain || null, wars: n.wars || null };
            } catch (e) { /* the Hub's own read covers it */ }
            if (Date.now() - num(store.get(K.feedDoneAt, 0)) > 170000 && !fresh('recent', 170000)) {
                try {
                    // [HB Suite] Torn API — crime feed extra: the newest completed crimes (v2 faction/crimes, 1 call every 3 min, feeder only)
                    const c = await tornGet('https://api.torn.com/v2/faction/crimes?cat=completed&limit=100&sort=DESC');
                    if (Array.isArray(c.crimes)) { store.set(K.feedDoneAt, Date.now());
                        body.completed = c.crimes.map(x => ({ id: x.id, name: x.name, status: x.status, executed_at: x.executed_at,   // only what the payout list needs
                            rewards: x.rewards ? { money: x.rewards.money, items: Array.isArray(x.rewards.items) ? x.rewards.items.map(() => 0) : [], payout: x.rewards.payout || null } : null })); }
                } catch (e) { /* next time */ }
            }
            const r = await hub('oc_feed', body);
            store.set(K.feedOn, r && r.feed ? Date.now() + FEED_LEASE_MS : 0);
            if (r && (r.changed || (r.extra && r.extra.length))) { try { liveClear(); } catch (e) { /* not set up yet */ } }   // this panel's reads are re-asked
        } catch (e) {
            const m = String((e && e.message) || '');
            if (/^Torn: /.test(m)) {                           // Torn refused the read: give the job back so another script takes it
                if (/Faction API access|Access level|Incorrect ID/i.test(m)) store.set(K.feedNo, Date.now() + FEED_NO_MS);
                store.set(K.feedOn, 0); hub('oc_feed', { do: 'stop' }).catch(() => {});
            }                                                  // (Torn / the Hub not answering: try again next minute; the lease lapses by itself)
        }
        feedBusy = false;
    }
    setInterval(feedTick, 15000);

    // ---------------------------------------------------------------------
    // CLICKS (event delegation shared by every tab)
    // ---------------------------------------------------------------------
    function bindBody() {
        bodyEl.addEventListener('scroll', viewOnScroll, { passive: true });   // (0.2.4) remember where you are on each tab
        bodyEl.addEventListener('click', e => {
            const t = e.target;
            const pr = t.closest('[data-prof]');
            if (pr) { e.preventDefault(); openProfile(pr.dataset.prof); return; }
            // (0.2.4, user: "Clicking a members name on the Suite should open their profile in the suite") a Torn
            // profile link on a faction member's NAME opens the Suite profile; buttons (Torn profile) still go to Torn
            const pa = t.closest('a[href*="profiles.php?XID="]');
            if (pa && !pa.classList.contains('hbs-btn')) { const id = (pa.href.match(/XID=(\d+)/) || [])[1]; if (id && isMemberId(id)) { e.preventDefault(); openProfile(id); return; } }
            if (t.closest('a')) return;                                   // links do their own thing
            const tg = t.closest('[data-toggle]');
            if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; viewSave(); render(true); return; }
            const b = t.closest('button');
            if (!b) return;
            if (b.dataset.gotab && hrefTab(b.dataset.gotab)) return;
            if (b.dataset.gotab) { tab = b.dataset.gotab; store.set(K.tab, tab); render(); return; }
            if (b.dataset.termed) { toggleTermed(b); return; }
            if (b.dataset.rc) { showReceipt(Number(b.dataset.rc)); return; }
            if (b.dataset.ntf) { notifyClick(b); return; }
            if (b.dataset.lv) { showLeave(Number(b.dataset.lv)); return; }
            if (b.dataset.news != null && b.dataset.what) { copyNews(b); return; }
            if (b.dataset.lvdel) {
                const pid = Number(b.dataset.lvdel), box = bodyEl.querySelector(`[data-lvbox="${pid}"]`), x = box && box._list && box._list[Number(b.dataset.k)];
                if (!x) return;
                saveLeave(pid, L => { L[pid] = (L[pid] || []).filter(y => !(y.from === x.from && y.to === x.to)); }, 'removed');
                return;
            }
            if (b.dataset.lvadd) {
                const pid = Number(b.dataset.lvadd), box = bodyEl.querySelector(`[data-lvbox="${pid}"]`);
                const f = box.querySelector('[data-lvf]').value, to = box.querySelector('[data-lvt]').value, msgEl = box.querySelector('[data-lvmsg]');
                if (!f || !to) { msgEl.textContent = 'Pick both dates.'; return; }
                const from = Date.parse(f + 'T00:00:00Z') / 1000, end = Date.parse(to + 'T23:59:59Z') / 1000;
                if (!(end >= from)) { msgEl.textContent = 'The end date is before the start.'; return; }
                const note = box.querySelector('[data-lvn]').value.trim().slice(0, 80);
                saveLeave(pid, L => { (L[pid] = L[pid] || []).push({ from, to: end, note, by: me ? me.name : '', at: nowS() }); }, 'added');
            }
        });
    }

    // ---------------------------------------------------------------------
    // PERFORMANCE RECEIPT drawing
    // ---------------------------------------------------------------------
    // Same layout as the Hub profile's receipt (tools/member_profile.html drawReceipt) - keep the two in step.
    function drawReceipt(m, R, WT, RU) {
        const X = R.receipt, W = X.wars || {}, C = X.chains || {}, sc = R.score, G = sc == null ? null : relG(sc);
        const S = 2, Wd = 640, pad = 28, last = W.last || [];
        const H = 640 + last.length * 26 + (X.leave && X.leave.length ? 40 : 0);
        const cv = document.createElement('canvas'); cv.width = Wd * S; cv.height = H * S;
        const g = cv.getContext('2d'); g.scale(S, S);
        g.fillStyle = '#100a0b'; g.fillRect(0, 0, Wd, H);
        g.strokeStyle = '#5c1c1a'; g.lineWidth = 2; g.strokeRect(6, 6, Wd - 12, H - 12);
        g.strokeStyle = '#2a1416'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, 92); g.lineTo(Wd - pad, 92); g.stroke(); g.setLineDash([]);
        const T = (txt, x, y, size, col, weight, align) => { g.font = `${weight || 400} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
            g.fillStyle = col || '#ddd'; g.textAlign = align || 'left'; g.fillText(String(txt), x, y); };
        T('HEART BREAKERS', Wd / 2, 40, 13, '#e4382e', 800, 'center');
        T('PERFORMANCE RECEIPT', Wd / 2, 66, 22, '#e8be5a', 800, 'center');
        T('Generated ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + ' (TCT)', Wd / 2, 84, 11, '#9a9a9c', 400, 'center');
        let y = 124;
        T(m.name, pad, y, 24, '#fff', 800); T(`[${m.id}]`, Wd - pad, y, 13, '#9a9a9c', 400, 'right'); y += 24;
        T([X.level != null ? 'Level ' + X.level : '', m.position || '', X.days != null ? X.days + ' days in the faction' : ''].filter(Boolean).join('  ·  '), pad, y, 14, '#cfcfd1'); y += 20;
        T('Last active: ' + (X.last_action ? fmtD(X.last_action) : '-'), pad, y, 12, '#9a9a9c'); y += 30;
        g.fillStyle = '#170d0e'; g.strokeStyle = '#5c1c1a'; g.lineWidth = 1; g.fillRect(pad, y, Wd - 2 * pad, 74); g.strokeRect(pad, y, Wd - 2 * pad, 74);
        T('RELIABILITY RATING', pad + 14, y + 22, 11, '#9a9a9c', 700);
        if (sc == null) T('Not enough data', pad + 14, y + 56, 24, '#9a9a9c', 800);
        else { T(G[0], pad + 14, y + 60, 38, G[1], 800); T(sc + ' / 100', pad + 64, y + 58, 20, '#fff', 700); }
        const pt = (k, mx) => R.parts[k] == null ? 'n/a' : `${R.parts[k]}/${mx}`;
        T(`War ${pt('war', WT.war)}   ·   Chains ${pt('chains', WT.chains)}   ·   Activity ${pt('activity', WT.activity)}`, Wd - pad - 14, y + 56, 13, '#cfcfd1', 400, 'right');
        y += 104;
        const row = (label, val, cmp) => { T(label, pad + 8, y, 14, '#cfcfd1'); T(val, Wd - pad - 8, y, 14, '#fff', 700, 'right'); y += 24;
            if (cmp) { T(cmp, Wd - pad - 8, y - 6, 11, '#9a9a9c', 400, 'right'); y += 10; } };
        const head = txt => { T(txt, pad, y, 15, '#e8be5a', 800); g.fillStyle = '#5c1c1a'; g.fillRect(pad, y + 7, Wd - 2 * pad, 1); y += 30; };
        const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
        const vs = (a, f) => a == null || f == null ? '' : `faction avg ${f}  (${f ? (a >= f ? '▲ ' : '▼ ') + Math.abs(Math.round((a / f - 1) * 100)) + '%' + (a >= f ? ' above' : ' below') : '-'})`;
        head('⚔  WARS');
        row('Wars while a member', String(W.in || 0));
        row(`Wars participated (${RU.min_hits}+ hits)`, `${W.part || 0}  (${pct(W.part || 0, W.in)})`);
        row('Total war hits', (W.hits || 0).toLocaleString('en-US'));
        row('Hits per war', W.avg == null ? '-' : String(W.avg), vs(W.avg, W.fac_avg));
        if (last.length) {
            y += 4; T('LAST ' + last.length + ' WARS', pad + 8, y, 11, '#9a9a9c', 700); T('HITS', Wd - pad - 120, y, 11, '#9a9a9c', 700, 'right'); T('FACTION AVG', Wd - pad - 8, y, 11, '#9a9a9c', 700, 'right'); y += 20;
            last.forEach(w => { T(`${w.ok ? '✓' : '✗'}  ${fmtD(w.end)}  vs ${String(w.opponent || '?').slice(0, 26)}`, pad + 8, y, 13, w.ok ? '#cfcfd1' : '#f08a84');
                T(String(w.hits), Wd - pad - 120, y, 13, w.ok ? '#fff' : '#f08a84', 700, 'right'); T(String(w.fac_avg), Wd - pad - 8, y, 13, '#9a9a9c', 400, 'right'); y += 26; });
        }
        y += 12; head(`⛓  LARGE CHAINS (${RU.chain_min}+ HITS)`);
        row('Large chains while a member', String(C.in || 0));
        row(`Large chains participated (${RU.min_hits}+ hits)`, `${C.part || 0}  (${pct(C.part || 0, C.in)})`);
        row('Large chain hits', (C.hits || 0).toLocaleString('en-US'));
        row('Hits per chain (when hitting)', C.avg == null ? '-' : String(C.avg), C.avg == null ? '' : vs(C.avg, C.fac_avg).replace('faction avg', 'faction avg per hitter'));
        y += 6;
        if (X.leave && X.leave.length) { T('Excused leave (not counted): ' + X.leave.map(l => fmtD(l.from) + ' – ' + fmtD(l.to)).join(', '), pad, y, 11, '#e8be5a'); y += 20; }
        T(`Whole time in the faction · taking part = ${RU.min_hits}+ hits · termed wars count only when you took part · excused leave isn't counted · crimes aren't rated.`, Wd / 2, H - 22, 10, '#6f6f72', 400, 'center');
        return cv;
    }

    // ---------------------------------------------------------------------
    // PANEL POSITION / DRAG
    // ---------------------------------------------------------------------
    function restorePanelPos() {
        const pos = store.get(K.panelPos, null);
        if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) { panel.style.left = pos.left + 'px'; panel.style.top = pos.top + 'px'; }
        else { panel.style.left = Math.max(8, window.innerWidth - 450) + 'px'; panel.style.top = '70px'; }
    }
    // ---- RESIZING (v2.4.0) ----
    const MIN_W = 300, MIN_H = 260;
    const maxW = () => Math.max(MIN_W, window.innerWidth - 8), maxH = () => Math.max(MIN_H, window.innerHeight - 8);
    function applySize(w, h) {
        panel.style.width = clamp(Math.round(w), MIN_W, maxW()) + 'px';
        panel.style.height = clamp(Math.round(h), MIN_H, maxH()) + 'px';
    }
    function restorePanelSize() {
        const sz = store.get(K.panelSize, null);
        if (sz && Number.isFinite(sz.w) && Number.isFinite(sz.h)) applySize(sz.w, sz.h);   // else the CSS default size
    }
    function makePanelResizable() {
        const grip = el('div', 'hbs-grip', '◢');
        grip.title = 'Drag to resize · double-tap for the default size';
        panel.appendChild(grip);
        let rs = null, lastTap = 0;
        grip.addEventListener('pointerdown', e => {
            const r = panel.getBoundingClientRect();
            rs = { id: e.pointerId, x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top };
            try { grip.setPointerCapture(e.pointerId); } catch (_) {}
            grip.classList.add('hbs-on'); panel.classList.add('hbs-resizing');
            e.preventDefault(); e.stopPropagation();
        });
        grip.addEventListener('pointermove', e => {
            if (!rs || e.pointerId !== rs.id) return;
            // grow right / down, never past the screen edge from where the panel sits
            const w = Math.min(rs.w + (e.clientX - rs.x), window.innerWidth - rs.left - 4);
            const h = Math.min(rs.h + (e.clientY - rs.y), window.innerHeight - rs.top - 4);
            applySize(w, h);
        });
        const end = e => {
            if (!rs || e.pointerId !== rs.id) return;
            rs = null;
            try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
            grip.classList.remove('hbs-on'); panel.classList.remove('hbs-resizing');
            store.set(K.panelSize, { w: parseInt(panel.style.width, 10) || panel.offsetWidth, h: parseInt(panel.style.height, 10) || panel.offsetHeight });
            clampPanel();
        };
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
        // double-tap / double-click: back to the default size
        grip.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTap < 350) { panel.style.width = ''; panel.style.height = ''; store.set(K.panelSize, null); clampPanel(); }
            lastTap = now;
        });
    }
    function clampPanel() {
        if (!panel.classList.contains('hbs-open')) return;
        const sz = store.get(K.panelSize, null);                 // a saved size still has to fit a smaller / rotated screen
        if (sz && Number.isFinite(sz.w)) applySize(sz.w, sz.h);
        const w = panel.offsetWidth, h = panel.offsetHeight;
        panel.style.left = clamp(parseInt(panel.style.left, 10) || 0, 0, Math.max(0, window.innerWidth - w)) + 'px';
        panel.style.top = clamp(parseInt(panel.style.top, 10) || 0, 0, Math.max(0, window.innerHeight - h)) + 'px';
    }
    function makePanelDraggable(handle, ctrls) {
        let drag = null;
        handle.addEventListener('pointerdown', e => {
            if (ctrls.contains(e.target)) return;      // buttons stay clickable
            const r = panel.getBoundingClientRect();
            drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });
        handle.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.id) return;
            panel.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - panel.offsetWidth) + 'px';
            panel.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - panel.offsetHeight) + 'px';
        });
        const end = e => {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
            store.set(K.panelPos, { left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) });
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function setCollapsed(state) {
        collapsed = state;
        store.set(K.collapsed, state);
        panel.classList.toggle('hbs-open', !state);
        launcher.classList.toggle('hbs-show', state);
        if (!state) { clampPanel(); render(); } else { clampLauncher(); stopTimers(); }   // nothing polls while minimized
        if (me) cwWatch();                                     // Chain Watch stays connected only while you're queued
        try { cvDraw(); } catch (e) { /* compact view */ }       // (0.2.42)
    }

    // ---------------------------------------------------------------------
    // LAUNCHER (minimized state) — .torn-launcher, Torn Dock compatible
    // ---------------------------------------------------------------------
    const DRAG_THRESHOLD = 6;
    const launcherDragged = () => { const p = store.get(K.launchPos, null); return !!(p && Number.isFinite(p.left) && Number.isFinite(p.top)); };
    const isDocked = () => launcher && launcher.parentElement !== document.body;    // Torn Dock adopted it
    const isVisible = n => !!(n && n.isConnected && n.getClientRects().length);

    function buildLauncher() {
        launcher = el('div', 'torn-launcher');
        launcher.id = 'hbs-launcher';
        launcher.innerHTML = ICON_SVG;
        launcher.dataset.dockIcon = ICON_SVG;          // Dock renders this glyph in its own FAB chrome
        launcher.dataset.dockLabel = 'Heart Breakers Suite';
        launcher.setAttribute('aria-label', 'Heart Breakers Suite');
        launcher.setAttribute('role', 'button');
        document.body.appendChild(launcher);
        if (launcherDragged()) { const p = store.get(K.launchPos, null); launcher.style.left = p.left + 'px'; launcher.style.top = p.top + 'px'; }
        let drag = null, suppressClick = false;
        launcher.addEventListener('pointerdown', e => {
            if (isDocked()) return;
            const r = launcher.getBoundingClientRect();
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
        });
        launcher.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (!drag.moved) {
                if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
                drag.moved = true;
                try { launcher.setPointerCapture(e.pointerId); } catch (_) {}
            }
            e.preventDefault();
            const s = launcher.offsetWidth;
            launcher.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - s) + 'px';
            launcher.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - s) + 'px';
        });
        const end = e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.moved) {
                suppressClick = true;
                store.set(K.launchPos, { left: parseInt(launcher.style.left, 10), top: parseInt(launcher.style.top, 10) });
                try { launcher.releasePointerCapture(e.pointerId); } catch (_) {}
            }
            drag = null;
        };
        launcher.addEventListener('pointerup', end);
        launcher.addEventListener('pointercancel', end);
        launcher.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.preventDefault(); return; } setCollapsed(false); });
    }

    // Auto-place in the next free slot up the right edge (only when never dragged).
    function placeLauncherAuto() {
        if (!launcher || isDocked() || !launcher.classList.contains('hbs-show')) return;
        const size = launcher.offsetWidth || 52, gap = 10, margin = 12, bottomStart = 90;
        const others = [...document.querySelectorAll('.torn-launcher')]
            .filter(n => n !== launcher && n.parentElement === document.body && isVisible(n)).map(n => n.getBoundingClientRect());
        const x = window.innerWidth - size - margin;
        for (let i = 0; i < 30; i++) {
            const y = window.innerHeight - size - bottomStart - i * (size + gap);
            if (y < 0) break;
            const hit = others.some(r => !(x + size <= r.left || x >= r.right || y + size <= r.top || y >= r.bottom));
            if (!hit) { launcher.style.left = x + 'px'; launcher.style.top = y + 'px'; return; }
        }
        launcher.style.left = x + 'px';
        launcher.style.top = Math.max(0, window.innerHeight - size - bottomStart) + 'px';
    }
    function clampLauncher() {
        if (!launcher || isDocked()) return;
        if (!launcherDragged()) { placeLauncherAuto(); return; }
        const s = launcher.offsetWidth || 52;
        launcher.style.left = clamp(parseInt(launcher.style.left, 10) || 0, 0, Math.max(0, window.innerWidth - s)) + 'px';
        launcher.style.top = clamp(parseInt(launcher.style.top, 10) || 0, 0, Math.max(0, window.innerHeight - s)) + 'px';
    }

    // ---------------------------------------------------------------------
    // INIT
    // ---------------------------------------------------------------------
    function init() {
        if (document.getElementById('hbs-panel')) return;     // double-inject guard (the Hub script uses hbx-, so no clash)
    try { if (window.top !== window.self) return; } catch (e) { return; }   // (0.2.21) top page only - a copy in a frame would fight for the Chain Watch socket + alert tab
        // SCRIPT DETECTION (v2.1.0): tell other suite scripts (and the Scripts tab) this one is installed + its version
        try { const mt = document.createElement('meta'); mt.name = 'hb-script'; mt.content = 'Heart Breakers Suite'; mt.dataset.version = VERSION;
              (document.head || document.documentElement).appendChild(mt); } catch (e) { /* no head yet */ }
        injectStyles();
        buildPanel();
        bindBody();
        buildLauncher();
        setCollapsed(store.get(K.collapsed, true) !== false);
        window.addEventListener('resize', () => { clampPanel(); clampLauncher(); });
        // other scripts' launchers are appended to <body>; re-slot ours when they appear
        let slotTimer = null;
        new MutationObserver(() => {
            if (launcherDragged() || slotTimer) return;
            slotTimer = setTimeout(() => { slotTimer = null; placeLauncherAuto(); }, 200);
        }).observe(document.body, { childList: true });
        setTimeout(() => shareTick(), 5000);                 // sharing from the script (only if turned on)
        // suite modules (0.1.4): Chain Watch connects straight away (like Chain Watch 4.20.6) using the remembered Hub
        // identity - no Torn or Hub call before it when the session is still good; the crimes-page seat highlight
        (async () => {
            if (!keyOk()) return;                                // (0.2.86) no key: nothing to do (keyless sign-in removed)
            const mc = store.get(K.meC, null);
            if (!me && mc && mc.me && num(mc.exp) > Date.now() + 60000) setMe(mc.me);
            if (store.get(K.cwq, false)) cw.queued = true;
            applyUi();
            try { if (!me) setMe((await hub('whoami')).me); } catch (e) { return; }      // signed out
            refreshBadges(true); checkUpdate();
            if (modOn('chain')) cwWatch();
            if (modOn('ocpage') && /factions\.php/.test(location.href)) ocPageWatch();
            if (me.leader) loanPageWatch();
            if (me.leader) { names().catch(() => {}); rsPassWatch(); }   // 🛰 recruit collector (does nothing unless switched on) (0.2.13)                     // 🧰 Loans: outline Armoury rows to loan / retrieve (0.2.4)
        })();
        console.log(LOG, 'loaded', VERSION, typeof PDA_httpPost === 'function' ? '(TornPDA)' : '(desktop)');
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();

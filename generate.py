#!/usr/bin/env python3
"""
Faction Banner generator (Heart Breakers theme)
===============================================

Pulls the faction's current data from the Torn API v2 and renders it onto the
themed banner art, then writes site/banner.webp (+ .png/.jpg) for GitHub Pages. The faction
description embeds that one fixed URL, so the image refreshes on its own every
time the daily GitHub Actions job runs (see .github/workflows/banner.yml).

Pipeline (each stage is its own function so redesigns only touch one):
    1. fetch_all()   - calls the API endpoints and returns the raw JSON
    2. normalize()   - turns raw JSON into a small, stable "summary" dict
    3. render()      - stacks the art pieces (art/pieces/*.png, cut from the
                       template by tools/build_art.py) and draws the text
    4. main()        - writes site/banner.webp/.png/.jpg and site/data.json

EVERYTHING the user may want to change lives in config.json (section titles,
order, What We Offer list, button text, requirement tiles, Faction Information
fields, custom leadership role titles, hidden roles, perk tree/icons). The user
edits that file on the GitHub website; a push re-renders within minutes.

Art layout model (all numbers are 2x canvas pixels, canvas = 1298 wide):
    header.png                         fixed, faction logo/title + respect line
    per section:
        section_top.png  (100)         title bar, title drawn by code
        body             (variable)    section_body.png tiled vertically
                                        (or req_body.png for Requirements)
        section_end.png  (60)          / final_end.png (120) for the last one
The template's frame is continuous left/right, so stacking pieces vertically
keeps the borders intact at any height.

API notes
---------
* Uses the key in the TORN_API_KEY environment variable (a GitHub Actions
  secret - never committed to the repo). The key owner's own faction is used.
* `upgrades` and `positions` need a key whose owner has faction API access.
* Every request carries `comment=Heart Breakers Hub` (every api.torn.com call the site makes - the updates here,
  the gatekeeper's sign-in, the hubs' live timers and the payout calculator - uses this same comment).
* v2 response shapes used here:
    /v2/faction/basic     -> {"basic": {id, name, tag, leader_id, co_leader_id,
                                        respect, days_old, capacity, members,
                                        best_chain, rank{name, division}, ...}}
    /v2/faction/members   -> {"members": [{id, name, position, ...}, ...]}
    /v2/faction/positions -> {"positions": [{name, is_default, abilities}, ...]}
    /v2/faction/upgrades  -> {"upgrades": {"core": {...}, "peace": [branch...],
                                           "war": [branch...]}, "state": "peace"|"war"}
      branch  = {id, name, order, multiplier, upgrades: [upgrade...]}
      upgrade = {id, name, ability, level, ...}
  The normalizer is written defensively (accepts list-or-dict variants and
  missing keys) because v2 is still evolving. If a shape changes, the job
  log prints the top-level structure of every response (keys/types only,
  never values) to make the fix quick.

Local preview without an API key:
    python generate.py --mock tests/mock_api.json
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_DIR = ROOT / "fonts"
PIECES = ROOT / "art" / "pieces_v2"   # v2 red-circuit theme (tools/build_art_v2.py)
ICON_DIR = ROOT / "art" / "icons"
CONFIG_PATH = ROOT / "config.json"

API_BASE = "https://api.torn.com/v2/faction"
API_COMMENT = "Heart Breakers Hub"
# ==========================================================================
# FIXED CLOCK SCHEDULE (TCT = UTC). Every Torn read is tied to a clock slot: a dataset is read by the first run
# after its slot starts (the scheduled :00 runs hit them exactly; a missed slot is caught up by the next run) and
# NOT again until the next slot - runs started by a leader's save / an opt-in change / a push just rebuild from
# saved data. Slot lengths (hours) - slots start at 00:00 TCT and every N hours after:
#   faction basics + member list      3   00 03 06 09 12 15 18 21   (positions + upgrades: 24 -> 00:00)
#   gym contributors (4 calls)        6   00 06 12 18  (00:00 on the 1st = exact month boundary)
#   organized crime history           3   00 03 ... 21
#   armory news                       3
#   payout vault checks               3   (a newly saved receipt is checked straight away)
#   opt-in battle / work stats        3   (members' own keys)
#   item types                        weekly, Monday 00:00
#   ranked war list + chain list      every run (hourly; war updates hourly while a war is on)
#   crime check / chain watch         every 15 min (:00 :15 :30 :45 / :07 :22 :37 :52) - Cloudflare timer
# tools/should_run.py makes the 3-hourly FULL update land on the same 3-hour slots.
# ==========================================================================
SLOT_H = {"core": 3, "core_slow": 24, "gym": 6, "crimes": 3, "armory": 3, "vault": 3, "optin": 24, "item_types": 168}   # optin: battle / work stats once a day, 00:00 TCT (Nov 2026)
_MONDAY = 4 * 86400                 # 1970-01-05 00:00 UTC was a Monday - weekly slots start on Mondays


def slot_start(name: str, now: int = None) -> int:
    """Start time (unix, UTC/TCT) of the current clock slot for a dataset (SLOT_H)."""
    now = int(now if now is not None else datetime.now(timezone.utc).timestamp())
    per = int(SLOT_H[name] * 3600)
    anchor = _MONDAY if SLOT_H[name] == 168 else 0
    return now - (now - anchor) % per


# the config parts the Site Panels editors (description banner, announcements) save - a change means a leader saved
PANEL_KEYS = ("section_order", "faction_info", "requirements", "perks", "what_we_offer", "achievements", "footer",
              "announcements")


def panels_sig(cfg: dict) -> str:
    import hashlib
    return hashlib.sha1(json.dumps({k: cfg.get(k) for k in PANEL_KEYS}, sort_keys=True).encode()).hexdigest()[:12]


def due(name: str, last_read) -> bool:
    """True when a dataset hasn't been read yet in its current clock slot."""
    return int(last_read or 0) < slot_start(name)  # on EVERY Torn API call the site makes (here, gatekeeper, pages)
# pause between paged API calls (war attack log, vault log): 2 s = at most ~30 calls a minute, so even
# while a war's attack log is read the account stays far below Torn's 100/minute (shared with the key
# owner's other tools - PDA, userscripts, Torn Stats)
API_PAGE_DELAY = 2.0
SECTIONS = ["basic", "members", "positions", "upgrades"]

# ==========================================================================
# 1. FETCH
# ==========================================================================
def fetch_section(section: str, key: str, params: dict = None) -> dict:
    """GET /v2/faction/<section> for the key owner's faction. `section` may
    be a sub-path, e.g. "12345/rankedwarreport".

    The key goes in the Authorization header (v2 supports `ApiKey <key>`), so
    it never appears in a URL that could end up in a log.
    """
    query = urllib.parse.urlencode({**(params or {}), "comment": API_COMMENT})
    url = f"{API_BASE}/{section}?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"ApiKey {key}",
            "User-Agent": "FactionBanner/1.0 (GitHub Actions)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"[{section}] HTTP {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise SystemExit(f"[{section}] network error: {e.reason}")

    # Torn returns HTTP 200 with an "error" object for API-level errors
    # (bad key = 2, incorrect access level = 16, etc.).
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        code = err.get("code") if isinstance(err, dict) else None
        msg = err.get("error") if isinstance(err, dict) else err
        hint = ""
        if code == 16:
            hint = " (key owner needs faction API access for this selection)"
        elif code == 2:
            hint = " (TORN_API_KEY secret is wrong or missing)"
        raise SystemExit(f"[{section}] Torn API error {code}: {msg}{hint}")
    return data


def fetch_all(key: str, cfg: dict) -> dict:
    """Fetch every section, plus ranked wars when that panel is enabled.

    Calls per run: 4 core + the ranked war list (1-2 pages). War REPORTS are
    not fetched here any more: each finished war's report is read once by
    update_war_history() and saved in data/war_history.json; the Recent
    Ranked Wars panels are built from that saved copy.

    Ranked-war data is optional: if it fails, the job logs it and the panel
    shows "No ranked wars" instead of failing the whole banner.
    """
    raw = core_sections(key, cfg)
    rw = cfg.get("ranked_wars", {})
    # Ranked war list is needed by the banner's Recent Ranked Wars section
    # (if in section_order) AND by the announcement (War Status, Recent Ranked
    # Wars, war leaderboards) - fetch it if either uses it.
    an = cfg.get("announcements", {})
    if rw.get("enabled", True) and ("ranked_wars" in cfg.get("section_order", [])
                                    or an.get("enabled", True)):
        try:
            # ALL wars (paged) - needed for the all-time won/lost record in
            # the section title bar; a faction has a few dozen at most.
            # one call: a single 100-war page holds the whole history for now;
            # only walk the paging links once the faction passes 100 wars
            first = _as_list(fetch_section("rankedwars", key, {"limit": 100}).get("rankedwars"))
            wars = first if len(first) < 100 else all_pages("rankedwars", "rankedwars", key, "Ranked wars")[0]
            raw["rankedwars"] = {"rankedwars": wars}
        except SystemExit as e:  # fetch_section raises SystemExit on errors
            print(f"Ranked wars skipped: {e}")
            raw.pop("rankedwars", None)
    return raw


CORE_CACHE_PATH = ROOT / "data" / "core_cache.json"


def members_asof(now: int) -> int:
    """When the member list (last actions) was last READ - idle times are measured to this moment, not to the
    build time, so rebuilds from the same data give the same numbers and the site is only re-uploaded on real changes
    (Nov 2026). At most one 3-hour slot behind; never later than `now`."""
    try:
        return min(now, int(json.loads(CORE_CACHE_PATH.read_text(encoding="utf-8")).get("fetched") or now))
    except (OSError, ValueError, TypeError):
        return now


def core_sections(key: str, cfg: dict) -> dict:
    """basic / members / positions / upgrades (header, Faction Information,
    Leadership, Faction Perks) - refreshed only every core_refresh_hours
    (default 3), cached in data/core_cache.json in between. Only the fields
    the banner uses are kept (it's a public repo). The ranked war list,
    chains and gym data keep their own schedules."""
    # clock slots (FIXED CLOCK SCHEDULE): read once per 3-hour slot; hourly war / chain runs reuse the cache.
    # LEADER SAVES: when the description / announcement settings changed since the last read (a leader saved them in
    # Site Panels - panels_sig differs), this update reads the faction fresh (positions + upgrades too) so the new
    # banner shows current facts. The slots carry on as normal (the next slot still reads everything).
    now = int(datetime.now(timezone.utc).timestamp())
    sig = panels_sig(cfg)
    edited = False
    try:
        cache = json.loads(CORE_CACHE_PATH.read_text(encoding="utf-8"))
        edited = cache.get("panels_sig") not in (None, sig) and os.environ.get("RUN_KIND", "full") == "full"
        if not edited and (os.environ.get("RUN_KIND") in ("war", "chain") or not due("core", cache.get("fetched"))):
            print("Core sections: using cache")
            return {s: cache[s] for s in SECTIONS}
        if edited:
            print("Core sections: description / announcements were edited - reading fresh")
    except (OSError, ValueError, KeyError):
        pass
    # basic + members every refresh; positions + upgrades (perks / roles,
    # rarely change) only every slow_refresh_hours (24) - reuse the cache between
    try:
        old = json.loads(CORE_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    slow_ok = (old.get("positions") and old.get("upgrades") and not due("core_slow", old.get("fetched_slow"))
               and not edited)
    raw = {s: fetch_section(s, key) for s in SECTIONS if not (slow_ok and s in ("positions", "upgrades"))}
    if slow_ok:
        raw["positions"], raw["upgrades"] = old["positions"], old["upgrades"]
        print("Core sections: positions/upgrades from cache")
    slim = {
        "basic": raw["basic"],
        "members": {"members": [{"id": m.get("id"), "name": m.get("name"), "position": m.get("position"),
                                 # last action time - Slacker Watch "inactive" check
                                 "last_action": (m.get("last_action") or {}).get("timestamp"),
                                 # Chain Review: skip chains from before they joined
                                 "days_in_faction": m.get("days_in_faction"),
                                 "level": m.get("level")}     # the performance receipt (Nov 2026)
                                for m in _as_list(raw["members"].get("members"))]},
        "positions": raw["positions"] if slow_ok else
        {"positions": [{"name": p.get("name"), "is_default": p.get("is_default")}
                       for p in _as_list(raw["positions"].get("positions"))]},
        "upgrades": raw["upgrades"],
    }
    CORE_CACHE_PATH.parent.mkdir(exist_ok=True)
    CORE_CACHE_PATH.write_text(json.dumps(dict(slim, fetched=now, panels_sig=sig,
                                               fetched_slow=old.get("fetched_slow") if slow_ok else now),
                                          separators=(",", ":")) + "\n", encoding="utf-8")
    print("Core sections: refreshed")
    return slim


RUN_STATE_PATH = ROOT / "data" / "run_state.json"


def write_run_state(summary: dict, cfg: dict):
    """Tells the workflow's gate (tools/should_run.py) whether to do the
    hourly war-only runs: war_active = a ranked war is ongoing, or starts
    within the next war_lookahead_hours."""
    ws = summary.get("war_status") or {}
    now = int(datetime.now(timezone.utc).timestamp())
    ahead = float(cfg.get("war_lookahead_hours", 3)) * 3600
    active = ws.get("kind") == "ongoing" or (
        ws.get("kind") == "upcoming" and int(ws.get("start") or 0) - now <= ahead)
    state = {"last_run": now, "war_active": bool(active)}
    try:
        old = json.loads(RUN_STATE_PATH.read_text(encoding="utf-8"))
        state["last_full"] = old.get("last_full", 0)
    except (OSError, ValueError):
        state["last_full"] = 0
    if os.environ.get("RUN_KIND", "full") == "full":
        state["last_full"] = now
    # the 3-hour slot whose SCHEDULED full update has run (tools/should_run.py) - triggered renders don't count
    state["last_slot_full"] = old.get("last_slot_full", 0) if "old" in locals() else 0
    if os.environ.get("RUN_KIND", "full") == "full" and os.environ.get("HB_SLOT_RUN") == "true":
        state["last_slot_full"] = now - now % (3 * 3600)
    RUN_STATE_PATH.parent.mkdir(exist_ok=True)
    RUN_STATE_PATH.write_text(json.dumps(state, sort_keys=True) + "\n", encoding="utf-8")


def pick_wars(rankedwars_resp: dict, count: int) -> list:
    """Most recent FINISHED wars (an ongoing war has no report yet)."""
    now = int(datetime.now(timezone.utc).timestamp())
    wars = [w for w in _as_list(rankedwars_resp.get("rankedwars"))
            if w.get("end") and 0 < int(w["end"]) <= now]
    wars.sort(key=lambda w: int(w.get("end") or 0), reverse=True)
    return wars[:max(int(count), 0)]


def describe_shape(obj, depth=0, max_depth=3):
    """Keys/types only (never values) - printed to the Actions log so a v2
    shape change can be diagnosed without leaking faction data."""
    pad = "  " * depth
    if depth >= max_depth:
        return f"{pad}{type(obj).__name__}\n"
    if isinstance(obj, dict):
        out = ""
        for k, v in list(obj.items())[:12]:
            out += f"{pad}{k}: {type(v).__name__}\n"
            if isinstance(v, (dict, list)):
                out += describe_shape(v, depth + 1, max_depth)
        return out
    if isinstance(obj, list):
        return (f"{pad}[{len(obj)} items]\n" +
                (describe_shape(obj[0], depth + 1, max_depth) if obj else ""))
    return ""




# ==========================================================================
# 1b. CHAIN ACHIEVEMENTS (saved, only updated when a new tier is reached)
# ==========================================================================
# Torn's chain bonus tiers. The banner shows the tiers >= achievements.
# min_chain_tier (100): the date of the FIRST chain that reached each tier,
# unreached tiers greyed out as goals.
#
# Results are saved in data/achievements.json (committed back to the repo by
# the workflow), so the chain history is only read when basic.best_chain
# shows a tier has been reached that isn't saved yet - normally zero extra
# API calls per run. A first chain to reach a higher tier can't be earlier
# than the first to reach a lower one, so the search starts from the date
# of the highest tier already saved.
# Date shown = the END date of that chain (the API has no per-hit times).
CHAIN_TIERS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
ACH_PATH = ROOT / "data" / "achievements.json"


def load_achievements() -> dict:
    try:
        return json.loads(ACH_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def chain_tiers(cfg: dict) -> list:
    lo = int(cfg.get("achievements", {}).get("min_chain_tier", 100))
    return [t for t in CHAIN_TIERS if t >= lo]


def fetch_url(url: str, key: str) -> dict:
    """GET a full API URL (a _metadata.links next/prev link). Any key in the
    link is dropped - the key always travels in the Authorization header."""
    parts = urllib.parse.urlsplit(url)
    # Torn's next/prev links repeat the old comment - always ours
    q = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k.lower() not in ("key", "comment")]
    q.append(("comment", API_COMMENT))
    url = urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                               "Authorization": f"ApiKey {key}",
                                               "User-Agent": "FactionBanner/1.0 (GitHub Actions)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        raise SystemExit(f"[chains page] {e}")
    if isinstance(data, dict) and "error" in data:
        raise SystemExit(f"[chains page] Torn API error: {data['error']}")
    return data


def all_pages(section: str, list_key: str, key: str, label: str, params: dict = None,
              stop_ids: set = None) -> tuple:
    """Every item of a paged v2 faction list (chains, rankedwars, ...).

    Walks the list page by page via the response's own _metadata.links
    (prev and next), so it works whatever order or page size the API uses -
    sort=/from= params were found to be ignored. Returns (items, complete);
    complete=False if paging stopped early."""
    chains, seen_ids, seen_urls = [], set(), set()
    first = fetch_section(section, key, {"limit": 100, **(params or {})})
    queue = [first]
    pages = 0
    while queue and pages < 500:
        data = queue.pop()
        pages += 1
        new = [c for c in _as_list(data.get(list_key)) if c.get("id") not in seen_ids]
        if stop_ids is not None:
            # incremental read: a page with nothing unsaved ends that direction
            if pages > 1 and all(str(c.get("id")) in stop_ids for c in new):
                continue
        seen_ids.update(c.get("id") for c in new)
        chains += new
        if not new and pages > 1:
            continue                     # this direction is exhausted
        links = (data.get("_metadata") or {}).get("links") or {}
        for direction in ("prev", "next"):
            url = links.get(direction)
            if url and url not in seen_urls:
                seen_urls.add(url)
                queue.append(fetch_url(url, key))
    print(f"{label}: read {pages} page(s), {len(chains)} items")
    return chains, pages < 500


_CHAIN_CACHE = {}   # per-run memo: chain achievements + chain history share reads


def all_chains(key: str) -> tuple:
    """Every completed chain in the faction's history (see all_pages).
    Read at most once per run, shared by achievements and chain history."""
    if "all" not in _CHAIN_CACHE:
        _CHAIN_CACHE["all"] = all_pages("chains", "chains", key, "Chain history")
    return _CHAIN_CACHE["all"]


def newest_chains(key: str) -> list:
    """Newest page of chains - read once per run and shared (it used to be
    read separately by achievements and by chain history)."""
    if "newest" not in _CHAIN_CACHE:
        _CHAIN_CACHE["newest"] = _as_list(fetch_section("chains", key, {"limit": 100}).get("chains"))
    return _CHAIN_CACHE["newest"]


def update_chain_achievements(raw: dict, cfg: dict, key: str = None) -> dict:
    """Saved chain achievements (data/achievements.json):

      chains: {"<tier>": {"date", "chain_id", "length"}}  first time each tier
              was reached = END date of the earliest chain that long
      counts: {"<tier>": n}   how many chains reached each tier. A chain counts
              for EVERY tier it passed (a 10K chain = 1 each for 10K, 5K,
              2.5K, 1K, 500, ...), i.e. n = chains with length >= tier.
      last:   {"end": ts, "ids": [...]}  newest chain already counted

    Full history read (all_chains) only when counts don't exist yet or
    best_chain shows a tier reached that has no date. Otherwise ONE call:
    the newest page of chains; anything newer than `last` is added to the
    counts (and dates any newly reached tier). Saved only after a complete
    read. key=None (mock) computes everything from raw["chains"]."""
    ach = load_achievements() if key else {}
    saved = ach.setdefault("chains", {})
    basic = raw["basic"].get("basic", raw["basic"])
    best = basic.get("best_chain")
    if isinstance(best, dict):
        best = best.get("count") or best.get("chain")
    best = int(best or 0)
    missing = [t for t in chain_tiers(cfg) if t <= best and str(t) not in saved]

    def length(c):
        return int(c.get("chain") or 0)

    def end(c):
        return int(c.get("end") or 0)

    def rebuild(chains):
        """Counts, dates and `last` from a complete chain history."""
        counts = {str(t): sum(1 for c in chains if length(c) >= t) for t in CHAIN_TIERS}
        for t in CHAIN_TIERS:
            if str(t) in saved:
                continue
            hits = [c for c in chains if length(c) >= t and end(c) > 0]
            if hits:
                c = min(hits, key=end)
                saved[str(t)] = {"date": end(c), "chain_id": c.get("id"), "length": length(c)}
        newest = max((end(c) for c in chains), default=0)
        ach["counts"] = counts
        ach["last"] = {"end": newest, "ids": [c.get("id") for c in chains if end(c) == newest]}

    if key is None:
        rebuild(_as_list(raw.get("chains", {}).get("chains")))
        return ach

    try:
        if "counts" not in ach or missing:
            chains, complete = all_chains(key)
            if not complete:
                return ach
            rebuild(chains)
        else:
            page = newest_chains(key)
            last = ach.get("last", {"end": 0, "ids": []})
            new = [c for c in page if end(c) > last["end"]
                   or (end(c) == last["end"] and c.get("id") not in last["ids"])]
            if not new:
                return ach                  # nothing finished since last run
            if len(new) == len(page):       # whole page is new - may have missed some
                chains, complete = all_chains(key)
                if not complete:
                    return ach
                rebuild(chains)
            else:
                for c in sorted(new, key=end):
                    for t in CHAIN_TIERS:
                        if length(c) >= t:
                            ach["counts"][str(t)] = ach["counts"].get(str(t), 0) + 1
                            saved.setdefault(str(t), {"date": end(c), "chain_id": c.get("id"),
                                                      "length": length(c)})
                newest = max(end(c) for c in new)
                ids = [c.get("id") for c in new if end(c) == newest]
                if newest == last["end"]:
                    ids += last["ids"]
                ach["last"] = {"end": newest, "ids": ids}
                print(f"Chain achievements: added {len(new)} new chain(s)")
    except SystemExit as e:  # API errors -> keep what's saved, retry next run
        print(f"Chain achievements skipped: {e}")
        return load_achievements()
    ACH_PATH.parent.mkdir(exist_ok=True)
    ACH_PATH.write_text(json.dumps(ach, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return ach


# ==========================================================================
# 1c. WAR HISTORY + LEADERBOARD (saved; each war's report read once)
# ==========================================================================
# data/war_history.json keeps, per finished ranked war, OUR members' hits and
# war score from that war's report. A war is read only once (when it first
# appears finished); leaderboards are summed from the saved file, so there is
# no ongoing API cost.
WAR_HIST_PATH = ROOT / "data" / "war_history.json"


CHAIN_BONUS_HITS = {10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000}


def war_attack_stats(key: str, start: int, end: int, my_id, opp_id=None) -> dict:
    """Per-member assists + hospitalizations during a ranked war, from
    /v2/faction/attacks (from/to = the war window, paged via _metadata links;
    capped at 150 pages). Only OUR members' ranked-war attacks count.
    Returns {member id: {"assists", "hosps"}} or None on error."""
    import time
    out, seen, pages, diag = {}, set(), 0, {}
    try:
        data = fetch_section("attacks", key, {"from": start, "to": end, "limit": 100})
    except SystemExit as e:
        print(f"War attack log skipped: {e}")
        return None
    urls = set()
    queue = [data]
    while queue and pages < 150:
        data = queue.pop()
        pages += 1
        items = _as_list(data.get("attacks"))
        for a_ in items:                    # diagnostics: what marks a war hit
            k_ = (a_.get("is_ranked_war"), str(((a_.get("defender") or {}).get("faction") or {}).get("id")) == str(opp_id),
                  str(((a_.get("attacker") or {}).get("faction") or {}).get("id")) == str(my_id), a_.get("result"))
            diag[k_] = diag.get(k_, 0) + 1
        new = [a for a in items if a.get("id") not in seen]
        seen.update(a.get("id") for a in new)
        # exactly the war window (same as the previous payout tool)
        inside = [a for a in new if start <= int(a.get("started") or a.get("ended") or 0) <= end]
        for a in inside:
            att = a.get("attacker") or {}
            if str((att.get("faction") or {}).get("id")) != str(my_id):
                continue
            res = str(a.get("result", "")).lower()
            t = out.setdefault(str(att.get("id")), {"assists": 0, "hosps": 0, "best": 0.0,
                                                    "bonus_resp": 0.0, "bonus_hits": 0, "war_hits": 0,
                                                    "resp_war": 0.0, "out": 0, "out_all": 0, "resp_out": 0.0,
                                                    "out_bonus_resp": 0.0, "mugs": 0, "stealth": 0, "losses": 0})
            ok_hit = res in ("attacked", "hospitalized", "mugged")   # "special" results don't count
            # war targets: the defender must be in THIS war's enemy faction
            # (falls back to the ranked-war flag if the id is unknown)
            dfac = str(((a.get("defender") or {}).get("faction") or {}).get("id"))
            is_war = (dfac == str(opp_id)) if opp_id else bool(a.get("is_ranked_war"))
            if ok_hit and a.get("is_stealthed"):
                t["stealth"] += 1
            if not is_war:
                # hits on anyone else during the war (payout calculator "Outside Hits")
                if ok_hit:
                    t["out_all"] += 1
                    # added to the chain, raids not counted (matches the faction's
                    # previous payout tool, verified against its totals)
                    t["out"] += int(a.get("chain") or 0) > 0 and not a.get("is_raid")
                    t["resp_out"] += float(a.get("respect_gain") or 0)
                    if int(a.get("chain") or 0) in CHAIN_BONUS_HITS:
                        t["out_bonus_resp"] += float(a.get("respect_gain") or 0)
                continue
            if ok_hit:
                t["war_hits"] += 1
                t["resp_war"] += float(a.get("respect_gain") or 0)
            if res == "mugged":
                t["mugs"] += 1
            elif res == "lost":
                t["losses"] += 1
            if res in ("attacked", "hospitalized", "mugged"):
                if int(a.get("chain") or 0) in CHAIN_BONUS_HITS:
                    # chain bonus hit (10th, 25th, ...): counted (Bonus Hunter); its respect IS included in every
                    # respect total and Respect / Hit (Nov 2026) - but kept OUT of Biggest Hit
                    t["bonus_resp"] += float(a.get("respect_gain") or 0)
                    t["bonus_hits"] += 1
                else:
                    # Biggest Hit: best respect from ONE war hit, chain bonus hits excluded (decided Nov 2026)
                    t["best"] = max(t["best"], float(a.get("respect_gain") or 0))
            if res == "assist":
                t["assists"] += 1
            elif res == "hospitalized":
                t["hosps"] += 1
        if not inside and pages > 1:
            continue                       # walked past the war window
        links = (data.get("_metadata") or {}).get("links") or {}
        for direction in ("prev", "next"):
            u = links.get(direction)
            if u and u not in urls:
                urls.add(u)
                time.sleep(API_PAGE_DELAY)  # ~30 calls/min max - leaves room for the key owner's other tools
                try:
                    queue.append(fetch_url(u, key))
                except SystemExit as e:
                    # incomplete log -> don't save partial counts; retry next run
                    print(f"War attack log incomplete, will retry: {e}")
                    return None
    print(f"War attack log: {pages} page(s), {len(seen)} attacks read")
    tot_ = {}
    for st in out.values():
        for k_, v_ in st.items():
            tot_[k_] = tot_.get(k_, 0) + v_
    print(f"  on war targets: {tot_}")
    return out


def nb(m: dict):
    """(respect, hits) for a member's war - used by every Respect / Hit figure. Chain bonus respect is INCLUDED
    (decided Nov 2026 - it was left out before): the war report's whole score over all its hits. (The name is
    kept from when it meant "no bonus"; bonus_resp / bonus_hits are still recorded, e.g. for the Bonus Hunter award.)"""
    return (m.get("score") or 0), (m.get("attacks") or 0)


ATTACK_LOG_DAYS = 30      # Nov 2026: attack logs (Torn history reads) only for wars ended in the last 30 days - no backlog
WAR_REFRESH_SECONDS = 8 * 60      # full war-history refresh: attack-log time per full run (see update_war_history)
# 7 = payout stats: raids + "special" excluded, exact war window (Biggest Hit without chain bonus hits)
ATTACK_LOG_V = 7


def fill_war_attack_log(hist: dict, key: str, my_id) -> bool:
    """Process ONE queued war (hist["attack_log_queue"], newest first) that
    has no attack-log stats yet. Runs on every run kind (hourly chain runs
    too) so the queue drains quickly. Returns True if a war was filled."""
    wars = hist.get("wars", {})
    for wid in hist.get("attack_log_queue", []):
        w = wars.get(wid)
        if not w or w.get("attack_log") == ATTACK_LOG_V or not w.get("opp_id"):
            continue
        stats = war_attack_stats(key, w.get("start") or w["end"] - 86400 * 4, w["end"], my_id, w["opp_id"])
        if stats is None:
            return False                   # rate-limited / failed: try again next run
        for m in w["members"]:
            st = stats.get(str(m["id"]), {})
            m["assists"], m["hosps"] = st.get("assists", 0), st.get("hosps", 0)
            m["best"] = round(st.get("best", 0.0), 2)
            m["bonus_resp"] = round(st.get("bonus_resp", 0.0), 2)
            m["bonus_hits"] = st.get("bonus_hits", 0)
            # payout calculator stats (so it needs no API key for saved wars)
            for k_ in ("war_hits", "out", "out_all", "mugs", "stealth", "losses"):
                m[k_] = st.get(k_, 0)
            for k_ in ("resp_war", "resp_out", "out_bonus_resp"):
                m[k_] = round(st.get(k_, 0.0), 2)
        w["attack_log"] = ATTACK_LOG_V     # see ATTACK_LOG_V
        print(f"War attack log: war {wid} filled")
        return True
    return False


def update_war_history(raw: dict, key: str = None, recent: int = 5) -> dict:
    """Add any finished war missing from the saved history (one report read
    per war, ever). Saved per war: end, start, our rank before/after and our
    members' hits + score. The `recent` newest wars must also have the rank
    change (added later) - older saves missing it are re-read once.
    key=None (mock) builds an in-memory history from the mock file's reports."""
    hist = {"wars": {}}
    if key:
        try:
            hist = json.loads(WAR_HIST_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
    wars = hist.setdefault("wars", {})
    if "rankedwars" not in raw:
        return hist
    my_id = str(raw["basic"].get("basic", raw["basic"]).get("id"))
    now = int(datetime.now(timezone.utc).timestamp())
    reports = raw.get("rankedwarreports", {})
    changed = False
    recent_ids = {str(w["id"]) for w in pick_wars(raw["rankedwars"], recent)}
    # FULL REFRESH (Nov 2026): bump config "war_history_refresh" -> the next full update re-reads EVERY war's report
    # from Torn (one call each) and re-queues every war's attack-log stats (assists, hosps, bonus respect, outside
    # hits...), which then fill a few wars per run (WAR_REFRESH_SECONDS of each full run, 1 per hourly run) until all
    # are done. Saved stats stay in place until their war is re-read, so nothing goes blank meanwhile.
    try:
        want_refresh = str(load_config().get("war_history_refresh", "") or "") if key else ""
    except (OSError, ValueError):
        want_refresh = ""
    full_refresh = bool(want_refresh) and hist.get("refresh_done") != want_refresh
    refresh_ok = True
    if full_refresh:
        print(f"War history: full refresh {want_refresh} - re-reading every war report")
    for w in _as_list(raw["rankedwars"].get("rankedwars")):
        wid, end = str(w.get("id")), int(w.get("end") or 0)
        if not end or end > now:
            continue
        if not full_refresh and wid in wars and ("rank" in wars[wid] or wid not in recent_ids) and "reward" in wars[wid]:
            continue
        rep_ = None if full_refresh else reports.get(wid)
        if rep_ is None:
            if not key:
                continue
            try:
                if full_refresh:
                    import time as _tw
                    _tw.sleep(API_PAGE_DELAY)
                rep_ = fetch_section(f"{wid}/rankedwarreport", key)
            except SystemExit as e:
                print(f"War history: report {wid} skipped: {e}")
                refresh_ok = False
                continue
        rep_ = rep_.get("rankedwarreport", rep_)
        mine = next((f for f in _as_list(rep_.get("factions")) if str(f.get("id")) == my_id), None)
        if not mine:
            continue
        rwd = mine.get("rewards") or {}
        old_w = wars.get(wid) or {}
        old_m = {str(m.get("id")): m for m in old_w.get("members", [])}
        wars[wid] = {"end": end, "start": int(w.get("start") or rep_.get("start") or 0),
                     # bonus respect awarded for the war result (not from hits)
                     "reward": int((rwd.get("respect") if isinstance(rwd, dict) else 0) or 0),
                     "rank": {"before": (mine.get("rank") or {}).get("before") or "",
                              "after": (mine.get("rank") or {}).get("after") or ""},
                     "members": [
            {"id": m.get("id"), "name": m.get("name", "?"), "attacks": int(m.get("attacks") or 0),
             "score": round(float(m.get("score") or 0), 2)} for m in _as_list(mine.get("members"))]}
        # a re-read keeps what the report doesn't hold (attack-log stats, opponent id) - refreshed separately
        for m in wars[wid]["members"]:
            for k_, v_ in (old_m.get(str(m["id"])) or {}).items():
                m.setdefault(k_, v_)
        for k_ in ("opp_id", "attack_log"):
            if k_ in old_w:
                wars[wid][k_] = old_w[k_]
        if full_refresh:
            wars[wid]["attack_log"] = None         # re-read its attack-log stats too
        changed = True
    if full_refresh and refresh_ok:
        hist["refresh_done"] = want_refresh
        hist["refresh_attacks"] = True
        print(f"War history: every war report re-read ({len(wars)} wars) - attack logs queued")
    # opponent faction id per war (from the list, no calls) - lets the attack
    # log keep only attacks on THIS war's enemy
    for w in _as_list(raw["rankedwars"].get("rankedwars")):
        wid = str(w.get("id"))
        opp = next((f.get("id") for f in _as_list(w.get("factions")) if str(f.get("id")) != my_id), None)
        if wid in wars and opp and wars[wid].get("opp_id") != opp:
            wars[wid]["opp_id"] = opp
            changed = True
    # assists + hospitalizations per member come from the faction attack log
    # (not in the war report): queued, one war per run, recent wars first
    # Only RECENT wars (ended in the last ATTACK_LOG_DAYS - covers the monthly recap + the announcement's
    # recent wars). Older wars aren't re-read in the background: the payout calculator reads one from
    # Torn with the leader's API key only when that war is selected.
    import time as _t
    cutoff = _t.time() - ATTACK_LOG_DAYS * 86400
    refreshing = bool(hist.get("refresh_attacks"))
    # (a full refresh no longer re-reads OLDER wars' attack logs either - Nov 2026, Torn's daily read limit)
    hist["attack_log_queue"] = sorted((k for k in wars if wars[k].get("end", 0) >= cutoff),
                                      key=lambda k: -wars[k].get("end", 0))
    if key and fill_war_attack_log(hist, key, my_id):
        changed = True
        # full refresh: keep going for up to WAR_REFRESH_SECONDS on full runs
        if refreshing and os.environ.get("RUN_KIND", "full") == "full":
            t0 = _t.time()
            while _t.time() - t0 < WAR_REFRESH_SECONDS and fill_war_attack_log(hist, key, my_id):
                pass
    if refreshing and all(wars[k].get("attack_log") == ATTACK_LOG_V for k in hist["attack_log_queue"]):
        hist.pop("refresh_attacks", None)
        print("War history: full refresh complete - every war's report and attack log re-read")
        changed = True
    if key and changed:
        WAR_HIST_PATH.parent.mkdir(exist_ok=True)
        WAR_HIST_PATH.write_text(json.dumps(hist, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        print(f"War history: {len(wars)} wars saved")
    return hist


def reports_from_history(hist: dict, my_id) -> dict:
    """Saved war history -> the report shape normalize_wars() reads, so the
    Recent Ranked Wars panels need no API calls."""
    out = {}
    for wid, w in hist.get("wars", {}).items():
        out[wid] = {"rankedwarreport": {"start": w.get("start", 0), "factions": [{
            "id": my_id, "rank": w.get("rank") or {}, "members": w["members"]}]}}
    return out


# LEADERBOARD OPT-OUT (Nov 12 2026, user: "Some members have asked for the ability to opt out of the leaderboards ...
# I still want to be able to track members based on the same metrics because they're still important for ratings and
# performance reporting"). Members switch it on in My data & sharing (no key needed) -> data/optin.json "lb_hidden"
# [ids] (gate/worker.js optinRoute). User (Nov 13 2026): "The only thing Opting out should remove you from is the
# Leaderboards for War/Chain/Gym/Organized Crimes. You should still be included on all war reports, chain reports,
# etc." -> hidden members are left out of the LEADERBOARDS only: the war / chain / gym leaderboard boards (banner +
# announcement images), the site's Leaderboards page incl. OC (db/members.json "nolb") and the Hub script's Boards
# tab. Everything else includes them: war reports (incl. each war's top hits / respect), chain reports, the monthly
# recap, faction totals, profiles, the Members list, reliability, payouts and the leaders' tools.
LB_HIDDEN = set()


def load_lb_hidden():
    try:
        d = json.loads((ROOT / "data" / "optin.json").read_text(encoding="utf-8"))
        LB_HIDDEN.clear(); LB_HIDDEN.update(str(int(i)) for i in d.get("lb_hidden") or [])
    except (OSError, ValueError, TypeError):
        pass
    return LB_HIDDEN


def leaderboard(hist: dict, current_ids: set, lcfg: dict, since: int = 0, monthly: bool = False) -> dict:
    """All-time leaderboards from the saved war history, CURRENT members only
    (former members are ignored), top `top` each:
      hits          total war hits
      respect       total war score (respect earned)
      avg_hits      hits / wars present                 (min_wars wars)
      rph           respect per hit = score / hits      (min_hits hits)
      iron          war participation %: wars with at least 1 hit / wars
                    present (min_wars wars); ties -> more wars first
      non_participation  EVERY member whose % of wars with 0 hits is over
                    np_threshold                        (min_wars wars)"""
    # every current member is listed (full faction); since/monthly = only
    # wars that ended from `since` on (This Month boards, lower minimums)
    top = 10 ** 6
    min_wars = int(lcfg.get("monthly_min_wars" if monthly else "min_wars", 1 if monthly else 3))
    min_hits = int(lcfg.get("monthly_min_hits" if monthly else "min_hits", 20 if monthly else 50))
    thr = float(lcfg.get("np_threshold", 50))
    tot = {}
    wars_in = {k: w for k, w in hist.get("wars", {}).items() if w["end"] >= since}
    for wid, w in sorted(wars_in.items(), key=lambda kv: kv[1]["end"]):
        for m in w["members"]:
            t = tot.setdefault(str(m["id"]), {"name": m["name"], "hits": 0, "respect": 0.0,
                                              "wars": 0, "zero": 0, "run": 0, "best_run": 0})
            t["name"] = m["name"]               # latest name wins
            t["hits"] += m["attacks"]
            t["respect"] += m["score"]                     # total respect (bonuses included)
            r_nb, h_nb = nb(m)
            t["resp_nb"] = t.get("resp_nb", 0.0) + r_nb    # Respect / Hit (chain bonus respect included)
            t["hits_nb"] = t.get("hits_nb", 0) + h_nb
            t["wars"] += 1
            if m["attacks"]:
                t["run"] += 1
                t["best_run"] = max(t["best_run"], t["run"])
            else:
                t["zero"] += 1
                t["run"] = 0
    # every current member is listed, 0s included (members with no wars in
    # the period get an all-zero row; current_ids may be {id: name})
    people = [t for i, t in tot.items() if i in current_ids and i not in LB_HIDDEN]     # opted out: not ranked
    if isinstance(current_ids, dict):
        people += [{"name": n, "hits": 0, "respect": 0.0, "wars": 0, "zero": 0, "run": 0, "best_run": 0}
                   for i, n in current_ids.items() if i not in tot and i not in LB_HIDDEN]

    def ranked(rows, key, fmt, cond=lambda t: True, below=None):
        """Members meeting the minimum are ranked first; everyone else is
        still listed underneath (their own value, 0 if none) with a grey
        `below(t)` note such as "(2 wars)" - every member appears."""
        # every member is listed and every hit counts: members meeting the
        # participation minimum are ranked first; the rest follow at the end,
        # marked with "*" (explained under the tables)
        ok = sorted((t for t in rows if cond(t)), key=lambda t: (-key(t), t["name"].lower()))
        rest = sorted((t for t in rows if not cond(t)), key=lambda t: (-key(t), t["name"].lower()))
        return ([{"name": t["name"], "value": fmt(t)} for t in ok]
                + [{"name": t["name"] + "*", "value": fmt(t)} for t in rest])[:top]

    np_ = [t for t in people if t["wars"] >= min_wars and 100 * t["zero"] / t["wars"] > thr]
    np_.sort(key=lambda t: (-t["zero"] / t["wars"], -t["zero"], t["name"].lower()))
    # totals over EVERYONE who took part (incl. members who left); averages for rates
    A = list(tot.values())
    th, tr = sum(t["hits"] for t in A), sum(t["respect"] for t in A)
    tw_, tz = sum(t["wars"] for t in A), sum(t["zero"] for t in A)
    totals = {"hits": ("Total", fmt_int(th)), "respect": ("Total", fmt_int(int(round(tr)))),
              "avg_hits": ("Average", f"{th / tw_:.1f}" if tw_ else "-"),
              "rph": ("Average", (lambda rn, hn: f"{rn / hn:.2f}" if hn else "-")(
                  sum(t.get("resp_nb", 0) for t in A), sum(t.get("hits_nb", 0) for t in A))),
              "iron": ("Average", f"{round(100 * (tw_ - tz) / tw_)}%" if tw_ else "-")}
    return {
        "wars": len(wars_in), "totals": totals, "min_wars": min_wars, "min_hits": min_hits,
        "hits": ranked(people, lambda t: t["hits"], lambda t: fmt_int(t["hits"])),
        "respect": ranked(people, lambda t: t["respect"], lambda t: fmt_int(int(round(t["respect"])))),
        "avg_hits": ranked(people, lambda t: t["hits"] / t["wars"] if t["wars"] else 0,
                           lambda t: f"{t['hits'] / t['wars']:.1f}" if t["wars"] else "0.0",
                           lambda t: t["wars"] >= min_wars,
                           lambda t: f"({t['wars']} war{'' if t['wars'] == 1 else 's'})"),
        "rph": ranked(people, lambda t: t.get("resp_nb", 0) / t["hits_nb"] if t.get("hits_nb") else 0,
                      lambda t: f"{t['resp_nb'] / t['hits_nb']:.2f}" if t.get("hits_nb") else "0.00",
                      lambda t: t["hits"] >= min_hits,
                      lambda t: f"({t['hits']} hit{'' if t['hits'] == 1 else 's'})"),
        # attendance: qualifiers first, then everyone else (their own %, 0% if no wars)
        "iron": [{"name": t["name"],
                  "value": f"{round(100 * (t['wars'] - t['zero']) / t['wars'])}%" if t["wars"] else "0%",
                  "extra": f"({t['wars'] - t['zero']}/{t['wars']})"}
                 for t in sorted((t for t in people if t["wars"] >= min_wars),
                                 key=lambda t: (-(t["wars"] - t["zero"]) / t["wars"], -t["wars"],
                                                t["name"].lower()))][:top]
                + [{"name": t["name"] + "*",
                    "value": f"{round(100 * (t['wars'] - t['zero']) / t['wars'])}%" if t["wars"] else "0%",
                    "extra": f"({t['wars'] - t['zero']}/{t['wars']})"}
                   for t in sorted((t for t in people if t["wars"] < min_wars),
                                   key=lambda t: (-((t["wars"] - t["zero"]) / t["wars"] if t["wars"] else 0),
                                                  t["name"].lower()))],
        "non_participation": [{"name": t["name"], "value": f"{round(100 * t['zero'] / t['wars'])}%",
                               "extra": f"({t['zero']}/{t['wars']})"} for t in np_],
    }


# ==========================================================================
# 1d. CHAIN HISTORY (per-member chain stats; each chain report read once)
# ==========================================================================
# data/chain_history.json keeps, per finished chain of at least
# chain_min_length hits, every attacker's chain hits, respect and
# retaliations from /v2/faction/{chainId}/chainreport. Reports have member
# IDS only (no names) - names come from the current member list, which is
# all the leaderboard shows anyway.
# First run reads every qualifying chain (throttled to stay under Torn's
# 100 requests/minute); afterwards only newly finished chains are read.
CHAIN_HIST_PATH = ROOT / "data" / "chain_history.json"
CHAIN_REPORTS_PER_RUN = 200          # cap per run (~3.5 min); the rest next run
CHAIN_REPORT_DELAY = API_PAGE_DELAY  # s between chain report reads: ~30/min max, leaves room
                                     # under Torn's 100/min for other tools on the key


CHAIN_SETTLE = 15 * 60      # a chain counts as finished this long after its end time
CHAIN_BONUS_BACKFILL = 40   # chain reports read per run to fill in who made the bonus hits (older chains)


def update_chain_history(raw: dict, cfg: dict, key: str = None) -> dict:
    import time
    lcfg = cfg.get("announcements", {}).get("leaderboard", {})
    min_len = int(lcfg.get("chain_min_length", 50))
    hist = {"chains": {}}
    if key:
        try:
            hist = json.loads(CHAIN_HIST_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
    saved = hist.setdefault("chains", {})
    # Full chain list needed while backfilling: first run, after the minimum
    # length is lowered, or while earlier runs hit the per-run cap.
    backfill = (not saved or hist.get("min_length") != min_len or not hist.get("complete"))
    # Skip the chain-list read (Nov 2026) on hourly chain / war runs and leader-save renders when chain watch
    # (every 15 min) has seen no chain activity since the last read - nothing can have ended. Scheduled 3-hour
    # slot runs always read (safety net for a chain that started AND ended between two chain-watch checks).
    # activity_at: chain watch's last "a chain started / ended / cooldown began"; listed_at: our last read that
    # left nothing pending (no chain still running or waiting to settle, no reports left for later runs).
    slot_run = os.environ.get("RUN_KIND", "full") == "full" and os.environ.get("HB_SLOT_RUN") == "true"
    try:
        activity = int(json.loads(CHAIN_WATCH_PATH.read_text(encoding="utf-8")).get("activity_at") or 0)
    except (OSError, ValueError):
        activity = None                  # no chain watch state: read as before
    if key and not backfill and not slot_run and activity is not None \
            and activity <= int(hist.get("listed_at") or 0):
        print("Chain history: no chain activity since the last read - chain list not read")
        return hist
    if key:
        hist["checked"] = int(time.time())     # when the chain list was last read (site footer: "Chains")
    # chain list: mock file, full history while backfilling, else newest page
    if key is None:
        chains = _as_list((raw.get("chains") or {}).get("chains"))
        reports = raw.get("chainreports", {})
    else:
        reports = {}
        try:
            if backfill:
                chains, _ = all_chains(key)
            else:
                chains = newest_chains(key)
        except SystemExit as e:
            print(f"Chain history skipped: {e}")
            return hist
    # chains saved before start times were stored: fill them from the list
    filled = 0
    for c in chains:
        sc = saved.get(str(c.get("id")))
        if sc is not None and not sc.get("start") and c.get("start"):
            sc["start"] = int(c["start"]); filled += 1
    # Only chains that have really ENDED: Torn lists the running chain too (its "end" moves as hits land),
    # so a chain is saved once its end is CHAIN_SETTLE seconds in the past (the chain timer is 5 min max).
    # A saved chain whose length no longer matches Torn's (it was saved while still running) is re-read,
    # and its old report page is dropped so it gets drawn again with the final numbers.
    now_ = int(time.time())
    todo = []
    for c in chains:
        cid_, ln, end_ = str(c.get("id")), int(c.get("chain") or 0), int(c.get("end") or 0)
        if ln < min_len or end_ <= 0 or end_ > now_ - CHAIN_SETTLE:
            continue
        if cid_ not in saved:
            todo.append(c)
        elif saved[cid_].get("length") != ln:
            print(f"Chain history: chain {cid_} re-read ({saved[cid_].get('length')} saved, Torn says {ln})")
            for ext in (".json", ".png"):
                (REPORTS_DIR / f"chain-{cid_}{ext}").unlink(missing_ok=True)
            todo.append(c)
    todo.sort(key=lambda c: int(c.get("end") or 0))
    read = 0
    for c in todo[:CHAIN_REPORTS_PER_RUN]:
        cid = str(c.get("id"))
        if key is None:
            rep_ = reports.get(cid)
            if rep_ is None:
                continue
        else:
            try:
                rep_ = fetch_section(f"{cid}/chainreport", key)
            except SystemExit as e:
                print(f"Chain history: report {cid} skipped: {e}")
                continue
            time.sleep(CHAIN_REPORT_DELAY)
        rep_ = rep_.get("chainreport", rep_)
        attackers = []
        for a in _as_list(rep_.get("attackers")):
            at = a.get("attacks") or {}
            rs = a.get("respect") or {}
            attackers.append({"id": a.get("id"), "hits": int(at.get("total") or 0),
                              "respect": round(float(rs.get("total") or 0), 2),
                              "rets": int(at.get("retaliations") or 0),
                              "war": int(at.get("war") or 0),
                              "assists": int(at.get("assists") or 0)})
        saved[cid] = {"end": int(c.get("end") or 0), "length": int(c.get("chain") or 0),
                      "respect": round(float(c.get("respect") or 0), 2),
                      "start": int(c.get("start") or 0), "attackers": attackers}
        # members in the faction during the chain who made no hits (if the
        # report lists them) - used by the Discord Chain Review
        # bonus hits (10, 25, ... 1,000+): who made them, for the Chain Report
        bon = []
        for x in _as_list(rep_.get("bonuses")):
            aid = x.get("attacker_id") or (x.get("attacker") or {}).get("id")
            if aid:
                bon.append({"id": aid, "chain": int(x.get("chain") or 0),
                            "respect": round(float(x.get("respect") or 0), 2)})
        if bon:
            saved[cid]["bonuses"] = bon
        na = rep_.get("non_attackers")
        if isinstance(na, list):
            saved[cid]["non_attackers"] = [x.get("id") if isinstance(x, dict) else x for x in na]
        read += 1
    # Back-fill chain bonus hits (who made them, their respect) for EVERY chain saved before bonuses were
    # recorded - for the bonus-hit lists and the Bonus Hunter award (bonus respect itself is counted everywhere,
    # Nov 2026). Longest chains first, CHAIN_BONUS_BACKFILL reports per run until done.
    if key and os.environ.get("RUN_KIND", "full") == "full":     # full updates only (3-hour slots)
        need = sorted((k for k, c in saved.items() if c["length"] >= 10
                       and "bonuses" not in c and not c.get("bonus_checked")),
                      key=lambda k: (-saved[k]["length"], -saved[k]["end"]))[:CHAIN_BONUS_BACKFILL]
        for cid in need:
            try:
                rep_ = fetch_section(f"{cid}/chainreport", key)
            except SystemExit as e:
                print(f"Chain bonus back-fill stopped: {e}")
                break
            time.sleep(CHAIN_REPORT_DELAY)
            rep_ = rep_.get("chainreport", rep_)
            bon = []
            for x in _as_list(rep_.get("bonuses")):
                aid = x.get("attacker_id") or (x.get("attacker") or {}).get("id")
                if aid:
                    bon.append({"id": aid, "chain": int(x.get("chain") or 0),
                                "respect": round(float(x.get("respect") or 0), 2)})
            saved[cid]["bonuses"] = bon
            saved[cid]["bonus_checked"] = True
            read += 1
        if need:
            print(f"Chain bonus back-fill: {len(need)} chain(s)")
    complete = len(todo) <= CHAIN_REPORTS_PER_RUN
    # nothing left to wait for: no chain in the list still running / settling, every report read
    pending = (not complete) or any(int(c.get("end") or 0) > now_ - CHAIN_SETTLE for c in chains)
    listed = hist.get("listed_at")
    if key and not pending:
        hist["listed_at"] = now_
    if key and (read or filled or hist.get("min_length") != min_len or hist.get("complete") != complete
                or hist.get("listed_at") != listed or key):     # key: "checked" moved
        hist["min_length"] = min_len
        hist["complete"] = complete
        CHAIN_HIST_PATH.parent.mkdir(exist_ok=True)
        CHAIN_HIST_PATH.write_text(json.dumps(hist, separators=(",", ":"), sort_keys=True) + "\n",
                                   encoding="utf-8")
        print(f"Chain history: read {read} report(s), {len(saved)} chains saved"
              + ("" if complete else f", {len(todo) - read} left for later runs"))
    return hist


def chain_leaderboard(hist: dict, members: list, ach: dict, lcfg: dict, since: int = 0) -> dict:
    """Chain leaderboards, CURRENT members only, top `top` each: total chain
    hits, total chain respect, retaliations. Plus a faction summary strip."""
    top = 10 ** 6                        # full faction
    names = {str(m.get("id")): m.get("name", "?") for m in members if str(m.get("id")) not in LB_HIDDEN}   # opted out
    tot = {}
    chains = {k: c for k, c in hist.get("chains", {}).items() if c["end"] >= since}
    allh = allr = allrets = 0           # totals incl. members who left
    for c in chains.values():
        for a in c["attackers"]:
            allh += a["hits"]; allr += a["respect"]; allrets += a["rets"]
            i = str(a["id"])
            if i not in names:
                continue
            t = tot.setdefault(i, {"name": names[i], "hits": 0, "respect": 0.0, "rets": 0})
            t["hits"] += a["hits"]
            t["respect"] += a["respect"]
            t["rets"] += a["rets"]

    for i, n in names.items():                       # 0s included: every current member
        tot.setdefault(i, {"name": n, "hits": 0, "respect": 0.0, "rets": 0})

    def ranked(key, fmt):
        rows = list(tot.values())
        rows.sort(key=lambda t: (-key(t), t["name"].lower()))
        return [{"name": t["name"], "value": fmt(t)} for t in rows[:top]]

    counts = ach.get("counts", {})
    longest = max((c["length"] for c in chains.values()), default=0)
    return {
        "chains": len(chains),
        "min_length": int(lcfg.get("chain_min_length", 50)),
        "counts": counts,
        "longest": longest,
        "hits": ranked(lambda t: t["hits"], lambda t: fmt_int(t["hits"])),
        "respect": ranked(lambda t: t["respect"], lambda t: fmt_int(int(round(t["respect"])))),
        "rets": ranked(lambda t: t["rets"], lambda t: fmt_int(t["rets"])),
        "totals": {"hits": ("Total", fmt_int(allh)), "respect": ("Total", fmt_int(int(round(allr)))),
                   "rets": ("Total", fmt_int(allrets))},
    }


# ==========================================================================
# 1e. GYM LEADERBOARDS (monthly gains from faction contributors)
# ==========================================================================
# /v2/faction/contributors?stat=<stat>&cat=current gives each current
# member's RUNNING TOTAL for that stat while in the faction. Monthly gain =
# current total - the total saved at the start of the calendar month (TCT).
# A member first seen mid-month is baselined at that moment.
#   gymstrength / gymspeed / gymdefense / gymdexterity : per-stat totals
#   "Total" board = the sum of those four, so it's in the same unit as the
#   stat columns (whatever Torn counts there - see README).
# Refreshed at most every gym_refresh_hours (4 calls per refresh), saved in
# data/gym.json. At month rollover last month's top 3 per board are kept.
GYM_PATH = ROOT / "data" / "gym.json"
# month-by-month gym energy per member: {"months": {"YYYY-MM": {stat: {member id: energy trained}}}} - the
# current month is rewritten on every gym refresh, and finalised exactly when the month rolls over
GYM_HIST_PATH = ROOT / "data" / "gym_history.json"
GYM_FETCH = [("gymstrength", "Strength"), ("gymspeed", "Speed"), ("gymdefense", "Defense"),
             ("gymdexterity", "Dexterity")]
GYM_STATS = GYM_FETCH + [("gymtotal", "Total")]      # gymtotal = sum, not fetched


def _month_start() -> int:
    """Start of the current calendar month (TCT/UTC) as a timestamp."""
    n = datetime.now(timezone.utc)
    return int(datetime(n.year, n.month, 1, tzinfo=timezone.utc).timestamp())


def _month_label() -> str:
    return datetime.now(timezone.utc).strftime("%B %Y")


def _month_of(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m")


def _gym_board(gym: dict, cur: dict, base: dict, top: int, names: dict) -> list:
    rows = []
    for i, n in names.items():             # every current member, 0s included
        v = cur.get(i)
        gain = max(0, int(v) - int(base.get(i, v))) if v is not None else 0
        rows.append((gain, n))
    rows.sort(key=lambda r: (-r[0], r[1].lower()))
    return [{"name": n, "value": g} for g, n in rows[:top]]


def update_gym(raw: dict, cfg: dict, key: str = None) -> dict:
    gcfg = cfg.get("announcements", {}).get("leaderboard", {})
    now = int(datetime.now(timezone.utc).timestamp())
    gym = {}
    if key:
        try:
            gym = json.loads(GYM_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            gym = {}
    if key is None:                          # mock: build from the mock file
        gym = copy_gym_mock(raw)
        return gym
    if os.environ.get("RUN_KIND") == "war" and gym.get("current"):
        return gym                           # hourly war-only run: no gym calls
    # clock slots: 00:00 06:00 12:00 18:00 TCT (and straight away when the month rolls over)
    if not due("gym", gym.get("fetched")) and gym.get("month") == _month_of(now):
        return gym                           # read this slot already - no API calls
    cur = {}
    try:
        for stat, _ in GYM_FETCH:
            data = fetch_section("contributors", key, {"stat": stat, "cat": "current"})
            cur[stat] = {str(c.get("id")): int(c.get("value") or 0)
                         for c in _as_list(data.get("contributors"))
                         if c.get("in_faction", True)}
    except SystemExit as e:
        print(f"Gym leaderboards skipped: {e}")
        return gym
    add_total(cur)
    names = {str(m.get("id")): m.get("name", "?")
             for m in _as_list(raw["members"].get("members"))}
    month = _month_of(now)
    try:
        ghist = json.loads(GYM_HIST_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ghist = {}
    gmonths = ghist.setdefault("months", {})
    if gym.get("month") and gym["month"] != month and gym.get("baseline"):
        # month rolled over: last month's final gains -> keep top 3 per board
        pbase = json.loads(json.dumps(gym["baseline"]))
        add_total(pbase)
        gym["prev"] = {"month": gym["month"], "top3": {
            stat: _gym_board(gym, cur[stat], pbase.get(stat, {}), 3, {k: v for k, v in names.items() if k not in LB_HIDDEN})
            for stat, _ in GYM_STATS},
            # full per-member gains (monthly recap Gym Leaderboard)
            "gains": {stat: {i: int(v) - int(pbase.get(stat, {}).get(i, v)) for i, v in cur[stat].items()
                             if int(v) - int(pbase.get(stat, {}).get(i, v)) > 0}
                      for stat, _ in GYM_STATS}}
        gmonths[gym["month"]] = gym["prev"]["gains"]          # last month's final gains -> history
        gym["baseline"] = {}
    if gym.get("month") != month:
        gym["month"] = month
        gym.setdefault("baseline", {})
    base = gym.setdefault("baseline", {})
    for stat, _ in GYM_FETCH:
        b = base.setdefault(stat, {})
        for i, v in cur[stat].items():
            b.setdefault(i, v)               # new member mid-month: start now
    gym["current"] = cur
    gym["fetched"] = now
    # this month so far -> history (overwritten each refresh; final once the month rolls over)
    tb = json.loads(json.dumps(base))
    add_total(tb)
    gmonths[month] = {stat: {i: int(v) - int(tb.get(stat, {}).get(i, v)) for i, v in cur[stat].items()
                             if int(v) - int(tb.get(stat, {}).get(i, v)) > 0} for stat, _ in GYM_STATS}
    GYM_HIST_PATH.parent.mkdir(exist_ok=True)
    GYM_HIST_PATH.write_text(json.dumps(ghist, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    GYM_PATH.parent.mkdir(exist_ok=True)
    GYM_PATH.write_text(json.dumps(gym, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print("Gym leaderboards: refreshed")
    return gym


def add_total(per_stat: dict):
    """per_stat[stat][member] -> also per_stat["gymtotal"][member] = sum."""
    tot = {}
    for stat, _ in GYM_FETCH:
        for i, v in per_stat.get(stat, {}).items():
            tot[i] = tot.get(i, 0) + int(v)
    per_stat["gymtotal"] = tot


def copy_gym_mock(raw: dict) -> dict:
    """Mock: raw["gym_mock"] = {"baseline": {...}, "current": {...}, "prev": {...}}"""
    g = json.loads(json.dumps(raw.get("gym_mock") or {}))
    for part in ("baseline", "current"):
        if g.get(part):
            g[part].pop("gymenergy", None)
            add_total(g[part])
    g.setdefault("month", _month_of(int(datetime.now(timezone.utc).timestamp())))
    return g


def gym_leaderboard(gym: dict, members: list, lcfg: dict) -> dict:
    if not gym.get("current"):
        return None
    top = 10 ** 6                        # full faction
    names = {str(m.get("id")): m.get("name", "?") for m in members if str(m.get("id")) not in LB_HIDDEN}   # opted out
    base = json.loads(json.dumps(gym.get("baseline", {})))
    add_total(base)                       # Total baseline = sum of stat baselines
    boards = {stat: _gym_board(gym, gym["current"].get(stat, {}), base.get(stat, {}),
                               top, names) for stat, _ in GYM_STATS}
    # All time = the running contributor totals themselves (energy trained
    # while in the faction, since joining)
    atop = 10 ** 6
    cur = json.loads(json.dumps(gym["current"]))
    add_total(cur)
    alltime = {stat: _gym_board(gym, cur.get(stat, {}), {i: 0 for i in cur.get(stat, {})}, atop, names)
               for stat, _ in GYM_STATS}
    tsum = lambda bd: {st: ("Total", sum(int(r["value"]) for r in bd.get(st, [])))
                       for st, _ in GYM_STATS}
    return {"month": gym.get("month"), "boards": boards, "alltime": alltime, "prev": gym.get("prev"),
            "totals": tsum(boards), "alltime_totals": tsum(alltime)}


# ==========================================================================
# 1f. SLACKER WATCH (announcement) - from saved war history + member list
# ==========================================================================
def slacker_watch(hist: dict, members: list, scfg: dict) -> dict:
    """Current members only. Over the last `recent_wars` (3) finished wars:
      missed   = wars they were in (per the report) with 0 hits
      low hits = wars with 1+ hits but under token_pct % (5) of that war's
                 average hits (average over members who hit at all); the
                 actual hit counts are shown, e.g. "(3 & 5 hits)"
    Plus inactive = last action >= inactive_days (5) days ago.
    If a member missed EVERY war in the window, the count shown is their
    true run of consecutive missed wars across the whole history, e.g.
    "Missed 10/3 wars" (10 in a row, window of 3).
    Tiers (highest that applies):
      Review  : missed >= review_missed (3)  or inactive
      Warning : missed >= warning_missed (2)
      Watch   : missed >= 1 or low-hit wars >= watch_token_wars (2)
    Each entry: {name, reasons: [..]} sorted worst first."""
    n_recent = int(scfg.get("recent_wars", 3))
    token_pct = float(scfg.get("token_pct", 5)) / 100
    inactive_days = float(scfg.get("inactive_days", 5))
    rev_m, warn_m = int(scfg.get("review_missed", 3)), int(scfg.get("warning_missed", 2))
    watch_tok = int(scfg.get("watch_token_wars", 2))
    now = int(datetime.now(timezone.utc).timestamp())
    tw = termed_wars()                       # termed wars never count as missed / low hits
    all_wars = sorted((w for k, w in hist.get("wars", {}).items() if str(k) not in tw), key=lambda w: w["end"])
    wars = all_wars[-n_recent:]
    stats = {}
    for w in wars:
        hitters = [m["attacks"] for m in w["members"] if m["attacks"] > 0]
        avg = sum(hitters) / len(hitters) if hitters else 0
        for m in w["members"]:
            t = stats.setdefault(str(m["id"]), {"present": 0, "missed": 0, "low": []})
            t["present"] += 1
            if m["attacks"] == 0:
                t["missed"] += 1
            elif avg and m["attacks"] < token_pct * avg:
                t["low"].append(m["attacks"])
    # consecutive missed wars (newest backwards, only wars they were in)
    streak = {}
    for w in reversed(all_wars):
        for m in w["members"]:
            i = str(m["id"])
            if streak.get(i, (0, True))[1]:
                n, going = streak.get(i, (0, True))
                streak[i] = (n + 1, True) if m["attacks"] == 0 else (n, False)
    tiers = {"review": [], "warning": [], "watch": []}
    for m in members:
        i = str(m.get("id"))
        st = stats.get(i, {"present": 0, "missed": 0, "low": []})
        la = m.get("last_action")
        # idle time as of when the member list was READ (not this build) - the data's own moment, so rebuilds from the
        # same data give the same numbers (site deploys only on real changes, Nov 2026); ≤3 h behind at most
        idle = (members_asof(now) - int(la)) / 86400 if la else 0
        reasons = []
        if st["missed"]:
            shown = st["missed"]
            if st["missed"] == st["present"]:
                shown = max(shown, streak.get(i, (0, False))[0])
            reasons.append(f"Missed {shown}/{st['present']} war" + ("s" if st["present"] != 1 else ""))
        if st["low"] and (st["missed"] or len(st["low"]) >= watch_tok):
            hits = " & ".join(str(h) for h in st["low"])
            reasons.append(f"Low hits in {len(st['low'])}/{st['present']} war"
                           + ("s" if st["present"] != 1 else "") + f" ({hits} hit"
                           + ("s" if not (len(st["low"]) == 1 and st["low"][0] == 1) else "") + ")")
        if idle >= inactive_days:
            reasons.append(f"Inactive {int(idle)} days")
        if not reasons:
            continue
        if st["missed"] >= rev_m or idle >= inactive_days:
            tier = "review"
        elif st["missed"] >= warn_m:
            tier = "warning"
        else:
            tier = "watch"
        tiers[tier].append({"name": m.get("name", "?"), "reasons": reasons,
                            "_k": (-st["missed"], -streak.get(i, (0, 0))[0], -len(st["low"]), -idle,
                                   str(m.get("name", "")).lower())})
    for v in tiers.values():
        v.sort(key=lambda e: e.pop("_k"))
    return {"wars": len(wars), "tiers": tiers}


def chain_review(chist: dict, members: list, scfg: dict) -> list:
    """Chain Review (Discord only): CURRENT members who made no hits in
    `chain_review_missed` (3)+ of the last `chain_review_recent` (5) chains
    of `chain_review_min` (1,000)+ hits. A chain only counts for a member if
    they were in the faction when it started (report's non-attacker list
    when saved, else days in faction vs the chain start). Entry reasons:
      "Missed 4/5 chains", "Hits: 0 · 12 · 0 · 0 · 0" (newest first)."""
    min_len = int(scfg.get("chain_review_min", 1000))
    n_recent = int(scfg.get("chain_review_recent", 5))
    need = int(scfg.get("chain_review_missed", 3))
    now = int(datetime.now(timezone.utc).timestamp())
    big = sorted((c for c in chist.get("chains", {}).values() if c.get("length", 0) >= min_len),
                 key=lambda c: c["end"])[-n_recent:][::-1]          # newest first
    out = []
    for m in members:
        i = m.get("id")
        dif = m.get("days_in_faction")
        joined = now - int(dif) * 86400 if dif is not None else None
        hits = []
        for c in big:
            att = {a["id"]: a["hits"] for a in c.get("attackers", [])}
            if i in att:
                hits.append(att[i]); continue
            if "non_attackers" in c:
                if i in c["non_attackers"]:
                    hits.append(0)
                continue
            started = c.get("start") or c["end"]
            if joined is None or joined <= started:
                hits.append(0)
        missed = hits.count(0)
        if missed >= need:
            out.append({"name": m.get("name", "?"),
                        "reasons": [f"Missed {missed}/{len(hits)} chains",
                                    "Hits: " + " · ".join(str(h) for h in hits)],
                        "_k": (-missed, sum(hits), str(m.get("name", "")).lower())})
    out.sort(key=lambda e: e.pop("_k"))
    return out


def _in_chain(m: dict, c: dict, now: int):
    """Was member m in the faction for chain c? Uses the report's attacker /
    non-attacker lists when saved, else days in faction vs the chain start.
    Returns hits (0 = in the faction, no hits) or None (not in the faction)."""
    i = m.get("id")
    for a in c.get("attackers", []):
        if a["id"] == i:
            return a["hits"]
    if "non_attackers" in c:
        return 0 if i in c["non_attackers"] else None
    dif = m.get("days_in_faction")
    if dif is None:
        return 0
    joined = now - int(dif) * 86400
    return 0 if joined <= (c.get("start") or c["end"]) else None


def chain_report(cid: str, chist: dict, members: list, ccfg: dict) -> dict:
    """Everything the Chain Report shows for one finished chain.
    Large chains (>= large_min, 1,000) also get repeat offenders + low hits.
      summary : length, dates, duration, hits, respect, participation,
                retaliations, assists, top hits/respect, bonus hits
      missed  : in the faction for the chain, 0 hits
      repeat  : missed this one AND >= repeat_missed (2) of the previous
                repeat_window (4) large chains they were in
      low     : 1 to low_hits-1 (4) hits"""
    now = int(datetime.now(timezone.utc).timestamp())
    chains = chist.get("chains", {})
    c = chains[cid]
    large = c["length"] >= int(ccfg.get("large_min", 1000))
    names = {m.get("id"): m.get("name", "?") for m in members}
    nm = lambda i: names.get(i, f"[{i}]")       # former members: ID only
    att = c.get("attackers", [])
    in_chain = {m.get("id"): _in_chain(m, c, now) for m in members}
    elig = [i for i, h in in_chain.items() if h is not None]
    hit = [i for i in elig if in_chain[i] > 0]
    out = {
        "id": cid, "length": c["length"], "start": c.get("start"), "end": c["end"], "large": large,
        "hits": sum(a["hits"] for a in att), "respect": sum(a["respect"] for a in att),
        "rets": sum(a.get("rets", 0) for a in att),
        "assists": sum(a.get("assists", 0) for a in att) if any("assists" in a for a in att) else None,
        "hit": len(hit), "present": len(elig), "attackers": len(att),
        # full summary: every member who hit, most successful attacks first
        "rows": [{"name": nm(a["id"]), "hits": a["hits"], "respect": a["respect"],
                  # AVG = respect / hits, chain bonus respect included (Nov 2026)
                  "avg": a["respect"] / a["hits"] if a["hits"] else 0,
                  "rets": a.get("rets", 0), "assists": a.get("assists")}
                 for a in sorted(att, key=lambda a: (-a["hits"], -a["respect"]))],
        "bonuses": [(b["chain"], nm(b["id"])) for b in sorted(c.get("bonuses", []), key=lambda b: b["chain"])
                    if b["chain"] >= int(ccfg.get("bonus_min", 100))],
        # small chains aren't scrutinised: no Didn't Participate list
        "missed": sorted((nm(i) for i in elig if in_chain[i] == 0), key=str.lower) if large else [],
        "repeat": [], "low": [],
    }
    if large:
        lmin = int(ccfg.get("large_min", 1000))
        prev = sorted((x for x in chains.values() if x["length"] >= lmin and x["end"] < c["end"]),
                      key=lambda x: x["end"])[::-1]          # newest first
        window, need = int(ccfg.get("repeat_window", 4)), int(ccfg.get("repeat_missed", 2))
        for m in members:
            i = m.get("id")
            if in_chain.get(i) != 0:
                continue
            seq = [0]                       # this chain first, then older ones
            for x in prev:
                h = _in_chain(m, x, now)
                if h is not None:
                    seq.append(h)
            recent = seq[1:window + 1]
            if recent.count(0) >= need:
                streak = 0
                for h in seq:
                    if h: break
                    streak += 1
                shown = seq[:window + 1]
                out["repeat"].append({
                    "name": nm(i),
                    "reasons": [f"Missed {shown.count(0)}/{len(shown)} chains"]
                               + ([f"{streak} in a row"] if streak > 1 else [])
                               + ["Hits: " + " · ".join(str(h) for h in shown)],
                    "_k": (-shown.count(0), -streak, nm(i).lower())})
        out["repeat"].sort(key=lambda e: e.pop("_k"))
        low = int(ccfg.get("low_hits", 5))
        out["low"] = sorted(((nm(i), in_chain[i]) for i in elig if 0 < in_chain[i] < low),
                            key=lambda t: (t[1], t[0].lower()))
    return out


def chain_rows(ach: dict, cfg: dict) -> list:
    saved = ach.get("chains", {})
    counts = ach.get("counts", {})
    rows = []
    for t in chain_tiers(cfg):
        v = saved.get(str(t))
        rows.append({"tier": t, "date": v["date"] if v else None,
                     "count": counts.get(str(t), 1 if v else 0)})
    return rows


# ==========================================================================
# 2. NORMALIZE
# ==========================================================================
def load_config() -> dict:
    """config.json is the user-editable content. Keys starting with "_" are
    notes for the person editing and are ignored by the code."""
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def _as_list(value):
    """v1 returned id-keyed dicts, v2 returns lists. Accept either."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        out = []
        for k, v in value.items():
            if isinstance(v, dict):
                v = dict(v)
                v.setdefault("id", k)
                out.append(v)
        return out
    return []


def _upgrade_items(container):
    """Pull the flat list of upgrades out of a branch/core container that may
    be {upgrades: [...]}, a list of upgrades, or a list of branches."""
    if isinstance(container, dict):
        return _as_list(container.get("upgrades", container))
    items = []
    for entry in _as_list(container):
        if isinstance(entry, dict) and "upgrades" in entry:
            items.extend(_as_list(entry["upgrades"]))
        else:
            items.append(entry)
    return items


def _clean_upgrade(u: dict) -> dict:
    lvl = u.get("level")
    try:
        lvl = int(lvl)
    except (TypeError, ValueError):
        lvl = None
    return {
        "name": str(u.get("name", "")).strip(),
        "ability": str(u.get("ability", "")).strip(),
        "level": lvl,
    }


def normalize(raw: dict, cfg: dict) -> dict:
    basic = raw["basic"].get("basic", raw["basic"])
    members = _as_list(raw["members"].get("members"))
    positions = _as_list(raw["positions"].get("positions"))
    up_root = raw["upgrades"]
    upgrades = up_root.get("upgrades", {}) or {}
    # `state` sits beside `upgrades` in v2; fall back to inside it, then peace.
    state = str(up_root.get("state") or upgrades.get("state") or "peace").lower()

    by_id = {int(m["id"]): m for m in members if str(m.get("id", "")).isdigit()}

    def person(pid):
        """Leader/co-leader name; None when the slot is empty (id 0)."""
        try:
            pid = int(pid or 0)
        except (TypeError, ValueError):
            return None
        if not pid:
            return None
        return by_id.get(pid, {}).get("name", f"[{pid}]")

    # ---- Leadership rows ------------------------------------------------
    # ONE ROW PER PERSON: "Organized Crime Lead: AuroraTRX [123456]".
    # Who appears: every member whose Torn `position` is a shown position.
    # Hidden: Leader / Co-leader (they have their own fields), the faction's
    # default position (what new members get), and anything in role_exclude.
    # Title per row, first match wins:
    #   1. member_titles[<member name or id>]   (custom title per person)
    #   2. roles[] entry for their position      (custom title per position)
    #   3. the Torn position name itself
    # Order: people listed in member_titles first (in that order), then the
    # rest by position order (roles[] first, then Torn's order), then name.
    fi = cfg.get("faction_info", {})
    default_pos = {str(p.get("name", "")).strip().lower() for p in positions if p.get("is_default")}
    excluded = {str(x).strip().lower() for x in fi.get("role_exclude", [])}
    skip = {"leader", "co-leader", "co leader", "coleader", ""} | default_pos | excluded

    pos_titles, pos_order = {}, []
    for r in fi.get("roles", []):
        pos = str(r.get("position", "")).strip().lower()
        if pos and pos not in skip:
            pos_titles[pos] = r.get("title") or r.get("position")
            pos_order.append(pos)
    if fi.get("show_unlisted_roles", True):
        for p in positions:  # API order = the faction's own position order
            pos = str(p.get("name", "")).strip().lower()
            if pos and pos not in skip and pos not in pos_order:
                pos_order.append(pos)

    # member_titles keys can be a player name (any case) or a player id.
    # SLOTS: the people are filled in from the API automatically; only the TITLES are set by hand.
    # Slot order is stable: position order (roles[] first, then Torn's), then longest in the faction, then ID.
    # leadership_titles[k] = the title of slot k+1 ({leadership1}, {leadership2}, ... on the banner); an empty /
    # missing title falls back to the roles[] title for their position, then the Torn position name.
    slot_titles = [str(t or "").strip() for t in fi.get("leadership_titles") or []]
    roles = []
    for m in members:
        pos = str(m.get("position", "")).strip()
        if pos.lower() not in pos_order:
            continue
        roles.append({"name": str(m.get("name", "?")), "id": str(m.get("id", "")), "position": pos,
                      "_sort": (pos_order.index(pos.lower()), -int(m.get("days_in_faction") or 0),
                                int(m.get("id") or 0))})
    roles.sort(key=lambda r: r["_sort"])
    for k, r in enumerate(roles):
        r.pop("_sort")
        r["title"] = slot_title(fi, k, r["position"])
    LEADERSHIP_NOW[:] = [{"name": r["name"], "id": r["id"], "title": r["title"]} for r in roles]
    if not fi.get("hide_empty_roles", True):
        filled = {str(m.get("position", "")).strip().lower() for m in members}
        for pos in pos_order:
            if pos not in filled:
                roles.append({"title": pos_titles.get(pos, pos.title()), "name": "Vacant", "id": ""})

    # ---- Upgrades ---------------------------------------------------------
    # The API returns BOTH trees (peace and war) plus `state` = the active one.
    # config perks.tree picks which to show: "peace", "war", or "active"
    # (follow whichever is currently switched on).
    tree = str(cfg.get("perks", {}).get("tree", "active")).lower()
    if tree not in ("peace", "war"):
        tree = state
    branches = []
    for b in _as_list(upgrades.get(tree)):
        items = [_clean_upgrade(u) for u in _upgrade_items(b)]
        items = [u for u in items if u["ability"] or u["name"]]
        if items:
            branches.append({
                "name": str(b.get("name", "Branch")).strip(),
                "order": b.get("order", 99),
                "upgrades": items,
            })
    branches.sort(key=lambda b: (b["order"] if isinstance(b["order"], int) else 99))

    rank = basic.get("rank") or {}
    # v2 gives division as an integer (2); Torn displays it as "Gold II".
    div = rank.get("division")
    div = roman(div) if isinstance(div, int) else div
    rank_label = " ".join(str(x) for x in (rank.get("name"), div) if x)
    count = basic.get("members") if isinstance(basic.get("members"), int) else len(members)
    best_chain = basic.get("best_chain")
    if isinstance(best_chain, dict):  # defensive: some endpoints nest it
        best_chain = best_chain.get("count") or best_chain.get("chain")

    return {
        # Every value here is available as a {placeholder} in config.json
        # text (header respect line, Faction Information fields).
        "values": {
            "faction_name": basic.get("name", ""),
            "tag": basic.get("tag", ""),
            "leader": person(basic.get("leader_id")) or "Vacant",
            "co_leader": person(basic.get("co_leader_id")) or "Vacant",
            "leader_id": str(basic.get("leader_id") or "") if person(basic.get("leader_id")) else "",
            "co_leader_id": str(basic.get("co_leader_id") or "") if person(basic.get("co_leader_id")) else "",
            # {leadership1} {leadership1_id} {leadership1_title} ... one set per leadership slot (filled from the API)
            # (slots nobody holds: "Vacant" / empty, so a leftover placeholder never shows as {leadership5})
            **{f"leadership{k + 1}{suf}": ((roles[k][key] if k < len(roles) else ("Vacant" if suf == "" else "")))
               for k in range(max(8, len(roles))) for suf, key in (("", "name"), ("_id", "id"), ("_title", "title"))},
            "respect": fmt_int(basic.get("respect")),  # exact, comma-grouped
            "members": fmt_int(count),
            "capacity": fmt_int(basic.get("capacity")),
            "rank": rank_label,
            "days_old": fmt_int(basic.get("days_old")),
            "best_chain": fmt_int(best_chain),
            "rw_wins": fmt_int(rank.get("wins")),  # total ranked war wins (basic.rank.wins)
            "mode": state.capitalize(),
            "updated": datetime.now(timezone.utc).strftime("%b %d, %Y · %H:%M TCT"),
        },
        "roles": roles,
        "wars": normalize_wars(raw, basic.get("id"), cfg.get("ranked_wars", {})),
        # announcement shows more wars; same lists, its own count
        "wars_announce": normalize_wars(raw, basic.get("id"), dict(
            cfg.get("ranked_wars", {}),
            count=cfg.get("announcements", {}).get("ranked_wars", {}).get("count", 5),
            top_hitters=cfg.get("announcements", {}).get("ranked_wars", {}).get("top", 5))),
        "chain_ach": chain_rows(raw.get("_achievements", {}), cfg),
        "war_record": war_record(raw, basic.get("id")),
        "war_status": war_status(raw, basic.get("id")),
        "leaderboard": leaderboard(raw.get("_war_history", {}),
                                   {str(m.get("id")): m.get("name", "?") for m in members},
                                   cfg.get("announcements", {}).get("leaderboard", {})),
        "leaderboard_month": leaderboard(raw.get("_war_history", {}),
                                         {str(m.get("id")): m.get("name", "?") for m in members},
                                         cfg.get("announcements", {}).get("leaderboard", {}),
                                         since=_month_start(), monthly=True),
        # computed for the announcement (if enabled) and/or the Discord post
        "slacker_watch": slacker_watch(raw.get("_war_history", {}), members,
                                       cfg.get("announcements", {}).get("slacker_watch", {}))
        if (cfg.get("announcements", {}).get("slacker_watch", {}).get("enabled", True)
            or cfg.get("discord", {}).get("enabled", False)) else None,
        "chain_review": chain_review(raw.get("_chain_history", {}), members,
                                     cfg.get("announcements", {}).get("slacker_watch", {}))
        if cfg.get("announcements", {}).get("slacker_watch", {}).get("chain_review", False) else None,
        "gym_leaderboard": gym_leaderboard(raw.get("_gym", {}), members,
                                           cfg.get("announcements", {}).get("leaderboard", {})),
        "chain_leaderboard": chain_leaderboard(raw.get("_chain_history", {}), members,
                                               raw.get("_achievements", {}),
                                               cfg.get("announcements", {}).get("leaderboard", {}))
        if raw.get("_chain_history") else None,
        "chain_leaderboard_month": chain_leaderboard(raw.get("_chain_history", {}), members,
                                                     raw.get("_achievements", {}),
                                                     cfg.get("announcements", {}).get("leaderboard", {}),
                                                     since=_month_start())
        if raw.get("_chain_history") else None,
        "upgrades": {"state": state, "tree": tree, "branches": branches},
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M TCT"),
    }


def normalize_wars(raw: dict, my_id, rw_cfg: dict) -> list:
    """Recent finished ranked wars with our top hitters.
    Each: {opponent, won, our_score, their_score, end, hitters:[{name,id,
    attacks, score}]}. Hitters are OUR members only, ranked by
    rw_cfg.rank_hitters_by ("attacks" = number of hits, or "score")."""
    if "rankedwars" not in raw:
        return []
    by = rw_cfg.get("rank_hitters_by", "attacks")
    top_n = int(rw_cfg.get("top_hitters", 3))
    reports = raw.get("rankedwarreports", {})
    out = []
    for w in pick_wars(raw["rankedwars"], rw_cfg.get("count", 3)):
        facs = _as_list(w.get("factions"))
        me = next((f for f in facs if str(f.get("id")) == str(my_id)), None)
        them = next((f for f in facs if str(f.get("id")) != str(my_id)), None)
        if not me or not them:
            continue
        rep_ = reports.get(str(w["id"]), {})
        rep_ = rep_.get("rankedwarreport", rep_)
        my_rep = next((f for f in _as_list(rep_.get("factions"))
                       if str(f.get("id")) == str(my_id)), {})
        members = _as_list(my_rep.get("members"))
        slim = lambda m: {"name": m.get("name", "?"), "id": m.get("id"),
                          "attacks": m.get("attacks") or 0, "score": m.get("score") or 0,
                          "assists": m.get("assists") or 0, "hosps": m.get("hosps") or 0,
                          "best": m.get("best") or 0,
                          "rph": nb(m)[0] / nb(m)[1] if nb(m)[1] > 0 else 0}
        # Two leaderboards per war (OUR members only):
        #   top_hits     - most attacks (hits) in the war
        #   most_respect - highest war score (= respect earned for the faction)
        by_hits = sorted(members, key=lambda m: (m.get("attacks") or 0, m.get("score") or 0), reverse=True)
        by_resp = sorted(members, key=lambda m: (m.get("score") or 0, m.get("attacks") or 0), reverse=True)
        members.sort(key=lambda m: (m.get(by) or 0, m.get("score") or 0), reverse=True)
        out.append({
            "id": w.get("id"),
            "opponent": them.get("name", "?"),
            "won": str(w.get("winner")) == str(my_id),
            "our_score": me.get("score"),
            "their_score": them.get("score"),
            "end": int(w.get("end") or 0),
            "start": int(w.get("start") or rep_.get("start") or 0),
            # rank before -> after, from OUR side of the war report
            "rank_before": ((my_rep.get("rank") or {}).get("before") or ""),
            "rank_after": ((my_rep.get("rank") or {}).get("after") or ""),
            # participation: members in the report who made at least 1 hit
            "present": len(members),
            "hit": sum(1 for m in members if (m.get("attacks") or 0) > 0),
            "hitters": [slim(m) for m in members[:top_n]],
            "top_hits": [slim(m) for m in by_hits[:top_n] if (m.get("attacks") or 0) > 0],
            "most_respect": [slim(m) for m in by_resp[:top_n] if (m.get("score") or 0) > 0],
            # from the war's attack log (saved in war history): assists + hospitalizations
            "top_assists": [slim(m) for m in sorted(members, key=lambda m: -(m.get("assists") or 0))[:top_n]
                            if (m.get("assists") or 0) > 0],
            "top_hosps": [slim(m) for m in sorted(members, key=lambda m: -(m.get("hosps") or 0))[:top_n]
                          if (m.get("hosps") or 0) > 0],
            "has_attack_log": any("hosps" in m for m in members),
            # Big Hitter: best single war hit (respect, chain bonus hits excluded)
            "top_best": [slim(m) for m in sorted(members, key=lambda m: -(m.get("best") or 0))[:top_n]
                         if (m.get("best") or 0) > 0],
            # Respect / Hit (min 10 war hits so one lucky hit doesn't win)
            "top_rph": [slim(m) for m in sorted((m for m in members if nb(m)[1] >= 10),
                                                key=lambda m: -(nb(m)[0] / nb(m)[1]))[:top_n]],
            # our members listed in the war report with 0 attacks
            "non_participants": sorted((m.get("name", "?") for m in members
                                        if not (m.get("attacks") or 0)), key=str.lower),
        })
    return out


def war_record(raw: dict, my_id):
    """All-time ranked war record from every FINISHED war in the history:
    {"won", "lost", "pct"} (pct rounded). None if wars weren't loaded."""
    if "rankedwars" not in raw:
        return None
    now = int(datetime.now(timezone.utc).timestamp())
    done = [w for w in _as_list(raw["rankedwars"].get("rankedwars"))
            if w.get("end") and 0 < int(w["end"]) <= now and w.get("winner")]
    won = sum(1 for w in done if str(w.get("winner")) == str(my_id))
    lost = len(done) - won
    pct = round(100 * won / len(done)) if done else 0
    return {"won": won, "lost": lost, "pct": pct}


def stamp_now() -> str:
    """'Last updated' time, taken at the moment a footer is drawn - the last
    thing done before that image is saved - so it's as close as possible to
    when the run publishes (publishing follows within about a minute)."""
    return datetime.now(timezone.utc).strftime("%b %d, %Y · %H:%M TCT")


# --------------------------------------------------------------------------
# "Last updated" only moves when the information shown actually changes.
# A fingerprint (hash) of everything an image displays - data + its config
# text, minus the clock - is compared with the one saved last run in
# data/stamps.json. Same fingerprint -> keep the old time; different ->
# stamp now. Banner and announcement are tracked separately.
# --------------------------------------------------------------------------
STAMPS_PATH = ROOT / "data" / "stamps.json"
_STAMPS = {"saved": {}, "new": {}, "persist": False}

BANNER_KEYS = ["values", "roles", "upgrades", "wars", "war_record", "chain_ach"]
# (no "values": the announcement doesn't show respect/members etc., so a
# respect tick shouldn't move its time)
ANNOUNCE_KEYS = ["war_status", "wars_announce", "war_record", "leaderboard", "slacker_watch",
                 "chain_leaderboard", "gym_leaderboard"]


def _fingerprint(summary: dict, keys: list, cfg_part) -> str:
    import hashlib
    data = {k: summary.get(k) for k in keys}
    if isinstance(data.get("values"), dict):
        data["values"] = {k: v for k, v in data["values"].items() if k != "updated"}
    blob = json.dumps([data, cfg_part], sort_keys=True, default=str)
    return hashlib.sha1(blob.encode()).hexdigest()


def prepare_stamps(summary: dict, cfg: dict, persist: bool):
    try:
        _STAMPS["saved"] = json.loads(STAMPS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _STAMPS["saved"] = {}
    _STAMPS["persist"] = persist
    _STAMPS["hash"] = {
        "banner": _fingerprint(summary, BANNER_KEYS, {k: v for k, v in cfg.items() if k != "announcements"}),
        "announce": _fingerprint(summary, ANNOUNCE_KEYS, cfg.get("announcements")),
    }


def stamp_for(kind: str) -> str:
    """Saved time if this image's information is unchanged, else now."""
    h = _STAMPS.get("hash", {}).get(kind)
    old = _STAMPS["saved"].get(kind) or {}
    if h and old.get("hash") == h and old.get("stamp"):
        stamp = old["stamp"]
    else:
        stamp = stamp_now()
    _STAMPS["new"][kind] = {"hash": h, "stamp": stamp}
    return stamp


def save_stamps():
    if not _STAMPS["persist"]:
        return
    out = dict(_STAMPS["saved"])
    out.update(_STAMPS["new"])
    STAMPS_PATH.parent.mkdir(exist_ok=True)
    STAMPS_PATH.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def fmt_int(n) -> str:
    return f"{n:,}" if isinstance(n, int) else ("" if n is None else str(n))


def fill(template: str, values: dict) -> str:
    """{placeholder} substitution that leaves unknown {names} untouched
    instead of crashing, so a typo in config.json can't break the job."""
    class Safe(dict):
        def __missing__(self, k):
            return "{" + k + "}"
    return str(template).format_map(Safe(values))


# ==========================================================================
# 3. RENDER
# ==========================================================================
# Colours tuned against the v2 (red circuit) template.
RED = (228, 56, 46)          # labels, headlines, branch names, bullets
RED_DIM = (120, 26, 24)      # panel grid / hairlines
GLOW = (235, 40, 32)         # panel border glow
TITLE = (196, 196, 196)      # section titles (light steel)
TEXT = (214, 214, 214)       # body text
SUB = (165, 165, 165)        # secondary text
SHADOW = (5, 5, 5)
RULE = (92, 28, 26)          # thin dividers inside red panels

W = 1298                     # canvas width (2x of the 649px template)
SIDE_W = 52                  # side frame column width (side_l/side_r.png)
PANEL_X0, PANEL_X1 = 62, 1236  # red glow panel, inside the side frames
CX0, CX1 = 96, 1202          # content area inside the panel
CW = CX1 - CX0
INTERIOR = (11, 11, 13)      # frame interior colour outside the panels

# Requirements row geometry inside req_body.png (2x), measured on template:
# plates centred at 1x x=129/320/501, icon centre 1x y=619, label plates
# 1x (62..196 / 250..394 / 434..576, y 660..690); req_body starts at 1x y=585.
# Measured on art/pieces_v2/req_body.png (2x): plate frames are centred at
# x=256/647/1013 and the label plates' inner faces are x 127-388 / 511-780 /
# 881-1146, y 152-192. Icons and labels are centred on the SAME slot centre.
REQ_SLOT_CX = [257, 646, 1013]
REQ_ICON_CY = 68
REQ_ICON_MAX = 118
REQ_PILL = [(127, 152, 388, 192), (511, 152, 780, 192), (881, 152, 1146, 192)]
# The template's own icons (art2-*) were lifted from these exact spots, so they
# are pasted back at full size where they came from (centre of their cut box)
# to line up with the plate's red backing.
REQ_ART_POS = {"art2-shield": (258, 68), "art2-swords": (640, 68), "art2-cat": (1002, 68)}

# Header geometry (header.png, 2x): first section title on the header's bar,
# respect value inside the RESPECT LEVEL bar.
HDR_TITLE_XY = (136, 574)
RESPECT_XY = (760, 492)       # centre-baseline of the respect value
RESPECT_MAX_W = 420

# Perk branch heading: chevron.png starts 132px (2x) right of icon_plate.png's
# left edge - the same spacing as in the template, so the plate's arrow tip
# nests in the chevron's notch.
CHEV_OFFSET = 132

# Default branch -> icon. hex_* = the template's own hex tiles (icon baked
# in); gi-* = game-icons drawn in red glow on the empty hex. Overridable in
# config.json under perks.branch_icons.
BRANCH_ICONS = {
    "criminality": "hex_lock",
    "fortitude": "gi-medical-pack",
    "voracity": "gi-wrapped-sweet",
    "toleration": "hex_flask",
    "excursion": "hex_map",
    "steadfast": "gi-weight-lifting-up",
    "aggression": "gi-punch",
    "suppression": "gi-bolt-shield",
}



def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Bundled Rajdhani (OFL) - closest match to the template's lettering."""
    return ImageFont.truetype(str(FONT_DIR / f"Rajdhani-{weight}.ttf"), size)


def roman(n) -> str:
    if not isinstance(n, int) or n <= 0:
        return ""
    vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
            (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for v, s in vals:
        while n >= v:
            out, n = out + s, n - v
    return out


def wrap(text: str, fnt, max_w: float) -> list:
    """Greedy word wrap measured with the real font."""
    words, lines, cur = str(text).split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if fnt.getlength(test) <= max_w or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def fit_font(text, weight, size, max_w, min_size):
    """Largest size <= `size` at which `text` fits `max_w`."""
    f = font(weight, size)
    while f.getlength(text) > max_w and size > min_size:
        size -= 1
        f = font(weight, size)
    return f


def tracked_len(text, fnt, track):
    return sum(fnt.getlength(ch) for ch in text) + track * max(len(text) - 1, 0)


def draw_text(d, xy, text, fnt, fill, track=0, shadow=True, anchor="ls"):
    """Text with a hard drop shadow (matches the template's embossed look)
    and optional letter-spacing. xy is the LEFT-BASELINE point by default."""
    x, y = xy
    if anchor == "ms":  # centred on x
        x -= tracked_len(text, fnt, track) / 2
    if not track:
        if shadow:
            d.text((x + 2, y + 3), text, font=fnt, fill=SHADOW, anchor="ls")
        d.text((x, y), text, font=fnt, fill=fill, anchor="ls")
        return
    for ch in text:
        if shadow:
            d.text((x + 2, y + 3), ch, font=fnt, fill=SHADOW, anchor="ls")
        d.text((x, y), ch, font=fnt, fill=fill, anchor="ls")
        x += fnt.getlength(ch) + track


def bullet(d, x, y_base, size=14):
    """Red right-pointing triangle bullet, vertically centred on x-height."""
    cy = y_base - size * 0.95
    d.polygon([(x, cy - size * 0.6), (x + size * 0.9, cy), (x, cy + size * 0.6)], fill=RED)


def piece(name) -> Image.Image:
    return Image.open(PIECES / f"{name}.png").convert("RGBA")


def metal_icon(name: str, box: int) -> Image.Image:
    """Load an icon fitted into a box x box square.
    art-*.png are lifted from the template and used as-is; gi-*.png are white
    game-icons silhouettes recoloured to the template's brushed-steel look
    (vertical light->dark gradient, dark outline, soft drop shadow)."""
    path = ICON_DIR / f"{name}.png"
    if not path.exists():
        path = ICON_DIR / "gi-checked-shield.png"
        name = "gi-checked-shield"
    src = Image.open(path).convert("RGBA")
    src.thumbnail((box, box), Image.LANCZOS)
    # gi-* (game-icons) and glyph-* (shapes drawn from the bundled font, e.g.
    # glyph-percent) are white silhouettes -> recoloured to steel below.
    if not name.startswith(("gi-", "glyph-")):
        out = Image.new("RGBA", (box, box), (0, 0, 0, 0))
        out.alpha_composite(src, ((box - src.width) // 2, (box - src.height) // 2))
        return out

    a = src.getchannel("A")
    w, h = src.size
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        k = yy / max(h - 1, 1)
        v = int(232 - 95 * k)                     # 232 -> 137 steel ramp
        gd.line([(0, yy), (w, yy)], fill=(v, v, v + 2))
    body = grad.convert("RGBA")
    body.putalpha(a)
    pad = 10
    out = Image.new("RGBA", (box + 2 * pad, box + 2 * pad), (0, 0, 0, 0))
    ox, oy = (box - w) // 2 + pad, (box - h) // 2 + pad
    # outline: alpha grown by ~3px, near-black
    edge = Image.new("L", out.size, 0)
    edge.paste(a, (ox, oy))
    edge = edge.filter(ImageFilter.MaxFilter(7))
    shadow = edge.filter(ImageFilter.GaussianBlur(4))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, 0)] * 3 +
                                    [shadow.point(lambda p: p * 0.8)]), (3, 4))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, 18)] * 3 + [edge]))
    out.alpha_composite(body, (ox, oy))
    return out.crop((pad, pad, pad + box, pad + box))


def paste_center(canvas, img, cx, cy):
    canvas.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def red_icon(name: str, box: int) -> Image.Image:
    """White silhouette icon (gi-*/glyph-*) recoloured to the v2 look:
    hot red gradient, dark outline and a soft red glow behind it."""
    path = ICON_DIR / f"{name}.png"
    if not path.exists():
        path = ICON_DIR / "gi-checked-shield.png"
    src = Image.open(path).convert("RGBA")
    src.thumbnail((box, box), Image.LANCZOS)
    a = src.getchannel("A")
    w, h = src.size
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        k = yy / max(h - 1, 1)
        gd.line([(0, yy), (w, yy)], fill=(int(255 - 70 * k), int(98 - 70 * k), int(84 - 64 * k)))
    body = grad.convert("RGBA")
    body.putalpha(a)
    pad = 14
    out = Image.new("RGBA", (box + 2 * pad, box + 2 * pad), (0, 0, 0, 0))
    ox, oy = (box - w) // 2 + pad, (box - h) // 2 + pad
    m = Image.new("L", out.size, 0)
    m.paste(a, (ox, oy))
    glow = m.filter(ImageFilter.GaussianBlur(7)).point(lambda p: int(p * 0.75))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, GLOW[0]),
                                             Image.new("L", out.size, GLOW[1]),
                                             Image.new("L", out.size, GLOW[2]), glow]))
    edge = m.filter(ImageFilter.MaxFilter(5))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, 25)] * 3 + [edge]))
    out.alpha_composite(body, (ox, oy))
    return out.crop((pad, pad, pad + box, pad + box))


def side_columns(height: int) -> Image.Image:
    """Frame interior of any height: tiled left/right frame columns from the
    template (mirrored every other copy) with a dark interior between."""
    out = Image.new("RGBA", (W, height), INTERIOR + (255,))
    for name, x in (("side_l", 0), ("side_r", W - SIDE_W)):
        src = piece(name)
        y, flip = 0, False
        while y < height:
            p = src.transpose(Image.FLIP_TOP_BOTTOM) if flip else src
            out.alpha_composite(p.crop((0, 0, p.width, min(p.height, height - y))), (x, y))
            y, flip = y + p.height, not flip
    return out


def red_panel(size, chamfer=14, grid=32) -> Image.Image:
    """The template's glowing red grid panel, drawn so it fits any height:
    dark red-black fill (brighter towards the centre), faint red grid,
    bright red border with an outer glow, cut corners."""
    w, h = size
    pad = 12
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    poly = lambda o, c: [(o + c, o), (o + w - 1 - c, o), (o + w - 1, o + c), (o + w - 1, o + h - 1 - c),
                         (o + w - 1 - c, o + h - 1), (o + c, o + h - 1), (o, o + h - 1 - c), (o, o + c)]
    # outer glow
    gm = Image.new("L", out.size, 0)
    ImageDraw.Draw(gm).polygon(poly(pad, chamfer), outline=255, width=6)
    gm = gm.filter(ImageFilter.GaussianBlur(7))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, c) for c in GLOW] + [gm]))
    # fill: vertical dark-red gradient
    fill_l = Image.new("RGBA", (w, h))
    fd = ImageDraw.Draw(fill_l)
    for yy in range(h):
        k = abs(yy / max(h - 1, 1) - 0.5) * 2          # 0 centre -> 1 edges
        fd.line([(0, yy), (w, yy)], fill=(int(46 - 26 * k), int(9 - 4 * k), int(10 - 4 * k), 255))
    # grid
    for gx in range(grid // 2, w, grid):
        fd.line([(gx, 0), (gx, h)], fill=(90, 18, 18, 255), width=1)
    for gy in range(grid // 2, h, grid):
        fd.line([(0, gy), (w, gy)], fill=(90, 18, 18, 255), width=1)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(poly(0, chamfer), fill=255)
    fill_l.putalpha(mask)
    out.alpha_composite(fill_l, (pad, pad))
    # border: bright line + darker inner line
    bd = ImageDraw.Draw(out)
    bd.polygon(poly(pad, chamfer), outline=(214, 46, 38, 255), width=3)
    return out, pad


def body_strip(height: int, panel: bool = True) -> Image.Image:
    """Section body of any height: frame columns + (optionally) the red grid
    panel inset inside them. Content layers are composited on top."""
    out = side_columns(height)
    if panel and height > 40:
        pw, ph = PANEL_X1 - PANEL_X0, height - 16
        p, pad = red_panel((pw, ph))
        out.alpha_composite(p, (PANEL_X0 - pad, 8 - pad))
        # remembered so the animated version can pulse this panel's border
        out.info["panel"] = (PANEL_X0, 8, PANEL_X1, 8 + ph)
    return out


def frame_top(height: int = 56) -> Image.Image:
    """Top frame edge + corner plates (the un-flipped final_end) - starts each
    split announcement image after the first."""
    out = side_columns(height)
    out.alpha_composite(piece("top_band"), (0, 0))
    cl = piece("corner_l")
    out.alpha_composite(cl, (0, 0))
    out.alpha_composite(cl.transpose(Image.FLIP_LEFT_RIGHT), (W - cl.width, 0))
    return out


def final_end(height: int = 56) -> Image.Image:
    """Bottom frame: the template's top frame edge + corner plates, flipped
    upside down (the mock-up has no clean bottom edge of its own)."""
    out = side_columns(height)
    band = piece("top_band").transpose(Image.FLIP_TOP_BOTTOM)
    out.alpha_composite(band, (0, height - band.height))
    cl = piece("corner_l").transpose(Image.FLIP_TOP_BOTTOM)
    out.alpha_composite(cl, (0, height - cl.height))
    out.alpha_composite(cl.transpose(Image.FLIP_LEFT_RIGHT), (W - cl.width, height - cl.height))
    return out


# --------------------------------------------------------------------------
# Section content drawers. Each takes (cfg_section, summary) and returns an
# RGBA layer exactly as tall as its content (transparent background); the
# compositor puts it on a body strip of matching height.
# --------------------------------------------------------------------------
F_BODY = font("SemiBold", 34)
F_BODY_B = font("Bold", 34)
F_LABEL = font("Bold", 25)
F_VALUE = font("SemiBold", 38)
F_SUB = font("Bold", 30)
F_SMALL = font("SemiBold", 29)
LH_BODY = 44
PAD_TOP, PAD_BOT = 26, 34


def layer(height):
    img = Image.new("RGBA", (W, max(int(height), 1)), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def draw_name_id(d, cx, base, name, pid, cell_w):
    """Centred name (white) with the player ID centred on its own line
    underneath, smaller and dimmer: 'Chris5295' / '[974757]'."""
    fv = fit_font(name, "SemiBold", 38, cell_w - 50, 24)
    draw_text(d, (cx, base), name, fv, TEXT, anchor="ms")
    if pid:
        draw_text(d, (cx, base + ID_LINE), f"[{pid}]", font("Medium", 26), (125, 125, 125),
                  anchor="ms")


ID_LINE = 32       # baseline offset of the ID line under a name
ID_EXTRA = 30      # extra cell height for a row that has an ID line


def split_id(val: str):
    """'Chris5295 [974757]' -> ('Chris5295', '974757'); also strips an empty
    ' []' left by a vacant slot. Values without a trailing [id] pass through."""
    import re
    val = re.sub(r"\s*\[\s*\]$", "", val)
    m = re.match(r"^(.*?)\s*\[(\d+)\]$", val)
    return (m.group(1), m.group(2)) if m else (val, "")


def draw_faction_info(sec, s):
    """Grid of label/value cells (2 columns, text centred in each cell) +
    leadership cells in the same grid. A value ending in [id] (e.g. the
    Leader field "{leader} [{leader_id}]") shows the ID on its own dim line
    under the name; rows with an ID line are taller (ID_EXTRA)."""
    fields = [f for f in sec.get("fields", []) if f.get("label")]
    cols = 2
    cell_w, base_h = CW / cols, 92
    vals = [split_id(fill(f.get("value", ""), s["values"])) for f in fields]
    rows = (len(fields) + cols - 1) // cols
    roles = s["roles"]
    role_rows = (len(roles) + cols - 1) // cols

    def row_h(items, r):
        chunk = items[r * cols:(r + 1) * cols]
        return base_h + (ID_EXTRA if any(pid for _, pid in chunk) else 0)

    field_hs = [row_h(vals, r) for r in range(rows)]
    role_items = [(x["name"], x["id"]) for x in roles]
    role_hs = [row_h(role_items, r) for r in range(role_rows)]

    h = PAD_TOP + sum(field_hs)
    if roles:
        h += 24 + 50 + sum(role_hs)
    h += PAD_BOT
    img, d = layer(h)

    def cell_x(c):
        return CX0 + c * cell_w + (22 if c else 0)

    def hairline(c, y_line):
        x = cell_x(c)
        d.line([(x, y_line), (x + cell_w - 44, y_line)], fill=RULE, width=2)

    y = PAD_TOP
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if i >= len(fields):
                break
            cx = cell_x(c) + (cell_w - 44) / 2          # centre of the cell
            draw_text(d, (cx, y + 28), fill(fields[i]["label"], s["values"]).upper(), F_LABEL,
                      RED, track=2, anchor="ms")
            name, pid = vals[i]
            draw_name_id(d, cx, y + 70, name, pid, cell_w)
            if r < rows - 1 or roles:
                hairline(c, y + field_hs[r] - 6)
        y += field_hs[r]

    if roles:
        y += 24
        # "LEADERSHIP" centred between two red rules
        label = sec.get("leadership_title", "LEADERSHIP").upper()
        lw = tracked_len(label, F_SUB, 3)
        draw_text(d, (W / 2, y + 30), label, F_SUB, TITLE, track=3, anchor="ms")
        d.line([(CX0, y + 20), (W / 2 - lw / 2 - 18, y + 20)], fill=RED, width=2)
        d.line([(W / 2 + lw / 2 + 18, y + 20), (CX1 - 10, y + 20)], fill=RED, width=2)
        y += 50
        for rr in range(role_rows):
            for c in range(cols):
                k = rr * cols + c
                if k >= len(roles):
                    break
                r = roles[k]
                # an odd last leader is centred across both columns
                if rr == role_rows - 1 and len(roles) % cols and c == 0:
                    cx = W / 2
                else:
                    cx = cell_x(c) + (cell_w - 44) / 2
                t = r["title"].upper()
                draw_text(d, (cx, y + 28), t, fit_font(t, "Bold", 25, cell_w - 50, 18), RED,
                          track=2, anchor="ms")
                draw_name_id(d, cx, y + 70, r["name"], r["id"], cell_w)
                if rr < role_rows - 1:
                    hairline(c, y + role_hs[rr] - 6)
            y += role_hs[rr]
    return img


def draw_offer(sec, s):
    """Feature tiles (if `tiles` is set) or the plain bullet list (`items`),
    then the optional red button (text editable, "" hides it)."""
    if sec.get("tiles"):
        return draw_offer_tiles(sec, s)
    return draw_offer_bullets(sec, s)


def metal_tile(size, chamfer=12) -> Image.Image:
    """Dark gunmetal plate with a grey bevelled border - the look of the
    template's perk-row bars, drawn so it fits any size."""
    w, h = size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    poly = lambda o, c: [(o + c, o), (w - 1 - o - c, o), (w - 1 - o, o + c), (w - 1 - o, h - 1 - o - c),
                         (w - 1 - o - c, h - 1 - o), (o + c, h - 1 - o), (o, h - 1 - o - c), (o, o + c)]
    fill_l = Image.new("RGBA", (w, h))
    fd = ImageDraw.Draw(fill_l)
    for yy in range(h):
        k = yy / max(h - 1, 1)
        v = int(40 - 18 * k)
        fd.line([(0, yy), (w, yy)], fill=(v, v, v + 1, 235))
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon(poly(0, chamfer), fill=255)
    fill_l.putalpha(Image.composite(fill_l.getchannel("A"), m, m))
    out.alpha_composite(fill_l)
    d = ImageDraw.Draw(out)
    d.polygon(poly(0, chamfer), outline=(18, 18, 18, 255), width=2)
    d.polygon(poly(2, chamfer - 1), outline=(112, 112, 114, 255), width=2)
    d.polygon(poly(5, chamfer - 3), outline=(52, 52, 54, 255), width=1)
    return out


def icon_plate(icon_name: str) -> Image.Image:
    """The template's small red icon plate (perk rows) with a red icon."""
    plate = piece("icon_plate")
    ic = red_icon(icon_name, int(plate.height * 0.86))
    # the plate ends in a right-pointing chevron; its face is the left ~85%
    paste_center(plate, ic, plate.width * 0.45, plate.height / 2)
    return plate


def draw_offer_tiles(sec, s):
    """2-per-row feature tiles: gunmetal plate, red icon plate on the left,
    red headline + grey detail. An odd last tile is centred."""
    tiles = [t for t in sec["tiles"] if t.get("title") or t.get("text")]
    per_row, gap = 2, 24
    tw = int((CW - gap) / per_row)
    th = 132
    frame = metal_tile((tw, th))
    nrows = (len(tiles) + per_row - 1) // per_row
    text_x = 188                            # text starts here inside the tile
    f_det = font("SemiBold", 28)
    btn_text = str(sec.get("button", "")).strip()
    btn = piece("button") if btn_text else None

    h = PAD_TOP + nrows * (th + gap) - gap
    if btn:
        h += 34 + btn.height
    h += PAD_BOT
    img, d = layer(h)

    y = PAD_TOP
    for r in range(nrows):
        row = tiles[r * per_row:(r + 1) * per_row]
        row_w = len(row) * tw + (len(row) - 1) * gap
        x = CX0 + (CW - row_w) / 2
        for t in row:
            img.alpha_composite(frame, (int(x), int(y)))
            plate = icon_plate(t.get("icon", "gi-checked-shield"))
            paste_center(img, plate, x + 20 + plate.width / 2, y + th / 2)
            head = fill(t.get("title", ""), s["values"]).upper()
            hf = fit_font(head, "Bold", 34, tw - text_x - 20, 22)
            # Detail: one line if it fits at >= 25px, else wrap to 2 lines.
            det = fill(t.get("text", ""), s["values"])
            fd = fit_font(det, "SemiBold", 28, tw - text_x - 24, 24)
            if fd.getlength(det) <= tw - text_x - 24:
                lines = [det]
            else:
                fd = f_det
                lines = wrap(det, fd, tw - text_x - 24)[:2]
            block = 40 + len(lines) * 36
            ty = y + (th - block) / 2 + 30
            draw_text(d, (x + text_x, ty), head, hf, RED, track=2)
            for k, ln in enumerate(lines):
                draw_text(d, (x + text_x, ty + 40 + k * 36), ln, fd, (196, 196, 196))
            x += tw + gap
        y += th + gap
    y -= gap

    if btn:
        y += 34
        bx = (W - btn.width) // 2
        img.alpha_composite(btn, (bx, int(y)))
        bt = btn_text.upper()
        bf = fit_font(bt, "Bold", 50, 360, 26)
        draw_text(d, (W / 2, y + btn.height / 2 + bf.size * 0.36), bt, bf, (226, 226, 226),
                  track=2, anchor="ms")
    return img


def draw_offer_bullets(sec, s):
    """Bullet list + optional red button (text editable, "" hides it)."""
    items = [fill(t, s["values"]) for t in sec.get("items", []) if str(t).strip()]
    wrapped = [wrap(t, F_BODY, CW - 60) for t in items]
    btn_text = str(sec.get("button", "")).strip()
    btn = piece("button") if btn_text else None

    h = PAD_TOP + sum(len(w) * LH_BODY + 6 for w in wrapped)
    if btn:
        h += 26 + btn.height
    h += PAD_BOT
    img, d = layer(h)

    y = PAD_TOP
    for lines in wrapped:
        base = y + 32
        bullet(d, CX0 + 6, base)
        for ln in lines:
            draw_text(d, (CX0 + 40, base), ln, F_BODY, TEXT)
            base += LH_BODY
        y += len(lines) * LH_BODY + 6
    if btn:
        y += 26
        bx = (W - btn.width) // 2
        img.alpha_composite(btn, (bx, int(y)))
        # text must sit between the two stars on the plate (~380px gap)
        bt = btn_text.upper()
        bf = fit_font(bt, "Bold", 50, 360, 26)
        draw_text(d, (W / 2, y + btn.height / 2 + bf.size * 0.36), bt, bf, (222, 222, 222),
                  track=2, anchor="ms")
    return img


REQ_SLOT_X = [(108, 405), (495, 800), (862, 1165)]   # each plate + pill in req_body.png (x range, full height)


def _req_row(base_art: Image.Image, n: int):
    """One Requirements row for n (1..3) tiles -> (image, [(cx, pill rect, template slot or None)]).
    3 tiles = the template art as it is. 1-2 tiles (the last row when there are more than 3): the plates are
    copied onto a plain copy of the strip and centred, so no empty plates show."""
    if n >= 3:
        return base_art.copy(), [(REQ_SLOT_CX[k], REQ_PILL[k], k) for k in range(3)]
    row = base_art.copy()
    plain = base_art.crop((476, 0, 486, base_art.height)).resize((1190 - 100, base_art.height))
    row.paste(plain, (100, 0))                          # wipe the three plates (frame edges kept)
    centers = [646] if n == 1 else [452, 840]
    slots = []
    for k, cx in enumerate(centers):
        src = 1 if n == 1 else (0, 2)[k]                # take the middle plate for one, the outer ones for two
        x0, x1 = REQ_SLOT_X[src]
        dx = cx - REQ_SLOT_CX[src]
        row.alpha_composite(base_art.crop((x0, 0, x1, base_art.height)), (x0 + dx, 0))
        px0, py0, px1, py1 = REQ_PILL[src]
        slots.append((cx, (px0 + dx, py0, px1 + dx, py1), None))
    return row, slots


# ---- Requirements plate faces + icons (all drawn, so every tile is crisp and matches) ----------------------
# The plate face in req_body.png is a blurred leftover of the template's icons, so every tile gets a clean face
# drawn over it (dark brushed steel, steel bevel, red inner trim like the template shield) and a crisp steel
# symbol, drawn 4x and scaled down (sharp edges). The template's own three icons are redrawn the same way:
# art2-shield = a heater shield (badge e.g. "15+" printed on it), art2-swords = crossed swords,
# art2-cat = a document with a folded corner and red "CAT". gi-* = any game-icons silhouette.
REQ_FACE_W, REQ_FACE_H, REQ_FACE_CH, REQ_FACE_CY = 152, 122, 12, 69     # face size / chamfer / centre y on the row
REQ_SYMBOL = 84                                                          # symbol box inside the face
_SS = 4                                                                  # supersampling factor


def req_face() -> Image.Image:
    import random
    W_, H_, C_ = REQ_FACE_W, REQ_FACE_H, REQ_FACE_CH
    poly = lambda i: [(C_ + i, i), (W_ - 1 - C_ - i, i), (W_ - 1 - i, C_ + i), (W_ - 1 - i, H_ - 1 - C_ - i),
                      (W_ - 1 - C_ - i, H_ - 1 - i), (C_ + i, H_ - 1 - i), (i, H_ - 1 - C_ - i), (i, C_ + i)]
    im = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    mask = Image.new("L", (W_, H_), 0)
    ImageDraw.Draw(mask).polygon(poly(0), fill=255)
    grad = Image.new("RGB", (W_, H_))
    gd = ImageDraw.Draw(grad)
    for y in range(H_):
        v = int(46 - 28 * y / (H_ - 1))
        gd.line([(0, y), (W_, y)], fill=(v + 2, v - 2, v - 1))
    rnd = random.Random(7)                       # faint brushed-metal streaks (same every time)
    for _ in range(140):
        y, x0, ln = rnd.randrange(H_), rnd.randrange(W_), rnd.randrange(10, 50)
        dv = rnd.choice((-1, 1)) * rnd.randrange(3, 8)
        px = grad.getpixel((x0, y))
        gd.line([(x0, y), (x0 + ln, y)], fill=tuple(max(0, min(255, c + dv)) for c in px))
    im.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(im)
    for inset, col in ((0, (12, 10, 11, 255)), (2, (104, 100, 100, 255)), (7, (120, 30, 27, 255))):
        pts = poly(inset)
        d.line(pts + [pts[0]], fill=col, width=2)  # dark edge / steel bevel / red inner trim
    return im


def _steel(mask: Image.Image, red: Image.Image = None) -> Image.Image:
    """Supersampled symbol mask (white = symbol) -> steel symbol with a crisp dark outline and a soft drop
    shadow, scaled down to 1/_SS. `red` (optional, same size): parts painted template red (e.g. "CAT")."""
    w, h = mask.size
    pad = 6 * _SS
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        v = int(236 - 100 * yy / max(h - 1, 1))
        gd.line([(0, yy), (w, yy)], fill=(v, v, v + 2))
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    full = mask if red is None else ImageChops.lighter(mask, red)
    edge = Image.new("L", out.size, 0)
    edge.paste(full, (pad, pad))
    edge = edge.filter(ImageFilter.MaxFilter(2 * _SS + 1))
    sh = edge.filter(ImageFilter.GaussianBlur(2 * _SS))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, 0)] * 3 + [sh.point(lambda p: int(p * 0.7))]),
                        (2 * _SS, 3 * _SS))
    out.alpha_composite(Image.merge("RGBA", [Image.new("L", out.size, 14)] * 3 + [edge]))
    body = grad.convert("RGBA")
    body.putalpha(mask)
    out.alpha_composite(body, (pad, pad))
    if red is not None:
        rb = Image.new("RGBA", (w, h), (200, 44, 38, 255))
        rb.putalpha(red)
        out.alpha_composite(rb, (pad, pad))
    return out.resize((out.width // _SS, out.height // _SS), Image.LANCZOS)


def req_symbol(name: str, box: int = REQ_SYMBOL) -> Image.Image:
    """The symbol for a Requirements tile (see the note above req_face)."""
    S = box * _SS
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    if name == "art2-shield":
        # heater shield: slightly arched top, straight sides, then rounded (quarter-ellipse) curves to the point
        import math
        l, r_, cx = int(S * 0.13), int(S * 0.87), S // 2
        top, side, tip = int(S * 0.05), int(S * 0.46), int(S * 0.97)
        pts = [(l, top + int(S * 0.05))]
        for k in range(1, 20):                   # gentle arch across the top
            t = k / 20
            pts.append((int(l + (r_ - l) * t), int(top + int(S * 0.05) - S * 0.05 * math.sin(math.pi * t))))
        pts += [(r_, top + int(S * 0.05)), (r_, side)]
        for k in range(1, 25):                   # right side curving in to the point
            a = math.pi / 2 * k / 24
            pts.append((int(cx + (r_ - cx) * math.cos(a)), int(side + (tip - side) * math.sin(a))))
        for k in range(23, 0, -1):               # ...and the left side back up
            a = math.pi / 2 * k / 24
            pts.append((int(cx - (cx - l) * math.cos(a)), int(side + (tip - side) * math.sin(a))))
        pts.append((l, side))
        d.polygon(pts, fill=255)
        return _steel(m)
    if name == "art2-cat":
        # document: page with a folded top-right corner, text lines, red "CAT"
        l, t, r_, b, f = int(S * 0.16), int(S * 0.04), int(S * 0.84), int(S * 0.96), int(S * 0.2)
        lw = max(4, S // 22)
        page = [(l, t), (r_ - f, t), (r_, t + f), (r_, b), (l, b)]
        d.line(page + [page[0]], fill=255, width=lw, joint="curve")
        d.line([(r_ - f, t), (r_ - f, t + f), (r_, t + f)], fill=255, width=lw, joint="curve")
        for k, (x0, x1) in enumerate(((0.28, 0.58), (0.28, 0.72), (0.28, 0.72), (0.28, 0.66))):
            y = int(S * (0.24 + k * 0.1))
            d.line([(int(S * x0), y), (int(S * x1), y)], fill=255, width=max(3, S // 30))
        red = Image.new("L", (S, S), 0)
        rd = ImageDraw.Draw(red)
        ft = font("Bold", int(S * 0.26))
        tw = ft.getlength("CAT")
        rd.text(((S - tw) / 2, int(S * 0.62)), "CAT", font=ft, fill=255)
        return _steel(m, red)
    if name == "art2-swords":
        name = "gi-crossed-swords"
    path = ICON_DIR / f"{name}.png"
    if not name.startswith(("gi-", "glyph-")) or not path.exists():
        if path.exists():                        # other lifted art: as-is, fitted
            src = Image.open(path).convert("RGBA")
            src.thumbnail((box, box), Image.LANCZOS)
            return src
        path = ICON_DIR / "gi-checked-shield.png"
    src = Image.open(path).convert("RGBA").resize((S, S), Image.LANCZOS)
    return _steel(src.getchannel("A"))


def draw_requirements(sec, s, base: Image.Image):
    """Requirements: tiles 3 per row on the req_body art (icon + optional badge + pill label). Any number of
    tiles - the section grows a row for every 3 (a last row of 1-2 is centred)."""
    tiles = sec.get("tiles", []) or []
    rows = []
    for r0 in range(0, max(1, len(tiles)), 3):
        chunk = tiles[r0:r0 + 3]
        row, slots = _req_row(base, len(chunk) or 3)
        d = ImageDraw.Draw(row)
        for tile, (cx, pill, slot) in zip(chunk, slots):
            name = tile.get("icon", "art2-shield")
            face = req_face()
            sym = req_symbol(name)
            face.alpha_composite(sym, ((face.width - sym.width) // 2, (face.height - sym.height) // 2))
            paste_center(row, face, cx, REQ_FACE_CY)
            badge = str(tile.get("badge", "")).strip()
            if badge:  # e.g. "15+" printed on the shield face
                bf = fit_font(badge, "Bold", 40, 60, 20)
                draw_centered(d, (cx, REQ_FACE_CY - 2), badge, bf, (28, 28, 28), shadow=False)
            label = fill(tile.get("label", ""), s["values"])
            x0, y0, x1, y1 = pill
            lf = fit_font(label, "SemiBold", 32, (x1 - x0) - 24, 18)
            draw_centered(d, ((x0 + x1) / 2, (y0 + y1) / 2), label, lf, TEXT)
        rows.append(row)
    if len(rows) == 1:
        return rows[0]
    out = Image.new("RGBA", (base.width, sum(r.height for r in rows)), (0, 0, 0, 0))
    y = 0
    for r in rows:
        out.alpha_composite(r, (0, y))
        y += r.height
    return out


def draw_centered(d, center, text, fnt, fill_c, shadow=True):
    """Centre text on a point by its real glyph box (not the font's line
    box), so it sits visually in the middle of plates/pills."""
    cx, cy = center
    l, t, r, b = fnt.getbbox(text, anchor="ls")
    x = cx - (l + r) / 2
    y = cy - (t + b) / 2          # baseline that puts the glyph box centre at cy
    if shadow:
        d.text((x + 2, y + 3), text, font=fnt, fill=SHADOW, anchor="ls")
    d.text((x, y), text, font=fnt, fill=fill_c, anchor="ls")


ROMAN_RE = None


def upgrade_title(u) -> str:
    """'Strength training IX'. The v2 API already ends most upgrade names with
    the roman level, so only append it when the name doesn't have it."""
    import re
    global ROMAN_RE
    ROMAN_RE = ROMAN_RE or re.compile(r"\s[IVXLCDM]+$")
    name = u["name"]
    if ROMAN_RE.search(name) or not u["level"]:
        return name
    return f"{name} {roman(u['level'])}"


def hex_tile(icon_name: str) -> Image.Image:
    """Perk tile: a template hex (hex_* has its icon baked in) or the empty
    hex with a red game-icon drawn in it."""
    if icon_name.startswith("hex_") and (PIECES / f"{icon_name}.png").exists():
        return piece(icon_name)
    tile = piece("hex_empty")
    ic = red_icon(icon_name, int(tile.width * 0.56))
    paste_center(tile, ic, tile.width / 2, tile.height / 2)
    return tile


def draw_perks(sec, s):
    """Hex tiles (branch name above each), then the full 'Name LEVEL: effect'
    list, each branch headed by the template's red icon plate + chevron."""
    up = s["upgrades"]
    branches = up["branches"]
    titles = {k.lower(): v for k, v in sec.get("branch_titles", {}).items()}
    icons = dict(BRANCH_ICONS)
    icons.update({k.lower(): v for k, v in sec.get("branch_icons", {}).items()})

    hex_w, hex_h = piece("hex_empty").size
    per_row, gap, label_h = 5, 46, 44
    nrows = (len(branches) + per_row - 1) // per_row
    chev = piece("chevron")

    effects = []
    if sec.get("show_effects", True):
        for b in branches:
            lines = []
            for u in b["upgrades"]:
                head = upgrade_title(u)
                txt = f"{head}: {u['ability']}" if u["ability"] else head
                lines.append(wrap(txt, F_SMALL, CW - 60))
            effects.append((b, titles.get(b["name"].lower(), b["name"]), lines))

    h = PAD_TOP
    h += nrows * (label_h + hex_h + 18) if branches else 50
    if effects:
        h += 16 + sum(chev.height + 10 + sum(len(l) * 38 + 4 for l in ls) + 16 for _, _, ls in effects)
    h += PAD_BOT
    img, d = layer(h)

    y = PAD_TOP
    if not branches:
        draw_text(d, (W / 2, y + 36), f"No {up['tree']} upgrades", F_BODY, SUB, anchor="ms")
        y += 50
    for r in range(nrows):
        row = branches[r * per_row:(r + 1) * per_row]
        cell = max(hex_w + gap, 210)
        row_w = len(row) * cell
        x = CX0 + (CW - row_w) / 2
        for b in row:
            name = titles.get(b["name"].lower(), b["name"]).upper()
            nf = fit_font(name, "Bold", 30, cell - 12, 18)
            draw_text(d, (x + cell / 2, y + 32), name, nf, RED, track=2, anchor="ms")
            tile = hex_tile(icons.get(b["name"].lower(), "gi-checked-shield"))
            img.alpha_composite(tile, (int(x + (cell - hex_w) / 2), int(y + label_h)))
            x += cell
        y += label_h + hex_h + 18

    if effects:
        y += 16
        for b, name, groups in effects:
            # heading (red icon plate + chevron name plate), centred
            ic_name = icons.get(b["name"].lower(), "gi-checked-shield")
            if ic_name.startswith("hex_"):     # hex art -> use the matching game-icon
                ic_name = {"hex_flask": "gi-fizzing-flask", "hex_map": "gi-commercial-airplane",
                           "hex_lock": "gi-handcuffs"}.get(ic_name, "gi-checked-shield")
            plate = icon_plate(ic_name)
            c = chev.copy()
            cf = fit_font(name.upper(), "Bold", 32, c.width - 70, 20)
            draw_text(ImageDraw.Draw(c), (40, c.height / 2 + cf.size * 0.35), name.upper(), cf,
                      (222, 222, 222), track=2)
            hw = CHEV_OFFSET + c.width
            hx = W / 2 - hw / 2
            img.alpha_composite(plate, (int(hx), int(y)))
            img.alpha_composite(c, (int(hx + CHEV_OFFSET), int(y)))
            y += chev.height + 10
            # effect lines, centred; small red bullet before each upgrade
            for lines in groups:
                base = y + 28
                for k, ln in enumerate(lines):
                    lw = F_SMALL.getlength(ln)
                    lx = W / 2 - lw / 2
                    if k == 0:
                        bullet(d, lx - 22, base, size=11)
                    draw_text(d, (lx, base), ln, F_SMALL, TEXT)
                    base += 38
                y += len(lines) * 38 + 4
            y += 16
    return img


# Recent Ranked Wars (announcement): (title, nickname, list key, stat, decimals).
# Titles/nicknames can be overridden in config announcements.ranked_wars:
# <key>_title / <key>_nick, e.g. "top_hits_nick": "Soldier".
RW_COLUMNS = [("Hits", "Soldier", "top_hits", "attacks", False),
              ("Respect", "General", "most_respect", "score", False),
              ("Biggest Hit", "Sniper", "top_best", "best", True),
              ("Respect / Hit", "Heavyweight", "top_rph", "rph", True),
              ("Hosps", "Assassin", "top_hosps", "hosps", False)]


def draw_ranked_wars(sec, s, show_np: bool = False):
    """One block per recent war:
         VICTORY  vs Opponent Name                    4,325 - 2,010
         Oct 12, 2026
         TOP HITS      1. Name 112   2. Name 87     3. Name 66
         MOST RESPECT  1. Name 998   2. Name 697    3. Name 675
    separated by hairlines. Counts: hits = attacks in the war; respect =
    the member's war score (respect earned), rounded."""
    # show_np (announcement only): adds a NON PARTICIPANTS row per war -
    # every member in the war report with 0 attacks, wrapped over as many
    # lines as needed.
    wars = s["wars"]
    label_w = 250                       # "MOST RESPECT" column
    col_w = (CW - label_w) / 3
    f_np = font("SemiBold", 27)
    np_lines = []
    for w in wars:
        if show_np:
            names = ", ".join(w.get("non_participants", [])) or sec.get("np_none", "None")
            np_lines.append(wrap(names, f_np, CW - label_w - 10))
        else:
            np_lines.append([])
    # announcement (show_np): 4 columns - Hits / Respect / Assists / Hosps - top 5 each
    cols4 = show_np
    base_rows = (98 + 44 + 24 + 5 * 38 + 20 + 44) if cols4 else 236
    heights = [base_rows + (len(l) * 38 + 14 if show_np else 0) for l in np_lines]
    h = PAD_TOP + (sum(heights) if wars else 60) + PAD_BOT - 10
    img, d = layer(h)
    y = PAD_TOP
    if not wars:
        draw_text(d, (W / 2, y + 40), "No ranked wars yet", F_BODY, SUB, anchor="ms")
        return img
    f_res = font("Bold", 30)
    f_date = font("Medium", 26)
    f_lab = font("Bold", 25)
    f_cnt = font("Bold", 29)
    f_num = font("Bold", 29)
    rows = [(sec.get("hits_title", "Top Hits"), "top_hits", "attacks"),
            (sec.get("respect_title", "Most Respect"), "most_respect", "score")]
    for i, w in enumerate(wars):
        base = y + 40
        res = "VICTORY" if w["won"] else "DEFEAT"
        rc = RED if w["won"] else (130, 130, 130)
        # result tag: outlined plate
        rw_ = tracked_len(res, f_res, 2) + 28
        d.rounded_rectangle([CX0, base - 32, CX0 + rw_, base + 8], radius=6, outline=rc, width=3)
        draw_text(d, (CX0 + 14, base), res, f_res, rc, track=2)
        score = f"{fmt_int(w['our_score'])} - {fmt_int(w['their_score'])}"
        sf = font("Bold", 38)
        draw_text(d, (CX1 - sf.getlength(score) - 6, base + 2), score, sf, TEXT)
        opp = f"vs {w['opponent']}"
        of = fit_font(opp, "Bold", 38, CX1 - CX0 - rw_ - sf.getlength(score) - 60, 24)
        draw_text(d, (CX0 + rw_ + 22, base + 2), opp, of, TEXT)
        when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y") if w["end"] else ""
        # detail line: date · duration · rank change · participation
        segs = [(when, (125, 125, 125))]
        if w.get("start") and w.get("end") and w["end"] > w["start"]:
            secs = w["end"] - w["start"]
            dd, hh, mm = secs // 86400, secs % 86400 // 3600, secs % 3600 // 60
            dur = f"{dd}d {hh}h" if dd else (f"{hh}h {mm}m" if hh else f"{mm}m")
            segs.append((dur, (150, 150, 152)))
        if w.get("rank_before") and w.get("rank_after"):
            rb_, ra_ = w["rank_before"], w["rank_after"]
            segs.append((f"{rb_} » {ra_}" if rb_ != ra_ else f"{ra_} (no change)", (150, 150, 152)))
        if w.get("present"):
            pct = round(100 * w["hit"] / w["present"])
            segs.append((f"{w['hit']}/{w['present']} participated ({pct}%)",
                         RED if pct < 100 else (150, 150, 152)))
        dx = CX0
        for k, (txt, col) in enumerate(segs):
            if k:
                draw_text(d, (dx, base + 42), "  ·  ", f_date, (90, 90, 92))
                dx += f_date.getlength("  ·  ")
            draw_text(d, (dx, base + 42), txt, f_date, col)
            dx += f_date.getlength(txt)
        rb = base + 98
        if cols4:
            # five columns, each with a nickname under its title
            ncol = len(RW_COLUMNS)
            cw4 = (CW - (ncol - 1) * 16) / ncol
            f_h, f_nk, f_n, f_v = font("Bold", 21), font("Medium", 18), font("SemiBold", 23), font("Bold", 23)
            for c_, (title, nick, key, stat, dec) in enumerate(RW_COLUMNS):
                title = sec.get(f"{key}_title", title)
                nick = sec.get(f"{key}_nick", nick)
                x0 = CX0 + c_ * (cw4 + 16)
                d.rounded_rectangle([x0, rb - 30, x0 + cw4, rb + 40 + 5 * 38 + 6], radius=8,
                                    fill=(20, 8, 9, 200), outline=RULE, width=2)
                draw_text(d, (x0 + cw4 / 2, rb), title.upper(), fit_font(title.upper(), "Bold", 21, cw4 - 12, 14),
                          RED, track=1, anchor="ms")
                draw_text(d, (x0 + cw4 / 2, rb + 24), f'"{nick}"', f_nk, (196, 160, 90), shadow=False, anchor="ms")
                d.line([(x0 + 10, rb + 34), (x0 + cw4 - 10, rb + 34)], fill=RULE, width=1)
                lst = w.get(key, [])[:5]
                if not lst:
                    msg = "-" if key in ("top_hits", "most_respect", "top_rph") or w.get("has_attack_log") else "No data"
                    draw_text(d, (x0 + cw4 / 2, rb + 74), msg, f_n, SUB, anchor="ms")
                for j, m in enumerate(lst):
                    yy = rb + 70 + j * 38
                    num = f"{j + 1}."
                    draw_text(d, (x0 + 8, yy), num, f_n, (150, 150, 150))
                    v_ = m[stat]
                    cnt = f"{v_:.2f}" if dec else fmt_int(int(round(v_)))
                    vw = f_v.getlength(cnt)
                    nx = x0 + 8 + f_n.getlength("5.") + 6
                    draw_text(d, (nx, yy), m["name"],
                              fit_font(m["name"], "SemiBold", 23, x0 + cw4 - 10 - vw - 6 - nx, 12), TEXT)
                    draw_text(d, (x0 + cw4 - 10 - vw, yy), cnt, f_v, RED)
            rb += 24 + 44 + 5 * 38 + 20
            rows_iter = []
        else:
            rows_iter = rows
        # two leaderboard rows (description banner)
        for title, key, stat in rows_iter:
            draw_text(d, (CX0, rb), title.upper(), f_lab, RED, track=2)
            for j, m in enumerate(w.get(key, [])[:3]):
                x = CX0 + label_w + j * col_w
                num = f"{j + 1}."
                draw_text(d, (x, rb), num, f_num, (150, 150, 150))
                x += f_num.getlength(num) + 8
                cnt = fmt_int(int(round(m[stat])))
                cw_ = f_cnt.getlength(cnt)
                nf = fit_font(m["name"], "SemiBold", 29, col_w - (f_num.getlength(num) + 8) - cw_ - 34, 18)
                draw_text(d, (x, rb), m["name"], nf, TEXT)
                draw_text(d, (x + nf.getlength(m["name"]) + 10, rb), cnt, f_cnt, RED)
            rb += 48
        if show_np:
            draw_text(d, (CX0, rb), sec.get("np_title", "Non Participants").upper(), f_lab,
                      (150, 150, 152), track=2)
            for k, ln in enumerate(np_lines[i]):
                draw_text(d, (CX0 + label_w, rb + k * 38), ln, f_np, SUB)
        block_h = heights[i]
        if i < len(wars) - 1:
            d.line([(CX0, y + block_h - 16), (CX1, y + block_h - 16)], fill=RULE, width=2)
        y += block_h
    return img


def tier_label(t: int) -> str:
    if t >= 1000:
        v = t / 1000
        return (f"{v:.1f}".rstrip("0").rstrip(".")) + "K"
    return str(t)


def draw_achievements(sec, s):
    """Faction Achievements. Currently one block: CHAINS - a tile per chain
    bonus tier (5 per row): tier in red + date first reached; unreached
    tiers greyed out as goals."""
    rows = s.get("chain_ach", [])
    per_row, gap = 5, 18
    tw = int((CW - (per_row - 1) * gap) / per_row)
    th = 112
    nrows = (len(rows) + per_row - 1) // per_row
    sub_h = 50
    h = PAD_TOP + sub_h + nrows * (th + gap) - gap + PAD_BOT
    img, d = layer(h)
    y = PAD_TOP
    # sub-heading centred between two red rules (same as LEADERSHIP)
    label = sec.get("chains_title", "Chains").upper()
    lw = tracked_len(label, F_SUB, 3)
    draw_text(d, (W / 2, y + 30), label, F_SUB, TITLE, track=3, anchor="ms")
    d.line([(CX0, y + 20), (W / 2 - lw / 2 - 18, y + 20)], fill=RED, width=2)
    d.line([(W / 2 + lw / 2 + 18, y + 20), (CX1 - 10, y + 20)], fill=RED, width=2)
    y += sub_h
    tile = metal_tile((tw, th))
    dim = tile.copy()
    dim.putalpha(dim.getchannel("A").point(lambda v: int(v * 0.55)))
    f_tier = font("Bold", 44)
    f_date = font("SemiBold", 24)
    for r in range(nrows):
        row = rows[r * per_row:(r + 1) * per_row]
        row_w = len(row) * tw + (len(row) - 1) * gap
        x = CX0 + (CW - row_w) / 2
        for c in row:
            done = c["date"] is not None
            img.alpha_composite(tile if done else dim, (int(x), int(y)))
            cx = x + tw / 2
            label = tier_label(c["tier"])
            if done and c.get("count"):
                # "1K x24": tier in red + smaller grey count, centred together
                cnt = f" x{c['count']:,}"
                f_cnt = font("SemiBold", 28)
                lw = tracked_len(label, f_tier, 1) + f_cnt.getlength(cnt)
                lx = cx - lw / 2
                draw_text(d, (lx, y + 56), label, f_tier, RED, track=1)
                draw_text(d, (lx + tracked_len(label, f_tier, 1), y + 56), cnt, f_cnt,
                          (150, 150, 152))
            else:
                draw_text(d, (cx, y + 56), label, f_tier,
                          RED if done else (88, 88, 90), track=1, anchor="ms")
            if done:
                when = datetime.fromtimestamp(c["date"], timezone.utc).strftime("%b %d, %Y")
                draw_text(d, (cx, y + 92), when, f_date, (200, 200, 200), anchor="ms")
            else:
                draw_text(d, (cx, y + 92), sec.get("goal_text", "GOAL"), f_date, (92, 92, 94),
                          track=2, anchor="ms")
            x += tw + gap
        y += th + gap
    return img


def draw_war_record(d, rec, min_x):
    """Small all-time record, right-aligned in the title bar:
         24 - Won   6 - Lost   Wins: 80%
    numbers in red, words in steel grey. Shrinks to fit between the title
    (min_x) and the bar's right end."""
    parts = [(str(rec["won"]), " - Won"), (str(rec["lost"]), " - Lost"), ("Wins: ", f"{rec['pct']}%")]
    right = 1210
    for size in range(32, 19, -1):
        fn, fw = font("Bold", size), font("SemiBold", size)
        gap = size * 1.1
        widths = [fn.getlength(a) + fw.getlength(b) if i < 2 else fw.getlength(a) + fn.getlength(b)
                  for i, (a, b) in enumerate(parts)]
        total = sum(widths) + gap * (len(parts) - 1)
        if right - total >= min_x:
            break
    x = right - total
    base = 72
    # dark backing so the record stays readable over the bar's lightning
    d.rounded_rectangle([x - 16, base - size - 6, right + 14, base + 12], radius=8,
                        fill=(8, 8, 9, 215))
    for i, (a, b) in enumerate(parts):
        if i < 2:   # "24" red + " - Won" grey
            draw_text(d, (x, base), a, fn, RED)
            draw_text(d, (x + fn.getlength(a), base), b, fw, TITLE)
        else:       # "Wins: " grey + "80%" red
            draw_text(d, (x, base), a, fw, TITLE)
            draw_text(d, (x + fw.getlength(a), base), b, fn, RED)
        x += widths[i] + gap


def render(summary: dict, cfg: dict, out_path: Path):
    """Draw the banner (render_image), then save it (+ the animated version)."""
    out, panels = render_image(summary, cfg)
    if cfg.get("animation", {}).get("enabled", True):
        write_animated(out, panels, cfg.get("animation", {}), out_path)
    # Same image in three formats (see SAVE_OPTS). out_path is the folder.
    for name in OUTPUTS:
        img = out
        if name.endswith(".jpg"):  # JPEG has no alpha: flatten on dark grey
            img = Image.new("RGBA", out.size, JPG_BG + (255,))
            img.alpha_composite(out)
            img = img.convert("RGB")
        img.save(out_path / name, **SAVE_OPTS[Path(name).suffix])
    return out.size


def render_image(summary: dict, cfg: dict):
    """Stack header + sections and draw everything -> (image, panel rects). Nothing is saved here, so the
    leaders' Site Panels page can run this same code in the browser (Pyodide) for its live preview."""
    # leadership slot titles come from cfg at DRAW time (people stay as read from Torn)
    fi_ = cfg.get("faction_info", {})
    if summary.get("roles") and any("position" in r for r in summary["roles"]):
        roles_ = [dict(r, title=slot_title(fi_, k, r.get("position", r.get("title", "")))) for k, r in enumerate(summary["roles"])]
        vals_ = dict(summary["values"], **{f"leadership{k + 1}_title": r["title"] for k, r in enumerate(roles_)})
        summary = dict(summary, roles=roles_, values=vals_)
    v = summary["values"]
    order = cfg.get("section_order", ["faction_info", "what_we_offer", "requirements", "perks"])
    sections = [k for k in order if cfg.get(k, {}).get("enabled", True)]

    blocks = []  # list of RGBA images stacked top->bottom
    header = piece("header")
    hd = ImageDraw.Draw(header)
    # Respect value inside the "RESPECT LEVEL" bar (label is part of the art).
    rt = fill(cfg.get("header", {}).get("respect_text", "{respect}"), v)
    rf = fit_font(rt, "Bold", 38, RESPECT_MAX_W, 22)
    draw_text(hd, RESPECT_XY, rt, rf, (226, 226, 226), anchor="ms")
    blocks.append(header)

    drawers = {"faction_info": draw_faction_info, "what_we_offer": draw_offer,
               "perks": draw_perks, "ranked_wars": draw_ranked_wars,
               "achievements": draw_achievements}
    for i, key in enumerate(sections):
        sec = cfg.get(key, {})
        title = str(sec.get("title", key)).upper()
        if i == 0:
            # The first section's title bar is part of header.png (the heart
            # emblem overlaps it in the art), so its title goes there.
            draw_text(hd, HDR_TITLE_XY, title, font("Bold", 52), TITLE, track=3)
        else:
            top = piece("section_top")
            td = ImageDraw.Draw(top)
            draw_text(td, (136, 76), title, font("Bold", 52), TITLE, track=3)
            if key == "ranked_wars" and summary.get("war_record") and sec.get("show_record", True):
                draw_war_record(td, summary["war_record"],
                                136 + tracked_len(title, font("Bold", 52), 3) + 40)
            blocks.append(top)
        if key == "requirements":
            blocks.append(draw_requirements(sec, summary, piece("req_body")))
        else:
            content = drawers[key](sec, summary)
            body = body_strip(content.height + 12)
            body.alpha_composite(content)
            blocks.append(body)
        if i == len(sections) - 1:
            # Footer ("Last updated ...") on a short body strip just above
            # the bottom frame, right-aligned, small and dim.
            ft = cfg.get("footer", {})
            if ft.get("enabled", True):
                strip = body_strip(50, panel=False)
                txt = fill(ft.get("text", "Last updated: {updated}"), dict(v, updated=stamp_for("banner")))
                fd = ImageDraw.Draw(strip)
                ff = font("Medium", 26)
                draw_text(fd, (CX1 - ff.getlength(txt), 34), txt, ff, (125, 125, 125))
                blocks.append(strip)
            blocks.append(final_end())
        else:
            blocks.append(side_columns(14))   # gap before the next title bar

    H = sum(b.height for b in blocks)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    y = 0
    panels = []                      # panel rects in final-image coords
    for b in blocks:
        out.alpha_composite(b, (0, y))
        if "panel" in b.info:
            x0, y0, x1, y1 = b.info["panel"]
            panels.append((x0 + OUTER_PAD, y0 + y + OUTER_PAD, x1 + OUTER_PAD, y1 + y + OUTER_PAD))
        y += b.height
    out = cut_outside_frame(out)
    out = pad_transparent(out, OUTER_PAD)
    return out, panels


# --------------------------------------------------------------------------
# Animated version: banner-animated.webp
# --------------------------------------------------------------------------
# The finished static banner is the base. Each frame adds a red "screen"
# light over the two hearts in the header (the chained heart and the
# anatomical heart emblem) and, optionally, a glow along every red panel
# border, both driven by a lub-dub heartbeat envelope. Animated WebP keeps
# transparency and only stores what changes between frames, so this costs
# roughly +0.1 MB (hearts only) to +0.4 MB (with border pulse) over the
# static file. GIF is not used: 256 colours would band the red glows and
# the file would be many MB at this size.
HEART_SPOTS = [  # (cx, cy, radius, beat phase) in header.png 2x coords
    (290, 228, 210, 0.10),    # chained heart
    (1112, 482, 95, 0.60),    # anatomical heart emblem - beats half a loop later
]
PANEL_CHAMFER = 14


def heartbeat(t: float, phase: float = 0.0) -> float:
    """0..1 'lub-dub': strong beat at `phase`, softer second beat just after."""
    def pulse(c, w):
        d = abs((t - c) % 1.0)
        d = min(d, 1 - d)
        return math.exp(-(d / w) ** 2)
    return min(1.0, pulse(phase, 0.06) + 0.6 * pulse(phase + 0.15, 0.06))


def panel_path(rect, step=4):
    """Points every `step` px around a panel's cut-corner border, clockwise
    from the top-left corner."""
    x0, y0, x1, y1 = rect
    x1, y1 = x1 - 1, y1 - 1
    c = PANEL_CHAMFER
    corners = [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1),
               (x0 + c, y1), (x0, y1 - c), (x0, y0 + c), (x0 + c, y0)]
    pts = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        pts += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n)]
    return pts


def ecg_offset(u: float) -> float:
    """ECG complex over u in [0,1] (same shape as the small banner's trace):
    small P wave, sharp QRS spike, T wave. Positive = towards the panel
    interior. Outside [0,1] the line is flat."""
    if u < 0 or u > 1:
        return 0.0
    def bump(c, w, a):
        return a * math.exp(-((u - c) / w) ** 2)
    return (bump(0.15, 0.05, 5) + bump(0.40, 0.018, -6) + bump(0.46, 0.022, 30)
            + bump(0.52, 0.02, -10) + bump(0.78, 0.07, 8))


def pulse_route(panels: list, heart_xy) -> list:
    """One CLOSED route for the heartbeat pulse, as points every 2x px:

        chained heart tip -> straight down to the first panel's top edge
        -> right along that top edge -> down the RIGHT edges of every panel
           (crossing the gaps / title bars between them)
        -> along the last panel's bottom edge
        -> back up the LEFT edges of every panel
        -> right along the first panel's top edge -> up into the heart tip.

    It starts and ends at the heart, so the pulse loops seamlessly: the heart
    beats, sends the pulse round the banner, the pulse returns and the heart
    beats again. Corners follow the panels' cut (chamfered) corners."""
    c = PANEL_CHAMFER
    hx, hy = heart_xy
    P = [(x0, y0, x1 - 1, y1 - 1) for x0, y0, x1, y1 in panels]
    top = P[0]
    bot = P[-1]
    pts = [(hx, hy), (hx, top[1]), (top[2] - c, top[1]), (top[2], top[1] + c)]
    for i, (x0, y0, x1, y1) in enumerate(P):          # down the right side
        if i:
            pts.append((x1, y0 + c))
        pts.append((x1, y1 - c))
    pts += [(bot[2] - c, bot[3]), (bot[0] + c, bot[3]), (bot[0], bot[3] - c)]
    for i, (x0, y0, x1, y1) in enumerate(reversed(P)):  # up the left side
        if i:
            pts.append((x0, y1 - c))
        pts.append((x0, y0 + c))
    pts += [(top[0] + c, top[1]), (hx, top[1]), (hx, hy)]
    out = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / 2))
        out += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n)]
    return out


def write_animated(base: Image.Image, panels: list, acfg: dict, out_path: Path):
    """Animated WebP: the chained heart beats and sends ONE heartbeat pulse
    round the banner along pulse_route(); the pulse flows down the right-hand
    panel borders, along the bottom, back up the left-hand borders and into
    the heart, which beats again as it arrives - a seamless loop.

    The pulse: white-hot head, an ECG blip (P-QRS-T) just behind it bending
    inward, and a long red tail that fades out. Speed is constant along the
    route, so it glides smoothly through corners and gaps. The heart emblem
    in the respect plate gives a soft beat of its own half-way through.
    Each frame only changes the strip around the pulse (and a heart), which
    animated WebP stores as a small rectangle - keeps the file ~1 MB."""
    w, h = base.size
    alpha = base.getchannel("A")
    rgb = base.convert("RGB")
    RED_LIGHT, HOT_LIGHT = (255, 46, 34), (255, 190, 170)
    frame_ms = int(acfg.get("frame_ms", 40))
    speed = float(acfg.get("pulse_px_per_frame", 150))    # 2x px per frame
    tail_px = int(acfg.get("tail_px", 1100))
    heart_glow = float(acfg.get("heart_glow", 0.28))
    ecg_len = 220

    def light(img, colour):
        return ImageChops.screen(img, Image.new("RGB", img.size, colour))

    # heart glow masks (chained heart = HEART_SPOTS[0], emblem = [1])
    hearts = []
    for cx, cy, r, _ in HEART_SPOTS:
        cx, cy = cx + OUTER_PAD, cy + OUTER_PAD
        R = int(r * 1.7)
        box = (max(0, cx - R), max(0, cy - R), min(w, cx + R), min(h, cy + R))
        m = Image.new("L", (box[2] - box[0], box[3] - box[1]), 0)
        ImageDraw.Draw(m).ellipse([cx - r - box[0], cy - r - box[1], cx + r - box[0], cy + r - box[1]], fill=255)
        hearts.append((box, m.filter(ImageFilter.GaussianBlur(int(r * 0.45)))))

    hx, hy, hr, _ = HEART_SPOTS[0]
    route = pulse_route(panels, (hx + OUTER_PAD, hy + OUTER_PAD + int(hr * 0.78))) \
        if panels and acfg.get("border_pulse", True) else []
    n = len(route)
    # inward normal (route runs clockwise, so "left of travel" is inward)
    normals = []
    for k in range(n):
        ax, ay = route[k - 1]
        bx, by = route[(k + 1) % n]
        tx, ty = bx - ax, by - ay
        ln = math.hypot(tx, ty) or 1
        normals.append((-ty / ln, tx / ln))

    # with the border pulse the loop length follows the route; hearts-only
    # uses hearts_loop_ms (default 2 s = a calm ~30 bpm double beat)
    frames_n = max(12, int(round(n * 2 / speed))) if n else \
        max(12, int(acfg.get("hearts_loop_ms", 2000)) // frame_ms)
    step_pts = n / frames_n if n else 0
    tl = tail_px // 2
    frames = []
    for i in range(frames_n):
        t = i / frames_n
        fr = rgb.copy()
        # chained heart: beat as the pulse leaves (t=0) - lub-dub
        for (box, m), e in ((hearts[0], heartbeat(t, 0.0)), (hearts[1], heartbeat(t, 0.5) * 0.7)):
            if e < 0.02:
                continue
            reg = fr.crop(box)
            k = heart_glow * e
            fr.paste(Image.composite(light(reg, RED_LIGHT), reg, m.point(lambda v, k=k: int(v * k))), box[:2])
        if n:
            head = int(i * step_pts)
            trace = []
            for j in range(tl):
                idx = (head - j) % n
                px, py = route[idx]
                nx, ny = normals[idx]
                off = ecg_offset(1 - j * 2 / ecg_len)
                trace.append((px + nx * off, py + ny * off, j))
            xs = [p[0] for p in trace]
            ys = [p[1] for p in trace]
            pad = 30
            box = (max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad),
                   min(w, int(max(xs)) + pad), min(h, int(max(ys)) + pad))
            line = Image.new("L", (box[2] - box[0], box[3] - box[1]), 0)
            core = Image.new("L", line.size, 0)
            ld, cd = ImageDraw.Draw(line), ImageDraw.Draw(core)
            ox, oy = box[0], box[1]
            for (x0, y0, j), (x1, y1, _) in zip(trace, trace[1:]):
                f = (1 - j / tl) ** 1.6
                ld.line([(x0 - ox, y0 - oy), (x1 - ox, y1 - oy)], fill=int(255 * f), width=6)
                if j * 2 < ecg_len:
                    cd.line([(x0 - ox, y0 - oy), (x1 - ox, y1 - oy)],
                            fill=int(255 * (1 - j * 2 / ecg_len * 0.6)), width=3)
            reg = fr.crop(box)
            reg = Image.composite(light(reg, RED_LIGHT), reg, line.filter(ImageFilter.GaussianBlur(4)))
            reg = Image.composite(light(reg, HOT_LIGHT), reg, core.filter(ImageFilter.GaussianBlur(0.8)))
            fr.paste(reg, box[:2])
        f = fr.convert("RGBA")
        f.putalpha(alpha)
        frames.append(f)

    path = out_path / "banner-animated.webp"
    frames[0].save(path, format="WEBP", save_all=True, append_images=frames[1:],
                   duration=frame_ms, loop=0, quality=int(acfg.get("quality", 82)),
                   method=4, minimize_size=True, allow_mixed=True)
    print(f"Animated: {frames_n} frames, {frames_n * frame_ms / 1000:.1f}s loop, route {n * 2} px")


# Files published to Pages. banner-animated.webp (written separately) is the
# one embedded; banner.webp is the static version (transparent, ~0.6 MB);
# banner.jpg (no transparency) is kept so old links don't break. banner.png
# (~3.5 MB) is no longer published - unused.
OUTPUTS = ["banner.webp"]   # transparent only (banner.jpg/banner.png dropped - no transparency)
JPG_BG = (34, 34, 34)


# Transparent margin added around the frame (2x px; 24 = 12 CSS px).
OUTER_PAD = 24
# Output format by file extension. PNG keeps transparency everywhere but is
# large (~3 MB); WebP keeps transparency at a fraction of the size and is
# supported by all current browsers and Torn PDA. JPEG has no transparency.
SAVE_OPTS = {
    ".png": {"format": "PNG", "optimize": True},
    ".webp": {"format": "WEBP", "quality": 90, "method": 6},
    ".jpg": {"format": "JPEG", "quality": 90, "subsampling": 0, "optimize": True,
             "progressive": True},
}


def cut_outside_frame(img: Image.Image) -> Image.Image:
    """Make everything OUTSIDE the grey outer frame transparent.

    The frame's outline is the same on every banner (all pieces share the
    template's side columns), so it is a fixed polygon: a rectangle inset by
    FRAME_INSET px with FRAME_CHAMFER px cut corners, measured on the 2x art
    (left frame edge at x=3, right at w-5, chamfer from (8,40) to (44,0)).
    Drawn at 4x and downsampled for an anti-aliased edge.
    (A brightness-based flood fill was tried first and leaked through the
    dim bottom frame, so the outline is geometric on purpose.)
    """
    w, h = img.size
    L, T, R, B = FRAME_INSET
    c = FRAME_CHAMFER
    S = 4
    m = Image.new("L", (w * S, h * S), 0)
    x0, y0, x1, y1 = L * S, T * S, (w - R) * S, (h - B) * S
    C = c * S
    ImageDraw.Draw(m).polygon([(x0 + C, y0), (x1 - C, y0), (x1, y0 + C), (x1, y1 - C),
                               (x1 - C, y1), (x0 + C, y1), (x0, y1 - C), (x0, y0 + C)], fill=255)
    out = img.convert("RGBA")
    out.putalpha(m.resize((w, h), Image.LANCZOS))
    return out


FRAME_INSET = (0, 0, 0, 0)   # left, top, right, bottom (2x px) - v2 frame reaches the edges
FRAME_CHAMFER = 30           # cut-corner size (2x px), v2 template


def pad_transparent(img: Image.Image, pad: int) -> Image.Image:
    out = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    out.alpha_composite(img, (pad, pad))
    return out


# ==========================================================================
# 3c. MEMBERS ANNOUNCEMENT (separate images for the members-only announcement)
# ==========================================================================
# Torn may strip image maps, so clickable areas are SEPARATE images, each
# wrapped in its own <a href> link in the pasted HTML:
#   announce-header.webp  header art (live respect + "ANNOUNCEMENTS" bar)
#                         + red panel with the notices (config text)
#   btn-<n>.webp          one gunmetal button per link (icon plate + label)
#   announcements.html    page with the ready-to-paste HTML + Copy button
# Buttons are shown BTN_DISPLAY_W px wide in the snippet (2 per row on
# desktop, wrapping on phones).
BANNER_URL = "https://s1seven17.github.io/HeartBreakersLogo/banner.webp"
BTN_SIZE = (640, 128)          # 2x px
BTN_DISPLAY_W = 320


def compact_header(title: str) -> Image.Image:
    """Short header for the announcement: frame top edge + corners, dark
    red-grid background with a red haze, the chained heart (feathered) and
    the HEART BREAKERS lettering lifted from header.png, then a section bar
    carrying `title`. No respect plate / heart emblem."""
    hdr = piece("header")
    Hc = 300
    out = side_columns(Hc)
    bg = Image.new("RGBA", (W - 2 * SIDE_W, Hc), INTERIOR + (255,))
    bd = ImageDraw.Draw(bg)
    for x in range(0, bg.width, 28):
        bd.line([(x, 0), (x, Hc)], fill=(30, 9, 9, 255))
    for y in range(0, Hc, 28):
        bd.line([(0, y), (bg.width, y)], fill=(30, 9, 9, 255))
    haze = Image.new("L", bg.size, 0)
    ImageDraw.Draw(haze).ellipse([60, -80, bg.width - 60, Hc + 80], fill=90)
    haze = haze.filter(ImageFilter.GaussianBlur(70))
    bg = Image.composite(Image.new("RGBA", bg.size, (72, 12, 12, 255)), bg, haze)
    out.alpha_composite(bg, (SIDE_W, 0))
    band = piece("top_band")
    out.alpha_composite(band, (0, 0))
    cl = piece("corner_l")
    out.alpha_composite(cl, (0, 0))
    out.alpha_composite(cl.transpose(Image.FLIP_LEFT_RIGHT), (W - cl.width, 0))

    # heart (feathered) - header.png 2x region around the chained heart
    heart = hdr.crop((80, 16, 504, 472))
    m = Image.new("L", heart.size, 0)
    ImageDraw.Draw(m).ellipse([30, 16, heart.width - 34, heart.height - 14], fill=255)
    heart.putalpha(ImageChops.multiply(heart.getchannel("A"), m.filter(ImageFilter.GaussianBlur(24))))
    hh = Hc - 24
    heart = heart.resize((int(heart.width * hh / heart.height), hh), Image.LANCZOS)
    # lettering lifted off its dark background (brightest channel > ~60)
    let = hdr.crop((508, 34, 1216, 364)).convert("RGB")
    r_, g_, b_ = let.split()
    a_ = ImageChops.lighter(ImageChops.lighter(r_, g_), b_).point(lambda v: max(0, min(255, (v - 52) * 7)))
    let = let.convert("RGBA")
    let.putalpha(a_.filter(ImageFilter.GaussianBlur(0.6)))
    lh = Hc - 64
    let = let.resize((int(let.width * lh / let.height), lh), Image.LANCZOS)
    gap = 24
    total = heart.width + gap + let.width
    x = (W - total) // 2
    out.alpha_composite(heart, (x, 18))
    out.alpha_composite(let, (x + heart.width + gap, (Hc - lh) // 2 + 14))

    bar = piece("section_top")
    draw_text(ImageDraw.Draw(bar), (136, 76), title.upper(), font("Bold", 52), TITLE, track=3)
    full = Image.new("RGBA", (W, Hc + bar.height), (0, 0, 0, 0))
    full.alpha_composite(out, (0, 0))
    full.alpha_composite(bar, (0, Hc))
    return full


def war_status(raw: dict, my_id) -> dict:
    """{"kind": "ongoing"|"upcoming"|"none", "opponent", "our", "their",
    "start"} from the ranked war list (already fetched for the banner)."""
    now = int(datetime.now(timezone.utc).timestamp())
    wars = _as_list((raw.get("rankedwars") or {}).get("rankedwars"))
    best = None
    for w in wars:
        start = int(w.get("start") or 0)
        end = int(w.get("end") or 0)
        if end and end <= now:
            continue                      # finished
        if not _as_list(w.get("factions")):
            continue                      # incomplete entry - nothing to show
        kind = "ongoing" if start and start <= now else "upcoming"
        if best is None or (kind == "ongoing") or start < best[1]:
            best = (kind, start, w)
            if kind == "ongoing":
                break
    if not best:
        return {"kind": "none"}
    kind, start, w = best
    facs = _as_list(w.get("factions"))
    me = next((f for f in facs if str(f.get("id")) == str(my_id)), {})
    them = next((f for f in facs if str(f.get("id")) != str(my_id)), {})
    my_basic = raw["basic"].get("basic", raw["basic"])
    return {"kind": kind, "opponent": them.get("name", "?"),
            "our": me.get("score"), "their": them.get("score"), "start": start,
            "our_name": me.get("name") or my_basic.get("name") or "Us"}


# --------------------------------------------------------------------------
# Leaderboard tables. Each table is its own dark card with a border so
# tables read as separate. TWO tables per row, each showing up to `limit`
# entries in two sub-columns (1-10 | 11-20). A table left alone on the last
# row (odd count) is drawn FULL WIDTH with double the slots: up to 2x limit
# entries in four sub-columns (1-10 | 11-20 | 21-30 | 31-40).
# Used by the War, Chain and Gym leaderboard panels.
# --------------------------------------------------------------------------
LB_ROW_H = 34
LB_HEAD_H = 50
LB_GAP = 26          # between the two tables in a row
LB_SUB_GAP = 18      # between sub-columns
LB_CARD_PAD = 14     # card padding around a table
LB_ROW_GAP = 22      # vertical gap between rows of cards
CARD_FILL = (14, 7, 8, 235)
CARD_EDGE = (96, 30, 27)


def _lb_layout(tables: list, limit: int = None):
    """[(pair, wide, n_cols, per_col, rows_here, has_total)] per row of cards.
    Every entry is shown (full faction): half-width cards use 2 sub-columns,
    a card alone on the last row is full width with 4 sub-columns."""
    out = []
    for i in range(0, len(tables), 2):
        pair = tables[i:i + 2]
        wide = len(pair) == 1 and len(tables) > 1
        n_cols = 4 if wide else 2
        n = max(1, max(len(t[1]) for t in pair))
        per_col = max(1, -(-n // n_cols))
        has_total = any(len(t) > 2 and t[2] for t in pair)
        out.append((pair, wide, n_cols, per_col, per_col, has_total))
    return out


def lb_tables_height(tables: list, limit: int = None) -> int:
    return sum(LB_HEAD_H + rows * LB_ROW_H + (LB_ROW_H + 8 if tot else 0) + 2 * LB_CARD_PAD + LB_ROW_GAP
               for _, _, _, _, rows, tot in _lb_layout(tables, limit))


def lb_draw_tables(d, y: float, tables: list, limit: int = None, fmt=lambda v: v,
                   title_col=RED) -> float:
    """tables = [(title, rows[, (total_label, total_value)])];
    rows = [{"name", "value", "extra"?}]. Every row is drawn. The optional
    total sits in a gold strip at the bottom of the card ("TOTAL 6,085" /
    "AVERAGE 12.3"). Returns the y below the last row of cards."""
    f_num, f_val, f_extra = font("Bold", 22), font("Bold", 22), font("Medium", 18)
    for pair, wide, n_cols, per_col, rows_here, has_total in _lb_layout(tables, limit):
        tw = CW if (wide or len(tables) == 1) else (CW - LB_GAP) / 2
        card_h = LB_HEAD_H + rows_here * LB_ROW_H + (LB_ROW_H + 8 if has_total else 0) + 2 * LB_CARD_PAD
        for c, tb in enumerate(pair):
            title, rows = tb[0], tb[1]
            total = tb[2] if len(tb) > 2 else None
            x0 = CX0 + c * (tw + LB_GAP)
            d.rounded_rectangle([x0, y, x0 + tw, y + card_h], radius=10, fill=CARD_FILL,
                                outline=CARD_EDGE, width=2)
            ix, iw = x0 + LB_CARD_PAD, tw - 2 * LB_CARD_PAD
            ty = y + LB_CARD_PAD
            t = title.upper()
            draw_text(d, (ix + iw / 2, ty + 26), t, fit_font(t, "Bold", 25, iw - 10, 16), title_col,
                      track=2, anchor="ms")
            d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
            if not rows:
                draw_text(d, (ix + iw / 2, ty + LB_HEAD_H + 24), "-", f_num, SUB, anchor="ms")
            sw = (iw - (n_cols - 1) * LB_SUB_GAP) / n_cols
            numw = f_num.getlength(f"{max(len(rows), 9)}.")
            for k, r in enumerate(rows):
                col, rr = divmod(k, per_col)
                sx = ix + col * (sw + LB_SUB_GAP)
                base = ty + LB_HEAD_H + rr * LB_ROW_H + 22
                draw_text(d, (sx + 2, base), f"{k + 1}.", f_num, (150, 150, 152))
                nx = sx + 2 + numw + 6
                val = fmt(r["value"])
                extra = (" " + r["extra"]) if r.get("extra") else ""
                vw = f_val.getlength(val) + f_extra.getlength(extra)
                draw_text(d, (sx + sw - 2 - vw, base), val, f_val, title_col)
                if extra:
                    draw_text(d, (sx + sw - 2 - f_extra.getlength(extra), base), extra, f_extra,
                              (140, 140, 142))
                nf = fit_font(r["name"], "SemiBold", 22, (sx + sw - 2 - vw - 8) - nx, 13)
                draw_text(d, (nx, base), r["name"], nf, TEXT)
            used_cols = (len(rows) + per_col - 1) // per_col
            for col in range(1, used_cols):             # faint sub-column dividers
                mx = ix + col * (sw + LB_SUB_GAP) - LB_SUB_GAP / 2
                d.line([(mx, ty + LB_HEAD_H), (mx, ty + LB_HEAD_H + rows_here * LB_ROW_H - 4)],
                       fill=RULE, width=1)
            if total:
                # gold total / average strip across the bottom of the card
                yb = ty + LB_HEAD_H + rows_here * LB_ROW_H + 6
                GOLD = (232, 190, 90)
                d.rounded_rectangle([ix, yb, ix + iw, yb + LB_ROW_H], radius=6, fill=(232, 190, 90, 30),
                                    outline=GOLD, width=1)
                lab, val = total[0].upper(), fmt(total[1]) if total[1] not in ("-",) else "-"
                fl, fv = font("Bold", 19), font("Bold", 24)
                draw_text(d, (ix + 12, yb + 25), lab, fl, GOLD, track=2)
                draw_text(d, (ix + iw - 12 - fv.getlength(val), yb + 25), val, fv, (250, 235, 190))
        y += card_h + LB_ROW_GAP
    return y


def _period_section(d, y, title, colour):
    """THIS MONTH / ALL TIME divider inside a leaderboard panel. Monthly
    boards use gold titles, all-time boards red, so the two read apart."""
    t = title.upper()
    f = font("Bold", 30)
    lw = tracked_len(t, f, 3)
    draw_text(d, (W / 2, y + 30), t, f, colour, track=3, anchor="ms")
    d.line([(CX0, y + 20), (W / 2 - lw / 2 - 18, y + 20)], fill=colour, width=2)
    d.line([(W / 2 + lw / 2 + 18, y + 20), (CX1, y + 20)], fill=colour, width=2)
    return y + 56


def _plural(n: int, word: str) -> str:
    return f"{fmt_int(n)} {word}{'' if n == 1 else 's'}"


MONTH_COL = (232, 190, 90)    # This Month boards (gold)
ALLTIME_COL = RED             # All Time boards (red)


def draw_leaderboard(lcfg: dict, s: dict, heading: bool = True) -> Image.Image:
    """WAR LEADERBOARDS panel, every current member listed:
         THIS MONTH (gold) : Total Hits | Top Respect, Avg Hits / War | Respect / Hit, Attendance
         ALL TIME   (red)  : the same five tables
       each with a TOTAL (or AVERAGE for rates) strip, then NON PARTICIPATION
       (all time): everyone over np_threshold, 3 per row."""
    def tables(lb):
        tt = lb.get("totals", {})
        return [(lcfg.get("hits_title", "Total Hits"), lb.get("hits", []), tt.get("hits")),
                (lcfg.get("respect_title", "Top Respect"), lb.get("respect", []), tt.get("respect")),
                (lcfg.get("avg_title", "Avg Hits / War"), lb.get("avg_hits", []), tt.get("avg_hits")),
                (lcfg.get("rph_title", "Respect / Hit"), lb.get("rph", []), tt.get("rph")),
                (lcfg.get("iron_title", "Attendance"), lb.get("iron", []), tt.get("iron"))]
    lb = s.get("leaderboard") or {}
    lbm = s.get("leaderboard_month") or {}
    month_t, all_t = tables(lbm), tables(lb)
    nps = lb.get("non_participation", [])
    np_cols = 3
    np_rows = max(1, (len(nps) + np_cols - 1) // np_cols)
    h = (PAD_TOP + 70 + 56 + lb_tables_height(month_t) + 56 + lb_tables_height(all_t) + 110
         + LB_HEAD_H + np_rows * LB_ROW_H + 2 * LB_CARD_PAD + PAD_BOT)
    img, d = layer(h)
    y = group_heading(d, PAD_TOP, lcfg.get("war_group_title", "War Leaderboards")) if heading else PAD_TOP
    y = _period_section(d, y, f"This Month - {_month_label()}  ({_plural(lbm.get('wars', 0), 'war')})", MONTH_COL)
    y = lb_draw_tables(d, y, month_t, title_col=MONTH_COL)
    y = _period_section(d, y, f"All Time  ({_plural(lb.get('wars', 0), 'war')})", ALLTIME_COL)
    y = lb_draw_tables(d, y, all_t, title_col=ALLTIME_COL)
    # * legend: who isn't ranked and why
    leg = (f"* Did not meet the participation requirement to be ranked (listed at the end). "
           f"Avg Hits / War & Attendance: {lbm.get('min_wars', 1)}+ war this month, {lb.get('min_wars', 3)}+ all time. "
           f"Respect / Hit: {lbm.get('min_hits', 20)}+ hits this month, {lb.get('min_hits', 50)}+ all time.")
    for ln in wrap(leg, font("Medium", 22), CW - 20):
        draw_text(d, (W / 2, y + 6), ln, font("Medium", 22), (165, 165, 168), anchor="ms")
        y += 30
    y += 12
    thr = lcfg.get("np_threshold", 50)
    # Non Participation in its own card, like the tables
    d.rounded_rectangle([CX0, y, CX1, y + LB_HEAD_H + np_rows * LB_ROW_H + 2 * LB_CARD_PAD],
                        radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
    y += LB_CARD_PAD
    t = fill(lcfg.get("np_title", "Non Participation"), {"thr": thr}).upper()
    draw_text(d, (W / 2, y + 24), t, font("Bold", 25), RED, track=2, anchor="ms")
    d.line([(CX0 + 8, y + 36), (CX1 - 8, y + 36)], fill=RULE, width=2)
    y += LB_HEAD_H
    f_name, f_val, f_extra = font("SemiBold", 22), font("Bold", 22), font("Medium", 18)
    if not nps:
        draw_text(d, (W / 2, y + 24), fill(lcfg.get("np_none", "No members over {thr}%"), {"thr": thr}),
                  f_name, SUB, anchor="ms")
    ncw = (CW - 2 * LB_CARD_PAD - 2 * 30) / np_cols
    for i, r in enumerate(nps):
        rr, cc = divmod(i, np_cols)
        x0 = CX0 + LB_CARD_PAD + cc * (ncw + 30)
        base = y + rr * LB_ROW_H + 24
        extra = " " + r.get("extra", "")
        vw = f_val.getlength(r["value"]) + f_extra.getlength(extra)
        draw_text(d, (x0 + ncw - 4 - vw, base), r["value"], f_val, RED)
        draw_text(d, (x0 + ncw - 4 - f_extra.getlength(extra), base), extra, f_extra, (140, 140, 142))
        draw_text(d, (x0 + 4, base), r["name"], fit_font(r["name"], "SemiBold", 22, ncw - vw - 16, 13), TEXT)
    return img


def group_heading(d, y, text, sub=None):
    """Big centred heading between red rules that separates the WAR and
    CHAIN leaderboard groups; optional grey summary line underneath."""
    t = text.upper()
    f = font("Bold", 40)
    lw = tracked_len(t, f, 4)
    draw_text(d, (W / 2, y + 40), t, f, TITLE, track=4, anchor="ms")
    d.line([(CX0, y + 26), (W / 2 - lw / 2 - 22, y + 26)], fill=RED, width=3)
    d.line([(W / 2 + lw / 2 + 22, y + 26), (CX1, y + 26)], fill=RED, width=3)
    y += 62
    if sub:
        draw_text(d, (W / 2, y + 22), sub, fit_font(sub, "SemiBold", 26, CW, 16), (150, 150, 152),
                  anchor="ms")
        y += 40
    return y + 8


def draw_chain_leaderboard(lcfg: dict, s: dict, heading: bool = True) -> Image.Image:
    """CHAIN LEADERBOARDS panel, every current member listed:
         THIS MONTH (gold) : Chain Hits | Chain Respect, Retaliations
         ALL TIME   (red)  : the same three tables
       each with a TOTAL strip (incl. members who have left)."""
    def tables(cl):
        tt = cl.get("totals", {})
        return [(lcfg.get("chain_hits_title", "Chain Hits"), cl.get("hits", []), tt.get("hits")),
                (lcfg.get("chain_respect_title", "Chain Respect"), cl.get("respect", []), tt.get("respect")),
                (lcfg.get("chain_rets_title", "Retaliations"), cl.get("rets", []), tt.get("rets"))]
    cl = s.get("chain_leaderboard") or {}
    clm = s.get("chain_leaderboard_month") or {}
    month_t, all_t = tables(clm), tables(cl)
    h = PAD_TOP + 70 + 56 + lb_tables_height(month_t) + 56 + lb_tables_height(all_t) + PAD_BOT - 10
    img, d = layer(h)
    y = group_heading(d, PAD_TOP, lcfg.get("chain_group_title", "Chain Leaderboards")) if heading else PAD_TOP
    y = _period_section(d, y, f"This Month - {_month_label()}  ({_plural(clm.get('chains', 0), 'chain')})", MONTH_COL)
    y = lb_draw_tables(d, y, month_t, title_col=MONTH_COL)
    y = _period_section(d, y, f"All Time  ({_plural(cl.get('chains', 0), 'chain')})", ALLTIME_COL)
    lb_draw_tables(d, y, all_t, title_col=ALLTIME_COL)
    return img


def compact_num(n: int) -> str:
    """12,345 -> '12.3k', 1,234,567 -> '1.23M' (narrow gym columns)."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1000:.1f}k"
    return fmt_int(n)


def draw_gym_leaderboard(lcfg: dict, s: dict, heading: bool = True) -> Image.Image:
    """GYM LEADERBOARDS panel:
        heading + "energy trained while in the faction" note
        THIS MONTH - <month> : Strength | Speed, Defense | Dexterity, Total
        ALL TIME             : same five tables
        (each up to `top` (20) entries in two sub-columns)
        LAST MONTH'S TOP 3   : five compact columns (once a month completed)"""
    gl = s.get("gym_leaderboard") or {}
    top = int(lcfg.get("top", 20))
    atop = int(lcfg.get("gym_alltime_top", top))
    prev = gl.get("prev") or {}
    num = lambda v: compact_num(int(v))

    def mlabel(m):
        try:
            return datetime.strptime(m or "", "%Y-%m").strftime("%B %Y")
        except ValueError:
            return m or ""

    def tables(bd, tt):
        return [(lcfg.get(f"{st}_title", lab), bd.get(st, []), (tt or {}).get(st)) for st, lab in GYM_STATS]

    month_t = tables(gl.get("boards", {}), gl.get("totals"))
    all_t = tables(gl.get("alltime", {}), gl.get("alltime_totals"))
    sub_h = 56
    prev_h = (sub_h + 48 + 3 * 36 + 30) if prev.get("top3") else 0
    h = (PAD_TOP + 110 + sub_h + lb_tables_height(month_t, top) + sub_h + lb_tables_height(all_t, atop)
         + prev_h + PAD_BOT)
    img, d = layer(h)
    if heading:
        y = group_heading(d, PAD_TOP, lcfg.get("gym_group_title", "Gym Leaderboards"),
                          lcfg.get("gym_subtitle", "Based on gym energy trained & contributed while in the faction"))
    else:
        sub = lcfg.get("gym_subtitle", "Based on gym energy trained & contributed while in the faction")
        draw_text(d, (W / 2, PAD_TOP + 22), sub, fit_font(sub, "SemiBold", 26, CW, 16), (150, 150, 152),
                  anchor="ms")
        y = PAD_TOP + 48

    def section(y, title):
        t = title.upper()
        f = font("Bold", 30)
        lw = tracked_len(t, f, 3)
        draw_text(d, (W / 2, y + 30), t, f, TITLE, track=3, anchor="ms")
        d.line([(CX0, y + 20), (W / 2 - lw / 2 - 18, y + 20)], fill=RED, width=2)
        d.line([(W / 2 + lw / 2 + 18, y + 20), (CX1, y + 20)], fill=RED, width=2)
        return y + sub_h

    y = _period_section(d, y, fill(lcfg.get("gym_month_title", "This Month - {month}"),
                                   {"month": mlabel(gl.get("month"))}), MONTH_COL)
    y = lb_draw_tables(d, y, month_t, top, num, title_col=MONTH_COL)
    y = _period_section(d, y, lcfg.get("gym_alltime_title", "All Time"), ALLTIME_COL)
    y = lb_draw_tables(d, y, all_t, atop, num, title_col=ALLTIME_COL)
    if prev.get("top3"):
        y = section(y, fill(lcfg.get("gym_prev_title", "Last Month's Top 3 - {month}"),
                            {"month": mlabel(prev.get("month"))}))
        gap = 14
        cw = (CW - 4 * gap) / 5
        f_num, f_val = font("Bold", 22), font("Bold", 22)
        for c, (st, lab) in enumerate(GYM_STATS):
            x0 = CX0 + c * (cw + gap)
            d.rounded_rectangle([x0 - 2, y - 6, x0 + cw + 2, y + 48 + 3 * 36 + 10], radius=10,
                                fill=CARD_FILL, outline=CARD_EDGE, width=2)
            t = lcfg.get(f"{st}_title", lab).upper()
            draw_text(d, (x0 + cw / 2, y + 24), t, fit_font(t, "Bold", 24, cw - 6, 16), RED, track=2, anchor="ms")
            d.line([(x0 + 6, y + 36), (x0 + cw - 6, y + 36)], fill=RULE, width=2)
            for i, r in enumerate(prev["top3"].get(st, [])[:3]):
                base = y + 48 + i * 36 + 24
                draw_text(d, (x0 + 4, base), f"{i + 1}.", f_num, (150, 150, 152))
                nx = x0 + 4 + f_num.getlength("3.") + 6
                val = num(r["value"])
                vw = f_val.getlength(val)
                draw_text(d, (x0 + cw - 4 - vw, base), val, f_val, RED)
                draw_text(d, (nx, base), r["name"],
                          fit_font(r["name"], "SemiBold", 22, (x0 + cw - 4 - vw - 8) - nx, 13), TEXT)
    return img


def draw_slacker_watch(scfg: dict, s: dict) -> Image.Image:
    """Three cards: REVIEW / WARNING / WATCH. Each lists members two per row
    as 'Name  - reason, reason'. Empty tier shows 'None'. Short legend line
    at the top explains the tiers."""
    sw = s.get("slacker_watch") or {"tiers": {}}
    tiers = [("review", scfg.get("review_title", "Review"), (235, 60, 50),
              scfg.get("review_rule", "Missed all {n} of the last {n} wars, or inactive {d}+ days")),
             ("warning", scfg.get("warning_title", "Warning"), (232, 140, 60),
              scfg.get("warning_rule", "Missed 2 of the last {n} wars")),
             ("watch", scfg.get("watch_title", "Watch"), (210, 190, 90),
              scfg.get("watch_rule", "Missed 1 war, or low hits in {w}+ wars (under {t}% of the war's average)"))]
    sw = {"tiers": dict(sw.get("tiers", {}))}
    if s.get("chain_review") is not None:      # 4th card: large chains
        sw["tiers"]["chain"] = s["chain_review"]
        tiers.append(("chain", scfg.get("chain_review_title", "Chain Review"), (200, 120, 230),
                      scfg.get("chain_review_rule",
                               "No hits in {cm}+ of the last {cn} chains of {cl}+ (newest first)")))
    vals = {"n": scfg.get("recent_wars", 3), "d": scfg.get("inactive_days", 5), "t": scfg.get("token_pct", 5),
            "w": scfg.get("watch_token_wars", 2), "cm": scfg.get("chain_review_missed", 3),
            "cn": scfg.get("chain_review_recent", 5), "cl": f"{int(scfg.get('chain_review_min', 1000)):,}"}
    f_name, f_why, f_rule = font("SemiBold", 24), font("Medium", 20), font("Medium", 21)
    row_h = 36
    cols = 2
    heights = []
    for key, *_ in tiers:
        n = len(sw["tiers"].get(key, []))
        heights.append(LB_HEAD_H + 30 + max(1, (n + cols - 1) // cols) * row_h + 2 * LB_CARD_PAD)
    h = PAD_TOP + sum(hh + LB_ROW_GAP for hh in heights) + PAD_BOT - 10
    img, d = layer(h)
    y = PAD_TOP
    for (key, title, colour, rule), ch in zip(tiers, heights):
        entries = sw["tiers"].get(key, [])
        d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
        ix, iw = CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
        ty = y + LB_CARD_PAD
        t = f"{title.upper()}  ({len(entries)})"
        draw_text(d, (ix + iw / 2, ty + 26), t, font("Bold", 26), colour, track=2, anchor="ms")
        d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
        draw_text(d, (ix + iw / 2, ty + LB_HEAD_H + 16), fill(rule, vals), f_rule, (140, 140, 142), anchor="ms")
        ty += LB_HEAD_H + 30
        if not entries:
            draw_text(d, (ix + iw / 2, ty + 24), scfg.get("none_text", "None"), f_name, SUB, anchor="ms")
        cw = (iw - 30) / cols
        for k, e in enumerate(entries):
            rr, cc = divmod(k, cols)
            x = ix + cc * (cw + 30)
            base = ty + rr * row_h + 24
            why = " · ".join(e["reasons"])
            ww = f_why.getlength(why)
            nf = fit_font(e["name"], "SemiBold", 24, cw - ww - 24, 14)
            draw_text(d, (x + 4, base), e["name"], nf, TEXT)
            draw_text(d, (x + cw - 4 - ww, base), why, f_why, colour)
        y += ch + LB_ROW_GAP
    return img


def render_announcement_header(acfg: dict, summary: dict, only: set = None) -> Image.Image:
    """Compact header + one red panel with everything centred:
         WAR STATUS (live)   then each notice group (sub-heading + lines).
    only = set of section slugs to draw (header always) - the Site Panels live preview skips the big
    leaderboards unless asked, so it stays quick in the browser."""
    want = lambda slug: only is None or slug in only
    v = summary["values"]
    header = compact_header(str(acfg.get("title", "Announcements")))
    f = font("SemiBold", 32)
    groups = []
    for g in acfg.get("groups", []):
        lines = [fill(n, v) for n in g.get("lines", []) if str(n).strip()]
        if lines:
            groups.append((g.get("title", ""), [wrap(n, f, CW - 80) for n in lines]))

    ws = summary.get("war_status") or {"kind": "none"}
    show_war = acfg.get("show_war_status", True)
    war_extra = 76 if ws.get("kind") == "ongoing" else 0
    sub_h = 54
    h = PAD_TOP
    if show_war:
        h += sub_h + 124 + war_extra
    for _, ls in groups:
        h += sub_h + sum(len(l) * 42 + 8 for l in ls) + 18
    h += PAD_BOT
    img, d = layer(h)

    def subheading(y, label):
        label = label.upper()
        lw = tracked_len(label, F_SUB, 3)
        draw_text(d, (W / 2, y + 30), label, F_SUB, TITLE, track=3, anchor="ms")
        d.line([(CX0, y + 20), (W / 2 - lw / 2 - 18, y + 20)], fill=RED, width=2)
        d.line([(W / 2 + lw / 2 + 18, y + 20), (CX1 - 10, y + 20)], fill=RED, width=2)
        return y + sub_h

    y = PAD_TOP
    if show_war:
        y = subheading(y, acfg.get("war_title", "War Status"))
        big = font("Bold", 44)
        small = font("Bold", 36)
        if ws["kind"] == "ongoing":
            line1 = f"AT WAR vs {ws['opponent']}"
            line2 = ""                      # scoreboard drawn below instead
            c1 = RED
        elif ws["kind"] == "upcoming":
            line1 = f"UPCOMING vs {ws['opponent']}"
            line2 = ("Starts " + datetime.fromtimestamp(ws["start"], timezone.utc)
                     .strftime("%b %d, %H:%M TCT")) if ws["start"] else "Start time TBA"
            c1 = RED
        else:
            line1 = "NO WAR SCHEDULED"
            line2 = ""
            c1 = (150, 150, 152)
        draw_text(d, (W / 2, y + 42), line1, fit_font(line1, "Bold", 44, CW - 40, 26), c1,
                  track=2, anchor="ms")
        if line2:
            draw_text(d, (W / 2, y + 90), line2, small, TEXT, anchor="ms")
        if ws["kind"] == "ongoing":
            # Scoreboard: our faction NAME over our score (left of centre),
            # theirs over their score (right), "-" between. Leader's score red.
            tag_f, sc_f = font("Bold", 32), font("Bold", 52)
            off = 250
            ours, theirs = ws.get("our") or 0, ws.get("their") or 0
            for sx, tag, sc, lead in ((W / 2 - off, ws["our_name"], ours, ours > theirs),
                                      (W / 2 + off, ws["opponent"], theirs, theirs > ours)):
                nf = fit_font(tag, "Bold", 32, 2 * off - 60, 20)
                draw_text(d, (sx, y + 86), tag, nf, (165, 165, 168), anchor="ms")
                draw_text(d, (sx, y + 140), fmt_int(sc), sc_f, RED if lead else TEXT, anchor="ms")
            draw_text(d, (W / 2, y + 136), "-", sc_f, (150, 150, 152), anchor="ms")
            y += 76
        y += 124
    for title, wrapped in groups:
        y = subheading(y, title)
        for lines in wrapped:
            base = y + 30
            for k, ln in enumerate(lines):
                lw = f.getlength(ln)
                lx = W / 2 - lw / 2
                if k == 0:
                    bullet(d, lx - 24, base, size=12)
                draw_text(d, (lx, base), ln, f, TEXT)
                base += 42
            y += len(lines) * 42 + 8
        y += 18
    body = body_strip(img.height + 12)
    body.alpha_composite(img)

    # The announcement is split into separate images (WebP max height is
    # 16,383 px): main (header + notices), one per leaderboard panel, and
    # the recent wars + footer. Every split image has its own frame top
    # (title bar) and bottom so they all look alike.
    sections = [("header", [header, body])]

    def start(slug, title, extra=None):
        top = piece("section_top")
        td = ImageDraw.Draw(top)
        draw_text(td, (136, 76), str(title).upper(), font("Bold", 52), TITLE, track=3)
        if extra:
            extra(td, title)
        blocks = [frame_top(), top]
        sections.append((slug, blocks))
        return blocks

    def body_of(content):
        b_ = body_strip(content.height + 12)
        b_.alpha_composite(content)
        return b_

    if want("wars") and acfg.get("show_ranked_wars", True) and summary.get("wars_announce") is not None:
        # Recent Ranked Wars: record in the title bar, Top Hits, Most Respect, Non Participants
        rw_cfg = dict(acfg.get("ranked_wars", {}))
        title = str(rw_cfg.get("title", "Recent Ranked Wars")).upper()
        rec = (lambda td, t: draw_war_record(td, summary["war_record"],
                                             136 + tracked_len(t.upper(), font("Bold", 52), 3) + 40)) \
            if summary.get("war_record") else None
        start("wars", title, rec).append(
            body_of(draw_ranked_wars(rw_cfg, dict(summary, wars=summary["wars_announce"]), show_np=True)))
    lcfg = acfg.get("leaderboard", {})
    # leaderboard panels in the order leaders set (Site Panels -> Announcements -> Leaderboard order;
    # config announcements.leaderboard.order, Nov 2026). Missing / unknown names: the default order fills in.
    def lb_war():
        if want("war") and lcfg.get("enabled", True) and summary.get("leaderboard"):
            start("war", lcfg.get("war_group_title", "War Leaderboards")).append(
                body_of(draw_leaderboard(lcfg, summary, heading=False)))
    def lb_chain():
        if want("chain") and lcfg.get("enabled", True) and summary.get("leaderboard") and summary.get("chain_leaderboard"):
            start("chain", lcfg.get("chain_group_title", "Chain Leaderboards")).append(
                body_of(draw_chain_leaderboard(lcfg, summary, heading=False)))
    def lb_gym():
        if want("gym") and lcfg.get("enabled", True) and summary.get("leaderboard") \
                and summary.get("gym_leaderboard") and lcfg.get("gym", True):
            start("gym", lcfg.get("gym_group_title", "Gym Leaderboards")).append(
                body_of(draw_gym_leaderboard(lcfg, summary, heading=False)))
    for k in leaderboard_order(lcfg):
        {"war": lb_war, "chain": lb_chain, "gym": lb_gym}[k]()
    scfg = acfg.get("slacker_watch", {})
    if want("slackers") and scfg.get("enabled", True) and summary.get("slacker_watch"):
        start("slackers", scfg.get("title", "Slacker Watch")).append(body_of(draw_slacker_watch(scfg, summary)))
    # "Last updated" footer, bottom right of the LAST image
    if acfg.get("footer", True):
        strip = body_strip(50, panel=False)
        txt = fill(acfg.get("footer_text", "Last updated: {updated}"),
                   dict(summary["values"], updated=stamp_for("announce")))
        ff = font("Medium", 26)
        draw_text(ImageDraw.Draw(strip), (CX1 - ff.getlength(txt), 34), txt, ff, (125, 125, 125))
        sections[-1][1].append(strip)
    out_imgs = []
    for slug, blocks in sections:
        blocks = blocks + [final_end()]
        im = Image.new("RGBA", (W, sum(b_.height for b_ in blocks)), (0, 0, 0, 0))
        y = 0
        for b_ in blocks:
            im.alpha_composite(b_, (0, y))
            y += b_.height
        out_imgs.append((slug, pad_transparent(cut_outside_frame(im), OUTER_PAD)))
    return out_imgs


def render_button(label: str, icon: str) -> Image.Image:
    """Gunmetal plate (same as What We Offer tiles) + red icon plate + label."""
    w, h = BTN_SIZE
    img = metal_tile((w, h), chamfer=14)
    plate = icon_plate(icon)
    paste_center(img, plate, 22 + plate.width / 2, h / 2)
    d = ImageDraw.Draw(img)
    text = label.upper()
    x0 = 22 + plate.width + 20
    fnt = fit_font(text, "Bold", 40, w - x0 - 28, 22)
    draw_centered(d, (x0 + (w - x0 - 22) / 2, h / 2), text, fnt, (232, 232, 232))
    return img


FACTION_URL = "https://www.torn.com/factions.php?step=profile&ID=51384"


LEADERSHIP_NOW = []


def slot_title(fi: dict, k: int, position: str) -> str:
    """Title of leadership slot k (0-based): leadership_titles[k], else the roles[] title for their position,
    else the Torn position name. Used when the data is read AND when drawing (so the editor's live preview
    shows a changed title straight away)."""
    st = [str(t or "").strip() for t in fi.get("leadership_titles") or []]
    pt = {str(r.get("position", "")).strip().lower(): (r.get("title") or r.get("position")) for r in fi.get("roles", [])}
    return (st[k] if k < len(st) else "") or pt.get(str(position).strip().lower()) or position    # this run's leadership slots [{name, id, title}] - shown on the leaders' Description editor


def gh_proxy_url() -> str:
    """Leaders' tools save through the gatekeeper (/l/gh/contents/<path>, faction token kept on Cloudflare) when it's
    on - "" = no gatekeeper: the tools fall back to the leader's own GitHub token."""
    g_ = gate_cfg()
    return g_["url"].rstrip("/") + "/l/gh/contents/" if g_ else ""


def gate_cfg() -> dict:
    """config.json "gate": {enabled, url, leader_positions}. When enabled (and url set), every member /
    leader page is reached through the Cloudflare gatekeeper (gate/worker.js) at url + "/m" and url + "/l",
    and the real GitHub Pages folders get hidden names (see member_dir / leader_dir)."""
    try:
        g_ = json.loads((ROOT / "config.json").read_text(encoding="utf-8")).get("gate") or {}
    except (OSError, ValueError):
        g_ = {}
    return g_ if g_.get("enabled") and g_.get("url") and os.environ.get("MEMBER_DIR", "").strip() else {}


def _gate_phys(raw_dir: str) -> str:
    """Hidden folder name the gatekeeper derives too: sha256(dir + "|gate"), first 32 hex chars."""
    import hashlib
    return hashlib.sha256(f"{raw_dir}|gate".encode()).hexdigest()[:32]


def member_dir() -> str:
    """Folder (on GitHub Pages) for every member-only page and image. From the MEMBER_DIR Actions secret,
    so it never appears in this public repo; empty = site root (local tests). With the gatekeeper on it's
    a name derived from that secret that only the gatekeeper knows - links never show it.
    Only the description banner stays at the public root."""
    raw_ = os.environ.get("MEMBER_DIR", "").strip().strip("/")
    return _gate_phys(raw_) if raw_ and gate_cfg() else raw_


def public_base() -> str:
    """Address of the PUBLIC files (the faction description banner at the site root): the gatekeeper's
    own address when it's on - so nothing pasted in Torn ever shows where the files really live -
    else the GitHub Pages root."""
    g_ = gate_cfg()
    return g_["url"].rstrip("/") if g_ else BANNER_URL.rsplit("/", 1)[0]


def member_base() -> str:
    """Address members use: the gatekeeper's /m when it's on, else the GitHub Pages folder."""
    g_ = gate_cfg()
    if g_:
        return g_["url"].rstrip("/") + "/m"
    root = BANNER_URL.rsplit("/", 1)[0]
    return f"{root}/{member_dir()}" if member_dir() else root


def member_out(out: Path) -> Path:
    d_ = out / member_dir() if member_dir() else out
    d_.mkdir(parents=True, exist_ok=True)
    return d_
# ONE header for every page (members' and leaders'), the same everywhere. Two parts, both set by leaders in the
# Header editor (leaders' header-editor.html -> config.json "site_header", Nov 2026; "header" is the banner's):
#   "members"  what EVERYONE sees (members and leaders)
#   "leaders"  extra items only leaders see, after the members' items (class "hbl": hidden until the gatekeeper's
#              whoami.json says leader) - by default one "🛡️ Leaders" dropdown with the leadership tools in folders
# Item:   {"label", "link"}                       a button
#         {"label", "items": [entry, ...]}        a dropdown; entry = {"label", "link"} or a FOLDER
#                                                 {"label", "items": [{"label", "link"}, ...]} (tap to open)
# link:   "M:<page>" members' folder · "L:<page>" leaders' folder · "G:/" the dashboard (Leaders Hub for leaders,
#         Members Hub for everyone else) · a full https:// address. Dropdowns are <details>, so they work by tap.
def header_default() -> dict:
    # Nov 12 2026 (user, site cleanup): History = wars / chains / crimes as tabs; one home (no Leaders Hub link);
    # Member data = stats + war readiness; one Torn panels entry; Site settings = homepage / header / profile layout
    # tabs; "Members list" (already in the top row) left the leaders' menu
    L = lambda label, link: {"label": label, "link": link}
    return {"members": [L("🏠 Home", "G:/"), L("📊 Leaderboards", "M:leaderboards.html"), L("📜 History", "M:wars.html"),
                        L("👥 Members", "M:members.html"),
                        L("⛓️ Chain watch", "M:chainwatch-schedule.html"), L("🎯 War targets", "M:war-targets.html"),   # Nov 12 2026
                        L("🧩 Scripts", "M:scripts.html")],
            "leaders": [{"label": "🛡️ Leaders", "items": [
                L("🤝 Recruitment", "L:recruitment.html"),          # Nov 11 2026: Torn Recruit Scout -> shared recruits
                {"label": "⚔️ Wars & payouts", "items": [L("🧮 Payout calculator", "L:payout.html"),
                                                        L("💰 Paid wars", "M:wars.html#paid")]},
                {"label": "👥 Members", "items": [L("🗄️ Armory monitor", "L:armory.html"), L("💪 Member data", "L:stats.html")]},
                L("📢 Torn panels", "L:announcements.html"),
                {"label": "📰 Newsletters", "items": [L("🎨 Newsletter builder", "L:builder.html"),
                                                     L("🧷 Newsletter filler", "L:hb-newsletter-filler.user.js"),
                                                     L("🗂️ Recap archive", "M:recaps.html")]},
                # Nov 13 2026 (user): script configuration / settings pages together in a Settings folder
                {"label": "⚙️ Settings", "items": [L("⛓️ Chain Watch", "L:chainwatch.html"),
                                                  L("🕵️ OC Management", "L:oc.html"),
                                                  L("🏠 Site settings", "L:homepage.html")]}]}]}


_HEADER = {}


def header_cfg() -> dict:
    """config.json "site_header" (read once per build), else header_default()."""
    if "v" not in _HEADER:
        try:
            h = load_config().get("site_header")       # NOT "header" - that's the banner's own settings
        except (OSError, ValueError):
            h = None
        ok = isinstance(h, dict) and isinstance(h.get("members"), list) and isinstance(h.get("leaders"), list)
        _HEADER["v"] = h if ok else header_default()
    return _HEADER["v"]


MENU_CSS = """<style>.hbm{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;margin:0 0 12px;
font:14px system-ui,sans-serif;position:relative;z-index:50}.hbm>a,.hbm summary{color:#e8be5a;background:#1a1012;
border:1px solid #5c1c1a;border-radius:7px;padding:6px 10px;text-decoration:none;cursor:pointer;list-style:none;white-space:nowrap}
.hbm summary::-webkit-details-marker{display:none}.hbm summary:after{content:" ▾";color:#9a9a9c}
.hbm details{position:relative}.hbm details[open] summary{border-color:#e4382e}
.hbm details[open]{z-index:100}.hbm details div{z-index:100}
.hbm details div{position:absolute;top:110%;left:0;background:#170d0e;border:1px solid #5c1c1a;border-radius:8px;
padding:4px;min-width:170px;box-shadow:0 6px 18px #000a}.hbm details div a{display:block;color:#ddd;padding:8px 10px;
border-radius:6px;text-decoration:none;white-space:nowrap}.hbm details div a:hover{background:#2a1416;color:#fff}
.hbm input{background:#1a1012;color:#eee;border:1px solid #5c1c1a;border-radius:7px;padding:6px 10px;width:170px;font:14px system-ui}
.hbm .ld>a,.hbm .ld summary{border-color:#6b4a18}
.hbm details details{position:static}.hbm details details summary{background:none;border:0;color:#e8be5a;padding:8px 10px;
display:block;font-weight:600}.hbm details details summary:after{content:" ▸";color:#9a9a9c}
.hbm details details[open] summary:after{content:" ▾"}.hbm details details>div{position:static;box-shadow:none;border:0;
border-left:2px solid #5c1c1a;border-radius:0;margin:0 0 4px 12px;padding:0 0 0 4px;min-width:0;background:none}</style>"""


def _menu_js(root: str) -> str:
    # dropdown behaviour only (the member search box was removed - members are on members.html)
    return ("<script>(function(){"
            # top-level dropdowns only (folders inside a dropdown are <details> too - opening one keeps its dropdown open)
            "document.querySelectorAll('.hbm>details').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open)return;"
            "document.querySelectorAll('.hbm>details').forEach(function(o){if(o!==d)o.open=false;});"
            # keep the opened list on screen: flip it to the right edge of its button if it would run off the right
            "var p=d.querySelector('div');if(!p)return;p.style.left='';p.style.right='';"
            "var r=p.getBoundingClientRect();if(r.right>innerWidth-6){p.style.left='auto';p.style.right='0';r=p.getBoundingClientRect();}"
            # ...and never off the left edge either (narrow phones): pin it 6px from the screen's left
            "if(r.left<6){p.style.right='auto';p.style.left=(6-d.getBoundingClientRect().left)+'px';}});});"
            "document.addEventListener('click',function(e){if(!e.target.closest('.hbm'))document.querySelectorAll('.hbm details')"
            ".forEach(function(o){o.open=false;});});"
            "})();</script>")


# Account menu (gatekeeper on): "👤 <their name>" with links to their own information + Sign out.
# The name is filled in the browser from whoami.json, which also reveals the leader-only groups.
# My Profile = their own member.html (the gatekeeper's /m/me sends them there; #sections jump to a part).
# ("🧩 My profile layout" left the menu Nov 12 2026 - it's the "⚙️ Customize this page" button on profiles)
ACCOUNT_LINKS = [("👤 My Profile", "me"), ("🔐 My data & sharing", "my-data.html"),
                 ("💰 My Payouts", "me#payouts"),
                 ("⚔️ My Wars", "me#wars"), ("⛓️ My Chains", "me#chains"), ("🕵️ My Crimes", "me#crimes")]


def account_menu(mroot: str) -> str:
    g_ = gate_cfg()["url"].rstrip("/")
    links = "".join(f'<a href="{mroot}{u}">{t}</a>' for t, u in ACCOUNT_LINKS)
    return (f'<details class="hbacc"><summary id="hbaccn">👤 Me</summary><div>{links}'
            f'<a href="{g_}/logout" style="color:#ff8a80">🚪 Sign out</a></div></details>'
            # (the browser-kept key and its "Remove my API key" link went Nov 12 2026 - Right now reads the Hub)
            "<script>try{localStorage.removeItem('hb_pub_key');}catch(e){}</script>"
            # OC pass rates moved to the stored opt-in key (Nov 2026): clear the old browser-only OC key everywhere
            "<script>try{['hb_oc_key','hb_oc_owner','hb_oc_shared_at'].forEach(function(k){localStorage.removeItem(k);});}catch(e){}</script>"
            "<script>(function(){fetch(" + json.dumps(mroot + "whoami.json") + ",{cache:'no-store'})"
            ".then(function(r){return r.ok?r.json():null;}).then(function(w){if(!w)return;"
            "document.getElementById('hbaccn').textContent='👤 '+w.name;"

            "if(w.leader)document.querySelectorAll('.hbm .hbl').forEach(function(e){e.style.display='';});"
            "}).catch(function(){});})();</script>")


def nav_menu(mroot: str, lroot: str) -> str:
    """The header (see NAV). mroot / lroot = path to the members' / leaders' folder from this page."""
    g_ = gate_cfg()
    groot = g_["url"].rstrip("/") if g_ else ""
    def href(u):
        k, rest = u.split(":", 1)
        if k == "G":
            return groot + rest if g_ else mroot + "index.html"
        return (mroot if k == "M" else lroot) + rest
    import html as _h
    def href_(u):
        u = str(u or "").strip()
        if u[:2] in ("M:", "L:", "G:"):
            if u.startswith("L:") and not lroot:
                return ""
            return href(u)
        return u if u.startswith(("https://", "http://", "#")) else ""
    def link_(e):
        u = href_(e.get("link"))
        return f'<a href="{_h.escape(u, quote=True)}">{_h.escape(str(e.get("label", "")))}</a>' if u else ""
    def entry(e):
        if isinstance(e.get("items"), list):              # folder inside a dropdown
            inner = "".join(link_(x) for x in e["items"] if isinstance(x, dict))
            return f"<details><summary>{_h.escape(str(e.get('label', '')))}</summary><div>{inner}</div></details>" if inner else ""
        return link_(e)
    parts = []
    hc = header_cfg()
    for lead, row in ((False, hc.get("members") or []), (True, hc.get("leaders") or [])):
        if lead and not lroot:
            continue                      # no leaders' folder (LEADER_DIR not set)
        # leader-only items: hidden until whoami says leader (always shown without the gatekeeper - local tests)
        attr = ' class="hbl ld" style="display:none"' if lead and g_ else (' class="ld"' if lead else "")
        for it in row:
            if not isinstance(it, dict):
                continue
            if isinstance(it.get("items"), list):
                inner = "".join(entry(x) for x in it["items"] if isinstance(x, dict))
                if inner:
                    parts.append(f"<details{attr}><summary>{_h.escape(str(it.get('label', '')))}</summary><div>{inner}</div></details>")
            else:
                u = href_(it.get("link"))
                if u:
                    parts.append(f'<a{attr} href="{_h.escape(u, quote=True)}">{_h.escape(str(it.get("label", "")))}</a>')
    if g_:
        parts.append(account_menu(mroot))
    return MENU_CSS + '<div class="hbm">' + "".join(parts) + "</div>" + _menu_js(mroot)


# TAB BARS (Nov 12 2026, user: merge pages) - pages that belong together share one header entry and a tab bar under
# the header; each tab is its own page (same folder), so old links and #anchors keep working.
#   History      wars.html · chains.html · crimes.html                 (members)
#   Member data  stats.html · readiness.html                           (leaders)
#   Site settings homepage.html · header-editor.html · profile-default.html (leaders)
#   Torn panels  announcements.html · description.html                  (leaders)
HISTORY_TABS = [("⚔️ Wars", "wars.html"), ("⛓️ Chains", "chains.html"), ("🕵️ Crimes", "crimes.html")]
MEMBER_DATA_TABS = [("💪 Stats", "stats.html"), ("⚔️ War readiness", "readiness.html")]
PANEL_TABS = [("📢 Announcements", "announcements.html"), ("🖼️ Faction description", "description.html")]   # Torn panels
SETTINGS_TABS = [("🏠 Homepage", "homepage.html"), ("🧭 Header", "header-editor.html"), ("🧩 Profile layout", "profile-default.html")]
TAB_CSS = ("<style>.hbtabs{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:-4px 0 12px;font:14px system-ui,sans-serif}"
           ".hbtabs a{color:#ddd;text-decoration:none;background:#1a1012;border:1px solid #5c1c1a;border-radius:8px;padding:6px 14px}"
           ".hbtabs a.on{background:#e4382e;border-color:#e4382e;color:#fff;font-weight:600}</style>")


def tab_bar(tabs: list, cur: str) -> str:
    """The tab bar for a page group (see TAB BARS) - `cur` = this page's file name."""
    import html as _h
    on = ' class="on"'
    return TAB_CSS + '<nav class="hbtabs">' + "".join(
        f'<a href="{_h.escape(u, quote=True)}"{on if u == cur else ""}>{_h.escape(t)}</a>' for t, u in tabs) + "</nav>"


def _leader_root() -> str:
    """Leaders' folder address for member pages: the gatekeeper's /l/ (or the GitHub Pages folder)."""
    lb = leader_base() if leader_dir() else ""
    return lb + "/" if lb else ""


def site_menu(root: str = "") -> str:
    """Header for a page in the MEMBERS' folder (`root` = path back to that folder: "" / "../")."""
    return nav_menu(root, _leader_root())


def leader_menu(root: str = "") -> str:
    """Header for a page in the LEADERS' folder (`root` = path back to that folder)."""
    return nav_menu(member_base() + "/", root or "./")


def image_page(path: Path, title: str, img_src: str, markup: str, root: str = "", menu: bool = True, extra: str = ""):
    """One PDA-friendly page per image: the image full width (tap to open the
    raw file), its copy-ready HTML markup with a Copy button, and links to
    the other pages. `root` = relative path back to the site root."""
    import html as _html
    nav = site_menu(root) if menu else ""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>{_html.escape(title)}</title>
<style>body{{background:#100a0b;color:#ddd;font:15px system-ui,sans-serif;margin:0 auto;padding:12px;max-width:900px}}
h1{{color:#e4382e;font-size:20px;text-align:center;margin:6px 0 10px}}nav{{text-align:center;font-size:14px;margin-bottom:10px}}
nav a{{color:#e8be5a;text-decoration:none}}img{{width:100%;height:auto;display:block}}
textarea{{width:100%;height:110px;box-sizing:border-box;background:#1a1012;color:#ddd;border:1px solid #5c1c1a;font:12px monospace}}
button{{background:#e4382e;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-weight:600;margin:8px 0 24px}}</style></head>
<body>{nav}<h1>{_html.escape(title)}</h1>{extra}
<a href="{img_src}"><img src="{img_src}" alt="{_html.escape(title)}"></a>
<p>HTML for Torn (source / HTML view, paste):</p>
<textarea id="s" readonly onclick="this.select()">{_html.escape(markup)}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('s').value).then(()=>this.textContent='Copied!')">Copy HTML</button>
</body></html>""", encoding="utf-8")


# --------------------------------------------------------------------------
# Torn faction NEWSLETTER page helper (newsletter_page) - no longer published for reports; leaders use the Message Builder templates
# --------------------------------------------------------------------------
TORN_NEWSLETTER_URL = "https://www.torn.com/factions.php?step=your&type=1#/tab=controls&option=newsletter"


def nl_p(inner: str, extra: str = "") -> str:
    """Centered newsletter paragraph (inline styles only - Torn strips classes)."""
    return f'<p style="text-align:center;{extra}">{inner}</p>'


def nl_join(parts) -> str:
    """Torn's newsletter shows paragraphs with NO gap - put an empty paragraph between sections."""
    return "\n<p>&nbsp;</p>\n".join(x for x in parts if x)


def newsletter_page(path: Path, title: str, body: str, root: str = ""):
    """Page with a preview of the newsletter + buttons:
      Open in Torn newsletter - opens Torn's newsletter with title + body passed in the link #hash
                                (the HB Newsletter Filler userscript fills them in); also copies the HTML
      Copy title / Copy HTML  - manual fallback (paste with Torn's </> code view)."""
    import html as _html
    nav = site_menu(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps({"t": title, "h": body}).replace("</", "<\\/")   # safe inside <script>
    path.write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Newsletter - {_html.escape(title)}</title>
<style>body{{background:#100a0b;color:#ddd;font:15px system-ui,sans-serif;margin:0 auto;padding:12px;max-width:820px}}
h1{{color:#e4382e;font-size:20px;text-align:center;margin:6px 0 4px}}nav{{text-align:center;font-size:14px;margin-bottom:10px}}
nav a,.s a{{color:#e8be5a;text-decoration:none}}.s{{color:#9a9a9c;font-size:13px;text-align:center;margin:0 0 10px}}
.prev{{background:#f2f2f2;color:#333;border-radius:8px;padding:12px;font:13px Arial,sans-serif}}.prev p{{margin:0}}
.prev img{{max-width:100%;height:auto}}.prev a{{color:#069}}
.btns{{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0 24px}}
button{{background:#2a1416;color:#eee;border:1px solid #6b2420;padding:10px 14px;border-radius:6px;font-weight:600}}
button.g{{background:#e4382e;border-color:#e4382e;color:#fff}}</style></head>
<body>{nav}<h1>{_html.escape(title)}</h1>
<p class="s">Faction newsletter - with the <b>HB Newsletter Filler</b> userscript, <b>Open in Torn newsletter</b> fills it in for you.
Without it: Copy title + Copy HTML, then paste in Torn using the &lt;/&gt; button.</p>
<div class="btns"><button class="g" id="o">Open in Torn newsletter</button><button id="ct">Copy title</button><button id="ch">Copy HTML</button></div>
<div class="prev">{body}</div>
<script>
var D={data};
function cp(t,b){{function ok(){{b.textContent="Copied!";}}
 if(navigator.clipboard&&document.hasFocus())navigator.clipboard.writeText(t).then(ok,function(){{old(t);ok();}});else{{old(t);ok();}}}}
function old(t){{var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{{document.execCommand("copy");}}catch(e){{}}a.remove();}}
function link(){{var b=new TextEncoder().encode(JSON.stringify(D)),s="";b.forEach(function(x){{s+=String.fromCharCode(x);}});
 return "{TORN_NEWSLETTER_URL}&hbnews="+btoa(s).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}}
document.getElementById("ct").onclick=function(){{cp(D.t,this);}};
document.getElementById("ch").onclick=function(){{cp(D.h,this);}};
document.getElementById("o").onclick=function(){{var l=link();old(D.h);window.open(l,"_blank");}};
</script></body></html>""", encoding="utf-8")


REPORTS_DIR = ROOT / "data" / "reports"
REPORTS_KEEP = 500         # newest reports kept per kind (war / chain) - every war has its report; hubs list the last 15
DEPLOY_REQUEST = ROOT / "data" / ".deploy_request"   # chain runs don't deploy: ask the workflow for a full run


def save_report(kind: str, rid, png: bytes, meta: dict) -> str:
    """Keep a posted report (image + facts) in data/reports so its page + newsletter can be published
    (and stay up) - returns its slug, e.g. "chain-12345". Older ones beyond REPORTS_KEEP are dropped."""
    slug = f"{kind}-{rid}"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / f"{slug}.png").write_bytes(png)
    (REPORTS_DIR / f"{slug}.json").write_text(json.dumps(dict(meta, kind=kind, id=str(rid))), encoding="utf-8")
    olds = sorted(REPORTS_DIR.glob(f"{kind}-*.json"), key=lambda f: json.loads(f.read_text()).get("end", 0))
    for f in olds[:-REPORTS_KEEP]:
        f.unlink(); f.with_suffix(".png").unlink(missing_ok=True)
    return slug


def report_links(slug: str) -> list:
    """Discord link button for a report: its page. (No newsletter buttons any more - leaders make newsletters
    in the Message Builder, which has War Report / Payout and other templates.)"""
    base_url = member_base()
    return [{"type": 1, "components": [
        {"type": 2, "style": 5, "label": "Report", "url": f"{base_url}/reports/{slug}.html"}]}]


# TERMED WARS: config.json "termed_wars": [war id, ...] - wars agreed with the enemy (e.g. a set result). Leaders
# toggle it on each war's report page (war_termed_box -> saved to config.json through the gatekeeper). A termed war
# is left out of reliability, the participation trend, Slacker Watch and "took part" figures, and a member who
# didn't hit in it isn't counted as having missed it (their hits in it still count everywhere).
def termed_wars(cfg: dict = None) -> set:
    """Termed wars: config "termed_wars" - set by the toggle on a war's report page and by the payout calculator's
    required Termed yes / no when a receipt is saved (the receipt keeps the answer too, "termed": true/false, as a
    record; the settings list is what counts, so a later toggle on the report page always wins)."""
    try:
        cfg = cfg if cfg is not None else load_config()
    except (OSError, ValueError):
        return set()
    return {str(x) for x in cfg.get("termed_wars", []) or []}


def war_termed_box(meta: dict) -> str:
    """The Termed badge on a war report page + the leaders' on/off toggle with Save (shown only to leaders -
    whoami). Saves config.json "termed_wars" through the gatekeeper (GET for the sha, PUT the change)."""
    wid = str(meta.get("id", ""))
    on = wid in termed_wars()
    proxy, g_ = gh_proxy_url(), gate_cfg()
    who = (g_["url"].rstrip("/") + "/m/whoami.json") if g_ else ""
    badge = ('<div id="tmB" style="text-align:center;margin:0 0 10px;' + ("" if on else "display:none;") +
             '"><span style="background:#3a2d12;color:#e8be5a;border:1px solid #6b4a18;border-radius:8px;padding:4px 12px;'
             'font-size:13px">🤝 Termed war - not counted against anyone\'s participation or reliability</span></div>')
    if not proxy:
        return badge
    return badge + f"""<div id="tmL" style="display:none;background:#170d0e;border:1px dashed #6b4a18;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:14px">
<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="tmC"{" checked" if on else ""} style="width:18px;height:18px">
<span><b style="color:#e8be5a">Termed war</b> <span style="color:#9a9a9c;font-size:12px">(leaders) - leave this war out of reliability and participation</span></span></label>
<button id="tmS" style="margin:8px 0 0;padding:7px 14px">Save</button> <span id="tmM" style="color:#e8be5a;font-size:13px"></span></div>
<script>
// Termed toggle (leaders only): config.json "termed_wars" through the gatekeeper's save route
(function(){{var W={json.dumps(wid)},P={json.dumps(proxy)},$=function(i){{return document.getElementById(i)}};
fetch({json.dumps(who)},{{cache:"no-store"}}).then(function(r){{return r.ok?r.json():null}}).then(function(w){{if(w&&w.leader)$("tmL").style.display=""}}).catch(function(){{}});
var d=function(b){{return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\\n/g,"")),function(c){{return c.charCodeAt(0)}}))}};
var e=function(t){{var u=new TextEncoder().encode(t),s="";for(var i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}};
$("tmS").onclick=function(){{var on=$("tmC").checked;$("tmM").textContent="Saving…";
  fetch(P+"config.json?ref=main",{{cache:"no-store"}}).then(function(r){{if(!r.ok)throw new Error("couldn't read the settings ("+r.status+")");return r.json()}})
  .then(function(j){{var c=JSON.parse(d(j.content)),l=(c.termed_wars||[]).map(String).filter(function(x){{return x!==W}});if(on)l.push(W);c.termed_wars=l;
    return fetch(P+"config.json",{{method:"PUT",headers:{{"Content-Type":"application/json","X-HB-Save":"1"}},
      body:JSON.stringify({{message:"War "+W+(on?" marked termed":" no longer termed"),sha:j.sha,branch:"main",content:e(JSON.stringify(c,null,2)+"\\n")}})}})}})
  .then(function(r){{if(!r.ok)throw new Error("save failed ("+r.status+")");$("tmM").textContent="Saved ✓ - reliability and the pages update in a few minutes";
    $("tmB").style.display=on?"":"none"}}).catch(function(x){{$("tmM").textContent=x.message}})}};}})();
</script>"""


def report_newsletter(meta: dict, slug: str) -> tuple:
    """(title, body HTML) for a saved war / chain report."""
    base_url = member_base()
    when = datetime.fromtimestamp(meta.get("end", 0), timezone.utc).strftime("%b %d, %Y") if meta.get("end") else ""
    img = nl_p(f'<a href="{base_url}/reports/{slug}.html"><img src="{base_url}/reports/{slug}.png" '
               f'alt="{meta.get("title", "Report")}" width="600"></a>')
    if meta["kind"] == "war":
        won = meta.get("won")
        col = "#2e8b3a" if won else "#c0261d"
        rank = ""
        if meta.get("rank_before") and meta.get("rank_after"):
            rank = (f" · Rank {meta['rank_after']}" if meta["rank_before"] == meta["rank_after"]
                    else f" · Rank {meta['rank_before']} → {meta['rank_after']}")
        title = (f"War Report{' & Payout' if meta.get('pay') else ''} - {'Victory' if won else 'Defeat'} "
                 f"vs {meta.get('opponent', '?')}")
        body = nl_join([
            nl_p(f'<strong><span style="font-size:20px;color:#c0261d">WAR REPORT{" &amp; PAYOUT" if meta.get("pay") else ""}</span></strong>'),
            nl_p(f'<strong><span style="font-size:16px;color:{col}">{"Victory" if won else "Defeat"} vs '
                 f'{meta.get("opponent", "?")}</span></strong><br>{when} · Score {fmt_int(meta.get("our", 0))} - '
                 f'{fmt_int(meta.get("their", 0))}{rank}'),
            nl_p(f'<strong>{fmt_int(meta.get("hits", 0))}</strong> war hits · <strong>{meta.get("hit", 0)}</strong> of '
                 f'{meta.get("present", 0)} members took part'
                 + (f' · <strong>{_short_money(meta.get("paid", 0))}</strong> paid to {meta.get("paid_n", 0)} members'
                    if meta.get("pay") else "")),
            img])
    else:
        title = f"Chain Report - {fmt_int(meta.get('length', 0))} hits"
        body = nl_join([
            nl_p('<strong><span style="font-size:20px;color:#c0261d">CHAIN REPORT</span></strong>'),
            nl_p(f'<strong><span style="font-size:16px">{fmt_int(meta.get("length", 0))} hit chain</span></strong>'
                 f'<br>{when}' + (f' · {meta["dur"]}' if meta.get("dur") else "")),
            nl_p(f'<strong>{meta.get("respect", 0):,.0f}</strong> respect · <strong>{meta.get("attackers", 0)}</strong> members involved'),
            img])
    return title, body


def write_report_pages(out: Path):
    """Every saved report: reports/<slug>.png + page (member folder)."""
    mout = member_out(out)
    base_url = member_base()
    for f in sorted(REPORTS_DIR.glob("*.json")) if REPORTS_DIR.exists() else []:
        try:
            meta = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        slug = f.stem
        png = f.with_suffix(".png")
        if not png.exists():
            continue
        (mout / "reports").mkdir(parents=True, exist_ok=True)
        (mout / "reports" / png.name).write_bytes(png.read_bytes())
        title, body = report_newsletter(meta, slug)
        image_page(mout / "reports" / f"{slug}.html", title, png.name,
                   f'<p style="text-align:center;"><a href="{base_url}/reports/{slug}.html"><img src="{base_url}/reports/'
                   f'{png.name}" alt="{title}" width="600"></a></p>', "../",
                   extra=war_termed_box(meta) if meta.get("kind") == "war" else "")
        # a paid war: its payout pages ARE the combined War Report & Payout (old receipt links keep working)
        if meta.get("kind") == "war" and meta.get("pay"):
            wid = str(meta.get("id"))
            (mout / "payouts").mkdir(parents=True, exist_ok=True)
            stems = [f"war-{wid}"] + [g.stem for g in (PAYOUT_DIR.glob("*.json") if PAYOUT_DIR.exists() else [])
                                       if g.stem.split("-")[0] == wid]
            for st in stems:
                (mout / "payouts" / f"{st}.png").write_bytes(png.read_bytes())
                (mout / "payouts" / f"{st}.html").write_text(
                    f'<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">'
                    f'<meta http-equiv="refresh" content="0;url=../reports/{slug}.html"><title>War Report &amp; Payout</title></head>'
                    f'<body style="background:#100a0b;color:#ddd;font-family:sans-serif;text-align:center">'
                    f'<p><a href="../reports/{slug}.html" style="color:#e8be5a">Open the War Report &amp; Payout</a></p></body></html>',
                    encoding="utf-8")


PANELS_DIR = ROOT / "data" / "panels"     # images published from the Message Builder


def write_message_builder(out: Path):
    """builder.html (LEADER folder) - Message Builder: leaders compose panels in the faction frame
    (header art, title bar, red grid panel, Rajdhani fonts) in their browser and export them.
    The frame pieces it draws with are exported here as PNGs (builder/*), sizes/colours via CONFIG.
    Images published from it (data/panels/*.png, committed with a leader's GitHub token) are copied
    to panels/ so they have a URL for Torn newsletters / mail."""
    import shutil
    mout = member_out(out)
    if not leader_dir():
        print("Message Builder: LEADER_DIR secret not set - not published")
        return
    lout = out / leader_dir()
    bd = lout / "builder"
    bd.mkdir(parents=True, exist_ok=True)
    head_bar = Image.new("RGBA", (W, 56 + 102), (0, 0, 0, 0))
    head_bar.alpha_composite(frame_top(), (0, 0))
    head_bar.alpha_composite(piece("section_top"), (0, 56))
    for name, im in (("head_big", compact_header("")), ("head_bar", head_bar), ("head_top", frame_top()),
                     ("end", final_end()), ("side_l", piece("side_l")), ("side_r", piece("side_r"))):
        im.save(bd / f"{name}.png", optimize=True)
    for w_ in ("Medium", "SemiBold", "Bold"):
        shutil.copyfile(FONT_DIR / f"Rajdhani-{w_}.ttf", bd / f"Rajdhani-{w_}.ttf")
    # navigation buttons (same look as the announcement's): blank gunmetal plate + every icon on its red plate
    metal_tile(BTN_SIZE, chamfer=14).save(bd / "btn_blank.png", optimize=True)
    (bd / "icons").mkdir(exist_ok=True)
    icons, all_icons = [], []
    for f in sorted(ICON_DIR.glob("*.png")):
        try:
            icon_plate(f.stem).save(bd / "icons" / f"{f.stem}.png", optimize=True)
        except Exception as e:
            print(f"Message Builder: icon {f.stem} skipped ({type(e).__name__})")
            continue
        nice = [f.stem, f.stem.split("-", 1)[-1].replace("-", " ").title() + (" (requirements art)" if f.stem.startswith("art2-") else "")]
        all_icons.append(nice)                         # Site Panels: every icon the banner can use
        if not f.stem.startswith(("glyph-", "art2-")):
            icons.append(nice)                         # Message Builder buttons
    conf = {"repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "member_base": member_base(),
            "W": W, "SIDE_W": SIDE_W, "PANEL_X0": PANEL_X0, "PANEL_X1": PANEL_X1, "CX0": CX0, "CX1": CX1,
            "PAD_TOP": PAD_TOP, "PAD_BOT": PAD_BOT, "OUTER_PAD": OUTER_PAD, "CHAMFER": FRAME_CHAMFER,
            "heads": {"big": {"img": "head_big.png", "h": 402, "ty": 376},
                      "bar": {"img": "head_bar.png", "h": 158, "ty": 132},
                      "none": {"img": "head_top.png", "h": 56, "ty": None}},
            "end_h": 56,
            "btn": {"w": BTN_SIZE[0], "h": BTN_SIZE[1], "plate_cx": 22 + 76, "text_x0": 22 + 152 + 20},
            "icons": icons,
            # the announcement's own buttons, offered as a one-click preset
            "preset_buttons": [dict(b, url=str(b.get("url", "")).replace("{member_base}", member_base()))
                               for b in load_config().get("announcements", {}).get("buttons", [])],
            "colors": {"RED": RED, "TITLE": TITLE, "TEXT": TEXT, "SUB": SUB, "RULE": RULE, "SHADOW": SHADOW,
                       "INTERIOR": INTERIOR, "GLOW": GLOW, "CARD_FILL": CARD_FILL, "CARD_EDGE": CARD_EDGE,
                       "GOLD": (232, 190, 90), "GREEN": (120, 200, 120)}}
    html_ = (ROOT / "tools" / "message_builder.html").read_text(encoding="utf-8")
    (lout / "builder.html").write_text(html_.replace("__CONFIG__", json.dumps(conf)).replace("__MENU__", leader_menu("")),
                                       encoding="utf-8")
    # Site Panels editor: the description banner + announcements text/tiles/buttons (config.json via the GitHub API)
    pconf = {"repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "member_base": member_base(), "icons": all_icons,
             "banner_url": public_base() + "/banner.webp",
             "announce_url": f"{member_base()}/announce-header.webp"}
    # one page per panel (header: Site Panels -> Description / Announcements), each its own editor + live
    # preview + the HTML for Torn under the panel. "html" = what's live now (the preview replaces it as you edit)
    tpl_ = (ROOT / "tools" / "panels_editor.html").read_text(encoding="utf-8")
    for only, fname in (("D", "description.html"), ("A", "announcements.html")):
        c_ = dict(pconf, only=only, html=description_snippet() if only == "D" else _PANEL_HTML.get("A", ""),
                  leadership=LEADERSHIP_NOW)      # who holds each leadership slot now (Description editor)
        (lout / fname).write_text(tpl_.replace("__CONFIG__", json.dumps(c_)).replace("__MENU__", leader_menu("") + tab_bar(PANEL_TABS, fname)),
                                  encoding="utf-8")
    (lout / "panels.html").write_text('<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" '
                                      'content="0;url=announcements.html"><title>Site Panels</title>', encoding="utf-8")
    if PANELS_DIR.exists():
        (mout / "panels").mkdir(exist_ok=True)
        for f in PANELS_DIR.glob("*.png"):
            shutil.copyfile(f, mout / "panels" / f.name)


HUB_CSS = """
:root{--bg:#100a0b;--card:#170d0e;--edge:#5c1c1a;--gold:#e8be5a;--red:#e4382e;--sub:#9a9a9c;--green:#78c878}
*{box-sizing:border-box}body{background:var(--bg);color:#ddd;font:15px system-ui,sans-serif;margin:0 auto;padding:14px;max-width:1100px}
a{color:inherit;text-decoration:none}
.top{text-align:center;margin:4px 0 18px}.top img{max-width:100%;height:auto}
h1{color:var(--red);font-size:24px;letter-spacing:2px;text-transform:uppercase;margin:6px 0 2px}
.tag{color:var(--sub);font-size:13px}
h2{color:var(--gold);font-size:14px;letter-spacing:1.5px;text-transform:uppercase;margin:24px 0 10px;border-bottom:1px solid var(--edge);padding-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.tile{display:block;background:var(--card);border:1px solid var(--edge);border-radius:10px;padding:12px 14px;transition:border-color .15s}
.tile:hover{border-color:var(--red)}.tile b{display:block;color:#fff;font-size:16px;margin-bottom:3px}
.tile span{color:var(--sub);font-size:13px}.tile i{font-style:normal;font-size:20px;margin-right:6px}
.tile.l{border-color:#6b4a18}.tile.l:hover{border-color:var(--gold)}
.latest{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.latest a{background:var(--card);border:1px solid var(--edge);border-radius:10px;overflow:hidden;display:block}
.latest a:hover{border-color:var(--red)}.latest img{width:100%;height:150px;object-fit:cover;object-position:top;display:block;background:#000}
.latest div{padding:8px 12px}.latest b{color:#fff;display:block}.latest span{color:var(--sub);font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--edge);border-radius:10px;overflow:hidden}
td,th{padding:9px 10px;border-bottom:1px solid #2a1416;text-align:left;font-size:14px}th{color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1px}
td a{color:var(--gold)}.w{color:var(--green)}.d{color:var(--red)}
.foot{text-align:center;color:var(--sub);font-size:12px;margin:26px 0 8px}
.note{background:#1f1608;border:1px solid #6b4a18;color:#e8d6a8;border-radius:8px;padding:8px 12px;font-size:13px;margin:8px 0}
"""


# Homepage (hub) layout: welcome · right now · needs attention · quick actions · latest · explore groups.
# A narrower column so it reads like an app on a phone and doesn't sprawl on a desktop.
HUB_CSS += """
.hubw{max-width:760px;margin:0 auto}
.hbsec[hidden]{display:none}
.wel{display:flex;align-items:center;gap:12px;margin:14px 2px 12px}
.av{width:48px;height:48px;border-radius:50%;background:#3b1513;color:#ff6b61;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex:none}
.wt{flex:1;min-width:0}.wt b{display:block;color:#fff;font-size:18px}.wt span{color:var(--sub);font-size:13px}
.relb{background:#3a2d12;color:var(--gold);font-size:12px;padding:3px 9px;border-radius:8px;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:6px}
.stats>div{background:var(--card);border:1px solid #2e1719;border-radius:10px;padding:10px}
.stats .l{color:var(--sub);font-size:12px}.stats .v{color:#fff;font-size:22px;font-weight:700;line-height:1.25}
.stats .s{font-size:12px;color:var(--sub)}.up{color:var(--green)!important}.dn{color:#ff6b61!important}
.nowc{display:flex;flex-direction:column;gap:8px}
.nowc>a{display:flex;align-items:center;gap:12px;border-radius:10px;padding:11px 13px;border:1px solid}
.nowc .war{background:#3b1513;border-color:#6b2420}.nowc .chain{background:#2e2410;border-color:#5c4716}
.nowc>a>i{font-style:normal;font-size:22px}.nowc .x{flex:1;min-width:0}.nowc b{display:block;color:#fff}
.nowc .x span{color:var(--sub);font-size:13px}.nowc .war em{color:#ff6b61;font-style:normal;font-weight:700}
.nowc .chain em{color:var(--gold);font-style:normal;font-weight:700}
.nowc .go{font-size:12px;padding:3px 10px;border-radius:8px;background:#6b2420;color:#ffd6d2}
.nowc .chain .go{background:#5c4716;color:#ffe9b8}
.pbar{height:5px;background:#3a2d12;border-radius:3px;margin:6px 0 4px}.pbar u{display:block;height:5px;background:var(--gold);border-radius:3px}
.keyc{background:var(--card);border:1px dashed var(--edge);border-radius:10px;padding:11px 13px;font-size:13px;color:var(--sub)}
.keyc b{color:#fff;font-size:14px}.keyc form{display:flex;gap:6px;margin:8px 0 6px}
.keyc input{flex:1;min-width:0;background:#1f1214;color:#eee;border:1px solid #4a1d1b;border-radius:8px;padding:9px;font:14px system-ui}
.keyc button{background:var(--red);color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
.keyc small{display:block;font-size:11px}.keyc .err{color:#ff6b61;margin-top:4px}.keyc a{color:var(--gold)}
.nowf{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--sub);margin-top:2px;padding:0 2px}
.nowf .lv{display:flex;align-items:center;gap:6px;min-width:0}.nowf .lv i{width:7px;height:7px;border-radius:50%;background:var(--green);flex:none}
.nowf .lv i.off{background:#ff6b61}
.keyx{background:transparent;color:var(--sub);border:1px solid #3a2729;border-radius:14px;padding:4px 11px;font:12px system-ui;cursor:pointer;white-space:nowrap}
.keyx:hover{color:#ff8a80;border-color:#6b2420}.nowe{color:#ff6b61;font-size:12px;padding:0 2px}
.nowq{background:var(--card);border:1px solid #2e1719;border-radius:10px;padding:11px 13px;font-size:14px;color:var(--sub);display:flex;align-items:center;gap:10px}
.attn{background:var(--card);border:1px solid #6b4a18;border-radius:12px;padding:10px 14px;margin:18px 0 6px}
.attn .ah{display:flex;align-items:center;gap:8px;margin-bottom:4px}.attn .ah b{flex:1;color:#fff;font-size:15px}
.attn .cnt{background:#3a2d12;color:var(--gold);font-size:12px;padding:2px 9px;border-radius:8px}
.attn a{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #2e1719;font-size:14px}
.attn a i{font-style:normal;width:22px;text-align:center}.attn a span{flex:1}.attn a em{color:var(--gold);font-style:normal;font-size:13px}
.qa{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:18px 0 4px}
.qa a{text-align:center;color:var(--sub);font-size:12px}
.qa a i{display:flex;align-items:center;justify-content:center;height:52px;font-style:normal;font-size:24px;background:var(--card);border:1px solid var(--edge);border-radius:12px;margin-bottom:5px;transition:border-color .15s}
.qa a:hover i{border-color:var(--red)}
.feat{display:block;background:var(--card);border:1px solid var(--edge);border-radius:12px;overflow:hidden;margin-bottom:10px}
.feat:hover{border-color:var(--red)}.feat img{width:100%;max-height:260px;object-fit:cover;object-position:top;display:block;background:#000}
.feat div{padding:10px 13px}.feat b{display:block;color:#fff;font-size:16px;margin:6px 0 1px}.feat .sub{color:var(--sub);font-size:12px}
.badge{display:inline-block;background:#3b1513;color:#ff6b61;font-size:11px;padding:2px 9px;border-radius:8px}
.ltiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
.ltile{background:var(--card);border:1px solid var(--edge);border-radius:12px;padding:8px 13px 4px}
.ltile p{display:flex;justify-content:space-between;align-items:center;margin:2px 0 4px;color:var(--gold);font-size:12px;letter-spacing:1px;text-transform:uppercase}
.ltile p a{color:var(--sub);font-size:12px;text-transform:none;letter-spacing:0}
.ltile>a{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #2e1719}
.ltile .t{flex:1;min-width:0;color:#eee;font-size:14px}.ltile .t small{display:block;color:var(--sub);font-size:12px}
.ltile .ago{color:var(--sub);font-size:12px;white-space:nowrap}.ltile>a:hover .t{color:var(--gold)}
.list{background:var(--card);border:1px solid var(--edge);border-radius:12px;padding:0 13px}
.list a{display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid #2e1719}.list a:first-child{border-top:0}
.list a i{font-style:normal;font-size:18px;width:24px;text-align:center}.list .t{flex:1;min-width:0;color:#eee;font-size:14px}
.list .t small{display:block;color:var(--sub);font-size:12px}.list .ago{color:var(--sub);font-size:12px;white-space:nowrap}
.list a:hover .t{color:var(--gold)}
.groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px;background:var(--card);border:1px solid var(--edge);border-radius:12px;padding:12px 14px}
.groups p{margin:0 0 4px;color:var(--gold);font-size:12px;letter-spacing:1px;text-transform:uppercase}
.groups a{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:14px;color:#ddd}.groups a:hover{color:var(--gold)}
.groups a i{font-style:normal;width:20px;text-align:center}
@media(max-width:420px){.stats .v{font-size:19px}.groups{grid-template-columns:repeat(2,minmax(0,1fr))}}
"""

# HOME_JS: the hubs' live parts. window.HBH (home_js_cfg) says where to read from:
#   who   /m/whoami.json  - name, position, leader      mine  /m/mine.json - own reliability (leaders' badge)
#   home  db/home.json    - own numbers vs average
#   att   leaders' db/attention.json - unpaid payouts, idle recruits ("Needs attention" hides when empty)
# "Right now" (live ranked war + chain) comes from the Hub (/m/now.json, Nov 12 2026 - members no longer paste a key
# here): the war from the Hub's 3-minute Torn read, the chain from the Chain Watch room or that read. Timers tick
# every second; the Hub is asked every 20 s while the page is visible.
HOME_JS = r"""
(function(){
const H=window.HBH||{},$=id=>document.getElementById(id),now=()=>Date.now()/1e3;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const get=u=>u?fetch(u,{cache:"no-store",credentials:"same-origin"}).then(r=>r.ok?r.json():null).catch(()=>null):Promise.resolve(null);
const k=v=>v>=1e6?(v/1e6).toFixed(1).replace(/\.0$/,"")+"m":v>=1e4?Math.round(v/1e3)+"k":v>=1e3?(v/1e3).toFixed(1).replace(/\.0$/,"")+"k":String(Math.round(v));
const ago=t=>{const s=now()-t;return s<3600?Math.max(1,Math.round(s/60))+"m":s<86400?Math.round(s/3600)+"h":Math.round(s/86400)+"d"};
const agoL=t=>{const s=now()-t;return s<3600?"posted "+Math.max(1,Math.round(s/60))+" min ago":s<86400?"posted "+Math.round(s/3600)+" h ago":s<172800?"posted yesterday":"posted "+Math.round(s/86400)+" days ago"};
const dur=s=>{s=Math.max(0,Math.floor(s));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;
  return d?`${d}d ${h}h ${String(m).padStart(2,"0")}m`:h?`${h}h ${String(m).padStart(2,"0")}m ${String(x).padStart(2,"0")}s`:`${m}:${String(x).padStart(2,"0")}`};
const BONUS=[10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000];
document.querySelectorAll(".ago[data-t]").forEach(e=>{const t=+e.dataset.t;if(t)e.textContent=e.dataset.long?agoL(t):ago(t)});
let WHO=null,HOME=null,ATT=null,WAR,CHAIN,NOWERR="",lastOk=0,DATAAT=0;

function welcome(){const el=$("hbWel");if(!el)return;
  const hr=new Date().getHours(),hi=hr<5?"Good evening":hr<12?"Good morning":hr<18?"Good afternoon":"Good evening";
  const r=WHO&&HOME&&HOME.m?HOME.m[String(WHO.id)]:null,A=(HOME&&HOME.avg)||{};
  const ini=WHO?String(WHO.name).replace(/[^A-Za-z0-9]/g,"").slice(0,2).toUpperCase()||"HB":"HB";
  const days=r&&r[0]!=null?` · ${Number(r[0]).toLocaleString("en-US")} days in faction`:"";
  el.querySelector(".wel").innerHTML=`<div class="av">${esc(ini)}</div><div class="wt"><b>${WHO?`${hi}, ${esc(WHO.name)}`:"Welcome to Heart Breakers"}</b>`
    +`<span>${WHO?esc(WHO.position||"Member")+days:"Members hub"}</span></div><span class="relb" id="hbRel" hidden></span>`;
  if(!r){el.querySelector(".stats").innerHTML="";return}
  const diff=(v,a,u)=>{if(v==null||a==null)return'<div class="s">&nbsp;</div>';const d=Math.round((v-a)*10)/10;
    return `<div class="s ${d>=0?"up":"dn"}">${d>=0?"+":""}${d}${u||""} vs avg</div>`};
  const lw=HOME.last_war;
  el.querySelector(".stats").innerHTML=
    `<div><div class="l">Last war hits</div><div class="v">${r[1]==null?"-":r[1]}</div>${r[1]==null?`<div class="s">${lw?"not in vs "+esc(lw.opponent):"no wars yet"}</div>`:diff(r[1],A.war)}</div>`
   +`<div><div class="l">Gym, month so far</div><div class="v">${k(r[2]||0)}</div><div class="s">avg ${A.gym!=null?k(A.gym):"-"}</div></div>`
   +`<div><div class="l">Crime success</div><div class="v">${r[3]==null?"-":r[3]+"%"}</div>${r[3]==null?'<div class="s">no crimes yet</div>':diff(r[3],A.oc," pts")}</div>`;
  if(WHO.leader&&H.mine)get(H.mine).then(m=>{const s=m&&m.reliability&&m.reliability.score;const b=$("hbRel");
    if(b&&s!=null){const g=relG(s);b.innerHTML="Reliability <b style=\"color:"+g[1]+"\">"+g[0]+"</b> · "+Math.round(s);b.hidden=false}});
}

function attention(){const el=$("hbAtt");if(!el)return;const L=H.links||{},rows=[];
  ((ATT&&ATT.unpaid)||[]).forEach(u=>rows.push(`<a href="${L.payout}"><i>💰</i><span>War payout vs ${esc(u.opponent||"?")} unpaid</span><em>Pay</em></a>`));
  const rc=(ATT&&ATT.recruits)||[];
  if(rc.length)rows.push(`<a href="${rc.length===1?L.profile+"?id="+rc[0].id:L.members}"><i>🙍</i><span>${rc.length===1?esc(rc[0].name)+" (recruit) inactive "+rc[0].idle+" days"
    :rc.length+" recruits inactive "+Math.min(...rc.map(r=>r.idle))+"+ days"}</span><em>${rc.length===1?"Profile":"Members"}</em></a>`);
  el.querySelector(".rows").innerHTML=rows.join("");el.querySelector(".cnt").textContent=rows.length;el.hidden=!rows.length;
}


// ---------- Right now: live war + chain FROM THE HUB (Nov 12 2026, user: no key on the homepage) ----------
// /m/now.json (gate/worker.js hubNow): the ranked war from the Hub's own 3-minute Torn read, the chain from the
// Chain Watch room (members' scripts, every few seconds during a chain) or else that 3-minute read. Read every
// NOW_EVERY s while the page is visible - no Torn call from the browser, no key. The old browser key is forgotten.
const NOW_EVERY=5;   // Nov 13 2026: chain watch within 5-10 s (the Hub reuses its answer for 3 s)
try{localStorage.removeItem("hb_pub_key")}catch(e){}
async function getNow(){const d=await get(H.now);
  if(!d||!d.ok){NOWERR="Couldn't reach the Hub just now - retrying.";nowCards();return}
  // "updated ... ago" = when THIS page last got an answer from the Hub (every NOW_EVERY s - Nov 13 2026: it used to
// show the age of the chain reading, which only moves on a hit or a Hub read, so it looked like a 30 s refresh);
// DATAAT = when the Hub last confirmed the chain reading - shown only if it's over 90 s old
WAR=d.war||null;CHAIN=d.chain||null;NOWERR="";lastOk=now();DATAAT=d.chain?(d.chain.seen_at||d.chain.as_of||0):0;nowCards()}
// the war + chain cards (redrawn every second for the timers)
function nowCards(){const el=$("hbNow");if(!el)return;el.hidden=false;
  const t=now(),L=H.links||{};let h="";
  if(WAR){const live_=WAR.kind==="ongoing"||(WAR.start&&WAR.start<=t);
    h+=`<a class="war" href="${L.torn_war}" target="_blank" rel="noopener"><i>⚔️</i><div class="x"><b>Ranked war vs ${esc(WAR.opponent)}</b>`
      +(live_?`<span>Live · <em>${WAR.our.toLocaleString("en-US")} - ${WAR.their.toLocaleString("en-US")}</em></span>`
             :`<span>Starts in <em>${dur(WAR.start-t)}</em></span>`)+`</div><span class="go">${live_?"Fight":"Plan"}</span></a>`}
  const c=CHAIN;
  if(c&&c.current>0&&c.timeout_at>t-20){const nx=BONUS.find(b=>b>c.current)||c.max||c.current,pv=[0].concat(BONUS).filter(b=>b<=c.current).pop()||0;
    const pc=Math.max(3,Math.min(100,Math.round(100*(c.current-pv)/Math.max(1,nx-pv))));
    h+=`<a class="chain" href="${L.torn_chain}" target="_blank" rel="noopener"><i>⛓️</i><div class="x"><b>Chain ${c.current.toLocaleString("en-US")} / ${nx.toLocaleString("en-US")}</b>`
      +`<div class="pbar"><u style="width:${pc}%"></u></div><span>${c.timeout_at>t?`Timeout <em>${dur(c.timeout_at-t)}</em>`:"Checking…"} · ${(nx-c.current).toLocaleString("en-US")} to the next bonus</span></div><span class="go">Hit</span></a>`}
  else if(c&&c.cooldown_at>t)h+=`<a class="chain" href="${L.torn_chain}" target="_blank" rel="noopener"><i>❄️</i><div class="x"><b>Chain on cooldown</b><span>A new chain can start in <em>${dur(c.cooldown_at-t)}</em></span></div></a>`;
  if(!h&&(WAR!==undefined||CHAIN!==undefined))h=`<div class="nowq">😴 No ranked war or chain running right now.</div>`;
  else if(!h)h=`<div class="nowq">Checking…</div>`;
  if(NOWERR)h+=`<div class="nowe">${esc(NOWERR)}</div>`;
  h+=`<div class="nowf"><span class="lv"><i class="${NOWERR?"off":""}"></i>Live from the Hub${lastOk?` · updated ${dur(Math.max(0,t-lastOk))} ago`:""}${CHAIN&&CHAIN.current>0&&DATAAT&&t-DATAAT>90?` · chain last confirmed ${dur(t-DATAAT)} ago`:""}</span></div>`;
  el.querySelector(".nowc").innerHTML=h}
let lastN=0;
function tick(){if($("hbNow")&&document.visibilityState==="visible"){const t=now();if(t-lastN>=NOW_EVERY){lastN=t;getNow()}}nowCards()}
Promise.all([get(H.who),get(H.home),$("hbAtt")?get(H.att):null]).then(([w,h,a])=>{WHO=w;HOME=h;ATT=a;welcome();attention()});
if($("hbNow")){tick();setInterval(tick,1e3);document.addEventListener("visibilitychange",tick)}
})();
"""


def _hub_page(path: Path, title: str, tagline: str, body: str, hub: bool = False, top: bool = True, menu: str = "",
              fresh: list = None, fresh_root: str = ""):
    """A page in the hub style. hub=True: the homepage column (.hubw); top=False: no big title (the hub's
    welcome section greets the member instead)."""
    import html as _html
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M TCT")
    path.write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>{_html.escape(title)}</title><style>{HUB_CSS}</style></head><body>
{menu}{f'<div class="top"><h1>{_html.escape(title)}</h1><div class="tag">{tagline}</div></div>' if top else ""}
{f'<div class="hubw">{body}</div>' if hub else body}
{fresh_html(fresh, fresh_root) if fresh else ""}<div class="foot">Page built {stamp}</div></body></html>""", encoding="utf-8")


def _hub_tiles(items, cls="") -> str:
    """items: [(icon, title, description, href)]"""
    import html as _html
    return '<div class="grid">' + "".join(
        f'<a class="tile {cls}" href="{u}"><b><i>{ic}</i>{_html.escape(t)}</b><span>{_html.escape(d)}</span></a>'
        for ic, t, d, u in items) + "</div>"


def latest_newsletters(n: int = 2, with_time: bool = False) -> list:
    """Newest Newsletter Builder images: [(name, title, subtitle)] newest first (with_time: + publish time). The name ends in the publish time
    (base 36, e.g. newsletter-mw371ul2); data/panels/<name>.json (saved with it since Nov 2026) has the title."""
    if not PANELS_DIR.exists():
        return []
    items = []
    for f in PANELS_DIR.glob("*.png"):
        if "-btn-" in f.stem:
            continue
        meta = {}
        try:
            meta = json.loads(f.with_suffix(".json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        t = meta.get("created")
        if not t:
            try:
                t = int(f.stem.rsplit("-", 1)[-1], 36) // 1000
            except ValueError:
                t = 0
        kind = f.stem.rsplit("-", 1)[0].replace("-", " ").title()
        # named publishes ("Newsletter-11/07/2026") show that name; older ones their heading
        title = meta.get("title") if meta.get("type") else (meta.get("heading") or meta.get("title") or kind)
        when = datetime.fromtimestamp(t, timezone.utc).strftime("%b %d, %Y") if t else ""
        sub = f"{meta.get('type') or 'Newsletter'} · {when}" if when else (meta.get("type") or "Newsletter")
        items.append((t, f.stem, str(title).title() if str(title).isupper() else str(title), sub))
    if with_time:
        return [(nm, ti, su, _t) for _t, nm, ti, su in sorted(items, reverse=True)[:n]]
    return [(nm, ti, su) for _t, nm, ti, su in sorted(items, reverse=True)[:n]]


def _hub_latest_items(mb: str, per_kind: int = 3) -> list:
    """Everything the "Latest" section can show, newest first (up to per_kind of each kind):
    [{"t": time, "url", "img", "title", "sub", "kind": newsletter|recap|war|chain}] (mb = link prefix).
    War reports include their payout once paid (War Report & Payout) - payouts aren't a separate kind any more."""
    items = []
    months = sorted(RECAP_DIR.glob("*.png"), reverse=True) if RECAP_DIR.exists() else []
    for f in months[:per_kind]:
        m = f.stem
        lab = datetime.strptime(m, "%Y-%m").strftime("%B %Y")
        first = f"recaps/{m}/recap-1.png" if (RECAP_DIR / m / "recap-1.png").exists() else f"recaps/{m}.png"
        # a recap is posted at the start of the NEXT month - use that, not the file time (checkouts reset it)
        y_, mo_ = int(m[:4]), int(m[5:7])
        t_ = int(datetime(y_ + (mo_ == 12), mo_ % 12 + 1, 1, tzinfo=timezone.utc).timestamp())
        items.append({"t": t_, "url": f"{mb}newsletter.html#{m}", "img": f"{mb}{first}",
                      "title": f"{lab} recap", "sub": "Monthly recap", "kind": "recap"})
    # newest newsletters (Newsletter Builder -> data/panels/<name>.png; copied to the members' panels/ folder)
    for nm, title, sub, t_ in latest_newsletters(per_kind, with_time=True):
        items.append({"t": t_, "url": f"{mb}panels/{nm}.png", "img": f"{mb}panels/{nm}.png",
                      "title": title, "sub": sub, "kind": "newsletter"})
    metas = []
    for f in REPORTS_DIR.glob("*.json") if REPORTS_DIR.exists() else []:
        try:
            metas.append((f.stem, json.loads(f.read_text(encoding="utf-8"))))
        except ValueError:
            pass
    for kind in ("war", "chain"):
        mk = sorted((x for x in metas if x[1].get("kind") == kind), key=lambda x: -x[1].get("end", 0))
        for slug, m in mk[:per_kind]:
            title, _ = report_newsletter(m, slug)
            when = datetime.fromtimestamp(m.get("end", 0), timezone.utc).strftime("%b %d, %Y")
            if kind == "war":
                recent = m.get("end", 0) > datetime.now(timezone.utc).timestamp() - ATTN_PAYOUT_DAYS * 86400
                sub = ("🤝 Termed · " if str(m.get("id", slug.split("-", 1)[-1])) in termed_wars() else "") + \
                      (f"{_short_money(m.get('paid', 0))} paid · " if m.get("pay") else "Payout pending · " if recent else "") + when
            else:
                sub = f"{m.get('respect', 0):,.0f} respect · {m.get('attackers', 0)} members · {when}"
            items.append({"t": int(m.get("end", 0)), "url": f"{mb}reports/{slug}.html", "img": f"{mb}reports/{slug}.png",
                          "title": title, "sub": sub, "kind": kind})
    items.sort(key=lambda x: -x["t"])
    return items


LATEST_ICON = {"newsletter": "📰", "recap": "🗓️", "war": "⚔️", "chain": "⛓️"}
LATEST_LABEL = {"newsletter": "Newsletter", "recap": "Recap", "war": "War report", "chain": "Chain report"}
# the sub-tiles under the featured post: (kind, heading, "see all" page)
LATEST_GROUPS = [("war", "⚔️ Wars", "wars.html"), ("chain", "⛓️ Chains", "chains.html"),
                 ("newsletter", "📰 Newsletters", ""), ("recap", "🗓️ Recaps", "recaps.html")]


def _hub_latest(mb: str) -> str:
    """The "Latest" section: the NEWEST post as one big picture card (type badge, name, how long ago), then a
    sub-tile per kind (Wars, Chains, Newsletters, Recaps) listing its last few - so a busy week of wars or chains
    shows every entry. Times are shown as "2h" / "3d" by HOME_JS (data-t), dates otherwise."""
    import html as _html
    items = _hub_latest_items(mb)
    if not items:
        return '<p class="tag">Nothing posted yet.</p>'
    f = items[0]
    when = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%b %d") if t else ""
    h = (f'<a class="feat" href="{f["url"]}"><img src="{f["img"]}" alt="" loading="lazy"><div>'
         f'<span class="badge">{LATEST_LABEL.get(f["kind"], "")}</span><b>{_html.escape(f["title"])}</b>'
         f'<span class="sub">{_html.escape(f["sub"])} · <span class="ago" data-t="{f["t"]}" data-long="1">{when(f["t"])}</span></span>'
         f'</div></a>')
    tiles = []
    for kind, head, allp in LATEST_GROUPS:
        # the featured (newest) post isn't listed again under its kind (Nov 12 2026, user: no repeats)
        rows = [x for x in items if x["kind"] == kind and x is not f]
        if not rows:
            continue
        tiles.append(f'<div class="ltile"><p>{head}' + (f'<a href="{mb}{allp}">All →</a>' if allp else "") + "</p>" + "".join(
            f'<a href="{x["url"]}"><span class="t">{_html.escape(x["title"])}<small>{_html.escape(x["sub"])}</small></span>'
            f'<span class="ago" data-t="{x["t"]}">{when(x["t"])}</span></a>' for x in rows) + "</div>")
    return h + '<div class="ltiles">' + "".join(tiles) + "</div>"


def _reports_page(mout: Path):
    """reports.html (members) - every saved war + chain report."""
    import html as _html
    metas = []
    for f in REPORTS_DIR.glob("*.json") if REPORTS_DIR.exists() else []:
        try:
            metas.append((f.stem, json.loads(f.read_text(encoding="utf-8"))))
        except ValueError:
            pass
    body = site_menu("")
    for kind, head in (("war", "War Reports"), ("chain", "Chain Reports")):
        rows = sorted((x for x in metas if x[1].get("kind") == kind), key=lambda x: -x[1].get("end", 0))
        body += f"<h2>{head}</h2>"
        if not rows:
            body += '<p class="tag">None saved yet - new reports appear here as they are posted.</p>'
            continue
        body += "<table><tr><th>Date</th><th>Report</th></tr>"
        for slug, m in rows:
            when = datetime.fromtimestamp(m.get("end", 0), timezone.utc).strftime("%b %d, %Y")
            if kind == "war":
                res = f'<span class="{"w" if m.get("won") else "d"}">{"Victory" if m.get("won") else "Defeat"}</span> vs {_html.escape(str(m.get("opponent", "?")))}'
            else:
                res = f'{fmt_int(m.get("length", 0))} hit chain · {m.get("respect", 0):,.0f} respect'
            body += f'<tr><td>{when}</td><td><a href="reports/{slug}.html">{res}</a></td></tr>'
        body += "</table>"
    _hub_page(mout / "reports.html", "Reports", "Every war and chain report posted to Discord", body)


# HOMEPAGES (Members Hub = members' index.html, Leaders Hub = leaders' index.html) are built from
# config.json "homepage" - leaders edit it on the Homepage editor (Site Panels -> Homepage), no code changes:
#   {"members": {"sections": [...]}, "leaders": {"sections": [...]}}
#   section types:
#     {"type": "welcome"}                       greeting with the signed-in member's name, position, days in faction
#                                               + 3 of their own numbers vs the faction average (db/home.json);
#                                               leaders also see their reliability badge (/m/mine.json)
#     {"type": "attention", "title": "Needs attention"}   LEADERS HUB ONLY: unpaid war payouts and inactive
#                                               recruits (leaders' db/attention.json); hides itself when all is clear
#     {"type": "now", "title": "Right now"}     live ranked war (countdown, then the score) and the chain timer, read
#                                               from Torn in the member's browser with their OWN Public key (they
#                                               paste it once; kept only in that browser) - chain every 15 s, war 30 s
#   The site itself holds no Torn key: members' Public keys (sign-in, and Right now) are all it uses.
#     {"type": "actions", "tiles": [{"icon", "title", "link"}]}   big icon buttons (quick actions)
#     {"type": "latest", "title": "Latest"}     newest post as a big card + the next few as a list (automatic)
#     {"type": "groups", "title": "Explore", "groups": [{"title", "links": [{"icon", "title", "link"}]}]}
#                                               page links sorted into short labelled groups
#     {"type": "tiles", "title": "Pages", "tiles": [{"icon", "title", "desc", "link"}]}   tile grid (older style)
#     {"type": "text", "title": "...", "text": "..."}   a note; blank lines = paragraphs
#   link: "M:<page>" members' folder · "L:<page>" leaders' folder · "G:/" the dashboard · a full https:// address
# With no "homepage" in config.json the hubs use homepage_default().
HOME_LAYOUT_V = 2          # bumped Nov 2026 for the redesigned hubs (welcome / right now / needs attention ...)


def homepage_default() -> dict:
    link = lambda rows: [{"icon": i_, "title": t_, "link": l_} for i_, t_, l_ in rows]
    actions = {"type": "actions", "title": "", "tiles": link([
        ("🙋", "Profile", "M:me"), ("💰", "Paid wars", "M:wars.html#paid"),
        ("🕵️", "Crimes", "M:crimes.html"), ("🏋️", "Gym", "M:gym.html")])}
    # Explore = the site's main navigation (the header is kept small) - every members' page is in here
    compete = {"title": "Compete", "links": link([("⚔️", "War history", "M:wars.html"), ("⛓️", "Chain history", "M:chains.html"),
                                                  ("🕒", "Chain watch schedule", "M:chainwatch-schedule.html"),
                                                  ("🏆", "Leaderboards", "M:leaderboards.html"),
                                                  ("📜", "Board history", "M:leaderboard-history.html")])}
    grow = {"title": "Grow", "links": link([("🏋️", "Gym", "M:gym.html"), ("📈", "Gym history", "M:gym-history.html"),
                                            ("🕵️", "Organized crimes", "M:crimes.html")])}
    faction = {"title": "Faction", "links": link([("👥", "Members", "M:members.html"), ("💰", "Paid wars", "M:wars.html#paid"),
                                                  ("📰", "Latest recap", "M:newsletter.html"), ("🗂️", "Recap archive", "M:recaps.html"),
                                                  ("🧩", "Scripts", "M:scripts.html")])}
    leaders = {"title": "Leaders", "links": link([
        ("🧮", "Payout calculator", "L:payout.html"),
        ("🗄️", "Armory monitor", "L:armory.html"), ("🕵️", "OC Management", "L:oc.html"), ("💪", "Member stats", "L:stats.html"),
        ("⚔️", "War readiness", "L:readiness.html"), ("⛓️", "Chain Watch", "L:chainwatch.html"),
        ("🤝", "Recruitment", "L:recruitment.html"),
        ("📢", "Announcements", "L:announcements.html"), ("🖼️", "Description", "L:description.html"),
        ("🎨", "Newsletter builder", "L:builder.html"), ("🏠", "Homepage editor", "L:homepage.html"),
        ("🧭", "Header editor", "L:header-editor.html"), ("🧩", "Profile layout", "L:profile-default.html"),
        ("🧷", "Newsletter filler", "L:hb-newsletter-filler.user.js"), ("🏡", "Members Hub", "M:index.html")])}
    return {"v": HOME_LAYOUT_V,
            # Nov 12 2026 (user): no Quick actions / Explore (they repeated the header) - one home for everyone
            "members": {"sections": [{"type": "welcome", "title": ""},
                                     {"type": "now", "title": "Right now"},
                                     {"type": "attention", "title": "Needs attention"},
                                     {"type": "latest", "title": "Latest"}]},
            "leaders": {"sections": [{"type": "welcome", "title": ""},
                                     {"type": "now", "title": "Right now"},
                                     {"type": "attention", "title": "Needs attention"},
                                     actions,
                                     {"type": "latest", "title": "Latest"},
                                     {"type": "groups", "title": "Explore", "groups": [compete, grow, faction, leaders]}]}}


def _hub_link(link: str, hub: str) -> str:
    """A homepage tile's link -> href on that hub ("members" / "leaders")."""
    link = str(link or "").strip()
    g_ = gate_cfg()
    if link.startswith("M:"):
        return (link[2:] if hub == "members" else member_base() + "/" + link[2:])
    if link.startswith("L:"):
        return (link[2:] if hub == "leaders" else (leader_base() + "/" + link[2:] if leader_dir() else "#"))
    if link.startswith("G:"):
        return (g_["url"].rstrip("/") + link[2:]) if g_ else ("index.html" if hub == "members" else member_base() + "/index.html")
    return link or "#"


def home_js_cfg(hub: str) -> dict:
    """Where the homepage's live parts read from (HOME_JS) - same addresses on the editor's preview."""
    g_ = gate_cfg()
    gate = g_["url"].rstrip("/") if g_ else ""
    return {"hub": hub, "home": member_base() + "/db/home.json",
            "att": (leader_base() + "/db/attention.json") if leader_dir() else "",
            "who": gate + "/m/whoami.json" if gate else "", "mine": gate + "/m/mine.json" if gate else "",
            "now": gate + "/m/now.json" if gate else "",          # Right now (Nov 12 2026) - the Hub's war + chain
            "faction": int(os.environ.get("FACTION_ID", "51384")), "comment": API_COMMENT,
            "links": {"payout": _hub_link("L:payout.html", hub), "members": _hub_link("M:members.html", hub),
                      "profile": _hub_link("M:member.html", hub),
                      "torn_war": "https://www.torn.com/factions.php?step=your#/war/rank",
                      "torn_chain": "https://www.torn.com/factions.php?step=your#/war/chain"}}


def _hub_sections(sections: list, hub: str) -> str:
    import html as _html
    h, live = "", False
    for sec in sections or []:
        title = str(sec.get("title") or "")
        t_ = sec.get("type", "tiles")
        head = f"<h2>{_html.escape(title)}</h2>" if title else ""
        if t_ == "welcome":
            # filled in by HOME_JS from the sign-in + db/home.json
            h += '<div class="hbsec" id="hbWel"><div class="wel"><div class="av">HB</div><div class="wt"><b>Welcome to Heart Breakers</b>' \
                 '<span>Loading your numbers…</span></div></div><div class="stats"></div></div>'
            live = True
        elif t_ == "now":
            h += f'<div class="hbsec" id="hbNow" hidden>{head}<div class="nowc"></div></div>'
            live = True
        elif t_ == "attention":
            # ONE HOME (Nov 12 2026): shown on the Members Hub too - it stays hidden unless the leaders' attention file
            # loads, which only a leader's pass can read
            h += f'<div class="hbsec" id="hbAtt" hidden><div class="attn"><div class="ah"><b>🔔 {_html.escape(title or "Needs attention")}</b>' \
                 '<span class="cnt"></span></div><div class="rows"></div></div></div>'
            live = True
        elif t_ == "actions":
            h += head + '<div class="qa">' + "".join(
                f'<a href="{_hub_link(x.get("link"), hub)}"><i>{_html.escape(str(x.get("icon", "")))}</i>{_html.escape(str(x.get("title", "")))}</a>'
                for x in sec.get("tiles") or []) + "</div>"
        elif t_ == "latest":
            h += head + _hub_latest("" if hub == "members" else member_base() + "/")
            live = True                      # "2h ago" times
        elif t_ == "groups":
            h += head + '<div class="groups">' + "".join(
                f'<div><p>{_html.escape(str(gr.get("title", "")))}</p>' + "".join(
                    f'<a href="{_hub_link(x.get("link"), hub)}"><i>{_html.escape(str(x.get("icon", "")))}</i>{_html.escape(str(x.get("title", "")))}</a>'
                    for x in gr.get("links") or []) + "</div>"
                for gr in sec.get("groups") or []) + "</div>"
        elif t_ == "text":
            h += head + '<div class="note">' + "".join(f"<p>{_html.escape(p_).replace(chr(10), '<br>')}</p>"
                                                      for p_ in str(sec.get("text") or "").split("\n\n") if p_.strip()) + "</div>"
        else:
            h += head + _hub_tiles([(x.get("icon", ""), x.get("title", ""), x.get("desc", ""), _hub_link(x.get("link"), hub))
                                    for x in sec.get("tiles") or []], "l" if hub == "leaders" else "")
    if live:
        h += f"<script>window.HBH={json.dumps(home_js_cfg(hub))};</script><script>{REL_GRADE_JS}\n{HOME_JS}</script>"
    return h


def _home_layout(cfg: dict) -> dict:
    """config.json "homepage", or the built-in layout when there is none / it's from before the redesign
    (no "v" - saved with the old editor) so the new hubs show up without anyone having to reset them."""
    hp = (cfg or {}).get("homepage")
    return hp if hp and hp.get("v", 0) >= HOME_LAYOUT_V else homepage_default()


def write_homepages(out: Path, cfg: dict = None):
    """index.html in the MEMBERS' folder (Members Hub) and in the LEADERS' folder (Leaders Hub), laid out from
    config.json "homepage" (Homepage editor) - see the HOMEPAGES note above."""
    hp = _home_layout(cfg)
    mout = member_out(out)
    msec = (hp.get("members") or {}).get("sections") or []
    _hub_page(mout / "index.html", "Heart Breakers", "Members Hub",
              _hub_sections(msec, "members"), hub=True, menu=site_menu(""), fresh=["members", "wars", "chains", "crimes", "gym"],
              top=not any(s.get("type") == "welcome" for s in msec))
    if not leader_dir():
        return
    lout = out / leader_dir()
    # ONE HOME (Nov 12 2026, user): the Leaders Hub was merged into the Members Hub (leaders see "Needs attention"
    # there) - the leaders' index.html just forwards, so old links and bookmarks still land on the home
    (lout / "index.html").write_text('<!DOCTYPE html><meta charset="utf-8"><title>Heart Breakers</title>'
                                     f'<script>location.replace({json.dumps(member_base() + "/")})</script>', encoding="utf-8")
    # the Homepage editor (leaders) - its preview uses the same CSS + script, the current "Latest" and these defaults
    pages = SITE_PAGES
    conf = {"repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "pages": pages, "default": homepage_default(),
            "member_base": member_base(), "layout_v": HOME_LAYOUT_V,
            "css": HUB_CSS, "js": REL_GRADE_JS + "\n" + HOME_JS, "jscfg": {"members": home_js_cfg("members"), "leaders": home_js_cfg("leaders")},
            "latest": {"members": _hub_latest(""), "leaders": _hub_latest(member_base() + "/")}}
    (lout / "homepage.html").write_text((ROOT / "tools" / "homepage_editor.html").read_text(encoding="utf-8")
                                        .replace("__CONFIG__", json.dumps(conf).replace("</", "<\\/"))
                                        .replace("__MENU__", leader_menu("") + tab_bar(SETTINGS_TABS, "homepage.html")), encoding="utf-8")
    # the Header editor (leaders, Nov 2026) - config.json "site_header": the members' header + the leaders' extra items
    hconf = {"repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "pages": SITE_PAGES, "default": header_default(),
             "css": MENU_CSS}
    (lout / "header-editor.html").write_text((ROOT / "tools" / "header_editor.html").read_text(encoding="utf-8")
                                             .replace("__CONFIG__", json.dumps(hconf).replace("</", "<\\/"))
                                             .replace("__MENU__", leader_menu("") + tab_bar(SETTINGS_TABS, "header-editor.html")), encoding="utf-8")


# every page the editors (homepage, header) can link to: (title, link)
SITE_PAGES = [(t, u) for t, u in [("My Profile", "M:me"), ("Members Hub", "M:index.html"), ("History (wars)", "M:wars.html"),
             ("Paid wars (War History)", "M:wars.html#paid"), ("Chain History", "M:chains.html"), ("Organized Crimes", "M:crimes.html"),
             ("Leaderboards", "M:leaderboards.html"), ("Leaderboard History", "M:leaderboard-history.html"),
             ("Gym Leaderboards", "M:leaderboards.html#gym"), ("Members", "M:members.html"),
             ("Monthly Recap", "M:newsletter.html"), ("Recap Archive", "M:recaps.html"), ("Dashboard (role home)", "G:/"),
             ("Armory Monitor", "L:armory.html"),
             ("Profile layout (default)", "L:profile-default.html"),
             ("Chain Watching Schedule", "M:chainwatch-schedule.html"), ("War targets", "M:war-targets.html"), ("Scripts directory", "M:scripts.html"), ("Member data (stats)", "L:stats.html"), ("Member data (war readiness)", "L:readiness.html"), ("My data & sharing", "M:my-data.html"), ("My profile layout (this browser)", "M:profile-editor.html"),
             ("Payout Calculator", "L:payout.html"), ("Announcements editor", "L:announcements.html"),
             ("Faction Description editor", "L:description.html"), ("Newsletter Builder", "L:builder.html"),
             ("Homepage Editor", "L:homepage.html"), ("Header Editor", "L:header-editor.html"),
             ("OC Management", "L:oc.html"), ("Chain Watch settings", "L:chainwatch.html"), ("Recruitment", "L:recruitment.html"),
             ("Newsletter Filler (userscript)", "L:hb-newsletter-filler.user.js")]]


# DATA FRESHNESS (Nov 2026): every page says how fresh its data is and since when it's on record - members' db/
# freshness.json, written each build:
#   {"built", "read": {members, gym, crimes, wars, chains: last read from Torn (unix)},
#    "since": {wars, chains, crimes, gym: first day on record}, "armory": {last, oldest, done}}
# fresh_html(keys, root) = the footer line for a page: e.g. "Wars checked 12 min ago · on record since Mar 12, 2024".
def write_freshness(out: Path, db: dict, mock: bool = False):
    now = int(datetime.now(timezone.utc).timestamp())
    rd = lambda p, k: (json.loads(p.read_text(encoding="utf-8")).get(k) if p.exists() else None)
    def safe(f):
        try:
            return f()
        except (OSError, ValueError, AttributeError):
            return None
    wars, chains, crimes = db["wars"]["wars"], db["chains"]["chains"], db["crimes"]["crimes"]
    try:
        al = json.loads(ARMORY_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        al = {}
    gm = sorted((db.get("gym") or {}).get("history", {}))
    fr = {"built": now,
          "read": {"members": safe(lambda: rd(CORE_CACHE_PATH, "fetched")), "gym": (db.get("gym") or {}).get("fetched"),
                   "crimes": safe(lambda: rd(CRIME_HIST_PATH, "fetched")),
                   # the ranked war list is read on every full / war update (this build); the chain list only when
                   # chain watch saw activity or at the 3-hour slot (Nov 2026) - its own "checked" time
                   "wars": None if mock else now, "chains": None if mock else safe(lambda: rd(CHAIN_HIST_PATH, "checked"))},
          "since": {"wars": wars[0]["end"] if wars else None, "chains": chains[0]["end"] if chains else None,
                    "crimes": min((c["t"] for c in crimes if c.get("t")), default=None),
                    "gym_months": gm[0] if gm else None},
          "armory": {"last": al.get("last"), "oldest": al.get("oldest"), "done": al.get("done")}}
    _jdump(member_out(out) / "db" / "freshness.json", fr)


# the footer script: fills <div class="hbfresh" data-k="wars,chains"> from db/freshness.json (root = path to the
# members' folder from the page, "" on member pages, member_base()/ on leader pages)
FRESH_LABEL = {"members": "Member list", "gym": "Gym", "crimes": "Organized crimes", "wars": "Wars", "chains": "Chains",
               "armory": "Armory"}


def fresh_html(keys, root: str = "") -> str:
    ks = ",".join(keys)
    return (f'<div class="hbfresh" data-k="{ks}" style="text-align:center;color:#9a9a9c;font-size:12px;'
            f'margin:18px 0 4px;line-height:1.7"></div>'
            "<script>(function(){var el=document.currentScript.previousElementSibling,L=" + json.dumps(FRESH_LABEL) + ";"
            "var ago=function(t){var s=Date.now()/1e3-t;return s<90?'just now':s<5400?Math.round(s/60)+' min ago':s<172800?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago'};"
            "var day=function(t){return new Date(t*1e3).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})};"
            "fetch(" + json.dumps(root + "db/freshness.json") + ",{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(F){if(!F)return;"
            "var out=el.dataset.k.split(',').map(function(k){var R=(F.read||{})[k],S=(F.since||{})[k],t='<b style=\"color:#cfc6c6\">'+L[k]+'</b> ';"
            "if(k==='armory'){var A=F.armory||{};if(!A.last)return t+'not read yet';return t+'read '+ago(A.last)+' · on record from '+day(A.oldest)+(A.done?'':' (older months still filling in)')}"
            "if(k==='gym'){return t+(R?'read '+ago(R):'')+' · per-month figures use the gym total since joining'+((F.since||{}).gym_months?' · months on record from '+new Date((F.since.gym_months)+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}):'')}"
            "return t+(R?(k==='wars'||k==='chains'?'checked ':'read ')+ago(R):'')+(S?' · on record since '+day(S):'')});"
            "el.innerHTML='Data: '+out.join('<br>')}).catch(function(){})})();</script>")


def write_home_data(out: Path, db: dict, raw: dict):
    """Data for the hubs' live parts (HOME_JS):
      members' db/home.json   per CURRENT member [days in faction, hits in the last war (None = not in it),
                              gym energy this month, crime success last 3 months (None = no crimes)] and the
                              faction averages of those
      leaders' db/attention.json   wars ended in the last ATTN_PAYOUT_DAYS days with no payout receipt, and
                              recruits idle ATTN_RECRUIT_IDLE_DAYS+ days """
    now = db["generated"]
    cur = [m for m in db["members"]["members"] if m["current"]]
    wars = db["wars"]["wars"]
    last = wars[-1] if wars else None
    lw = {x[0]: x[1] for x in (last or {}).get("m", [])}
    since = now - 91 * 86400
    crimes = [c for c in db["crimes"]["crimes"] if (c.get("t") or 0) >= since]
    rows, avg_src = {}, {"war": [], "gym": [], "oc": []}
    for m in cur:
        i = m["id"]
        hits = lw.get(i)
        gym = int(sum((m.get("gym_month") or {}).values()))
        mine_ = [c for c in crimes if i in (c.get("m") or [])]
        rate = round(100 * sum(1 for c in mine_ if str(c.get("status")).lower() == "successful") / len(mine_)) if mine_ else None
        rows[str(i)] = [m.get("days"), hits, gym, rate]
        if hits is not None:
            avg_src["war"].append(hits)
        avg_src["gym"].append(gym)
        if rate is not None:
            avg_src["oc"].append(rate)
    mean = lambda a: round(sum(a) / len(a), 1) if a else None
    home = {"generated": now, "cols": ["days", "last_war_hits", "gym_month", "crime_success"],
            "last_war": {"id": last["id"], "opponent": last.get("opponent"), "end": last["end"]} if last else None,
            "avg": {"war": mean(avg_src["war"]), "gym": mean(avg_src["gym"]), "oc": mean(avg_src["oc"])},
            "m": rows}
    _jdump(member_out(out) / "db" / "home.json", home)
    if not leader_dir():
        return
    paid = set(_latest_receipts())
    unpaid = [{"war": w["id"], "opponent": w.get("opponent"), "end": w["end"]} for w in wars
              if w["end"] >= now - ATTN_PAYOUT_DAYS * 86400 and str(w["id"]) not in paid]
    recruits = []
    for m in cur:
        la = m.get("last_action")
        # idle time as of when the member list was READ (not this build) - the data's own moment, so rebuilds from the
        # same data give the same numbers (site deploys only on real changes, Nov 2026); ≤3 h behind at most
        idle = (members_asof(now) - int(la)) / 86400 if la else 0
        if str(m.get("position", "")).lower() == "recruit" and idle >= ATTN_RECRUIT_IDLE_DAYS:
            recruits.append({"id": m["id"], "name": m["name"], "idle": int(idle)})
    _jdump(out / leader_dir() / "db" / "attention.json",
           {"generated": now, "unpaid": unpaid, "recruits": sorted(recruits, key=lambda r: -r["idle"])})


ATTN_PAYOUT_DAYS = 14          # Needs attention: wars ended this recently with no payout receipt
ATTN_RECRUIT_IDLE_DAYS = 3     # Needs attention: recruits idle this long


# ==========================================================================
# DATA LAYER - "databases" published with the site, rebuilt every full update from the saved data
#   members' folder  db/members.json   every current + past member, with totals across everything
#                    db/wars.json      every ranked war, per member: hits, respect, assists, hosps, outside
#                    db/chains.json    every chain (10+), per member: hits, respect, retals
#                    db/crimes.json    completed organized crimes (participants, result, money)
#                    db/gym.json       energy trained per stat (all time + this month)
#                    db/respect.json   faction respect per day
#                    db/payouts.json   current payout receipt per war (per member pay)
#   leaders' folder  db/crime_delays.json  every organized-crime delay (who, why, how long)
#                    (db/monitor.json + monitor.html - the Leader Monitor - were removed Nov 2026)
# Compact arrays keep the files small: rows are [member id, value, value, ...] - see each file's "cols".
# ==========================================================================
CRIME_DELAYS_PATH = ROOT / "data" / "crime_delays.json"


def _jdump(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def build_databases(raw: dict, cfg: dict) -> dict:
    """All the databases as Python objects (also used by the leader monitor)."""
    now = int(datetime.now(timezone.utc).timestamp())
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    cur = {str(m.get("id")): m for m in _as_list((raw.get("members") or {}).get("members"))}
    wh = (raw.get("_war_history") or {}).get("wars", {})
    ch = (raw.get("_chain_history") or {}).get("chains", {})
    meta = war_meta(raw, my_id) if "rankedwars" in raw else {}
    names = {i: m.get("name", "?") for i, m in cur.items()}
    # --- wars ---
    wars = []
    tw = termed_wars(cfg)                      # termed wars: flagged "termed" (see TERMED WARS)
    for k, w in sorted(wh.items(), key=lambda kv: kv[1]["end"]):
        mt = meta.get(k, {})
        for m in w.get("members", []):
            names.setdefault(str(m["id"]), m.get("name", "?"))
        wars.append({"id": k, "start": w.get("start"), "end": w["end"], "opponent": mt.get("opponent", "?"),
                     "won": mt.get("won"), "our": mt.get("our"), "their": mt.get("their"),
                     "rank": (w.get("rank") or {}).get("after", ""), "reward": w.get("reward"),
                     "termed": str(k) in tw,
                     "m": [[m["id"], m.get("attacks", 0), round(m.get("score", 0), 2), m.get("assists", 0),
                            m.get("hosps", 0), m.get("out", 0)] for m in w.get("members", [])]})
    # --- chains ---
    chains = [{"id": k, "start": c.get("start"), "end": c["end"], "length": c["length"],
               "respect": round(sum(a.get("respect", 0) for a in c.get("attackers", [])), 2),
               "m": [[a["id"], a.get("hits", 0), round(a.get("respect", 0), 2), a.get("rets", 0)]
                     for a in c.get("attackers", [])]}
              for k, c in sorted(ch.items(), key=lambda kv: kv[1]["end"])]
    # --- crimes ---
    try:
        crimes_raw = json.loads(CRIME_HIST_PATH.read_text(encoding="utf-8")).get("crimes", {})
    except (OSError, ValueError):
        crimes_raw = {}
    crimes_l = crimes_raw.values() if isinstance(crimes_raw, dict) else crimes_raw
    crimes = sorted(({"id": int(cid) if str(cid).isdigit() else cid, "prev": c.get("prev"),
                      "t": c.get("executed_at"), "name": c.get("name"), "diff": c.get("difficulty"),
                      "status": c.get("status"), "money": c.get("money", 0), "items": c.get("items", 0),
                      "respect": c.get("respect", 0), "m": c.get("members", [])}
                     for cid, c in (crimes_raw.items() if isinstance(crimes_raw, dict) else enumerate(crimes_raw))),
                    key=lambda c: c["t"] or 0)
    crime_shares(crimes)
    # --- gym ---
    try:
        g = json.loads(GYM_PATH.read_text(encoding="utf-8")) if "GYM_PATH" in globals() else {}
    except (OSError, ValueError):
        g = {}
    gym = {"month": g.get("month"), "stats": [st for st, _ in GYM_FETCH], "all": {}, "month_gain": {},
           "fetched": g.get("fetched"), "history": {}}
    for st, _ in GYM_FETCH:
        for i, v in (g.get("current", {}).get(st) or {}).items():
            gym["all"].setdefault(i, {})[st] = v
            b = (g.get("baseline", {}).get(st) or {}).get(i, 0)
            gym["month_gain"].setdefault(i, {})[st] = max(0, v - b)
    # month by month: {"YYYY-MM": {member id: [strength, speed, defense, dexterity]}} (energy trained that month;
    # the current month = month_gain above, so it always matches the leaderboards)
    try:
        gh_ = json.loads(GYM_HIST_PATH.read_text(encoding="utf-8")).get("months", {})
    except (OSError, ValueError):
        gh_ = {}
    for mon, per in gh_.items():
        rows = {}
        for k_, (st, _) in enumerate(GYM_FETCH):
            for i, v in (per.get(st) or {}).items():
                rows.setdefault(i, [0] * len(GYM_FETCH))[k_] = int(v)
        gym["history"][mon] = rows
    if gym["month"]:
        gym["history"][gym["month"]] = {i: [int(d.get(st, 0)) for st, _ in GYM_FETCH]
                                        for i, d in gym["month_gain"].items() if any(d.values())}
    # --- respect ---
    try:
        respect = json.loads(RESPECT_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        respect = {}
    # --- payouts (current receipt per war) ---
    payouts = []
    for wid, stem in _latest_receipts().items():
        try:
            r = json.loads((PAYOUT_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for m in r.get("members", []):
            names.setdefault(str(m["id"]), m.get("n", "?"))
        payouts.append({"war": wid, "end": r["war"].get("end"), "opponent": r["war"].get("opponent"),
                        "paid": r.get("paid", 0), "m": [[m["id"], m.get("pay", 0), m.get("w", 0), m.get("o", 0)]
                                                         for m in r.get("members", [])]})
    payouts.sort(key=lambda p: p["end"] or 0)
    # --- members (current first, then past), totals across everything ---
    tot = {}
    def T(i):
        return tot.setdefault(str(i), {"wars": 0, "war_hits": 0, "war_resp": 0.0, "assists": 0, "hosps": 0,
                                        "wars_zero": 0, "chains": 0, "chain_hits": 0, "chain_resp": 0.0, "rets": 0,
                                        "chains250": 0, "chain_hits250": 0,     # chains of CHAIN_AVG_MIN+ (hits per chain)
                                        "crimes": 0, "crimes_ok": 0, "crime_money": 0, "paid": 0, "payouts": 0})
    for w in wars:
        for i, h, r_, a, ho, _o in w["m"]:
            if w.get("termed") and h == 0:
                continue                       # a termed war with no hits doesn't count against them
            t = T(i); t["wars"] += 1; t["war_hits"] += h; t["war_resp"] += r_; t["assists"] += a; t["hosps"] += ho
            t["wars_zero"] += h == 0
    for c in chains:
        big = c["length"] >= CHAIN_AVG_MIN
        for i, h, r_, rt in c["m"]:
            t = T(i); t["chains"] += 1; t["chain_hits"] += h; t["chain_resp"] += r_; t["rets"] += rt
            if big:
                t["chains250"] += 1; t["chain_hits250"] += h
    for c in crimes:
        share = int(c.get("share") or 0)          # this crime's members' cut (see crime_shares)
        for i in c["m"]:
            t = T(i); t["crimes"] += 1
            if str(c["status"]).lower() == "successful":
                t["crimes_ok"] += 1; t["crime_money"] += share
    for p_ in payouts:
        for i, pay, _w, _o in p_["m"]:
            if pay:
                t = T(i); t["paid"] += pay; t["payouts"] += 1
    members = []
    for i in sorted(set(cur) | set(tot), key=lambda i: (i not in cur, names.get(i, "?").lower(), int(i))):   # id breaks ties: same order every build
        m = cur.get(i, {})
        t = tot.get(i) or T(i)
        t["war_resp"], t["chain_resp"] = round(t["war_resp"], 2), round(t["chain_resp"], 2)
        members.append({"id": int(i), "name": names.get(i, "?"), "current": i in cur,
                        "position": m.get("position", ""), "days": m.get("days_in_faction"),
                        "level": m.get("level"),
                        "last_action": m.get("last_action"), "t": t,
                        "nolb": i in LB_HIDDEN,          # LEADERBOARD OPT-OUT: left off the Leaderboards page / Hub script boards
                        "gym": gym["all"].get(i, {}), "gym_month": gym["month_gain"].get(i, {})})
    return {"generated": now,
            "members": {"generated": now, "members": members},
            "wars": {"cols": ["id", "hits", "respect", "assists", "hosps", "outside"], "wars": wars},
            "chains": {"cols": ["id", "hits", "respect", "rets"], "chains": chains},
            "crimes": {"tax": CRIME_TAX, "crimes": crimes},
            "gym": gym, "respect": respect,
            "payouts": {"cols": ["id", "pay", "war_hits", "outside"], "payouts": payouts}}


def write_databases(out: Path, raw: dict, cfg: dict) -> dict:
    """Write the databases (see the block comment above). Returns them for the leader monitor."""
    db = build_databases(raw, cfg)
    mdb = member_out(out) / "db"
    for name in ("members", "wars", "chains", "crimes", "gym", "respect", "payouts"):
        _jdump(mdb / f"{name}.json", db[name])
    if leader_dir():
        try:
            delays = json.loads(CRIME_DELAYS_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            delays = {"delays": []}
        _jdump(out / leader_dir() / "db" / "crime_delays.json", delays)
    print(f"Databases: {len(db['members']['members'])} members, {len(db['wars']['wars'])} wars, "
          f"{len(db['chains']['chains'])} chains, {len(db['crimes']['crimes'])} crimes")
    return db


# --------------------------------------------------------------------------
# Reliability (leaders: db/private.json - the Leader Monitor page itself was removed Nov 2026)
# --------------------------------------------------------------------------
TREND_WARS = 5          # participation trend: last N wars
# Reliability GRADE (Nov 2026): the 0-100 score shown as a tier with the number as its secondary, e.g. "A · 87".
# (lowest score for the grade, grade, colour) - highest first. The same table is used by the pages (REL_GRADE_JS).
REL_GRADES = [(95, "S", "#c9a0ff"), (85, "A", "#78c878"), (75, "B", "#a8d878"), (65, "C", "#e8be5a"),
              (55, "D", "#e8a05a"), (45, "E", "#e8705a"), (0, "F", "#e4382e")]


def rel_grade(score) -> str:
    return next(g_ for lo, g_, _c in REL_GRADES if (score or 0) >= lo)


# the same grading for the pages: relG(score) -> [grade, colour]
REL_GRADE_JS = ("function relG(s){var G=" + json.dumps([[lo, g_, c] for lo, g_, c in REL_GRADES])
                + ";for(var i=0;i<G.length;i++)if((s||0)>=G[i][0])return[G[i][1],G[i][2]];return['F','#e4382e'];}")
REL_CHAIN_MIN = 100     # reliability: chains of this many hits count ("large chains")
# RELIABILITY REWORK (Nov 11 2026, user - used for promotion / demotion decisions, so it must be fair):
#   * the member's WHOLE time in the faction (every war / large chain since they joined - no 10-war / 30-day window)
#   * taking part = at least REL_MIN_HITS hits (a token hit or two doesn't count)
#   * "Not enough data" instead of full marks: a part needs REL_MIN_WARS wars / REL_MIN_CHAINS large chains to be
#     judged; a part without enough is left out and the score is worked out from the parts that have data; with
#     neither, the score is None ("Not enough data")
#   * EXCUSED LEAVE: config.json "leave" {member id: [{from, to, note, by, at}]} (epoch s; leaders set it on the
#     member's profile) - wars / chains that overlap a leave period never count for that member
#   * crimes are NOT part of the rating any more (user) - War 55 + Chains 25 + Activity 20
REL_MIN_HITS = 5
REL_MIN_WARS = 3
REL_MIN_CHAINS = 2
REL_W_WAR, REL_W_CHAIN, REL_W_ACT = 55, 25, 20
REL_RECEIPT_LAST = 10   # the receipt's "last wars" list (user, Nov 11 2026: last 10)


def leave_periods(cfg: dict = None) -> dict:
    """Excused leave: {member id (str): [(from, to), ...]} from config.json "leave"."""
    try:
        cfg = cfg if cfg is not None else load_config()
    except (OSError, ValueError):
        return {}
    out = {}
    for pid, lst in (cfg.get("leave") or {}).items():
        for x in lst or []:
            try:
                a, b = int(x.get("from")), int(x.get("to"))
            except (TypeError, ValueError, AttributeError):
                continue
            if b >= a:
                out.setdefault(str(pid), []).append((a, b))
    return out


def monitor_data(db: dict) -> dict:
    """Per CURRENT member:
      trend       hits in each of the last TREND_WARS wars (None = not in the faction for it), hit rate,
                  ▲/▼/► comparing the last 2 wars they were in with the 3 before
      reliability 0-100 (or None = not enough data) from the parts that have enough data:
                    War 55       share of their wars (since joining, not termed, not on leave) with 5+ hits
                    Chains 25    share of large (100+) chains since joining (not on leave) with 5+ hits - half or
                                 more = full marks: nobody can make every chain across time zones
                    Activity 20  last action: <=1d 20, <=2d 16, <=3d 12, <=5d 7, else 0
                  score = points / max points of the parts used x 100
      receipt     the figures for the leaders' performance receipt (wars, last 5 wars, large chains, faction avgs)
      ledger      every member ever paid: total, wars paid, average, last payout"""
    now = db["generated"]
    members = [m for m in db["members"]["members"] if m["current"]]
    wars = [w for w in db["wars"]["wars"] if not w.get("termed")]   # termed wars: never judged (TERMED WARS)
    leave = leave_periods()
    big_chains = [c for c in db["chains"]["chains"] if c["length"] >= REL_CHAIN_MIN]
    # each war's average hits among members who hit - the trend compares a member against this, so a
    # bigger or smaller war doesn't look like them improving or slipping
    war_avg = [(sum(x[1] for x in w["m"] if x[1] > 0) / max(1, sum(1 for x in w["m"] if x[1] > 0))) or 1 for w in wars]
    # faction average hits per MEMBER in each war (everyone listed for it, 0s included) - the receipt's comparison
    war_mavg = [sum(x[1] for x in w["m"]) / max(1, len(w["m"])) for w in wars]
    # faction average hits per HITTER in each large chain (chain reports list the members who hit)
    chain_havg = {id(c): sum(x[1] for x in c["m"] if x[1] > 0) / max(1, sum(1 for x in c["m"] if x[1] > 0)) for c in big_chains}
    rows = []
    for m in members:
        i = m["id"]
        # only wars that STARTED after they joined (Nov 2026): a war from before they were here - or one that was
        # already running when they joined - is "not in the faction for it" (None), never a miss. Join date from
        # Torn's days-in-faction (whole days, so it errs towards leaving a borderline war out).
        joined = now - int(m["days"]) * 86400 if m.get("days") is not None else 0
        lv = leave.get(str(i), [])
        on_leave = lambda a, b: any(a <= t1 and b >= t0 for t0, t1 in lv)     # overlaps a leave period
        hist = [None if (w.get("start") or w["end"]) < joined else next((x[1] for x in w["m"] if x[0] == i), None)
                for w in wars]
        rel = [None if h is None else h / war_avg[k] for k, h in enumerate(hist)]
        last = hist[-TREND_WARS:]
        present = [h for h in hist if h is not None]
        rate = round(100 * sum(1 for h in present[-TREND_WARS:] if h > 0) / len(present[-TREND_WARS:])) if present[-TREND_WARS:] else None
        relp = [r_ for r_ in rel if r_ is not None]
        a, b = relp[-2:], relp[-5:-2]
        trend = "►"
        if a and b:
            ra, rb = sum(a) / len(a), sum(b) / len(b)      # share of the war average
            trend = "▲" if ra > rb + 0.15 else "▼" if ra < rb - 0.15 else "►"
        # ---- wars judged: since joining, not termed, not on leave ----
        jw = [(k, h) for k, h in enumerate(hist)
              if h is not None and not on_leave(wars[k].get("start") or wars[k]["end"], wars[k]["end"])]
        wars_in, wars_part = len(jw), sum(1 for _k, h in jw if h >= REL_MIN_HITS)
        war_hits = sum(h for _k, h in jw)
        war_pts = REL_W_WAR * wars_part / wars_in if wars_in >= REL_MIN_WARS else None
        # ---- large chains judged: started after they joined, not on leave ----
        jc = [c for c in big_chains if (c.get("start") or c["end"]) >= joined and not on_leave(c.get("start") or c["end"], c["end"])]
        ch = [next((x[1] for x in c["m"] if x[0] == i), 0) for c in jc]
        chains_in, chains_part = len(jc), sum(1 for h in ch if h >= REL_MIN_HITS)
        chain_hits = sum(ch)
        chain_pts = REL_W_CHAIN * min(1.0, chains_part / chains_in / 0.5) if chains_in >= REL_MIN_CHAINS else None
        # ---- activity ----
        la = m.get("last_action")
        # idle time as of when the member list was READ (not this build) - the data's own moment, so rebuilds from the
        # same data give the same numbers (site deploys only on real changes, Nov 2026); ≤3 h behind at most
        idle = (members_asof(now) - int(la)) / 86400 if la else 0
        act_pts = 20 if idle <= 1 else 16 if idle <= 2 else 12 if idle <= 3 else 7 if idle <= 5 else 0
        used = [(p_, mx) for p_, mx in ((war_pts, REL_W_WAR), (chain_pts, REL_W_CHAIN)) if p_ is not None]
        score = round(100 * (sum(p_ for p_, _m in used) + act_pts) / (sum(mx for _p, mx in used) + REL_W_ACT)) if used else None
        # ---- receipt figures ----
        fac_war = sum(war_mavg[k] for k, _h in jw) / wars_in if wars_in else None
        hit_chains = [(c, h) for c, h in zip(jc, ch) if h > 0]
        receipt = {
            "level": m.get("level"), "days": m.get("days"), "since": joined or None, "last_action": la,
            "wars": {"in": wars_in, "part": wars_part, "hits": war_hits,
                     "avg": round(war_hits / wars_in, 1) if wars_in else None,
                     "fac_avg": round(fac_war, 1) if fac_war is not None else None,
                     "last": [{"id": wars[k]["id"], "opponent": wars[k].get("opponent"), "end": wars[k]["end"], "hits": h,
                               "fac_avg": round(war_mavg[k], 1), "ok": h >= REL_MIN_HITS} for k, h in jw[-REL_RECEIPT_LAST:]][::-1]},
            "chains": {"in": chains_in, "part": chains_part, "hits": chain_hits,
                       "avg": round(chain_hits / len(hit_chains), 1) if hit_chains else None,
                       "fac_avg": round(sum(chain_havg[id(c)] for c, _h in hit_chains) / len(hit_chains), 1) if hit_chains else None},
            "leave": [{"from": a_, "to": b_} for a_, b_ in lv],
        }
        rows.append({"id": i, "name": m["name"], "position": m.get("position", ""), "last": last, "rate": rate,
                     "trend": trend, "score": score,
                     "parts": {"war": None if war_pts is None else round(war_pts),
                               "chains": None if chain_pts is None else round(chain_pts), "activity": act_pts},
                     "detail": {"wars_hit": wars_part, "wars_in": wars_in, "chains_hit": chains_part,
                                "chains_elig": chains_in, "idle_days": round(idle, 1)},
                     "receipt": receipt})
    ledger = []
    for m in db["members"]["members"]:
        if not m["t"]["payouts"]:
            continue
        last = None
        for p_ in db["payouts"]["payouts"]:
            pay = next((x[1] for x in p_["m"] if x[0] == m["id"] and x[1]), None)
            if pay:
                last = {"war": p_["war"], "opponent": p_["opponent"], "end": p_["end"], "pay": pay}
        ledger.append({"id": m["id"], "name": m["name"], "current": m["current"], "total": m["t"]["paid"],
                       "wars": m["t"]["payouts"], "avg": m["t"]["paid"] // m["t"]["payouts"], "last": last})
    ledger.sort(key=lambda x: -x["total"])
    return {"generated": now, "wars": [{"id": w["id"], "opponent": w["opponent"], "end": w["end"]} for w in wars[-TREND_WARS:]],
            "members": rows, "ledger": ledger}


def _spark(vals: list) -> str:
    """Tiny inline SVG bar chart of hits per war (grey dot = not in the faction for that war)."""
    mx = max([v for v in vals if v] + [1])
    w, h, bw = 16 * len(vals), 26, 12
    bars = []
    for k, v in enumerate(vals):
        x = k * 16 + 2
        if v is None:
            bars.append(f'<circle cx="{x + bw / 2}" cy="{h - 3}" r="2" fill="#555"/>')
        elif v == 0:
            bars.append(f'<rect x="{x}" y="{h - 3}" width="{bw}" height="3" fill="#e4382e"/>')
        else:
            bh = max(3, round((h - 2) * v / mx))
            bars.append(f'<rect x="{x}" y="{h - bh}" width="{bw}" height="{bh}" rx="2" fill="#e8be5a"/>')
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">{"".join(bars)}</svg>'


# ==========================================================================
# ARMORY MONITOR (leaders: armory.html - each member also sees their OWN usage on their profile)
# Replaces the Xanax monitor (Nov 2026): faction ARMORY usage only - what each member took from the armory -
# nothing about gym, attacks or energy. Read from the faction news, cat=armoryAction:
#   used       "<Name> used one of the faction's <Item> items" (drugs, medical, boosters, energy drinks...)
#   refill     "<Name> used 25 of the faction's points to refill their energy / nerve"
#   loaned     "<Name> loaned 1x <Item> to <Name2>"   (counted for Name2 - the member who got the item)
#   gave       "<Name> gave 1x <Item> to <Name2>"     (counted for Name2)
# Items are put in categories by Torn's item type (data/item_types.json, from /torn/items - read once, refreshed
# weekly): Drugs, Medical, Boosters (alcohol, candy, energy drinks, boosters), Temporary, Weapons, Armor,
# Refills (points), Other.
# Log: data/armory_log.json {"items": [item names], "last": newest news time read, "oldest": oldest time read,
#   "done": the whole history is read, "events": [[time, member id, item index, count, kind]]} (kind u/l/g/r)
# Every full update reads FORWARD first (everything new), then BACKFILLS older news in month windows, newest month
# first - but (Nov 2026) never further back than ARMORY_MAX_DAYS (30): no backlog catch-up, the log is built going
# forward. Page budgets (Torn caps history reads per key per day - "Daily read limit", code 14):
# ARMORY_PAGES_NEW forward + ARMORY_PAGES_BACK backfill (100 news rows a page).
# ==========================================================================
ARMORY_LOG_PATH = ROOT / "data" / "armory_log.json"
ITEM_TYPES_PATH = ROOT / "data" / "item_types.json"     # {"fetched": time, "types": {item name: Torn item type}}
ARMORY_PAGES_NEW = 20
ARMORY_PAGES_BACK = 150   # catch-up pace (Nov 2026): ~2 busy months per 3-hour slot (was 10 = ~1 month a day). Only
                          # used until the history is complete; afterwards the backfill stops and just forward reads run.
                          # Torn's daily read cap (code 14) is unpublished, so the pace adapts: a code 14 halves the
                          # backfill pages (log["back_pages"], min 10) and pauses the backfill until the next UTC day -
                          # the forward read always goes first, so new uses are never held up by the catch-up.
ARMORY_MAX_DAYS = 30      # Nov 2026: reads never reach further back than this (no backlog catch-up - Torn's daily
                          # read limit). Older news already saved stays; the log grows going forward from here.
ARMORY_RECENT = 40        # latest uses kept per member for the Armory Monitor's member view
# Categories (Nov 2026 rework): USED items only - loans / items given out are kept in the log but never counted.
# Tracked PER MEMBER (most important first): Xanax, Medical (incl. Empty Blood Bags filled from the armory), points
# Refills, Temporary, other Drugs, Boosters. Faction totals only (not per member): OC / utility items + anything else.
ARMORY_CATS = ["Xanax", "Medical", "Refills", "Temporary", "Drugs", "Boosters", "Crime items", "Weapons", "Armor", "Other"]
ARMORY_MEMBER_CATS = ["Xanax", "Medical", "Refills", "Temporary", "Drugs", "Boosters"]
ARMORY_COUNTED = ("u", "r")      # u = used, r = points refill; l = loaned, g = given -> not usage
# Torn item types -> categories. v2 /torn/items names them "Weapon", "Armor", "Tool", "Material", "Enhancer" (the
# old v1 names - Primary / Secondary / Melee / Defensive - are kept too). Verified with tools/verify.py (Nov 2026):
# before this, loaned weapons / armour and organized-crime items all fell into "Other".
ARMORY_TYPE_CAT = {"drug": "Drugs", "medical": "Medical", "alcohol": "Boosters", "candy": "Boosters",
                   "energy drink": "Boosters", "booster": "Boosters", "temporary": "Temporary",
                   "weapon": "Weapons", "primary": "Weapons", "secondary": "Weapons", "melee": "Weapons",
                   "armor": "Armor", "defensive": "Armor",
                   "tool": "Crime items", "material": "Crime items", "enhancer": "Crime items"}
# (the old Xanax monitor's attack_log.json / gym_daily.json / xanax_log.json were removed from the data repo, Nov 2026)


def item_types(key: str) -> dict:
    """{item name: Torn item type} - data/item_types.json, refreshed from /torn/items once a week (1 call)."""
    import time
    try:
        c = json.loads(ITEM_TYPES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        c = {"fetched": 0, "types": {}}
    if key and due("item_types", c.get("fetched")):       # weekly, Monday 00:00 TCT
        try:
            data = fetch_url("https://api.torn.com/v2/torn/items", key)
            items = data.get("items")
            for it in (items.values() if isinstance(items, dict) else _as_list(items)):
                if isinstance(it, dict) and it.get("name"):
                    c["types"][it["name"]] = it.get("type") or ""
            c["fetched"] = int(time.time())
            ITEM_TYPES_PATH.write_text(json.dumps(c, indent=0, sort_keys=True) + "\n", encoding="utf-8")
        except SystemExit as e:
            print(f"Item types skipped: {e}")
    return c.get("types", {})


def armory_cat(item: str, types: dict) -> str:
    if item.endswith(" refill (points)"):
        return "Refills"
    if item == "Xanax":
        return "Xanax"                  # its own category - the item leaders watch most
    if "blood bag" in item.lower():
        return "Medical"                # Empty Blood Bags (filled from the armory) count as medical
    return ARMORY_TYPE_CAT.get(str(types.get(item, "")).lower(), "Other")


def _armory_parse(text: str):
    """One armory news line -> (member id, item, count, kind) or None (deposits, fills, returns... aren't usage)."""
    import html as _h, re
    raw_ = _h.unescape(str(text))
    plain = re.sub(r"<[^>]+>", "", raw_)
    ids = re.findall(r"XID=(\d+)", raw_)
    if not ids:
        return None
    n_ = lambda v: 1 if str(v).lower() in ("one", "a", "an") else int(v)
    m = re.search(r"\bused\s+(\d+)\s+of the faction'?s\s+points\s+to\s+refill\s+(?:their|his|her)\s+(energy|nerve)", plain, re.I)
    if m:
        return int(ids[0]), f"{m.group(2).capitalize()} refill (points)", 1, "r"
    m = re.search(r"\bused\s+(one|an?|\d+)\s+of the faction'?s\s+(.+?)\s+items?\b", plain, re.I)
    if m:
        return int(ids[0]), m.group(2).strip(), n_(m.group(1)), "u"
    # "filled one of the faction's Empty Blood Bags to create a Blood Bag : A+" - the empty bag is used up (Nov 2026)
    m = re.search(r"\bfilled\s+(one|an?|\d+)\s+of the faction'?s\s+Empty Blood Bags?\b", plain, re.I)
    if m:
        return int(ids[0]), "Empty Blood Bag", n_(m.group(1)), "u"
    m = re.search(r"\b(loaned|gave)\s+(\d+)\s*x\s*(.+?)\s+to\s+", plain, re.I)
    if m and len(ids) >= 2:
        return int(ids[1]), m.group(3).strip(), int(m.group(2)), "l" if m.group(1).lower() == "loaned" else "g"
    return None


def _utc_month_start(t: int) -> int:
    """Start (UTC) of the month time t is in."""
    d = datetime.fromtimestamp(t, timezone.utc)
    return int(datetime(d.year, d.month, 1, tzinfo=timezone.utc).timestamp())


ARMORY_LOG_V = 4        # 2: month windows (v1 marked it "complete" after the newest pages)
                        # 3: each month window read OLDEST first with its place kept ("back") - Torn's newest-first
                        #    paging cut windows short; v2 logs keep their events and re-read the older months
                        # 4: Empty Blood Bag fills are usage (Nov 2026) - v3 logs keep their events and re-read the whole
                        #    history once (this month first) to pick up the fills; nothing already read is counted twice


def update_armory_log(key: str, founded: int = 0):
    """Full runs -> data/armory_log.json:
      1) forward: everything since the newest news read (a new log starts at the 1st of this month)
      2) backfill: month by month, newest month first - the window [month start, oldest read) is read OLDEST first
         (the paging that works reliably), its place kept in log["back"] = {"w0": window start, "pos": next time}
         so a month bigger than one run's page budget carries on next run. A finished window moves on to the
         month before. Done when the window reaches the faction's founding month (founded = from basic days_old)."""
    import time
    if not key:
        return
    now = int(time.time())
    try:
        log = json.loads(ARMORY_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log = {}
    if log.get("v") == 2:                        # keep v2's events, re-read the older months the v3 way
        log.update(v=ARMORY_LOG_V, oldest=_utc_month_start(now), done=False, back=None)
    if log.get("v") == 3:                        # keep v3's events, re-read everything (this month too) for the
        log.update(v=ARMORY_LOG_V, oldest=int(log.get("last") or now) + 1, done=False, back=None)   # blood bag fills
    if log.get("v") == ARMORY_LOG_V and not due("armory", log.get("read")):
        print("Armory log: read this slot already")
        return
    if log.get("v") != ARMORY_LOG_V:            # new / old-format log: start again from this month
        ms = _utc_month_start(now)
        log = {"v": ARMORY_LOG_V, "items": [], "last": ms - 1, "oldest": ms, "done": False, "events": [], "back": None}
    idx = {n: k for k, n in enumerate(log["items"])}
    seen = {(e[0], e[1], e[2]) for e in log["events"]}
    stats = {"new": 0, "back": 0, "pages": 0}
    today = now - now % 86400
    if int(log.get("paused_day") or 0) < today:
        log.pop("paused_day", None)
    back_cap = int(log.get("back_pages") or ARMORY_PAGES_BACK)
    budget = {"n": ARMORY_PAGES_NEW + back_cap, "limit": False}

    def take(items, which):
        for n in items:
            t = int(n.get("timestamp") or 0)
            p = _armory_parse(n.get("text", ""))
            if not p:
                continue
            mid, item, cnt, kind = p
            if item not in idx:
                idx[item] = len(log["items"]); log["items"].append(item)
            k_ = (t, mid, idx[item])
            if k_ in seen:
                continue
            seen.add(k_); log["events"].append([t, mid, idx[item], cnt, kind]); stats[which] += 1

    def walk(t0, t1, sort, pages, which):
        """Read news in [t0, t1] (up to `pages` pages). Returns (oldest, newest) time seen, and whether the
        window was read to its end (no more pages) - False if the page budget or an error stopped it."""
        lo = hi = None
        try:
            data = fetch_section("news", key, {"cat": "armoryAction", "from": t0, "to": t1, "sort": sort, "limit": 100})
        except SystemExit as e:
            print(f"Armory log ({which}) stopped: {e}")
            budget["limit"] = budget["limit"] or "'code': 14" in str(e) or "Daily read limit" in str(e)
            return lo, hi, False
        for _ in range(pages):
            if budget["n"] <= 0:
                return lo, hi, False
            budget["n"] -= 1
            items = _as_list(data.get("news"))
            stats["pages"] += 1
            take(items, which)
            ts = [int(n.get("timestamp") or 0) for n in items if n.get("timestamp")]
            if ts:
                lo = min(ts + ([lo] if lo else [])); hi = max(ts + ([hi] if hi else []))
            nxt = ((data.get("_metadata") or {}).get("links") or {}).get("next")
            if not nxt or not items:
                return lo, hi, True
            time.sleep(API_PAGE_DELAY)
            try:
                data = fetch_url(nxt, key)
            except SystemExit as e:
                print(f"Armory log ({which}) continues next run: {e}")
                budget["limit"] = budget["limit"] or "'code': 14" in str(e) or "Daily read limit" in str(e)
                return lo, hi, False
        return lo, hi, False

    floor = now - ARMORY_MAX_DAYS * 86400                  # never read further back than this
    # 1) forward (oldest first, so an unfinished read carries on from where it stopped) - after a long gap
    #    only the last ARMORY_MAX_DAYS are read
    _lo, hi, _end = walk(max(log["last"] + 1, floor), now, "ASC", ARMORY_PAGES_NEW, "new")
    if hi:
        log["last"] = max(log["last"], hi)
    # 2) backfill, newest month first, while the page budget lasts
    stop = max(_utc_month_start(founded) if founded else 0, floor)   # backfill: last ARMORY_MAX_DAYS only
    back_pages = 0 if (log.get("paused_day") or budget["limit"]) else back_cap
    if log.get("paused_day") and not log["done"]:
        print("Armory log: backfill paused until tomorrow (Torn daily read limit)")
    while not log["done"] and budget["n"] > 0 and back_pages > 0:
        if log["oldest"] <= stop:                           # read back as far as allowed
            log["done"], log["back"] = True, None
            break
        w0 = max(_utc_month_start(log["oldest"] - 1), stop)  # the month just before what's read (not past stop)
        bk = log.get("back") or {}
        pos = bk.get("pos", w0) if bk.get("w0") == w0 else w0
        before = budget["n"]
        _lo, hi, ended = walk(pos, log["oldest"] - 1, "ASC", back_pages, "back")
        back_pages -= before - budget["n"]
        if ended:
            log["oldest"], log["back"] = w0, None            # that whole month is read
        else:
            log["back"] = {"w0": w0, "pos": (hi or pos - 1) + 1 if hi else pos}
            break
    if budget["limit"]:                        # Torn's daily read cap: slow the catch-up, pause it until tomorrow
        log["back_pages"] = max(10, back_cap // 2)
        log["paused_day"] = today
        print(f"Armory log: daily read limit - backfill paused until tomorrow, then {log['back_pages']} pages/slot")
    log["events"].sort()
    log["read"] = now
    ARMORY_LOG_PATH.write_text(json.dumps(log, separators=(",", ":")) + "\n", encoding="utf-8")
    since = datetime.fromtimestamp(log["oldest"], timezone.utc).strftime("%b %d, %Y")
    print(f"Armory log: {stats['new']} new + {stats['back']} older uses ({stats['pages']} pages) · "
          f"{len(log['events'])} kept · read back to {since}{' (complete)' if log.get('done') else ''}")


ARMORY_LOANS_PATH = ROOT / "data" / "armory_loans.json"


def update_armory_loans(key: str):
    """Full runs (Nov 11 2026, user: Armory "Currently Loaned: Armor / Weapons / Temps / etc"): who has which faction
    armory items on loan RIGHT NOW - ONE Torn call per full update (faction key, v1 armor / weapons / temporary /
    utilities - the same selections the Faction Armory Tracker script reads). -> data/armory_loans.json
    {"at": time, "members": {id: {"Weapons": [names], "Armor": [...], "Temporary": [...], "Utilities": [...]}}}"""
    import time
    if not key:
        return
    try:
        url = (f"https://api.torn.com/faction/?selections=armor,weapons,temporary,utilities&key={urllib.parse.quote(key)}"
               f"&comment={urllib.parse.quote(API_COMMENT)}")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "HB Hub"}), timeout=30) as r:
            d = json.loads(r.read().decode())
    except Exception as ex:                       # never print the URL (it has the key)
        print(f"Armory loans: not read ({type(ex).__name__})")
        return
    if d.get("error"):
        print(f"Armory loans: Torn error {d['error'].get('code')}")
        return
    out = {}
    for sel, cat in (("weapons", "Weapons"), ("armor", "Armor"), ("temporary", "Temporary"), ("utilities", "Utilities")):
        items = d.get(sel) or []
        for it in (items.values() if isinstance(items, dict) else items):
            if not isinstance(it, dict):
                continue
            lt = it.get("loaned_to")
            ids = ([x.get("id") if isinstance(x, dict) else x for x in lt] if isinstance(lt, list)
                   else str(lt).split(",") if lt not in (None, "", 0, "0") else [])
            for x in ids:
                x = str(x).strip()
                if x and x != "0":
                    out.setdefault(x, {}).setdefault(cat, []).append(it.get("name") or "?")
    ARMORY_LOANS_PATH.write_text(json.dumps({"at": int(time.time()), "members": out}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Armory loans: {sum(len(v) for m in out.values() for v in m.values())} items loaned to {len(out)} members")


def armory_data(db: dict) -> dict:
    """Usage per member from data/armory_log.json: by month and all time, by category and by item.
      {"cats", "items": [names], "item_cat": [category per item], "oldest", "done", "months": [YYYY-MM newest first],
       "members": {id: {"m": {month: {item index: count}}}}} - the page sums whatever period is picked."""
    try:
        log = json.loads(ARMORY_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log = {"items": [], "events": []}
    types = item_types("")
    item_cat = [armory_cat(n, types) for n in log.get("items", [])]
    per, months, recent, fac = {}, set(), {}, {}
    for t, mid, it, cnt, kind in log.get("events", []):
        if kind not in ARMORY_COUNTED:          # loaned / given out: not usage
            continue
        mon = datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m")
        months.add(mon)
        if item_cat[it] not in ARMORY_MEMBER_CATS:
            # OC / utility items: faction totals per month only, not who took them
            d_ = fac.setdefault(mon, {})
            d_[str(it)] = d_.get(str(it), 0) + cnt
            continue
        d_ = per.setdefault(str(mid), {}).setdefault(mon, {})
        d_[str(it)] = d_.get(str(it), 0) + cnt
        recent.setdefault(str(mid), []).append([t, it, cnt, kind])     # events are in time order
    recent = {i: r[-ARMORY_RECENT:][::-1] for i, r in recent.items()}
    try:
        loans = json.loads(ARMORY_LOANS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        loans = {}
    return {"loans": loans.get("members", {}), "loans_at": loans.get("at"),     # currently loaned (update_armory_loans)
            "cats": ARMORY_CATS, "member_cats": ARMORY_MEMBER_CATS, "items": log.get("items", []),
            "item_cat": item_cat,
            "oldest": log.get("oldest"), "done": bool(log.get("done")), "months": sorted(months, reverse=True),
            "faction": fac,
            "members": {i: {"m": m, "r": recent.get(i, [])} for i, m in per.items()}}


def write_armory_page(out: Path, db: dict, ad: dict):
    """armory.html (leaders): pick a month (or all time / last 30 days) -> per member: items by category, top items,
    total; faction totals per category on top. Drawn in the browser from the embedded data (armory_data)."""
    lout = out / leader_dir()
    names = {str(m["id"]): (m["name"], m["current"]) for m in db["members"]["members"]}
    conf = dict(ad, names=names, member_base=member_base())
    # the same data for the "Heart Breakers Hub" userscript (Armory tab, leaders - op "read" l db/armory.json)
    _jdump(lout / "db" / "armory.json", conf)
    tpl = (ROOT / "tools" / "armory_monitor.html").read_text(encoding="utf-8")
    (lout / "armory.html").write_text(tpl.replace("__CONFIG__", json.dumps(conf, separators=(",", ":")).replace("</", "<\\/"))
                                      .replace("__MENU__", leader_menu(""))
                                      .replace("__FRESH__", fresh_html(["armory", "members"], member_base() + "/")), encoding="utf-8")
    # the old address keeps working
    (lout / "xanax.html").write_text('<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=armory.html">'
                                     '<title>Armory Monitor</title>', encoding="utf-8")


def oc_hist(crimes, cur: dict) -> dict:
    """History pass rates for the Team Builder: {"Crime|Role": {member id: [rate %, when]}} - each CURRENT member's
    latest rate per crime + role from completed crimes (their "slots")."""
    hist = {}
    for c in crimes:
        t = int(c.get("executed_at") or 0)
        for pid, label, rate in c.get("slots") or []:
            if not pid or rate is None or str(pid) not in cur:
                continue
            b = hist.setdefault(f"{c.get('name')}|{oc_role(label)}", {})
            if str(pid) not in b or t > b[str(pid)][1]:
                b[str(pid)] = [int(rate), t]
    return hist


def write_oc_management(out: Path, db: dict):
    """oc.html (leaders) - OC MANAGEMENT (Nov 2026): turn crimes on/off for the OC Optimizer script's suggestions,
    build teams (Team Builder, ported from the script's simulator + an automatic multi-team builder) and deploy them -
    members running the script are then pointed at their assigned role. Embedded here (rebuilt every full update):
      catalog   every OC scenario {name: {difficulty, roles, prereq}} (data/oc_catalog.json, weekly)
      hist      history pass rates {"Crime|Role": {member id: [rate %, when]}} - each CURRENT member's latest rate per
                crime + role from completed crimes (data/crime_history.json slots)
      members   current members {id: name}
      values    pay per crime {name: {g gross $, pp payout %, n, ok}} (oc_values) - auto-build ranks by members' $/day
    Read live by the page through the gatekeeper (leaders' pass): the OC Optimizer's shared rates (D1, /l/oc/rates),
    the deployed settings + plan (D1, /l/oc/config) and the active crimes (data/oc_active.json, every crime check)."""
    lout = out / leader_dir()
    try:
        catalog = json.loads(OC_CATALOG_PATH.read_text(encoding="utf-8")).get("crimes", {})
    except (OSError, ValueError):
        catalog = {}
    cur = {str(m["id"]): m["name"] for m in db["members"]["members"] if m["current"]}
    try:
        ch = json.loads(CRIME_HIST_PATH.read_text(encoding="utf-8")).get("crimes", {})
    except (OSError, ValueError):
        ch = {}
    # "built": when this copy was made - the page prefers data/oc_pool.json (Refresh button) when that's newer
    try:
        prices = json.loads(OC_PRICES_PATH.read_text(encoding="utf-8")).get("prices", {})
    except (OSError, ValueError):
        prices = {}
    # "values": pay per crime (oc_values) - the Team Builder ranks teams by members' pay per day with these
    conf = {"catalog": catalog, "hist": oc_hist(ch.values(), cur), "values": oc_values(ch.values(), prices),
            "members": cur, "member_base": member_base(),
            "repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "built": int(datetime.now(timezone.utc).timestamp())}
    tpl = (ROOT / "tools" / "oc_management.html").read_text(encoding="utf-8")
    # the shared team planner (gate/oc_planner.js - the gatekeeper's automatic plan runs the same code), inlined
    import re
    planner = re.sub(r"^export ", "", (ROOT / "gate" / "oc_planner.js").read_text(encoding="utf-8"), flags=re.M)
    # wrapped so its helper names (baseRole, uid...) don't clash with the page's own - only ocPlan is exposed
    tpl = tpl.replace("/*__PLANNER__*/", "const ocPlan = (() => {\n" + planner + "\nreturn ocPlan;\n})();")
    (lout / "oc.html").write_text(tpl.replace("__CONFIG__", json.dumps(conf, separators=(",", ":")).replace("</", "<\\/"))
                                  .replace("__MENU__", leader_menu("")), encoding="utf-8")


def armory_own(ad: dict, mid: str) -> dict:
    """One member's own usage for their profile (via the gatekeeper's /m/mine.json): this month, last month and
    all time on record, by category, plus their top items all time."""
    m = (ad["members"].get(str(mid)) or {}).get("m", {})
    now_ = datetime.now(timezone.utc)
    this_m = now_.strftime("%Y-%m")
    last_m = (now_.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    def cats(months):
        c = {}
        for mon in months:
            for it, n in (m.get(mon) or {}).items():
                k = ad["item_cat"][int(it)]
                c[k] = c.get(k, 0) + n
        return c
    items, by_cat = {}, {}
    for mon, d_ in m.items():
        for it, n in d_.items():
            nm, cat = ad["items"][int(it)], ad["item_cat"][int(it)]
            items[nm] = items.get(nm, 0) + n
            row = by_cat.setdefault(cat, {}).setdefault(nm, [0, 0])     # [this month, all time]
            row[1] += n
            if mon == this_m:
                row[0] += n
    return {"month": cats([this_m]), "last_month": cats([last_m]), "all": cats(list(m)),
            "top": sorted(items.items(), key=lambda kv: -kv[1])[:8],
            "items": {c: sorted(([nm, a, b] for nm, (a, b) in d_.items()), key=lambda x: -x[2]) for c, d_ in by_cat.items()},
            "oldest": ad.get("oldest"), "done": ad.get("done")}


# ==========================================================================
# OPT-IN STATS (members' own Limited API key - see the OPT-IN block in gate/worker.js)
#   data/optin.json        {members: {id: {k: encrypted key, bs, ws: "off"|"leaders"|"faction", ready, since}}}
#                          written by the gatekeeper (members' "My data & sharing" page); the key is AES-256-GCM
#                          encrypted with sha256(MEMBER_DIR|LEADER_DIR|hb-optin) - never stored or shown in plain
#   data/optin_stats.json  {id: {"bs": [[day, str, def, spd, dex], ...], "ws": [[day, man, int, end], ...]}}
#                          one point per day (the day's latest reading), the last OPTIN_KEEP_DAYS days
# Every full update (optin_update): one Torn call per opted-in member with THEIR key (battlestats, workstats).
# Automatic deletion (Torn ToS - data kept only while it's allowed):
#   - left the faction                -> key + settings + all their stats deleted
#   - Torn says the key is gone (code 2: incorrect key - deleted key / deleted account) or now belongs to someone
#     else -> deleted
#   - a part switched off (bs / ws "off") -> that part's history deleted; whole entry deleted -> all stats deleted
#   (key paused / owner inactive / temporary errors: kept, skipped this time)
# The key list is changed through GitHub's API with the file's sha (never by the git save), so a member saving
# at the same moment is never overwritten.
# ==========================================================================
OPTIN_PATH = ROOT / "data" / "optin.json"
OPTIN_STATS_PATH = ROOT / "data" / "optin_stats.json"
OPTIN_KEEP_DAYS = 400


def _optin_cipher():
    import hashlib
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    sec = f'{os.environ.get("MEMBER_DIR", "")}|{os.environ.get("LEADER_DIR", "")}|hb-optin'.encode()
    return AESGCM(hashlib.sha256(sec).digest())


def _optin_open(sealed: str) -> str:
    import base64
    raw = base64.urlsafe_b64decode(sealed + "=" * (-len(sealed) % 4))
    return _optin_cipher().decrypt(raw[:12], raw[12:], None).decode()


def _optin_remove(ids: set, why: str):
    """Delete members' entries from data/optin.json through GitHub's contents API (sha-checked, retried)."""
    import base64
    tok = os.environ.get("DATA_TOKEN", "").strip()
    if not ids or not tok:
        if ids:
            print("Opt-in: DATA_TOKEN not set - couldn't delete keys")
        return
    api = f"https://api.github.com/repos/{REPO}/contents/data/optin.json"
    H = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json", "User-Agent": "hb-update"}
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(api + "?ref=main", headers=H), timeout=30) as r:
                j = json.loads(r.read().decode())
            data = json.loads(base64.b64decode(j["content"]).decode())
            for i in ids:
                data.get("members", {}).pop(str(i), None)
            body = json.dumps({"message": f"Opt-in: {len(ids)} deleted ({why}) [bot]", "sha": j["sha"], "branch": "main",
                               "content": base64.b64encode((json.dumps(data, indent=1) + "\n").encode()).decode()}).encode()
            urllib.request.urlopen(urllib.request.Request(api, data=body, method="PUT",
                                                          headers=dict(H, **{"Content-Type": "application/json"})), timeout=30)
            print(f"Opt-in: deleted {len(ids)} member key(s) - {why}")
            return
        except urllib.error.HTTPError as e:
            if e.code not in (409, 422):
                print(f"Opt-in: delete failed ({e.code})")
                return
        except Exception as e:
            print(f"Opt-in: delete failed ({type(e).__name__})")
            return


def optin_update(raw: dict):
    """Full runs: delete what has to go, then today's battle / work stats for everyone who opted in."""
    import time
    try:
        opt = json.loads(OPTIN_PATH.read_text(encoding="utf-8")).get("members", {})
    except (OSError, ValueError):
        opt = {}
    try:
        st = json.loads(OPTIN_STATS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        st = {}
    current = {str(m.get("id")) for m in _as_list((raw.get("members") or {}).get("members"))}
    last_read = int((st.get("_meta") or {}).get("read") or 0)
    # SCHEDULE (Nov 2026, the user's rule): everyone is read once a day in the 00:00 TCT slot. A member who OPTS IN
    # (or turns a stat on) is read straight away - saving commits data/optin.json, which starts a full update - then
    # follows the 00:00 schedule. Nobody is read twice in a day (a second save the same day waits for 00:00).
    today0 = slot_start("optin")
    pending = {i for i, e in opt.items() if (e.get("bs", "off") != "off" or e.get("ws", "off") != "off")
               and int(e.get("updated") or 0) > int((st.get(i) or {}).get("r") or 0)     # r = when last read
               and int((st.get(i) or {}).get("r") or 0) < today0}
    only = None
    if not due("optin", last_read):
        if not pending:
            print("Opt-in: read this slot already (next read 00:00 TCT)")
            return opt, {k: v for k, v in st.items() if k != "_meta"}
        only = pending
        print(f"Opt-in: {len(pending)} newly opted-in member(s) read now")
    meta = st.pop("_meta", None) or {}
    gone, bad = set(), set()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=OPTIN_KEEP_DAYS)).strftime("%Y-%m-%d")
    n = 0
    for i, e in opt.items():
        if current and i not in current:
            gone.add(i)
            continue
        if e.get("bs", "off") == "off" and e.get("ws", "off") == "off":
            continue                              # readiness only - nothing to record
        if only is not None and i not in only:
            continue                              # not due this time (slot already read)
        try:
            key = _optin_open(e["k"])
        except Exception:
            print("Opt-in: a stored key couldn't be read - skipped")
            continue
        try:
            url = (f"https://api.torn.com/user/?selections=basic,battlestats,workstats&key={urllib.parse.quote(key)}"
                   f"&comment={urllib.parse.quote(API_COMMENT)}")
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "HB Hub"}), timeout=30) as r:
                d = json.loads(r.read().decode())
        except Exception as ex:                  # never print the URL (it has the key)
            print(f"Opt-in: a member's stats couldn't be read ({type(ex).__name__})")
            continue
        err = (d.get("error") or {}).get("code")
        if err == 2 or (not err and str(d.get("player_id")) != i):
            bad.add(i)                            # key deleted / account gone / not theirs any more
            continue
        if err:
            continue                              # paused, inactive, temporary - try again next time
        rec = st.setdefault(i, {})
        rec["r"] = int(time.time())               # when this member was last read (new / changed members: see pending)
        if e.get("bs") != "off":
            row = [day] + [int(d.get(k) or 0) for k in ("strength", "defense", "speed", "dexterity")]
            s_ = [x for x in rec.get("bs", []) if x[0] != day and x[0] >= cutoff]
            rec["bs"] = s_ + [row]
        if e.get("ws") != "off":
            row = [day] + [int(d.get(k) or 0) for k in ("manual_labor", "intelligence", "endurance")]
            s_ = [x for x in rec.get("ws", []) if x[0] != day and x[0] >= cutoff]
            rec["ws"] = s_ + [row]
        n += 1
        time.sleep(0.3)
    # stats only for members still opted in, and only the parts they still share
    for i in list(st):
        e = opt.get(i)
        if not e or i in gone or i in bad:
            del st[i]
            continue
        for part in ("bs", "ws"):
            if e.get(part, "off") == "off":
                st[i].pop(part, None)
        if not (st[i].get("bs") or st[i].get("ws")):
            del st[i]
    # "read" = the last full (slot) read; a read of only new / changed members keeps the slot's time
    meta = {"read": int(time.time())} if only is None else meta
    OPTIN_STATS_PATH.write_text(json.dumps(dict(st, _meta=meta), separators=(",", ":")) + "\n", encoding="utf-8")
    _optin_remove(gone, "left the faction")
    _optin_remove(bad, "key deleted or no longer theirs")
    for i in gone | bad:
        opt.pop(i, None)
    print(f"Opt-in: {len(opt)} member(s) opted in · stats read for {n}")
    return opt, st


def write_optin_pages(out: Path):
    """my-data.html (members - opt in / out, the Torn ToS disclosure) + stats.html and readiness.html (leaders)."""
    g_ = gate_cfg()
    if not g_:
        return
    gate = g_["url"].rstrip("/")
    page = lambda tpl, conf, menu: (ROOT / "tools" / tpl).read_text(encoding="utf-8") \
        .replace("__CONFIG__", json.dumps(conf)).replace("__MENU__", menu)
    (member_out(out) / "my-data.html").write_text(page("optin_settings.html", {"gate": gate}, site_menu("")), encoding="utf-8")
    # Chain Watching Schedule (Nov 2026): members sign up for chain watch shifts (gatekeeper /m/cw/schedule)
    (member_out(out) / "chainwatch-schedule.html").write_text(page("chainwatch_schedule.html", {"gate": gate}, site_menu("")), encoding="utf-8")
    # Scripts directory (Nov 10 2026): the faction's userscripts; leaders edit the listings on the same page (/m/scripts)
    (member_out(out) / "scripts.html").write_text(page("scripts_directory.html", {"gate": gate}, site_menu("")), encoding="utf-8")
    if leader_dir():
        lout = out / leader_dir()
        conf = {"member_base": member_base(), "gate": gate}
        (lout / "stats.html").write_text(page("member_stats.html", conf, leader_menu("") + tab_bar(MEMBER_DATA_TABS, "stats.html")), encoding="utf-8")
        (lout / "readiness.html").write_text(page("war_readiness.html", conf, leader_menu("") + tab_bar(MEMBER_DATA_TABS, "readiness.html")), encoding="utf-8")
        # Chain Watch settings (Nov 2026): the Faction Chain Watch script's faction settings, saved through the gate
        (lout / "chainwatch.html").write_text(page("chainwatch_settings.html", {"gate": gate}, leader_menu("")), encoding="utf-8")
        # Recruitment (Nov 11 2026): recruits shared by the Torn Recruit Scout script - claim / status / notes / remove
        # (gatekeeper /l/rc/*, D1 rc_recruit; contract claude/recruitment-hub-contract.md)
        (lout / "recruitment.html").write_text(page("recruitment.html", {"gate": gate}, leader_menu("")), encoding="utf-8")
        # Link Torn script page REMOVED (Nov 11 2026): the "Heart Breakers Hub" userscript now signs in with the
        # leader's own API key (kept on their device; the Hub gets only the client-reported identity - gatekeeper
        # /sx op "hello"). Its old address goes to the Leaders Hub.
        (lout / "script-link.html").write_text('<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=index.html">'
                                               '<title>Leaders Hub</title>', encoding="utf-8")


def optin_saved():
    """(settings, stats) as saved - for runs that don't read Torn (no keys used)."""
    try:
        opt = json.loads(OPTIN_PATH.read_text(encoding="utf-8")).get("members", {})
    except (OSError, ValueError):
        opt = {}
    try:
        st = json.loads(OPTIN_STATS_PATH.read_text(encoding="utf-8"))
        st.pop("_meta", None)
    except (OSError, ValueError):
        st = {}
    return opt, st


def optin_publish(out: Path, opt: dict, st: dict) -> dict:
    """What the site shows (no keys): per opted-in member {bs: {share, s: series}, ws: {...}, ready}.
    Returned for the leaders' db/private.json (leaders see all; a member gets their own via /m/mine.json);
    the parts a member shares with the FACTION also go to the members' db/optin_shared.json (profiles)."""
    full, shared = {}, {}
    for i, e in opt.items():
        rec = st.get(i, {})
        x = {"ready": bool(e.get("ready")), "since": e.get("since")}
        for part in ("bs", "ws"):
            if e.get(part, "off") != "off":
                x[part] = {"share": e[part], "s": rec.get(part, [])}
        full[i] = x
    # SCRIPT SHARING (Nov 11 2026): what members share from the Heart Breakers Hub script (their key stays on their
    # device; the script sends readings once a day) - merged in: a part only shared from the script uses the script's
    # setting; shared both ways = one series (same day: the script's reading).
    for i, e in sx_export().items():
        x = full.setdefault(i, {"ready": False, "since": int(e.get("since") or 0) // 1000 or None})
        x["ready"] = bool(x.get("ready") or e.get("ready"))
        for part in ("bs", "ws"):
            if part not in e:
                continue
            if part in x:
                byday = {r[0]: r for r in x[part]["s"]}
                byday.update({r[0]: r for r in e[part].get("s") or []})
                x[part]["s"] = [byday[d] for d in sorted(byday)]
            else:
                x[part] = {"share": e[part]["share"], "s": e[part].get("s") or []}
    # SHARING SOURCES (Nov 11 2026): how each member shares each thing - leaders see it ("site" = Hub site with a
    # stored key, "script" = the Heart Breakers Hub script, "ocopt" = the OC Optimizer script's pass rates). Leaders'
    # db/private.json only (optin.via); never in the members' optin_shared.json.
    for i, v in (_sx_export_raw().get("via") or {}).items():
        if any(v.get(k) for k in ("bs", "ws", "ready", "oc", "cw")):
            full.setdefault(i, {"ready": False})["via"] = v
    for i, x in full.items():
        sh = {p: x[p] for p in ("bs", "ws") if p in x and x[p]["share"] == "faction"}
        if sh:
            shared[i] = sh
    _jdump(member_out(out) / "db" / "optin_shared.json", {"members": shared})
    return full


# ==========================================================================
# WAR TARGETS (Nov 12 2026, the user: "compare war targets estimated stats and estimated FF rating against our own
# members ... which targets our members should attack for maximum score during wars"). User's choices:
#   enemy estimates   FFScouter (ffscouter.com get-stats: bss_public = the enemy's estimated battle stat score)
#   who sees it       all members (every member's list)
#   our members       their shared battle stats (Hub opt-in / Hub script, latest reading); members who don't share
#                     get FFScouter's estimate of them instead, and the page asks them to share their stats
#   band              estimated fair fight 2.5 - 3.0 by default (target at 56% - 75% of the member's stat score);
#                     each member can change the FF range and an estimated-stats range on the page (Nov 12 2026)
#   where             a Hub page (members' war-targets.html) for now
# Torn wiki (Chain - Fair fights): FF = 1 + 8/3 x (defender's stat score / attacker's stat score), 1x - 3x;
#   stat score = sqrt(str) + sqrt(def) + sqrt(spd) + sqrt(dex). Base respect = 1 + level / 200 (rounded down).
#   Est. respect per hit (shown, before chain / war / retaliation bonuses) = base respect x FF.
# Runs on every full / war run while a ranked war is ongoing or upcoming:
#   1 Torn call  /v2/faction/<enemy id>/members (levels, names)
#   1-2 FFScouter calls (<= 200 ids each): the enemy members + our members who don't share stats.
#     FFScouter takes the key as a URL parameter (their API) - server-side only, the address is never printed.
#     Key: FFSCOUTER_KEY secret (a Torn key registered on ffscouter.com). Missing -> the page says it's not set up.
# Estimates are cached in data/ffs_cache.json (last good per player) for when FFScouter can't be reached.
# Output: members' db/war_targets.json - no raw stats of OUR members (only the FF each target gives them).
# Live enemy status (hospital / travelling / okay) is read by the page from the gatekeeper (/m/war/enemy.json).
# ==========================================================================
FFS_CACHE_PATH = ROOT / "data" / "ffs_cache.json"
WAR_FF_BAND = (2.5, 3.0)


def _bss(st, de, sp, dx) -> float:
    import math
    return sum(math.sqrt(max(0, float(v or 0))) for v in (st, de, sp, dx))


def ffs_stats(ids: list) -> dict:
    """FFScouter get-stats for these player ids -> {id: {bss, bs, u}} (players FFScouter has no data on are left out).
    API: Heart Breakers Hub - War targets (FFScouter get-stats, <= 200 ids per call)."""
    key = os.environ.get("FFSCOUTER_KEY", "").strip()
    out = {}
    if not key or not ids:
        return out
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        url = "https://ffscouter.com/api/v1/get-stats?" + urllib.parse.urlencode({"key": key, "targets": ",".join(map(str, chunk))})
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "HeartBreakersHub/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode("utf-8"))
        except Exception as e:                        # never print the address (it holds the key)
            print(f"War targets: FFScouter unreachable ({type(e).__name__})")
            continue
        if isinstance(d, dict) and d.get("error"):
            print(f"War targets: FFScouter error code {d.get('code')}")
            continue
        for x in d if isinstance(d, list) else []:
            if isinstance(x, dict) and x.get("player_id") and x.get("bss_public"):
                out[str(x["player_id"])] = {"bss": float(x["bss_public"]), "bs": x.get("bs_estimate_human") or "",
                                            "b": int(x.get("bs_estimate") or 0),   # total battle stats estimate (stats filter)
                                            "u": int(x.get("last_updated") or 0)}
    return out


def _war_enemy(raw: dict):
    """(kind, war, enemy {id, name}) of the ongoing / next ranked war, or None."""
    my_id = str(raw["basic"].get("basic", raw["basic"]).get("id"))
    now = int(datetime.now(timezone.utc).timestamp())
    best = None
    for w in _as_list((raw.get("rankedwars") or {}).get("rankedwars")):
        start, end = int(w.get("start") or 0), int(w.get("end") or 0)
        if end and end <= now or not _as_list(w.get("factions")):
            continue
        kind = "ongoing" if start and start <= now else "upcoming"
        if best is None or kind == "ongoing" or start < best[1]:
            best = (kind, start, w)
            if kind == "ongoing":
                break
    if not best:
        return None
    them = next((f for f in _as_list(best[2].get("factions")) if str(f.get("id")) != my_id), None)
    return (best[0], best[2], them) if them and them.get("id") else None


def write_war_targets(out: Path, raw: dict):
    import time
    path = member_out(out) / "db" / "war_targets.json"
    base = {"generated": int(time.time()), "band": list(WAR_FF_BAND), "ffs": bool(os.environ.get("FFSCOUTER_KEY", "").strip())}
    we = _war_enemy(raw)
    if not we:
        _jdump(path, dict(base, war=None, enemy={}, members={}))
        return
    kind, w, them = we
    key = os.environ.get("TORN_API_KEY", "").strip()
    try:
        # API: Heart Breakers Hub - War targets (enemy faction members: names + levels), 1 call
        em = _as_list(fetch_section(f"{them['id']}/members", key).get("members"))
    except SystemExit as e:
        print(f"War targets: enemy members not read ({e})")
        em = []
    ours = _as_list((raw.get("members") or {}).get("members"))
    # our members' stat score: their own shared battle stats (latest reading)
    oi = OPTIN_FULL.get("v") or {}
    mine = {}
    for m in ours:
        bs = ((oi.get(str(m.get("id"))) or {}).get("bs") or {}).get("s") or []
        if bs and len(bs[-1]) >= 5 and sum(bs[-1][1:5]) > 0:
            mine[str(m.get("id"))] = _bss(*bs[-1][1:5])
    try:
        cache = json.loads(FFS_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    want = [str(x.get("id")) for x in em] + [str(m.get("id")) for m in ours if str(m.get("id")) not in mine]
    fresh = ffs_stats(want)
    now = int(time.time())
    for i, v in fresh.items():
        cache[i] = dict(v, at=now)
    cache = {i: v for i, v in cache.items() if now - int(v.get("at") or 0) < 30 * 86400}   # last good, 30 days
    FFS_CACHE_PATH.write_text(json.dumps(cache, separators=(",", ":")) + "\n", encoding="utf-8")
    enemy = {}
    for x in em:
        i = str(x.get("id")); c = cache.get(i) or {}
        enemy[i] = {"n": x.get("name") or "?", "l": int(x.get("level") or 0), "bs": c.get("bs") or "", "u": c.get("u") or 0,
                    "b": int(c.get("b") or 0), "_bss": c.get("bss")}
    members = {}
    for m in ours:
        pid = str(m.get("id"))
        if pid in mine:
            src, mb = "shared", mine[pid]
        elif (cache.get(pid) or {}).get("bss"):
            src, mb = "ffs", cache[pid]["bss"]
        else:
            members[pid] = {"n": m.get("name") or "?", "s": "none", "t": []}
            continue
        t = []
        for eid, e in enemy.items():
            if not e["_bss"] or not mb:
                continue
            # FILTERS (Nov 12 2026, the user: "Allow users to adjust the FF range or estimated stats range of the targets
            # they see"): EVERY enemy is listed with its UNCAPPED FF (above 3 = stronger than 75% - Torn pays 3x at most);
            # the page filters by the member's own FF / stats range (default WAR_FF_BAND) and works out respect
            ff = 1 + 8 / 3 * e["_bss"] / mb
            t.append([int(eid), round(ff, 2), round((1 + e["l"] / 200) * min(ff, 3), 2)])   # [enemy id, FF, est. respect]
        t.sort(key=lambda r: (-r[2], r[1]))
        members[pid] = {"n": m.get("name") or "?", "s": src, "t": t}
    for e in enemy.values():
        e.pop("_bss", None)
    _jdump(path, dict(base, war={"kind": kind, "start": int(w.get("start") or 0), "end": int(w.get("end") or 0),
                                 "enemy_id": int(them["id"]), "enemy": them.get("name") or "?"},
                      enemy=enemy, members=members))
    print(f"War targets: {len(enemy)} enemies ({sum(1 for e in enemy.values() if e['bs'])} with estimates), "
          f"{len(members)} members ({sum(1 for v in members.values() if v['s'] == 'shared')} sharing stats, "
          f"{sum(1 for v in members.values() if v['s'] == 'ffs')} estimated)")


def write_greasyfork(out: Path):
    """Scripts directory (Nov 11 2026, user: "Scripts should pull the greasyfork information for their name, version
    numbers, etc. These should stay updated even when an update is made."): Greasy Fork blocks Cloudflare Workers
    (403), so every deploying site run reads Greasy Fork's public JSON for each listing's script (gatekeeper /sx/export
    gives the install links) -> members' db/greasyfork.json {"scripts": {id: {name, version, description, updated (ms),
    code_url, url, installs, daily}}}. No Torn calls; a script that can't be read keeps last run's info."""
    import re as _re
    g_ = gate_cfg()
    if not g_:
        return
    old = {}
    try:
        old = json.loads(GF_PATH.read_text(encoding="utf-8")).get("scripts", {})
    except (OSError, ValueError):
        pass
    ids = []
    for u in (_sx_export_raw().get("scripts") or []):
        m = _re.match(r"^https://(?:update\.)?(?:greasyfork|sleazyfork)\.org/(?:[a-z-]+/)?scripts/(\d+)", str(u), _re.I)
        if m and m.group(1) not in ids:
            ids.append(m.group(1))
    got = {}
    for i in ids[:60]:
        try:
            req = urllib.request.Request(f"https://greasyfork.org/scripts/{i}.json",
                                         headers={"User-Agent": "HB Hub site build", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                j = json.loads(r.read().decode())
            upd = j.get("code_updated_at")
            got[i] = {"name": j.get("name"), "version": j.get("version"), "description": j.get("description"),
                      "updated": int(datetime.fromisoformat(upd.replace("Z", "+00:00")).timestamp() * 1000) if upd else None,
                      "code_url": j.get("code_url"), "url": j.get("url"), "installs": j.get("total_installs"),
                      "daily": j.get("daily_installs")}
        except Exception as ex:
            print(f"Greasy Fork: script {i} not read ({type(ex).__name__})")
            if i in old:
                got[i] = old[i]
    GF_PATH.write_text(json.dumps({"scripts": got}, separators=(",", ":")) + "\n", encoding="utf-8")
    _jdump(member_out(out) / "db" / "greasyfork.json", {"scripts": got})
    print(f"Greasy Fork: {len(got)} of {len(ids)} scripts")


GF_PATH = ROOT / "data" / "greasyfork.json"
_SX_RAW = {}


def _sx_export_raw() -> dict:
    """The gatekeeper's /sx/export answer (read once per run): {members, scripts}."""
    import hashlib
    if "v" in _SX_RAW:
        return _SX_RAW["v"]
    g_ = gate_cfg()
    _SX_RAW["v"] = {}
    if not g_:
        return {}
    tok = hashlib.sha256(f'{os.environ.get("MEMBER_DIR", "")}|{os.environ.get("LEADER_DIR", "")}|hb-sx-export'.encode()).hexdigest()
    try:
        req = urllib.request.Request(g_["url"].rstrip("/") + "/sx/export", headers={"X-HB-Export": tok, "User-Agent": "HB Hub build"})
        with urllib.request.urlopen(req, timeout=20) as r:
            _SX_RAW["v"] = json.loads(r.read().decode())
    except Exception as ex:
        print(f"Hub export: not read ({type(ex).__name__})")
    return _SX_RAW["v"]


def sx_export() -> dict:
    """Stats members share from the Heart Breakers Hub script (gatekeeper GET /sx/export, D1 sx_share):
    {member id: {bs: {share, s}, ws: {share, s}, ready, since}}. Proven with sha256(MEMBER_DIR|LEADER_DIR|hb-sx-export) -
    secrets only this workflow and the gatekeeper have. Numbers only, never a key. {} when the gate is off / unreachable."""
    m = _sx_export_raw().get("members") or {}
    print(f"Script sharing: {len(m)} member(s)")
    return m


def write_monitor(out: Path, db: dict, cfg: dict = None):
    """Leaders' data: reliability (monitor_data) -> db/private.json per member {reliability, armory, optin} + faction
    averages, the Armory Monitor (armory.html) and the opt-in pages. (The Leader Monitor page itself was removed.)
    db/private.json -
    leaders read it whole (Members list column); the gatekeeper's /m/mine.json gives a member ONLY their own entry."""
    import html as _html
    if not leader_dir():
        return
    md = monitor_data(db)
    lout = out / leader_dir()
    ad = armory_data(db)
    write_armory_page(out, db, ad)
    write_oc_management(out, db)
    oi = optin_publish(out, *(OPTIN_DATA.get("v") or optin_saved()))   # opt-in stats (no keys)
    OPTIN_FULL["v"] = oi                                                # war targets (write_war_targets) use it
    write_optin_pages(out)
    priv, sc = {}, [r["score"] for r in md["members"] if r["score"] is not None]
    for r in md["members"]:
        priv[str(r["id"])] = {"reliability": {"score": r["score"], "grade": rel_grade(r["score"]) if r["score"] is not None else None,
                                              "parts": r["parts"], "detail": r["detail"], "receipt": r["receipt"]},
                              "armory": armory_own(ad, r["id"]), "optin": oi.get(str(r["id"]))}
    # part averages over the members that part was judged for (None = not enough data: left out)
    avg_parts = {}
    for k in ("war", "chains", "activity"):
        v = [r["parts"][k] for r in md["members"] if r["parts"][k] is not None]
        avg_parts[k] = round(sum(v) / len(v), 1) if v else None
    _jdump(lout / "db" / "private.json", {"generated": md["generated"], "members": priv,
                                          "grades": [[lo, g_, c] for lo, g_, c in REL_GRADES],
                                          "weights": {"war": REL_W_WAR, "chains": REL_W_CHAIN, "activity": REL_W_ACT},
                                          "rules": {"min_hits": REL_MIN_HITS, "min_wars": REL_MIN_WARS,
                                                    "min_chains": REL_MIN_CHAINS, "chain_min": REL_CHAIN_MIN},
                                          "averages": {"reliability": round(sum(sc) / len(sc), 1) if sc else 0,
                                                       "parts": avg_parts}})
    # HUB SCRIPT FEED (Nov 11 2026): what the "Heart Breakers Hub" userscript shows in Torn, in one small file
    # (read with op "read" {area:"m", path:"db/script_feed.json"} - in the MEMBERS' folder since the script opened
    # to members; nothing in it is leaders-only): latest newsletters / recaps / reports (absolute addresses - the
    # images open without signing in), the recent wars with report + payout links and Termed, and the recap archive.
    try:
        mb = member_base().rstrip("/") + "/"
        rec = _latest_receipts()
        tw = termed_wars()
        wars_ = []
        for w in db["wars"]["wars"][-40:][::-1]:
            wid = str(w["id"])
            ms_ = [x for x in w["m"]]
            wars_.append({"id": w["id"], "opponent": w.get("opponent"), "start": w.get("start"), "end": w["end"],
                          "termed": wid in tw, "hits": sum(x[1] for x in ms_), "attackers": sum(1 for x in ms_ if x[1] > 0),
                          "members": len(ms_), "report": f"{mb}reports/war-{wid}.html", "report_img": f"{mb}reports/war-{wid}.png",
                          "payout": f"{mb}payouts/{rec[wid]}.html" if wid in rec else None,
                          "m": [[x[0], x[1]] for x in ms_]})
        recaps_ = []
        for f in (sorted(RECAP_DIR.glob("*.png"), reverse=True) if RECAP_DIR.exists() else [])[:24]:
            try:
                lab = datetime.strptime(f.stem, "%Y-%m").strftime("%B %Y")
            except ValueError:
                continue
            recaps_.append({"month": f.stem, "label": lab, "img": f"{mb}recaps/{f.name}", "url": f"{mb}newsletter.html#{f.stem}"})
        chains_ = [{"id": c["id"], "length": c["length"], "end": c["end"],
                    "report": f"{mb}reports/chain-{c['id']}.html", "img": f"{mb}reports/chain-{c['id']}.png"}
                   for c in db["chains"]["chains"][-30:][::-1]
                   if REPORTS_DIR.exists() and (REPORTS_DIR / f"chain-{c['id']}.json").exists()]
        # News tab sections (Nov 11 2026, user: "Latest, Newsletters, Chain Reports, War Reports, etc."): up to 30 of each
        every = _hub_latest_items(mb, 30)
        by_kind = {k: [x for x in every if x["kind"] == k] for k in ("newsletter", "war", "chain", "recap")}
        payouts_ = []
        for w in wars_:
            if w["payout"]:
                stem = rec[str(w["id"])]
                payouts_.append({"t": w["end"], "url": w["payout"], "img": f"{mb}payouts/{stem}.png",
                                 "title": f"War payout - vs {w.get('opponent') or '?'}", "sub": datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y"),
                                 "kind": "payout"})
        _jdump(member_out(out) / "db" / "script_feed.json", {"generated": md["generated"], "member_base": mb.rstrip("/"),
                                                  "latest": every[:8], "newsletters": by_kind["newsletter"],
                                                  "war_reports": by_kind["war"], "chain_reports": by_kind["chain"],
                                                  "recap_items": by_kind["recap"], "payouts": payouts_,
                                                  "wars": wars_, "chains": chains_, "recaps": recaps_})
        (lout / "db" / "script_feed.json").unlink(missing_ok=True)      # its old place (leaders' folder)
    except Exception as e_:                       # never break the site build over the script feed
        print("Hub script feed skipped:", e_)
    # the Leader Monitor page was removed (Nov 2026) - reliability is on Members / profiles, armory on the Armory
    # Monitor; its old address goes to the Leaders Hub
    (lout / "monitor.html").write_text('<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=index.html">'
                                       '<title>Leaders Hub</title>', encoding="utf-8")


# click a table header to sort by that column (numbers use data-v when present)
# Tap a header to sort (table.srt): data-v = the value to sort by (else the text). Delegated, so columns added
# later by script (e.g. the leaders' Reliability column on members.html) sort too. Rows whose first cell says
# "Total" stay at the bottom. Safe to include more than once on a page.
SORT_JS = """<style>table.srt tr:first-child th{cursor:pointer}</style><script>if(!window.__hbSort){window.__hbSort=1;
document.addEventListener("click",function(e){var th=e.target.closest&&e.target.closest("table.srt th");if(!th)return;
var t=th.closest("table");if(th.parentNode!==t.rows[0])return;var c=th.cellIndex;
var rows=[].slice.call(t.rows,1).filter(function(r){return !/Total/.test(r.cells[0].textContent)||r.cells.length<2});
var tot=[].slice.call(t.rows,1).filter(function(r){return rows.indexOf(r)<0});
var dir=th.dataset.d=th.dataset.d=="1"?"-1":"1";
rows.sort(function(a,b){var x=a.cells[c],y=b.cells[c];if(!x||!y)return 0;var vx=x.dataset.v!=null?+x.dataset.v:x.textContent.toLowerCase(),
vy=y.dataset.v!=null?+y.dataset.v:y.textContent.toLowerCase();return (vx>vy?1:vx<vy?-1:0)*dir;});
rows.concat(tot).forEach(function(r){r.parentNode.appendChild(r);});});}</script>"""


# Faction positions from lowest to highest - the Members list sorts its Position column by this
# (case-insensitive; any other position sorts below Recruit).
POSITION_ORDER = ["Recruit", "Heart Beat", "Heart Breaker", "Heart Stopper", "HR", "Leadership", "Co-Leader", "Leader"]


def position_rank(pos) -> int:
    p_ = str(pos or "").strip().lower()
    for i, x in enumerate(POSITION_ORDER):
        if x.lower() == p_:
            return i
    return -1


def crime_shares(crimes: list):
    """Organized crime payouts: CRIME_TAX (20%) goes to the faction, the other 80% is split EVENLY between every
    participating member - including the members of its prerequisite crime(s) (previous_crime_id, e.g. No Reserve
    before Bidding War; chains of several are followed back). Sets on each crime:
      split = how many member slots share the payout (this crime + its prerequisites)
      share = what each of THIS crime's members got (a prerequisite gets the share of the crime it led to)
      via   = for a prerequisite: the name of the crime whose payout it shared"""
    by_id = {c.get("id"): c for c in crimes}
    for c in crimes:
        c.setdefault("share", 0)
    for c in crimes:
        if not c.get("money") or str(c.get("status", "")).lower() != "successful":
            continue
        chain, x, seen = [c], c, set()
        while x.get("prev") and x["prev"] in by_id and x["prev"] not in seen:
            seen.add(x["prev"])
            x = by_id[x["prev"]]
            chain.append(x)
        split = sum(len(y.get("m") or []) for y in chain)
        share = int(c["money"] * (1 - CRIME_TAX) / split) if split else 0
        c["split"], c["share"] = split, share
        for y in chain[1:]:
            if not y.get("money"):             # a prerequisite that paid nothing itself
                y["share"], y["split"], y["via"] = share, split, c.get("name")


def write_profiles(out: Path, db: dict):
    """member.html (profile page, drawn in the browser from db/) + members.html (directory, sortable)."""
    import html as _html
    mout = member_out(out)
    tpl = (ROOT / "tools" / "member_profile.html").read_text(encoding="utf-8")
    gurl = gate_cfg()["url"].rstrip("/") if gate_cfg() else ""
    (mout / "member.html").write_text(tpl.replace("__MENU__", site_menu("")).replace("__GATE__", gurl)
                                      .replace("__GHPROXY__", gh_proxy_url())
                                      .replace("/*__RELG__*/", REL_GRADE_JS)
                                      .replace("__FRESH__", fresh_html(["members", "wars", "chains", "crimes", "gym"])), encoding="utf-8")
    # war-targets.html (Nov 12 2026): each member's best ranked-war targets (db/war_targets.json, write_war_targets)
    (mout / "war-targets.html").write_text((ROOT / "tools" / "war_targets.html").read_text(encoding="utf-8")
                                           .replace("__MENU__", site_menu("")), encoding="utf-8")
    # leaderboards.html (this month / all time) + leaderboard-history.html (any past month) - war, chain, OC, gym
    ltpl = (ROOT / "tools" / "leaderboards.html").read_text(encoding="utf-8").replace("__MENU__", site_menu("")) \
        .replace("__FRESH__", fresh_html(["wars", "chains", "crimes", "gym"]))
    (mout / "leaderboards.html").write_text(ltpl.replace("__MODE__", "current"), encoding="utf-8")
    (mout / "leaderboard-history.html").write_text(ltpl.replace("__MODE__", "history"), encoding="utf-8")
    # gym.html / gym-history.html: the Gym page became the Leaderboards' Gym tab (Nov 12 2026, user) - the old addresses
    # forward there (gym-history.html#YYYY-MM -> that month). tools/gym_boards.html is kept for reference only.
    (mout / "gym.html").write_text('<!DOCTYPE html><meta charset="utf-8"><title>Gym</title>'
                                   '<script>location.replace("leaderboards.html#gym")</script>', encoding="utf-8")
    (mout / "gym-history.html").write_text('<!DOCTYPE html><meta charset="utf-8"><title>Gym</title><script>'
                                           'var m=location.hash.slice(1);location.replace("leaderboard-history.html"+'
                                           '(/^\\d{4}-\\d{2}$/.test(m)?"?m="+m:"")+"#gym")</script>', encoding="utf-8")
    # crimes.html - Organized Crimes breakdown (header button), drawn in the browser from db/crimes.json
    (mout / "crimes.html").write_text((ROOT / "tools" / "oc_stats.html").read_text(encoding="utf-8")
                                      .replace("__MENU__", site_menu("") + tab_bar(HISTORY_TABS, "crimes.html")).replace("__FRESH__", fresh_html(["crimes"])),
                                      encoding="utf-8")
    if gate_cfg():     # account.html merged into the profile: old links go to their own profile (keeping #section)
        (mout / "account.html").write_text('<!DOCTYPE html><meta charset="utf-8"><title>My Profile</title>'
                                           '<script>location.replace("me" + location.hash)</script>', encoding="utf-8")
    ms = db["members"]["members"]
    # MEMBERS LIST (Nov 12 2026, user): the one per-member table - the war / chain history pages' "Every member"
    # columns moved here (hits per war, war respect, best war, assists, chain respect, best chain, retals)
    def table(rows):
        h = ('<div style="overflow-x:auto"><table class="srt"><tr><th>Member</th><th>Position</th><th>Days</th><th>War hits</th><th>Wars hit</th>'
             "<th>Hits / war</th><th>War respect</th><th>Best war</th><th>Assists</th>"
             "<th>Chain hits</th><th>Chain respect</th><th>Best chain</th><th>Retals</th><th>Crimes</th><th>Payouts</th></tr>")
        for m in rows:
            t = m["t"]
            w_, c_ = WAR_AGG.get(str(m["id"]), {}), CHAIN_AGG.get(str(m["id"]), {})
            n0 = lambda v, f=fmt_int: (f(v) if v else "-")
            h += (f'<tr data-id="{m["id"]}"><td><a href="member.html?id={m["id"]}" style="color:#e8be5a">{_html.escape(m["name"])}</a></td>'
                  f'<td data-v="{position_rank(m.get("position"))}">{_html.escape(str(m.get("position") or ""))}</td>'
                  f'<td data-v="{m.get("days") or 0}">{m.get("days") or ""}</td>'
                  f'<td data-v="{t["war_hits"]}">{t["war_hits"]:,}</td><td data-v="{t["wars"] - t["wars_zero"]}">{t["wars"] - t["wars_zero"]}/{t["wars"]}</td>'
                  f'<td data-v="{w_.get("per") or 0}">{n0(w_.get("per"), lambda v: f"{v:,.1f}")}</td>'
                  f'<td data-v="{round(w_.get("resp") or 0)}">{n0(w_.get("resp"), lambda v: f"{v:,.0f}")}</td>'
                  f'<td data-v="{w_.get("best") or 0}">{n0(w_.get("best"))}</td><td data-v="{w_.get("assists") or 0}">{n0(w_.get("assists"))}</td>'
                  f'<td data-v="{t["chain_hits"]}">{t["chain_hits"]:,}</td>'
                  f'<td data-v="{round(c_.get("resp") or 0)}">{n0(c_.get("resp"), lambda v: f"{v:,.0f}")}</td>'
                  f'<td data-v="{c_.get("best") or 0}">{n0(c_.get("best"))}</td><td data-v="{c_.get("rets") or 0}">{n0(c_.get("rets"))}</td>'
                  f'<td data-v="{t["crimes_ok"]}">{t["crimes_ok"]}/{t["crimes"]}</td>'
                  f'<td data-v="{t["paid"]}">${t["paid"]:,}</td></tr>')
        return h + "</table></div>"
    cur = [m for m in ms if m["current"]]
    past = [m for m in ms if not m["current"] and (m["t"]["war_hits"] or m["t"]["chain_hits"] or m["t"]["crimes"])]
    # leaders only: a Reliability column, filled from the leaders' db/private.json (members never get the file)
    rel_js = ""
    if gate_cfg() and leader_dir():
        rel_js = ("<script>" + REL_GRADE_JS + "(function(){fetch('whoami.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;})"
                  ".then(function(w){if(!w||!w.leader)return;return fetch(" + json.dumps(leader_base() + "/db/private.json")
                  + ",{cache:'no-store'}).then(function(r){return r.json();}).then(function(P){"
                  "document.querySelectorAll('table.srt').forEach(function(t){var hd=t.rows[0];var th=document.createElement('th');"
                  "th.textContent='Reliability';th.title='Tap to sort';hd.insertBefore(th,hd.cells[2]);"
                  "for(var k=1;k<t.rows.length;k++){var tr=t.rows[k],e=(P.members||{})[tr.dataset.id],sc=e?e.reliability.score:null;"
                  "var td=document.createElement('td');td.dataset.v=sc==null?-1:sc;"
                  "var g=sc==null?null:relG(sc);"
                  "td.innerHTML=sc==null?'-':'<b style=\"color:'+g[1]+'\">'+g[0]+'</b> <span style=\"color:#9a9a9c\">'+sc+'</span>';"
                  "tr.insertBefore(td,tr.cells[2]);}});});}).catch(function(){});})();</script>")
    body = (site_menu("") + f"<h2>👥 Current members ({len(cur)})</h2>" + table(cur)
            + f'<details style="margin-top:20px"><summary style="color:#e8be5a;cursor:pointer">Past members ({len(past)})</summary>'
            + table(sorted(past, key=lambda m: -m["t"]["war_hits"])) + "</details>" + SORT_JS + rel_js)
    _hub_page(mout / "members.html", "Members", "Tap a name for their profile · tap a column to sort", body,
              fresh=["members", "wars", "chains", "crimes"])


# PROFILE LAYOUTS: which sections profiles show and in what order (tools/member_profile.html <section data-sec>).
#   a member's own:  kept ONLY in their browser (localStorage hb_profile_layout, set on profile-editor.html) and
#                    used for every profile THEY open - nothing is saved on the site, nobody else sees it
#   the default:     config.json "profile_layout" {order, hidden} - leaders' profile-default.html - for everyone
#                    without their own. Published as the members' db/profile_layouts.json {"default"}.
PROFILE_SECTIONS = [("cmp", "📈 Compared with the faction average", "Their whole time in the faction vs everyone"),
                    ("reliability", "🛡️ Reliability breakdown", "Private - only the member and leaders see it"),
                    ("armory", "🗄️ Armory usage", "Private - only the member and leaders see it"),
                    ("stats", "💪 Battle and work stats", "Opt-in - only when the member shares them"),
                    ("totals", "📊 Totals", "Wars, chains, crimes, payouts"),
                    ("charts", "📉 War and chain charts", "Hits per war, chain hits over time"),
                    ("gym", "🏋️ Gym", "Gym energy and month by month"),
                    ("payouts", "💰 War payouts", "Every war payout"),
                    ("wars", "⚔️ Wars", "Every ranked war they were in"),
                    ("chains", "⛓️ Recent chains", "Their last 25 chains"),
                    ("crimes", "🕵️ Organized crimes", "Their organized crimes")]


def _clean_layout(x) -> dict:
    keys = [k for k, _l, _d in PROFILE_SECTIONS]
    if not isinstance(x, dict):
        return None
    order = [k for k in x.get("order") or [] if k in keys]
    return {"order": order + [k for k in keys if k not in order],
            "hidden": [k for k in x.get("hidden") or [] if k in keys]}


def write_profile_layouts(out: Path, cfg: dict):
    """db/profile_layouts.json (members: the leaders' default) + the two layout editors: profile-editor.html
    (members - their own, this browser only) and profile-default.html (leaders - the default)."""
    ly = {"default": _clean_layout(cfg.get("profile_layout"))}
    mout = member_out(out)
    _jdump(mout / "db" / "profile_layouts.json", ly)
    g_ = gate_cfg()
    if not g_:
        return
    tpl = (ROOT / "tools" / "profile_layout_editor.html").read_text(encoding="utf-8")
    base = {"sections": PROFILE_SECTIONS, "gate": g_["url"].rstrip("/"), "ghproxy": gh_proxy_url(),
            "member_base": member_base(), "layouts": ly}
    put = lambda path, mode, menu: path.write_text(
        tpl.replace("__CONFIG__", json.dumps(dict(base, mode=mode)).replace("</", "<\\/")).replace("__MENU__", menu), encoding="utf-8")
    put(mout / "profile-editor.html", "member", site_menu(""))
    if leader_dir():
        put(out / leader_dir() / "profile-default.html", "default", leader_menu("") + tab_bar(SETTINGS_TABS, "profile-default.html"))


def write_panel_preview_kit(out: Path, summary: dict):
    """Leaders' folder preview/ - everything the Site Panels page needs to draw the description banner and
    the announcement IN THE BROWSER (Pyodide = Python + Pillow in the page): this generate.py, the frame art,
    icons, fonts and this update's faction data (summary.json). manifest.json lists the files to load."""
    import shutil
    if not leader_dir():
        return
    pv = out / leader_dir() / "preview"
    files = []
    def put(src: Path, rel: str):
        dst = pv / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        files.append(rel)
    put(ROOT / "generate.py", "generate.py")
    put(ROOT / "config.json", "config.json")
    for f in sorted(PIECES.glob("*.png")):
        put(f, f"art/{PIECES.name}/{f.name}")
    for f in sorted(ICON_DIR.glob("*.png")):
        put(f, f"art/icons/{f.name}")
    for f in sorted(FONT_DIR.glob("*.ttf")):
        put(f, f"fonts/{f.name}")
    _jdump(pv / "summary.json", summary)
    _jdump(pv / "manifest.json", {"files": files, "member_dir": os.environ.get("MEMBER_DIR", "").strip().strip("/"),
                                  "built": summary.get("generated_at")})


def write_legacy_images(out: Path):
    """Gatekeeper on: the old member folder (raw MEMBER_DIR) keeps ONLY copies of the images, so pictures in
    newsletters / announcements pasted before the switch still show. No pages or data go there."""
    import shutil
    raw_ = os.environ.get("MEMBER_DIR", "").strip().strip("/")
    if not (raw_ and gate_cfg()):
        return
    src, dst = member_out(out), out / raw_
    n = 0
    for f in src.rglob("*"):
        if f.is_file() and f.suffix.lower() in (".png", ".webp", ".jpg", ".gif"):
            t = dst / f.relative_to(src)
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, t)
            n += 1
    print(f"Gatekeeper: {n} images also kept at the old address (for older newsletters)")


_PANEL_HTML = {}          # "A" = the announcement's paste-ready HTML from this run (write_announcements)


def write_description_page(out: Path):
    """description.html - the faction description banner + its markup."""
    markup = description_snippet()
    image_page(out / "description.html", "Faction Description Banner", "banner-animated.webp", markup, menu=False)


def announcement_snippet(acfg: dict, names: list, base_url: str) -> str:
    """The announcement's paste-ready HTML: the navigation buttons on top, then each section image (linking
    to its own page). Buttons: one centred paragraph, NO whitespace between
    the <a> tags (a space made the pair too wide and wrapped it), no target attr, torn.com links made
    site-relative (as Torn's editor stores them). Also used by the leaders' Site Panels page."""
    import html as _html
    bw = int(acfg.get("button_width", 240))
    per_row = int(acfg.get("buttons_per_row", 2))
    buttons = acfg.get("buttons", [])
    btn_html = []                     # (buttons now come first - no gap line above them)
    for i, b in enumerate(buttons, 1):
        url = b.get("url", "#").replace("{member_base}", base_url)   # e.g. the Recaps button
        for pre in ("https://www.torn.com", "https://torn.com"):
            if url.startswith(pre + "/"):
                url = url[len(pre):]
        label = _html.escape(b.get("label", ""))
        btn_html.append(f'<a href="{_html.escape(url, quote=True)}"><img src="{base_url}/btn-{i}.webp" '
                        f'alt="{label}" width="{bw}"></a>')
        if i % per_row == 0 and i < len(buttons):
            btn_html.append("<br>")
    pg = lambda n: n.rsplit(".", 1)[0] + ".html"
    img_p = lambda n: (f'<p style="text-align:center;"><a href="{base_url}/{pg(n)}">'
                       f'<img src="{base_url}/{n}" alt="{n}"></a></p>')
    btn_p = '<p style="text-align:center;">' + "".join(btn_html) + "</p>"
    parts = ["<p>&nbsp;</p>", btn_p]   # navigation buttons ABOVE the main announcement image
    for n in names:
        parts.append(img_p(n))
    parts.append("<p>&nbsp;</p>")
    return "\n".join(parts)


def announcement_slugs(acfg: dict, summary: dict) -> list:
    """Which section images the announcement is made of (same rules as render_announcement_header)."""
    lcfg = acfg.get("leaderboard", {})
    sl = ["header"]
    if acfg.get("show_ranked_wars", True) and summary.get("wars_announce") is not None:
        sl.append("wars")
    if lcfg.get("enabled", True) and summary.get("leaderboard"):
        sl.append("war")
        if summary.get("chain_leaderboard"):
            sl.append("chain")
        if summary.get("gym_leaderboard") and lcfg.get("gym", True):
            sl.append("gym")
    if acfg.get("slacker_watch", {}).get("enabled", True) and summary.get("slacker_watch"):
        sl.append("slackers")
    return sl


def description_snippet() -> str:
    """The faction description's paste-ready HTML (the banner, linking to the faction profile)."""
    base_url = public_base()             # gatekeeper address when it's on (hides where the files are)
    return (f'<p style="text-align:center;"><a href="{FACTION_URL}"><img src="{base_url}/banner-animated.webp" '
            f'alt="Heart Breakers"></a></p>')


LEADERBOARD_KINDS = ("war", "chain", "gym")


def leaderboard_order(lcfg: dict) -> list:
    """announcements.leaderboard.order - e.g. ["gym", "war", "chain"]; anything left out follows in the default order."""
    want = [k for k in (lcfg.get("order") or []) if k in LEADERBOARD_KINDS]
    return list(dict.fromkeys(want + list(LEADERBOARD_KINDS)))


def write_announcements(cfg: dict, summary: dict, out: Path):
    acfg = cfg.get("announcements", {})
    if not acfg.get("enabled", True):
        return
    out = member_out(out)                 # member-only: inside the secret folder
    import html as _html
    imgs = render_announcement_header(acfg, summary)
    names = []
    for slug, im in imgs:
        # WebP can't exceed 16,383 px - shrink a section just enough if it ever does
        if im.height > 16383:
            k = 16383 / im.height
            im = im.resize((int(im.width * k), 16383), Image.LANCZOS)
        name = f"announce-{slug}.webp"
        im.save(out / name, format="WEBP", quality=90, method=6)
        names.append(name)
        print(f"Announcement image {name}: {im.width}x{im.height}")
    base_url = member_base()
    # Buttons: one centred paragraph, explicit `per_row` per row (<br> after
    # each row), each button_width px wide. Matches the layout the user
    # hand-fixed in Torn's editor: NO whitespace / &nbsp; between the <a>
    # tags (a space made the pair too wide and wrapped it), no target attr,
    # torn.com links made site-relative (as Torn's editor stores them).
    buttons = acfg.get("buttons", [])
    for i, b in enumerate(buttons, 1):
        render_button(b.get("label", ""), b.get("icon", "gi-checked-shield")).save(
            out / f"btn-{i}.webp", format="WEBP", quality=92, method=6)
    pg = lambda n: n.rsplit(".", 1)[0] + ".html"
    img_p = lambda n: (f'<p style="text-align:center;"><a href="{base_url}/{pg(n)}">'
                       f'<img src="{base_url}/{n}" alt="{n}"></a></p>')
    titles = {"header": "Announcements", "wars": "Recent Ranked Wars", "war": "War Leaderboards",
              "chain": "Chain Leaderboards", "gym": "Gym Leaderboards", "slackers": "Slacker Watch"}
    for n in names:
        image_page(out / pg(n), titles.get(n[len("announce-"):].rsplit(".", 1)[0], n), n, img_p(n))
    snippet = announcement_snippet(acfg, names, base_url)
    _PANEL_HTML["A"] = snippet          # shown on the leaders' Announcements page (write_message_builder)
    # (no members' announcements.html any more - the HTML lives on the leaders' Announcements page)
    return
    page = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Announcement HTML</title>
<style>body{{background:#111;color:#ddd;font:15px system-ui,sans-serif;margin:16px;max-width:720px}}
textarea{{width:100%;height:200px;background:#1b1b1b;color:#eee;border:1px solid #333;font:12px monospace}}
button{{background:#b3261e;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-weight:600}}
.p img{{max-width:100%}}</style></head><body>{site_menu("")}
<h3>Faction announcement HTML</h3>
<p>Paste this into the faction announcement. Re-copy only if you add, remove or reorder buttons
(text and images update on their own).</p>
<textarea id="s" readonly>{_html.escape(snippet)}</textarea>
<p><button onclick="navigator.clipboard.writeText(document.getElementById('s').value).then(()=>this.textContent='Copied')">Copy</button></p>
<h3>Preview</h3><div class="p">{snippet}</div></body></html>"""
    (out / "announcements.html").write_text(page, encoding="utf-8")


# ==========================================================================
# 3d. DISCORD: Slacker Watch report after each completed ranked war
# ==========================================================================
# When a ranked war appears in the saved war history for the first time
# (i.e. it has finished and its report has been read), one message is posted
# to the webhook in the DISCORD_WEBHOOK_SLACKERS secret:
#   embed 1  war summary (result, opponent, score, date, duration, rank
#            change, participation)
#   embeds   REVIEW / WARNING / WATCH lists (coloured), as of after that war
#   image    the same three tiers as a picture, in the banner's style
# Posted war ids are saved in data/discord_state.json so a war is never
# posted twice. On the very first run only the most recent war is posted
# (as a test); older wars are marked done without posting.
# The webhook URL is never printed or logged.
DISCORD_STATE_PATH = ROOT / "data" / "discord_state.json"
DISCORD_CHAIN_STATE_PATH = ROOT / "data" / "discord_chain_state.json"


# Every Discord post's message id is kept here so ANY post can be edited later (webhooks can only
# edit messages whose id is known - Discord has no way to list a webhook's old messages).
#   data/discord_messages.json  {"<kind>:<key>": {"id", "hook": env var name, "at": unix time}}
#   kinds: chain:<chain id>, war:<war id>, payout:<war id>, recap:<YYYY-MM>, recap-previews:<YYYY-MM>,
#          crime:<crime id>:<time>, leader:<time>, links:pages
# config discord_adopt {"chain:12345": "<message id>"} adds an older post (id copied in Discord with
# Developer Mode) so it can be edited too. config discord_refresh {"chain": n, "war": n}: bump n to
# re-draw every saved post of that kind and edit it in place.
DISCORD_MSG_PATH = ROOT / "data" / "discord_messages.json"


# the 15-minute crimes workflow saves into its own file, so it never clashes with the main run's commits
DISCORD_MSG_CRIMES_PATH = ROOT / "data" / "discord_messages_crimes.json"


def _msg_path() -> Path:
    return DISCORD_MSG_CRIMES_PATH if os.environ.get("RUN_KIND") == "crimes" else DISCORD_MSG_PATH


def discord_msgs() -> dict:
    reg = {}
    for path in (DISCORD_MSG_CRIMES_PATH, DISCORD_MSG_PATH):
        try:
            reg.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    for k, mid in (load_config().get("discord_adopt") or {}).items():
        if not k.startswith("_") and mid and (k not in reg or reg[k].get("id") != str(mid)):
            reg[k] = {"id": str(mid), "hook": DISCORD_HOOKS.get(k.split(":")[0], ""), "at": 0, "adopted": True}
    return reg


DISCORD_HOOKS = {"chain": "DISCORD_WEBHOOK_CHAINS", "war": "DISCORD_WEBHOOK_SLACKERS", "payout": "DISCORD_WEBHOOK_PAYOUTS",
                 "recap": "DISCORD_WEBHOOK_RECAP", "recap-previews": "DISCORD_WEBHOOK_RECAP",
                 "crime": "DISCORD_WEBHOOK_CRIMES", "leader": "DISCORD_WEBHOOK_LEADERS", "links": "DISCORD_WEBHOOK_LEADERS"}


def discord_msg_save(key: str, mid, drop: bool = False):
    """Remember (or forget, drop=True) the message id for a post."""
    import time
    path = _msg_path()
    try:
        reg = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        reg = {}
    if drop:
        reg.pop(key, None)
    elif mid:
        reg[key] = {"id": str(mid), "hook": DISCORD_HOOKS.get(key.split(":")[0], ""), "at": int(time.time())}
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(reg, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def discord_refresh_due(kind: str) -> bool:
    """config discord_refresh[kind] bumped since the last refresh of that kind?"""
    want = str((load_config().get("discord_refresh") or {}).get(kind, 0))
    return want != "0" and discord_msgs().get(f"_refresh:{kind}", {}).get("id") != want


def discord_refresh_done(kind: str):
    want = str((load_config().get("discord_refresh") or {}).get(kind, 0))
    discord_msg_save(f"_refresh:{kind}", want)


def _discord_request(url: str, method: str, payload: dict = None, png=None):
    """POST/PATCH (multipart with the image) or DELETE a webhook message.
    Returns the parsed JSON reply (POST uses ?wait=true so Discord returns
    the new message, whose id is saved for the next replace)."""
    import uuid
    headers = {"User-Agent": "FactionBanner/1.0 (GitHub Actions)"}
    body = None
    if payload is not None:
        b = uuid.uuid4().hex
        parts = [f"--{b}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
                 f"Content-Type: application/json\r\n\r\n".encode(), json.dumps(payload).encode(), b"\r\n"]
        if png:
            # one image (bytes) or several: [(filename, bytes), ...] -> files[0..n]
            files_ = png if isinstance(png, list) else [
                ((payload.get("attachments") or [{}])[0].get("filename") or "report.png", png)]
            for k, (fname, data) in enumerate(files_):
                parts += [f"--{b}\r\nContent-Disposition: form-data; name=\"files[{k}]\"; "
                          f"filename=\"{fname}\"\r\nContent-Type: image/png\r\n\r\n".encode(), data, b"\r\n"]
        parts.append(f"--{b}--\r\n".encode())
        body = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={b}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def slacker_image(scfg: dict, summary: dict, war: dict = None) -> bytes:
    import io
    layer_img = draw_slacker_watch(scfg, summary)
    if war:                     # war result card above the tiers
        top = war_summary_card(war)
        both = Image.new("RGBA", (layer_img.width, top.height + layer_img.height - PAD_TOP), (0, 0, 0, 0))
        both.alpha_composite(top, (0, 0))
        both.alpha_composite(layer_img.crop((0, PAD_TOP, layer_img.width, layer_img.height)), (0, top.height))
        layer_img = both
    return frame_png(layer_img, bar="War Report")   # same faction frame as everything else (was "Slacker Watch")


def _war_embed(w: dict, faction_name: str) -> dict:
    # (Unused since reports went image-only - kept in case text is wanted again.)
    """War summary as a tidy embed: score + key facts as inline fields, then
    numbered Top Hits / Most Respect side by side."""
    fields = []
    def f(name, value, inline=True):
        fields.append({"name": name, "value": value or "-", "inline": inline})
    f("Score", f"**{fmt_int(w['our_score'])}** - {fmt_int(w['their_score'])}")
    if w.get("start") and w.get("end") and w["end"] > w["start"]:
        secs = w["end"] - w["start"]
        dd, hh, mm = secs // 86400, secs % 86400 // 3600, secs % 3600 // 60
        f("Duration", f"{dd}d {hh}h" if dd else f"{hh}h {mm}m")
    if w.get("rank_before") and w.get("rank_after"):
        f("Rank", f"{w['rank_before']} » {w['rank_after']}" if w["rank_before"] != w["rank_after"]
          else f"{w['rank_after']} (no change)")
    if w.get("present"):
        f("Participation", f"{w['hit']}/{w['present']} ({round(100 * w['hit'] / w['present'])}%)")
    medals = ["🥇", "🥈", "🥉"]
    if w.get("top_hits"):
        f("Top Hits", "\n".join(f"{medals[i]} {m['name']} - **{m['attacks']}**"
                                for i, m in enumerate(w["top_hits"][:3])))
    if w.get("most_respect"):
        f("Most Respect", "\n".join(f"{medals[i]} {m['name']} - **{fmt_int(round(m['score']))}**"
                                    for i, m in enumerate(w["most_respect"][:3])))
    when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y") if w.get("end") else ""
    return {"title": f"{'🏆 VICTORY' if w['won'] else '💀 DEFEAT'} vs {w['opponent']}",
            "description": f"Ranked war ended {when}",
            "color": 0xE4382E if w["won"] else 0x828282, "fields": fields,
            "footer": {"text": f"{faction_name} · Ranked war report"}}


def _tier_block(entries: list) -> str:
    """Aligned monospace list (reads as a table on desktop and mobile):
        Krunka            missed 5/5
        Colorau           missed 3/5 · token 2/5"""
    if not entries:
        return "None"
    short = lambda r: r
    w = min(18, max(len(e["name"]) for e in entries) + 2)
    lines = [f"{e['name'][:w - 1]:<{w}}{' · '.join(short(r) for r in e['reasons'])}" for e in entries]
    text = "```\n" + "\n".join(lines) + "\n```"
    if len(text) > 4000:
        text = text[:3990] + "\n...\n```"
    return text


def _dur(start, end):
    if not start or not end or end <= start:
        return ""
    secs = end - start
    dd, hh, mm = secs // 86400, secs % 86400 // 3600, secs % 3600 // 60
    return f"{dd}d {hh}h" if dd else f"{hh}h {mm}m"


def summary_card(title: str, colour, sub: str, tiles: list, lists: list) -> Image.Image:
    """One summary card (layer image, full width): title, date line, a row of
    stat tiles [(label, value)], then two ranked lists side by side
    [(heading, [(name, value_text)]), ...]."""
    f_name, f_rule = font("SemiBold", 24), font("Medium", 21)
    row_h, pad = 36, LB_CARD_PAD
    ix, iw = CX0 + pad, CW - 2 * pad
    n_top = max([len(rows) for _, rows in lists] + [1])
    ch = LB_HEAD_H + 40 + 92 + 20 + 44 + n_top * row_h + 2 * pad
    img, d = layer(PAD_TOP + ch + LB_ROW_GAP)
    y = PAD_TOP
    d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
    ty = y + pad
    draw_text(d, (ix + iw / 2, ty + 26), title, fit_font(title, "Bold", 26, iw - 40, 16), colour,
              track=2, anchor="ms")
    d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
    ty += LB_HEAD_H + 6
    draw_text(d, (ix + iw / 2, ty + 18), sub, f_rule, (150, 150, 152), anchor="ms")
    ty += 40
    tw = iw / max(len(tiles), 1)
    for k, (lab, val) in enumerate(tiles):
        cx = ix + tw * k + tw / 2
        d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + 84], radius=8,
                            fill=(24, 12, 13, 255), outline=RULE, width=2)
        draw_text(d, (cx, ty + 44), val, fit_font(val, "Bold", 34, tw - 24, 18), TEXT, anchor="ms")
        draw_text(d, (cx, ty + 72), lab.upper(), fit_font(lab.upper(), "SemiBold", 18, tw - 20, 12),
                  SUB, track=1, anchor="ms")
    ty += 92 + 20
    half = (iw - 30) / 2
    for col, (lab, rows) in enumerate(lists[:2]):
        x = ix + col * (half + 30)
        draw_text(d, (x + half / 2, ty + 26), lab.upper(), font("Bold", 22), TITLE, track=2, anchor="ms")
        d.line([(x + 4, ty + 36), (x + half - 4, ty + 36)], fill=RULE, width=2)
        for k, (n, val) in enumerate(rows):
            base = ty + 44 + k * row_h + 24
            draw_text(d, (x + 4, base), f"{k + 1}.", f_name, RED)
            draw_text(d, (x + 40, base), n, fit_font(n, "SemiBold", 24, half - 160, 14), TEXT)
            draw_text(d, (x + half - 4 - f_name.getlength(val), base), val, f_name, TEXT)
    return img


def involved_card(title: str, colour, sub: str, tiles: list, people: list, cols: int = 3,
                  heads: tuple = ("Hits", "Resp")) -> Image.Image:
    """Summary card listing EVERYONE involved (hub "Latest War" / "Latest Chain"): title, date line,
    stat tiles, then every member in `cols` columns - rank, name, two values (e.g. hits · respect),
    most hits first. Wide rather than tall so it stays readable in Discord.
    people = [(name, value1_text, value2_text)]"""
    f_name, f_rule, f_v = font("SemiBold", 21), font("Medium", 21), font("Bold", 20)
    row_h, pad = 32, LB_CARD_PAD
    ix, iw = CX0 + pad, CW - 2 * pad
    per = max(1, -(-len(people) // cols))           # rows per column (ceil)
    ch = LB_HEAD_H + 40 + 92 + 20 + 44 + per * row_h + 2 * pad
    img, d = layer(PAD_TOP + ch + LB_ROW_GAP)
    y = PAD_TOP
    d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
    ty = y + pad
    draw_text(d, (ix + iw / 2, ty + 26), title, fit_font(title, "Bold", 26, iw - 40, 16), colour, track=2, anchor="ms")
    d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
    ty += LB_HEAD_H + 6
    draw_text(d, (ix + iw / 2, ty + 18), sub, f_rule, (150, 150, 152), anchor="ms")
    ty += 40
    tw = iw / max(len(tiles), 1)
    for k, (lab, val) in enumerate(tiles):
        cx = ix + tw * k + tw / 2
        d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + 84], radius=8,
                            fill=(24, 12, 13, 255), outline=RULE, width=2)
        draw_text(d, (cx, ty + 44), val, fit_font(val, "Bold", 34, tw - 24, 18), TEXT, anchor="ms")
        draw_text(d, (cx, ty + 72), lab.upper(), fit_font(lab.upper(), "SemiBold", 18, tw - 20, 12), SUB, track=1, anchor="ms")
    ty += 92 + 20
    gap = 24
    cw = (iw - gap * (cols - 1)) / cols
    v2w, v1w = 76, 58                                  # value columns (right-aligned)
    for c in range(cols):
        x = ix + c * (cw + gap)
        draw_text(d, (x + 4, ty + 26), "MEMBER", font("Bold", 16), TITLE, track=1, shadow=False)
        for lab, rx in ((heads[0], x + cw - v2w - 8), (heads[1], x + cw - 4)):
            t = lab.upper()
            draw_text(d, (rx - tracked_len(t, font("Bold", 16), 1), ty + 26), t, font("Bold", 16), TITLE, track=1, shadow=False)
        d.line([(x + 4, ty + 36), (x + cw - 4, ty + 36)], fill=RULE, width=2)
        for k, (n, v1, v2) in enumerate(people[c * per:(c + 1) * per]):
            rank = c * per + k + 1
            base = ty + 44 + k * row_h + 22
            if k % 2 == 0:
                d.rectangle([x, base - 22, x + cw, base + 8], fill=(255, 255, 255, 8))
            draw_text(d, (x + 4, base), f"{rank}.", font("Medium", 18), SUB, shadow=False)
            draw_text(d, (x + 40, base), n, fit_font(n, "SemiBold", 21, cw - 40 - v1w - v2w - 16, 12),
                      (245, 225, 170) if rank == 1 else TEXT, shadow=False)
            draw_text(d, (x + cw - v2w - 8 - f_v.getlength(v1), base), v1, f_v, TEXT, shadow=False)
            draw_text(d, (x + cw - 4 - f_name.getlength(v2), base), v2, f_name, SUB, shadow=False)
    return img


def war_summary_card(w: dict) -> Image.Image:
    """Ranked war result at the top of the Slacker Watch image."""
    tiles = [("Score", f"{fmt_int(w['our_score'])} - {fmt_int(w['their_score'])}")]
    if _dur(w.get("start"), w.get("end")):
        tiles.append(("Duration", _dur(w.get("start"), w.get("end"))))
    if w.get("rank_before") and w.get("rank_after"):
        tiles.append(("Rank", f"{w['rank_before']} > {w['rank_after']}" if w["rank_before"] != w["rank_after"]
                      else f"{w['rank_after']}"))
    if w.get("present"):
        tiles.append(("Participation", f"{w['hit']}/{w['present']} ({round(100 * w['hit'] / w['present'])}%)"))
    when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y") if w.get("end") else ""
    sub = ((datetime.fromtimestamp(w["start"], timezone.utc).strftime("%b %d") + " - ")
           if w.get("start") else "Ended ") + when
    title = f"{'VICTORY' if w['won'] else 'DEFEAT'} VS {str(w['opponent']).upper()}"
    return summary_card(title, RED if w["won"] else (170, 170, 172), sub, tiles,
                        [("Top Hits", [(m["name"], fmt_int(m["attacks"])) for m in w.get("top_hits", [])[:5]]),
                         ("Most Respect", [(m["name"], fmt_int(round(m["score"])))
                                           for m in w.get("most_respect", [])[:5]])])


def chain_report_image(r: dict, ccfg: dict) -> bytes:
    """Chain Report picture (Discord): summary card, then Didn't Participate,
    and for large chains Repeat Offenders + Low Hits."""
    import io
    PURPLE = (200, 120, 230)
    f_name, f_why, f_rule = font("SemiBold", 24), font("Medium", 20), font("Medium", 21)
    row_h, pad = 36, LB_CARD_PAD
    ix, iw = CX0 + pad, CW - 2 * pad

    def card_h(n_rows, rule=True):
        return LB_HEAD_H + (30 if rule else 6) + max(1, n_rows) * row_h + 2 * pad

    # --- summary card layout
    tiles = [("Hits", fmt_int(r["hits"])), ("Respect", fmt_int(round(r["respect"]))),
             ("Participation", f"{r['hit']}/{r['present']}"
              + (f" ({round(100 * r['hit'] / r['present'])}%)" if r["present"] else "")),
             ("Retaliations", fmt_int(r["rets"]))]
    if r.get("assists") is not None:
        tiles.append(("Assists", fmt_int(r["assists"])))
    if _dur(r.get("start"), r["end"]):
        tiles.insert(0, ("Duration", _dur(r.get("start"), r["end"])))
    rows = r["rows"]
    show_ast = any(x.get("assists") is not None for x in rows)
    n_half = max(1, (len(rows) + 1) // 2)           # two side-by-side tables
    tbl_row = 32
    bonus_rows = (len(r["bonuses"]) + 2) // 3
    sum_h = (LB_HEAD_H + 40 + 92 + 20 + 44 + 30 + n_half * tbl_row
             + (44 + bonus_rows * row_h if r["bonuses"] else 0) + 2 * pad)

    blocks = [("summary", sum_h)]
    cols4 = 4
    if r["large"]:
        blocks.append(("missed", card_h((len(r["missed"]) + cols4 - 1) // cols4)))
        blocks.append(("repeat", card_h(len(r["repeat"]))))      # one per row (long lines)
        blocks.append(("low", card_h((len(r["low"]) + cols4 - 1) // cols4)))
    h = PAD_TOP + sum(b[1] + LB_ROW_GAP for b in blocks) + PAD_BOT - 10
    img, d = layer(h)
    y = PAD_TOP

    def head(y, title, colour, rule=None):
        d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
        ty = y + pad
        draw_text(d, (ix + iw / 2, ty + 26), title, font("Bold", 26), colour, track=2, anchor="ms")
        d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
        if rule:
            draw_text(d, (ix + iw / 2, ty + LB_HEAD_H + 16), rule, f_rule, (140, 140, 142), anchor="ms")
            return ty + LB_HEAD_H + 30
        return ty + LB_HEAD_H + 6

    def grid(ty, items, colour, cols):
        if not items:
            draw_text(d, (ix + iw / 2, ty + 24), ccfg.get("none_text", "None"), f_name, SUB, anchor="ms")
            return
        cw = (iw - 30 * (cols - 1)) / cols
        for k, it in enumerate(items):
            rr, cc = divmod(k, cols)
            x, base = ix + cc * (cw + 30), ty + rr * row_h + 24
            name, why = it if isinstance(it, tuple) else (it, "")
            ww = f_why.getlength(why) if why else 0
            draw_text(d, (x + 4, base), name, fit_font(name, "SemiBold", 24, cw - ww - 16, 14), TEXT)
            if why:
                draw_text(d, (x + cw - 4 - ww, base), why, f_why, colour)

    for key, ch in blocks:
        if key == "summary":
            when = datetime.fromtimestamp(r["end"], timezone.utc)
            title = f"CHAIN {fmt_int(r['length'])}"
            ty = head(y, title, RED)
            sub = (datetime.fromtimestamp(r["start"], timezone.utc).strftime("%b %d") + " - "
                   if r.get("start") else "Ended ") + when.strftime("%b %d, %Y")
            draw_text(d, (ix + iw / 2, ty + 18), sub, f_rule, (150, 150, 152), anchor="ms")
            ty += 40
            tw = iw / len(tiles)
            for k, (lab, val) in enumerate(tiles):
                cx = ix + tw * k + tw / 2
                d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + 84], radius=8,
                                    fill=(24, 12, 13, 255), outline=RULE, width=2)
                draw_text(d, (cx, ty + 44), val, fit_font(val, "Bold", 34, tw - 24, 18), TEXT, anchor="ms")
                draw_text(d, (cx, ty + 72), lab.upper(), font("SemiBold", 18), SUB, track=1, anchor="ms")
            ty += 92 + 20
            # full summary table in two halves: # Name Hits Respect Avg Rets (Assists),
            # sorted by successful attacks (hits)
            draw_text(d, (ix + iw / 2, ty + 26), ccfg.get("table_title", "MEMBER SUMMARY"),
                      font("Bold", 22), TITLE, track=2, anchor="ms")
            d.line([(ix + 4, ty + 36), (ix + iw - 4, ty + 36)], fill=RULE, width=2)
            ty += 44
            half = (iw - 30) / 2
            fr, fh = font("Medium", 21), font("SemiBold", 17)
            cols = [("HITS", 62), ("RESPECT", 92), ("AVG", 60), ("RETS", 54)] + ([("AST", 50)] if show_ast else [])
            for side in range(2):
                part = rows[side * n_half:(side + 1) * n_half]
                if not part:
                    continue
                x0 = ix + side * (half + 30)
                rights, xr = [], x0 + half - 6          # right edges of the number columns
                for lab, w in reversed(cols):
                    rights.insert(0, xr); xr -= w
                name_w = xr - (x0 + 44) - 8
                draw_text(d, (x0 + 44, ty + 20), "NAME", fh, SUB, track=1, shadow=False)
                for (lab, w), rx in zip(cols, rights):
                    draw_text(d, (rx - tracked_len(lab, fh, 1), ty + 20), lab, fh, SUB, track=1, shadow=False)
                for k, x in enumerate(part):
                    base = ty + 30 + k * tbl_row + 23
                    if k % 2 == 0:
                        d.rectangle([x0, base - 23, x0 + half, base + 9], fill=(255, 255, 255, 10))
                    rank = side * n_half + k + 1
                    draw_text(d, (x0 + 6, base), f"{rank}.", fr, RED if rank <= 3 else SUB, shadow=False)
                    draw_text(d, (x0 + 44, base), x["name"], fit_font(x["name"], "SemiBold", 22, name_w, 13),
                              TEXT, shadow=False)
                    vals = [fmt_int(x["hits"]), fmt_int(round(x["respect"])), f"{x['avg']:.1f}",
                            fmt_int(x["rets"])] + ([fmt_int(x["assists"] or 0)] if show_ast else [])
                    for v, rx in zip(vals, rights):
                        draw_text(d, (rx - fr.getlength(v), base), v, fr, TEXT, shadow=False)
            ty += 30 + n_half * tbl_row
            if r["bonuses"]:
                draw_text(d, (ix + iw / 2, ty + 26), "BONUS HITS", font("Bold", 22), TITLE, track=2, anchor="ms")
                d.line([(ix + 4, ty + 36), (ix + iw - 4, ty + 36)], fill=RULE, width=2)
                grid(ty + 44, [(n, fmt_int(b)) for b, n in r["bonuses"]], (232, 190, 90), 3)
        elif key == "missed":
            ty = head(y, f"DIDN'T PARTICIPATE  ({len(r['missed'])})", (235, 60, 50),
                      ccfg.get("missed_rule", "In the faction for this chain, no hits"))
            grid(ty, r["missed"], SUB, cols4)
        elif key == "repeat":
            vals = {"m": ccfg.get("repeat_missed", 2), "w": ccfg.get("repeat_window", 4)}
            ty = head(y, f"REPEAT OFFENDERS  ({len(r['repeat'])})", (232, 140, 60),
                      fill(ccfg.get("repeat_rule", "Missed this chain + {m} or more of the previous {w} large chains"
                                                   " (hits newest first)"), vals))
            grid(ty, [(e["name"], " · ".join(e["reasons"])) for e in r["repeat"]], (232, 140, 60), 1)
        elif key == "low":
            ty = head(y, f"LOW HITS  ({len(r['low'])})", (210, 190, 90),
                      fill(ccfg.get("low_rule", "Under {n} hits in this chain"), {"n": ccfg.get("low_hits", 5)}))
            grid(ty, [(n, f"{v} hit" + ("s" if v != 1 else "")) for n, v in r["low"]], (210, 190, 90), cols4)
        y += ch + LB_ROW_GAP
    return frame_png(img, bar="Chain Report")          # same faction frame as everything else


# --------------------------------------------------------------------------
# Chains channel: ONE hub post = Chain Leaderboard + Latest Chain + Chain Directory
# --------------------------------------------------------------------------
CHAIN_HUB_DIRECTORY = 15       # previous chains listed in the hub post
CHAIN_BACKFILL_PER_RUN = 20    # report pages made per run for recent chains (no API calls - drawn from saved history)


def compact_boards_png(sections: list, boards: list, bar: str, top: int = 5) -> bytes:
    """Compact, WIDE leaderboard image for Discord (a tall image shrinks to a sliver there).
    sections = [(heading, colour, board dict)]; boards = [(key, title)] - three boards side by side per
    section, top `top` rows each ({"name", "value"}) + the total strip (board["totals"][key])."""
    # a period with nothing in it yet (e.g. "this month" on the 1st) is left out - keep at least one section
    sections = [x for x in sections if x[2].get("wars", x[2].get("chains", 1))] or sections[-1:]
    row_h, gap, pad = 34, 14, LB_CARD_PAD
    card_h = pad + 44 + top * row_h + 8 + row_h + pad
    sec_h = 56 + card_h + 16
    img, d = layer(PAD_TOP + len(sections) * sec_h + PAD_BOT - 10)
    y = PAD_TOP
    n = len(boards)
    tw = (CW - (n - 1) * gap) / n
    f_val = font("Bold", 22)
    for label, col, cb in sections:
        y = _period_section(d, y, label, col)
        for k, (key, title) in enumerate(boards):
            x0 = CX0 + k * (tw + gap)
            d.rounded_rectangle([x0, y, x0 + tw, y + card_h], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
            draw_text(d, (x0 + tw / 2, y + pad + 24), title.upper(), font("Bold", 22), col, track=2, anchor="ms")
            d.line([(x0 + pad, y + pad + 36), (x0 + tw - pad, y + pad + 36)], fill=RULE, width=2)
            for m, r_ in enumerate((cb.get(key) or [])[:top]):
                base = y + pad + 44 + m * row_h + 24
                val = str(r_.get("value", ""))
                vw = f_val.getlength(val)
                draw_text(d, (x0 + pad + 4, base), f"{m + 1}.", font("Medium", 20), SUB, shadow=False)
                nm = str(r_.get("name", "?"))
                draw_text(d, (x0 + pad + 34, base), nm, fit_font(nm, "SemiBold", 22, tw - 2 * pad - 50 - vw, 13),
                          (245, 225, 170) if m == 0 else TEXT, shadow=False)
                draw_text(d, (x0 + tw - pad - 4 - vw, base), val, f_val, TEXT, shadow=False)
            tot = (cb.get("totals") or {}).get(key)
            if tot:
                tl, tv = (tot if isinstance(tot, (list, tuple)) else ("Total", tot))
                base = y + pad + 44 + top * row_h + 8 + 24
                d.rectangle([x0 + 6, base - 25, x0 + tw - 6, base + 9], fill=(232, 190, 90, 28))
                draw_text(d, (x0 + pad + 4, base), str(tl).upper(), font("Bold", 18), MONTH_COL, track=1, shadow=False)
                tvs = str(tv)
                draw_text(d, (x0 + tw - pad - 4 - f_val.getlength(tvs), base), tvs, f_val, MONTH_COL, shadow=False)
        y += card_h + 16
    return frame_png(img, bar=bar)


def chain_board_png(chist: dict, members: list, cfg: dict, top: int = 5) -> bytes:
    """Chain Leaderboard for the chains hub = the SAME Chain Leaderboards panel as the announcement (Nov 2026):
    this month + all time, Chain Hits | Chain Respect | Retaliations, every current member (draw_chain_leaderboard).
    Built from the saved chain history, so the hourly chain runs (no full summary) draw the same thing."""
    lcfg = cfg.get("announcements", {}).get("leaderboard", {})
    try:
        ach = json.loads((ROOT / "data" / "achievements.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ach = {}
    cl = chain_leaderboard(chist, members, ach, lcfg)
    clm = chain_leaderboard(chist, members, ach, lcfg, since=_month_start())
    return frame_png(draw_chain_leaderboard(lcfg, {"chain_leaderboard": cl, "chain_leaderboard_month": clm}, heading=False),
                     bar=lcfg.get("chain_group_title", "Chain Leaderboards"))


def chain_board_compact_png(chist: dict, members: list, cfg: dict, top: int = 5) -> bytes:
    """(Before Nov 2026 the hub showed this compact top-5 version - kept in case it's wanted again.)"""
    lcfg = cfg.get("announcements", {}).get("leaderboard", {})
    try:
        ach = json.loads((ROOT / "data" / "achievements.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ach = {}
    cl = chain_leaderboard(chist, members, ach, lcfg)
    clm = chain_leaderboard(chist, members, ach, lcfg, since=_month_start())
    return compact_boards_png(
        [(f"This Month - {_month_label()}  ({_plural(clm.get('chains', 0), 'chain')})", MONTH_COL, clm),
         (f"All Time  ({_plural(cl.get('chains', 0), 'chain')})", ALLTIME_COL, cl)],
        [("hits", lcfg.get("chain_hits_title", "Chain Hits")), ("respect", lcfg.get("chain_respect_title", "Chain Respect")),
         ("rets", lcfg.get("chain_rets_title", "Retaliations"))], "Chain Leaderboard", top)


def chain_card_png(r: dict) -> bytes:
    """Latest Chain card for the chains hub: length, date, respect / members / duration tiles and EVERY
    member who hit (hits · respect, most hits first). The full report is on its page."""
    when = datetime.fromtimestamp(r["end"], timezone.utc).strftime("%b %d, %Y")
    tiles = [("Hits", fmt_int(r["length"])), ("Respect", f"{r['respect']:,.0f}"), ("Members", str(r["attackers"]))]
    if r.get("start"):
        tiles.append(("Duration", _dur(r["start"], r["end"])))
    people = [(x["name"], fmt_int(x["hits"]), f"{x['respect']:,.0f}") for x in r.get("rows", [])]
    return frame_png(involved_card(f"{fmt_int(r['length'])} HIT CHAIN", RED, when, tiles, people), bar="Latest Chain")


def war_card_png(w0: dict, wh_: dict) -> bytes:
    """Latest War card for the war hub: result, dates, score / duration / rank / participation tiles and
    EVERY member who hit (war hits · respect, most hits first)."""
    tiles = [("Score", f"{fmt_int(w0['our_score'])} - {fmt_int(w0['their_score'])}")]
    if _dur(w0.get("start"), w0.get("end")):
        tiles.append(("Duration", _dur(w0.get("start"), w0.get("end"))))
    if w0.get("rank_before") and w0.get("rank_after"):
        tiles.append(("Rank", f"{w0['rank_before']} > {w0['rank_after']}" if w0["rank_before"] != w0["rank_after"]
                      else w0["rank_after"]))
    if w0.get("present"):
        tiles.append(("Participation", f"{w0['hit']}/{w0['present']} ({round(100 * w0['hit'] / w0['present'])}%)"))
    when = datetime.fromtimestamp(w0["end"], timezone.utc).strftime("%b %d, %Y") if w0.get("end") else ""
    sub = ((datetime.fromtimestamp(w0["start"], timezone.utc).strftime("%b %d") + " - ") if w0.get("start") else "") + when
    ms_ = sorted((m for m in wh_.get("members", []) if m.get("attacks", 0) > 0),
                 key=lambda m: (-m["attacks"], -m.get("score", 0)))
    people = [(m.get("name", "?"), fmt_int(m["attacks"]), fmt_int(round(m.get("score", 0)))) for m in ms_]
    title = f"{'VICTORY' if w0['won'] else 'DEFEAT'} VS {str(w0['opponent']).upper()}"
    return frame_png(involved_card(title, RED if w0["won"] else (170, 170, 172), sub, tiles, people), bar="Latest War")


def _chain_meta(cid: str, chist: dict, members: list, ccfg: dict, png: bytes = None) -> str:
    """Save a chain's report (image + facts) to data/reports; returns its slug."""
    r = chain_report(cid, chist, members, ccfg)
    return save_report("chain", cid, png or chain_report_image(r, ccfg),
                       {"title": f"Chain Report - {fmt_int(r['length'])} hits", "length": r["length"], "end": r["end"],
                        "start": r.get("start"), "dur": _dur(r.get("start"), r["end"]) if r.get("start") else "",
                        "respect": r["respect"], "attackers": r["attackers"]})


# per-member war / chain totals from the history pages, for the Members list (Nov 12 2026): {id: {...}}
WAR_AGG, CHAIN_AGG = {}, {}


def chain_history_page(out: Path, chist: dict, ccfg: dict):
    """chains.html (members) - every chain of min_length+ hits on record, newest first, with its report
    when one is saved."""
    import html as _html
    mout = member_out(out)
    min_len = int(ccfg.get("min_length", 50))
    chains = sorted(((k, c) for k, c in chist.get("chains", {}).items() if c.get("length", 0) >= min_len),
                    key=lambda kc: -kc[1]["end"])
    best = max((c["length"] for _k, c in chains), default=0)
    tot_hits = sum(c.get("length", 0) for _k, c in chains)
    tot_resp = sum(a.get("respect", 0) for _k, c in chains for a in c.get("attackers", []))
    # every member's chains, all time - EVERY chain on record (same counting as the all-time chain leaderboard)
    agg = {}
    for _k, c in chist.get("chains", {}).items():
        for a_ in c.get("attackers", []):
            a = agg.setdefault(str(a_["id"]), {"id": a_["id"], "name": a_.get("name", "?"), "chains": 0, "hits": 0,
                                               "resp": 0.0, "rets": 0, "best": 0})
            a["chains"] += 1; a["hits"] += a_.get("hits", 0); a["resp"] += a_.get("respect", 0)
            a["rets"] += a_.get("rets", 0) or 0; a["best"] = max(a["best"], a_.get("hits", 0))
            if c.get("length", 0) >= CHAIN_AVG_MIN:            # hits per chain: 250+ chains only
                a["big"] = a.get("big", 0) + 1; a["bigh"] = a.get("bigh", 0) + a_.get("hits", 0)
    for i, n in CURRENT_MEMBERS.items():
        agg.setdefault(i, {"id": int(i), "name": n, "chains": 0, "hits": 0, "resp": 0.0, "rets": 0, "best": 0})
    rows_ = []
    for i, a in agg.items():
        a["current"] = i in CURRENT_MEMBERS if CURRENT_MEMBERS else True
        a["name"] = CURRENT_MEMBERS.get(i, a["name"])
        a["per"] = round(a.get("bigh", 0) / a["big"], 1) if a.get("big") else None
        a["rph"] = round(a["resp"] / a["hits"], 2) if a["hits"] else None     # chain bonus respect included
        rows_.append(a)
    # MEMBERS LIST (Nov 12 2026): per-member chain totals go to members.html (see WAR_AGG)
    CHAIN_AGG.clear(); CHAIN_AGG.update({str(a["id"]): a for a in rows_})
    body = (site_menu("") + tab_bar(HISTORY_TABS, "chains.html") + "<h2>⛓️ Chain Summary</h2>" + HIST_STATS_CSS + _stat_strip([
                (fmt_int(len(chains)), f"Chains ({min_len}+)"), (fmt_int(best), "Longest"), (fmt_int(tot_hits), "Chain hits"),
                (f"{tot_resp:,.0f}", "Chain respect")])
            + f'<h2>All chains <span class="tag">(tap a column to sort)</span></h2>'
            '<table class="srt"><tr><th>Date</th><th>Hits</th><th>Respect</th><th>Members</th><th>Report</th></tr>')
    for k, c in chains:
        when = datetime.fromtimestamp(c["end"], timezone.utc).strftime("%b %d, %Y")
        resp = sum(a.get("respect", 0) for a in c.get("attackers", []))
        has = (REPORTS_DIR / f"chain-{k}.json").exists()
        link = (f'<a href="reports/chain-{k}.html">Report</a>'
                if has else '<span class="tag">-</span>')
        body += (f'<tr><td data-v="{c["end"]}">{when}</td><td data-v="{c["length"]}"><b>{fmt_int(c["length"])}</b></td>'
                 f'<td data-v="{resp:.2f}">{resp:,.0f}</td><td data-v="{len(c.get("attackers", []))}">{len(c.get("attackers", []))}</td>'
                 f'<td>{link}</td></tr>')
    body += "</table>" + SORT_JS
    _hub_page(mout / "chains.html", "Chain History", "Every chain on record, newest first", body, fresh=["chains"])


def ongoing_chain(key: str):
    """The faction's current chain from /v2/faction/chain (1 call): {current, max, timeout_at, cooldown_at,
    start, modifier} or None. Torn may give timeout / cooldown as seconds left or as a timestamp - both
    are turned into timestamps (for Discord's live <t:..:R> timers)."""
    if not key:
        return None
    try:
        c = fetch_section("chain", key).get("chain") or {}
    except SystemExit as e:
        print(f"Ongoing chain skipped: {e}")
        return None
    now = int(datetime.now(timezone.utc).timestamp())
    # seconds-left values are turned into timestamps rounded to the minute, so checks a few seconds apart
    # give the same text (no needless Discord edits)
    at = lambda v: (int(v) if int(v) > 1_000_000_000 else (now + int(v)) // 60 * 60) if v else 0
    return {"current": int(c.get("current") or 0), "max": int(c.get("max") or 0),
            "timeout_at": at(c.get("timeout")), "cooldown_at": at(c.get("cooldown")),
            "start": int(c.get("start") or 0), "modifier": c.get("modifier")}


def ongoing_chain_embed(oc) -> dict:
    """🔥 Ongoing Chain section of the chains hub (above Latest Chain)."""
    now = int(datetime.now(timezone.utc).timestamp())
    if oc and oc["current"] > 0 and oc["timeout_at"] > now:
        nxt = next((b for b in sorted(CHAIN_BONUS_HITS) if b > oc["current"]), None)
        lines = [f"⏱️ Times out <t:{oc['timeout_at']}:R>"]
        if nxt:
            lines.append(f"🎯 Next bonus **{fmt_int(nxt)}** - {fmt_int(nxt - oc['current'])} to go")
        if oc.get("start"):
            lines.append(f"🕐 Started <t:{oc['start']}:R>")
        return {"title": f"🔥 Ongoing Chain - {fmt_int(oc['current'])} hits", "color": 0xff8c1a,
                "description": "\n".join(lines)}
    if oc and oc["cooldown_at"] > now:
        return {"title": "❄️ Chain on cooldown", "color": 0x5865f2,
                "description": f"A new chain can start <t:{oc['cooldown_at']}:R> (<t:{oc['cooldown_at']}:t>)"}
    return {"title": "⛓️ No chain running", "color": 0x6b6b70,
            "description": "Start one when you're ready!" if oc else "Chain status unavailable right now."}


def _ongoing_sig(e: dict) -> str:
    return json.dumps(e, sort_keys=True)


def chain_ongoing_refresh(key: str, cfg: dict, cstate: dict, oc=False):
    """Chain watch (chainwatch.yml): refresh ONLY the Ongoing Chain section of the chains hub - the other
    embeds (and their images) are kept as they are. 1 API call; Discord is edited only on a change.
    cstate = the crimes run's own state (it never writes the chains state file)."""
    url = os.environ.get("DISCORD_WEBHOOK_CHAINS", "").strip()
    if not url or not cfg.get("chain_report", {}).get("ongoing", True):
        return
    try:
        hs = json.loads(DISCORD_CHAIN_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    hub, embeds, att = hs.get("hub_id"), hs.get("hub_embeds"), hs.get("hub_att")
    if not hub or not embeds:
        return
    e = ongoing_chain_embed(ongoing_chain(key) if oc is False else oc)
    sig = _ongoing_sig(e) + hub
    if cstate.get("chain_sig") == sig:
        return
    if not any(x.get("_ongoing") for x in embeds):
        return                          # hub has no Ongoing Chain section yet - the next hub update adds it
    embeds = [e if x.get("_ongoing") else x for x in embeds]
    try:
        # "attachments" left out = Discord keeps the uploaded images; attachment://name still points at them
        res = _discord_request(f"{url}/messages/{hub}", "PATCH",
                               {"embeds": [{k: v for k, v in x.items() if k != "_ongoing"} for x in embeds]})
        imgs = sum(1 for x in (res or {}).get("embeds", []) if (x.get("image") or {}).get("url"))
        cstate["chain_sig"] = sig
        print(f"Discord: ongoing chain updated ({imgs} image(s) kept)")
    except Exception as e_:      # never print the URL
        print(f"Discord: ongoing chain update failed: {type(e_).__name__}")


CHAIN_WATCH_PATH = ROOT / "data" / "chain_watch_state.json"
CHAIN_WATCH_EVERY = 5 * 60          # refresh while a chain is running
CHAIN_WATCH_MAX = 5 * 3600 + 40 * 60  # stay under GitHub's 6 h job limit - the next 15-min run carries on


def chain_watch(key: str, cfg: dict):
    """chainwatch.yml, every 15 minutes (RUN_KIND=chainwatch): 1 call to /faction/chain.
      - no chain / cooldown: the hub's Ongoing Chain section is edited only if it changed
      - chain running: stay on and refresh it every 5 minutes until the chain breaks (or ~5h40m, then the
        next scheduled run takes over); when it ends, wait CHAIN_SETTLE for Torn to finalise it and start a
        full update (workflow banner.yml) so it appears in Latest Chain + the Directory straight away."""
    import time as _t
    try:
        st = json.loads(CHAIN_WATCH_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        st = {}
    began = _t.time()
    was_running = False
    while True:
        oc = ongoing_chain(key)
        now = int(_t.time())
        running = bool(oc and oc["current"] > 0 and oc["timeout_at"] > now)
        # chain ACTIVITY marker for the hourly chain-list read (update_chain_history): set when a new chain is
        # seen running or a cooldown begins (a chain ended between checks); the chain end sets it below
        if oc:
            cd = oc["cooldown_at"] > now
            if (running and oc.get("start") != st.get("act_start")) or (cd and not st.get("in_cd")):
                st["activity_at"] = now
            if running:
                st["act_start"] = oc.get("start")
            st["in_cd"] = cd
        st_ = {"chain_sig": st.get("chain_sig")}
        chain_ongoing_refresh(key, cfg, st_, oc)
        st["chain_sig"] = st_.get("chain_sig")
        if running:
            was_running = True
            print(f"Chain watch: chain running ({oc['current']} hits)")
            if _t.time() - began > CHAIN_WATCH_MAX:
                print("Chain watch: time limit - the next run continues")
                break
            _t.sleep(CHAIN_WATCH_EVERY)
            continue
        if was_running:
            print("Chain watch: chain ended - waiting for Torn to finalise it, then a full update")
            _t.sleep(CHAIN_SETTLE + 60)
            st["request_full"] = True
            st["activity_at"] = int(_t.time())     # the full update must read the chain list
            # keep the section accurate after the wait (cooldown timer)
            st_ = {"chain_sig": st.get("chain_sig")}
            chain_ongoing_refresh(key, cfg, st_, ongoing_chain(key))
            st["chain_sig"] = st_.get("chain_sig")
        break
    CHAIN_WATCH_PATH.write_text(json.dumps(st) + "\n", encoding="utf-8")


def discord_chain_hub(chist: dict, members: list, cfg: dict, new_chain: bool) -> None:
    """The chains channel's single post:
         embed 1  🏆 Chain Leaderboard   (the announcement's Chain Leaderboards panel - this month + all time)
         embed 2  🔥 Ongoing Chain       (live: hits, timeout timer, next bonus / cooldown timer) -
                                          also refreshed every 15 min by the crime check
         embed 3  📄 Latest Chain Report (its report image + facts, links to its page)
         embed 4  📚 Chain Directory     (previous chains: date, hits, respect, report links)
       + buttons: Latest Report · Chain History.
    A NEW chain re-posts it (old one deleted, so it's the newest message and notifies); otherwise it is
    edited in place - only when its content changed."""
    import hashlib
    ccfg = cfg.get("chain_report", {})
    url = os.environ.get("DISCORD_WEBHOOK_CHAINS", "").strip()
    if not url:
        return
    min_len = int(ccfg.get("min_length", 50))
    chains = sorted(((k, c) for k, c in chist.get("chains", {}).items() if c.get("length", 0) >= min_len),
                    key=lambda kc: -kc[1]["end"])
    if not chains:
        return
    try:
        state = json.loads(DISCORD_CHAIN_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    # report pages for the latest + directory chains (a few per run for ones posted before reports were saved)
    made = 0
    for k, _c in chains[:CHAIN_HUB_DIRECTORY + 1]:
        if not (REPORTS_DIR / f"chain-{k}.json").exists() and made < CHAIN_BACKFILL_PER_RUN:
            _chain_meta(k, chist, members, ccfg)
            made += 1
    if made:
        DEPLOY_REQUEST.write_text("chain report pages\n")
    base = member_base()
    lk, lc = chains[0]
    r = chain_report(lk, chist, members, ccfg)
    # Latest Chain = its Chain Report (the saved report image, Nov 2026); the compact card only when there's none yet
    rp_ = REPORTS_DIR / f"chain-{lk}.png"
    latest_png = rp_.read_bytes() if rp_.exists() else chain_card_png(r)
    board = chain_board_png(chist, members, cfg)
    lines = []
    for k, c in chains[1:CHAIN_HUB_DIRECTORY + 1]:
        when = datetime.fromtimestamp(c["end"], timezone.utc).strftime("%b %d")
        resp = sum(a.get("respect", 0) for a in c.get("attackers", []))
        link = (f" · [Report]({base}/reports/chain-{k}.html)" if (REPORTS_DIR / f"chain-{k}.json").exists() else "")
        lines.append(f"`{when}` **{fmt_int(c['length'])}** hits · {resp:,.0f} respect{link}")
    more = len(chains) - 1 - len(lines)
    ongoing = ongoing_chain_embed(ongoing_chain(os.environ.get("TORN_API_KEY", "").strip())) \
        if ccfg.get("ongoing", True) else None
    embeds = [
        {"title": "🏆 Chain Leaderboard", "color": 0xe8be5a, "image": {"url": "attachment://chain-leaderboard.png"}},
    ] + ([ongoing] if ongoing else []) + [
        {"title": f"📄 Latest Chain Report - {fmt_int(r['length'])} hits", "url": f"{base}/reports/chain-{lk}.html",
         "color": 0xe4382e,
         "description": (f"<t:{r['end']}:f>" + (f" · {_dur(r.get('start'), r['end'])}" if r.get("start") else "")
                         + f"\n**{r['respect']:,.0f}** respect · **{r['attackers']}** members"),
         "image": {"url": "attachment://chain-latest.png"}},
        {"title": "📚 Chain Directory", "color": 0x2b2d31,
         "description": ("\n".join(lines) or "No earlier chains yet.")
                        + (f"\n-# …and {more} older - see the full Chain History" if more > 0 else ""),
         "footer": {"text": f"{len(chains)} chains of {min_len}+ hits on record"}}]
    payload = {"username": ccfg.get("username", "Chain Report"),
               "content": f"## ⛓️ Chains\n-# updated <t:{int(datetime.now(timezone.utc).timestamp())}:R>",
               "embeds": embeds,
               "attachments": [{"id": 0, "filename": "chain-leaderboard.png"}, {"id": 1, "filename": "chain-latest.png"}],
               "components": [{"type": 1, "components": [
                   {"type": 2, "style": 5, "label": "Latest Report", "url": f"{base}/reports/chain-{lk}.html"},
                   {"type": 2, "style": 5, "label": "Chain History", "url": f"{base}/chains.html"}]}],
               "allowed_mentions": {"parse": []}}
    files = [("chain-leaderboard.png", board), ("chain-latest.png", latest_png)]
    # b"v3": bump when the hub's buttons/layout change so the existing post is edited
    # (v3, Nov 2026: the announcement's chain leaderboard + the latest chain's report image)
    h = hashlib.sha1(b"v3" + board + latest_png + "\n".join(lines).encode() + base.encode()).hexdigest()[:12]
    hub = state.get("hub_id")
    osig = _ongoing_sig(ongoing or {})
    if hub and not new_chain and state.get("hub_hash") == h and "hub_att" in state:
        if state.get("ongoing_sig") != osig:
            # only the Ongoing Chain changed: edit the embeds, keep the uploaded images
            try:
                _discord_request(f"{url}/messages/{hub}", "PATCH", {"embeds": embeds})   # images kept
                state["ongoing_sig"] = osig
                print("Discord: ongoing chain updated")
            except Exception as e:      # never print the URL
                print(f"Discord: ongoing chain update failed: {type(e).__name__}")
            DISCORD_CHAIN_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
        return
    msg = {}
    try:
        if hub and not new_chain:
            try:
                msg = _discord_request(f"{url}/messages/{hub}?with_components=true", "PATCH", payload, files)
                print("Discord: chain hub updated")
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                hub = None
        if not hub or new_chain:
            if hub:
                try:
                    _discord_request(f"{url}/messages/{hub}", "DELETE")
                except Exception:
                    pass
            msg = _discord_request(f"{url}?wait=true&with_components=true", "POST", payload, files)
            hub = msg.get("id")
            print("Discord: chain hub posted")
        state["hub_id"], state["hub_hash"] = hub, h
        # kept so the 15-minute crime check can edit just the Ongoing Chain section without re-uploading images
        state["hub_embeds"] = [dict(x, _ongoing=True) if x is ongoing else x for x in embeds]
        state["hub_att"] = [a.get("id") for a in (msg or {}).get("attachments", []) if a.get("id")]
        state["ongoing_sig"] = osig
        discord_msg_save("chain:hub", hub)
        # tidy the channel: remove the old one-post-per-chain reports whose ids are known
        if not state.get("old_posts_removed"):
            for k_, v_ in discord_msgs().items():
                if k_.startswith("chain:") and k_ != "chain:hub":
                    try:
                        _discord_request(f"{url}/messages/{v_['id']}", "DELETE")
                    except Exception:
                        pass
                    discord_msg_save(k_, None, drop=True)
            state["old_posts_removed"] = True
    except Exception as e:      # never print the URL
        print(f"Discord: chain hub failed: {type(e).__name__}")
    DISCORD_CHAIN_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")


def discord_post_chains(raw: dict, cfg: dict, members: list):
    """Chain Report: one NEW post (never replaced) per finished chain of
    min_length (50)+ hits, to its own webhook (DISCORD_WEBHOOK_CHAINS):
    image only (no text version)."""
    ccfg = cfg.get("chain_report", {})
    url = os.environ.get("DISCORD_WEBHOOK_CHAINS", "").strip()
    chist = raw.get("_chain_history")
    if not ccfg.get("enabled", False) or not url or not chist:
        return
    chains = chist.get("chains", {})
    min_len = int(ccfg.get("min_length", 50))
    try:
        state = json.loads(DISCORD_CHAIN_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        # first run: everything already saved counts as posted, except the
        # newest qualifying chain (one previous report gets posted)
        ok = [k for k, c in chains.items() if c["length"] >= int(ccfg.get("min_length", 50))]
        newest = max(ok, key=lambda k: chains[k]["end"]) if ok else None
        state = {"posted": sorted(k for k in chains if k != newest)}
    posted = set(state.get("posted", []))
    todo = sorted((k for k, c in chains.items() if k not in posted and c["length"] >= min_len),
                  key=lambda k: chains[k]["end"])
    name = ccfg.get("username", "Chain Report")
    # one hub post instead of a post per chain: new chains get their report saved, then the hub is re-posted
    for cid in todo:
        _chain_meta(cid, chist, members, ccfg)
        DEPLOY_REQUEST.write_text("chain report\n")      # publish its pages now (chain runs don't deploy)
        posted.add(cid)
        print(f"Chain report saved: {cid}")
    state["posted"] = sorted(posted)
    DISCORD_CHAIN_STATE_PATH.parent.mkdir(exist_ok=True)
    DISCORD_CHAIN_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
    if ccfg.get("hub", True):
        discord_chain_hub(chist, members, cfg, new_chain=bool(todo))
        try:
            state = json.loads(DISCORD_CHAIN_STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        state["posted"] = sorted(posted)
    # refresh: re-draw every saved chain report and edit its post (config discord_refresh.chain)
    if discord_refresh_due("chain"):
        ok = True
        for k, v in discord_msgs().items():
            if not k.startswith("chain:") or k.split(":")[1] not in chains:
                continue
            cid = k.split(":")[1]
            r = chain_report(cid, chist, members, ccfg)
            png = chain_report_image(r, ccfg)
            slug = save_report("chain", cid, png, {"title": f"Chain Report - {fmt_int(r['length'])} hits",
                                                    "length": r["length"], "end": r["end"], "start": r.get("start"),
                                                    "dur": _dur(r.get("start"), r["end"]) if r.get("start") else "",
                                                    "respect": r["respect"], "attackers": r["attackers"]})
            try:
                _discord_request(f"{url}/messages/{v['id']}?with_components=true", "PATCH",
                                 {"attachments": [{"id": 0, "filename": "chain_report.png"}],
                                  "components": report_links(slug), "allowed_mentions": {"parse": []}}, png)
                print(f"Discord: chain report {cid} re-drawn")
            except Exception as e:     # never print the URL
                print(f"Discord: chain report {cid} edit failed: {type(e).__name__}")
                ok = ok and isinstance(e, urllib.error.HTTPError)   # gone/unknown post: skip it, don't retry forever
        if ok:
            discord_refresh_done("chain")
        DEPLOY_REQUEST.write_text("chain refresh\n")
    state["posted"] = sorted(posted)
    DISCORD_CHAIN_STATE_PATH.parent.mkdir(exist_ok=True)
    DISCORD_CHAIN_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")


WAR_HUB_DIRECTORY = 15        # previous wars listed in the war hub post
WAR_BACKFILL_PER_RUN = 20     # report pages made per run for recent wars (drawn from saved data, no API calls)


def _one_war(raw: dict, wid: str, my_id, cfg: dict):
    """normalize_wars() for a single war id (opponent, result, score, rank, participation, top 5s) or None."""
    one = normalize_wars(dict(raw, rankedwars={"rankedwars": [
        w for w in _as_list((raw.get("rankedwars") or {}).get("rankedwars")) if str(w.get("id")) == str(wid)]}),
        my_id, dict(cfg.get("ranked_wars", {}), count=1, top_hitters=5))
    return one[0] if one else None


WAR_REPORT_V = 5      # saved war reports older than this are redrawn in the current format
                      # (3: full members list · 4: the war's payout merged in - War Report & Payout
                      #  · 5: "Every member in the war" card removed)


def war_report_full_png(w0: dict, wh_: dict, pay_layer=None) -> bytes:
    """A war's report image: the War Summary card, then - when the war was paid out - its payout (summary,
    metrics, vault check, member payouts: payout_receipt_image(layer=True)). Drawn from saved data (no API calls).
    With a payout this is the war's ONE combined image (War Report & Payout) - the payout pages and posts use it.
    (The "Every member in the war" card was removed Nov 2026 - war_members_card below keeps the code.)"""
    top = war_summary_card(w0)
    if pay_layer is not None:
        both_ = Image.new("RGBA", (top.width, top.height + pay_layer.height - PAD_TOP), (0, 0, 0, 0))
        both_.alpha_composite(top, (0, 0))
        both_.alpha_composite(pay_layer.crop((0, PAD_TOP, pay_layer.width, pay_layer.height)), (0, top.height))
        top = both_
    return frame_png(top, bar="War Report & Payout" if pay_layer is not None else "War Report")


def war_members_card(w0: dict, wh_: dict, top):
    """(Unused since Nov 2026) the report's old "Every member in the war" card under `top` - kept in case it's wanted."""
    ms_ = sorted(wh_.get("members", []), key=lambda m: (-m.get("attacks", 0), -m.get("score", 0), str(m.get("name", ""))))
    people = [(m.get("name", "?"), fmt_int(m.get("attacks", 0)), fmt_int(round(m.get("score", 0)))) for m in ms_]
    hit = sum(1 for m in ms_ if m.get("attacks", 0) > 0)
    card = involved_card("EVERY MEMBER IN THE WAR", RED if w0.get("won") else (170, 170, 172),
                         f"{hit} of {len(ms_)} hit · no hits listed last",
                         [("Hits", fmt_int(sum(m.get("attacks", 0) for m in ms_))), ("Hit", f"{hit}/{len(ms_)}"),
                          ("Respect", fmt_int(round(sum(m.get("score", 0) for m in ms_))))], people)
    both = Image.new("RGBA", (top.width, top.height + card.height - PAD_TOP), (0, 0, 0, 0))
    both.alpha_composite(top, (0, 0))
    both.alpha_composite(card.crop((0, PAD_TOP, card.width, card.height)), (0, top.height))
    return both                   # the layer (frame it with frame_png)


def war_payout_sig(wid: str):
    """(receipt, vault check, signature) of a war's CURRENT payout receipt, or (None, None, "") when it has none.
    The signature changes when the receipt is corrected or its vault check result changes -> the combined
    War Report & Payout image is redrawn."""
    import hashlib
    stem = _latest_receipts().get(str(wid))
    if not stem:
        return None, None, ""
    try:
        f = PAYOUT_DIR / f"{stem}.json"
        r = json.loads(f.read_text(encoding="utf-8"))
        vs = json.loads(PAYOUT_VAULT_PATH.read_text(encoding="utf-8")) if PAYOUT_VAULT_PATH.exists() else {}
    except (OSError, ValueError):
        return None, None, ""
    v = vs.get(stem)
    sig = hashlib.sha1(f.read_bytes() + json.dumps((v or {}).get("members", {}), sort_keys=True).encode()).hexdigest()[:12]
    return r, v, f"{stem}:{sig}"


def refresh_war_reports(raw: dict, cfg: dict, only_new: set = None) -> int:
    """(Re)draw saved war reports that are missing, in an older format (rv < WAR_REPORT_V) or whose payout changed
    (a receipt saved / corrected / vault-checked since -> meta "pay" differs). With a payout the image is the
    combined War Report & Payout. Drawn from saved data only - no API calls. Returns how many were drawn."""
    wars = (raw.get("_war_history") or {}).get("wars", {})
    if not wars or "rankedwars" not in raw:
        return 0
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    n = 0
    for wid in sorted(wars, key=lambda k: -wars[k]["end"]):
        f_ = REPORTS_DIR / f"war-{wid}.json"
        try:
            meta_ = json.loads(f_.read_text(encoding="utf-8")) if f_.exists() else {}
        except ValueError:
            meta_ = {}
        r, v, sig = war_payout_sig(wid)
        if f_.exists() and meta_.get("rv", 0) >= WAR_REPORT_V and meta_.get("pay", "") == sig and \
                not (only_new and wid in only_new):
            continue
        try:
            w0 = _one_war(raw, wid, my_id, cfg)
            if w0:
                layer = payout_receipt_image(r, v, layer=True) if r else None
                meta = dict(_war_report_meta(w0, wars[wid]), pay=sig)
                if r:
                    meta.update(paid=r.get("paid", 0), paid_n=sum(1 for m in r.get("members", []) if m.get("pay")))
                save_report("war", wid, war_report_full_png(w0, wars[wid], layer), meta)
                n += 1
        except Exception as e:                 # one bad war never stops the run
            print(f"War report {wid} not drawn ({type(e).__name__})")
    if n:
        print(f"War reports drawn: {n}")
    return n


def _war_report_meta(w0: dict, wh_: dict) -> dict:
    ms_ = wh_.get("members", [])
    return {"opponent": w0.get("opponent", "?"), "won": w0.get("won"), "our": w0.get("our_score") or 0,
            "their": w0.get("their_score") or 0, "end": wh_.get("end") or w0.get("end", 0), "start": w0.get("start") or 0,
            "rank_before": w0.get("rank_before", ""), "rank_after": w0.get("rank_after", ""),
            "hits": sum(m["attacks"] for m in ms_), "hit": sum(1 for m in ms_ if m["attacks"] > 0), "present": len(ms_),
            "top": max(ms_, key=lambda m: m["attacks"]).get("name", "") if ms_ else "", "rv": WAR_REPORT_V}


HIST_STATS_CSS = """<style>.hst{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:0 0 14px}
.hst div{background:#170d0e;border:1px solid #5c1c1a;border-radius:10px;padding:9px;text-align:center}
.hst b{display:block;color:#fff;font-size:19px}.hst span{color:#9a9a9c;font-size:11px;text-transform:uppercase;letter-spacing:1px}
.wsum{text-align:center;margin:0 0 6px}.wsum img{max-width:100%;height:auto;border-radius:8px}
table.srt th{white-space:nowrap}table.srt th:after{content:" ⇅";color:#5c4a4a;font-size:11px}
table.msum tr.fmr{display:none}table.msum.shf tr.fmr{display:table-row}table.msum tr.fmr td{color:#8a7f80}
table.msum td{white-space:nowrap}.trm{background:#3a2d12;color:#e8be5a;border-radius:6px;padding:1px 6px;font-size:11px;margin-left:4px}</style>"""


CURRENT_MEMBERS = {}       # member id (str) -> name, current members - set in main() (history summaries)
OPTIN_DATA = {}            # "v": (opt-in settings, stats) from optin_update - full runs only
OPTIN_FULL = {}            # "v": optin_publish's merged view (site + Hub script sharing) - set by write_monitor
CHAIN_AVG_MIN = 250        # "hits per chain" (profiles, Chain History summary) counts only chains this long or longer


def _member_summary(rows: list, cols: list, tid: str) -> str:
    """A sortable all-member summary table (War / Chain History): rows = [{"id", "name", "current", <key>: value}],
    cols = [(label, key, fmt)] (fmt(value) -> text; the raw value sorts). Current members show; former members
    appear with "Show former members". Sorts with SORT_JS (table.srt)."""
    import html as _html
    h = (f'<label style="color:#9a9a9c;font-size:13px;display:flex;gap:6px;align-items:center;margin:4px 0 8px">'
         f'<input type="checkbox" onchange="document.getElementById(\'{tid}\').classList.toggle(\'shf\',this.checked)"> Show former members</label>'
         f'<div style="overflow-x:auto"><table class="srt msum" id="{tid}"><tr><th>Member</th>'
         + "".join(f"<th>{_html.escape(l)}</th>" for l, _k, _f in cols) + "</tr>")
    for r in rows:
        h += (f'<tr{"" if r["current"] else " class=fmr"}><td>'
              f'<a href="member.html?id={r["id"]}">{_html.escape(str(r["name"]))}</a>'
              + ("" if r["current"] else ' <span class="tag">former</span>') + "</td>"
              + "".join(f'<td data-v="{r.get(k) or 0}">{f(r.get(k)) if r.get(k) is not None else "-"}</td>' for _l, k, f in cols)
              + "</tr>")
    return h + "</table></div>"


def _stat_strip(items) -> str:
    """[(value, label)] -> a row of stat boxes (War / Chain History headers)."""
    import html as _html
    return '<div class="hst">' + "".join(f"<div><b>{v}</b><span>{_html.escape(l)}</span></div>" for v, l in items) + "</div>"


def war_history_page(out: Path, raw: dict, cfg: dict):
    """wars.html (members) - the War Summary on top (record + totals, and the latest war's War Summary card),
    then every ranked war on record, newest first: result, score, hits, respect, participation, with its report
    and payout when saved. The table sorts by tapping a column (date, result, score, hits, respect, took part)."""
    import html as _html
    mout = member_out(out)
    hist = raw.get("_war_history") or {}
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    meta = war_meta(raw, my_id)
    wars = sorted(hist.get("wars", {}).items(), key=lambda kv: -kv[1]["end"])
    won = sum(1 for k, _w in wars if meta.get(k, {}).get("won"))
    tot_hits = sum(m["attacks"] for _k, w in wars for m in w.get("members", []))
    tot_resp = sum(m.get("score", 0) for _k, w in wars for m in w.get("members", []))
    tw = termed_wars(cfg)
    # took part: termed wars left out (TERMED WARS)
    part = [sum(1 for m in w.get("members", []) if m["attacks"] > 0) / len(w["members"]) for k, w in wars
            if w.get("members") and str(k) not in tw]
    summary_html = HIST_STATS_CSS + _stat_strip([
        (f"{won}-{len(wars) - won}", "Record (W-L)"), (f"{round(100 * won / len(wars)) if wars else 0}%", "Win rate"),
        (fmt_int(len(wars)), "Ranked wars"), (fmt_int(tot_hits), "War hits"), (f"{tot_resp:,.0f}", "War respect"),
        (f"{round(100 * sum(part) / len(part)) if part else 0}%", "Avg took part")])
    # the latest war's War Summary card (same printout as the payout receipts / Discord), linked to its report
    if wars:
        lk = wars[0][0]
        try:
            w0 = _one_war(raw, lk, my_id, cfg)
            if w0:
                (mout / "war-summary.png").write_bytes(frame_png(war_summary_card(w0), bar="War Summary"))
                href = f"reports/war-{lk}.html" if (REPORTS_DIR / f"war-{lk}.json").exists() else "war-summary.png"
                summary_html += (f'<div class="wsum"><a href="{href}"><img src="war-summary.png" '
                                 f'alt="War Summary - latest war" loading="lazy"></a></div>')
        except Exception as e:
            print(f"War History: war summary skipped ({type(e).__name__})")
    # every member's wars, all time (same counting as the all-time war leaderboard; a termed war with no hits
    # isn't counted against anyone)
    agg = {}
    for k, w in wars:
        for m in w.get("members", []):
            if str(k) in tw and m["attacks"] == 0:
                continue
            a = agg.setdefault(str(m["id"]), {"id": m["id"], "name": m.get("name", "?"), "wars": 0, "hits": 0, "resp": 0.0,
                                              "took": 0, "assists": 0, "best": 0})
            a["wars"] += 1; a["hits"] += m["attacks"]; a["resp"] += m.get("score", 0); a["took"] += m["attacks"] > 0
            a["assists"] += m.get("assists", 0) or 0; a["best"] = max(a["best"], m["attacks"])
    for i, n in CURRENT_MEMBERS.items():
        agg.setdefault(i, {"id": int(i), "name": n, "wars": 0, "hits": 0, "resp": 0.0, "took": 0, "assists": 0, "best": 0})
    rows_ = []
    for i, a in agg.items():
        a["current"] = i in CURRENT_MEMBERS if CURRENT_MEMBERS else True
        a["name"] = CURRENT_MEMBERS.get(i, a["name"])
        a["per"] = round(a["hits"] / a["wars"], 1) if a["wars"] else None
        a["rate"] = round(100 * a["took"] / a["wars"]) if a["wars"] else None
        rows_.append(a)
    # MEMBERS LIST (Nov 12 2026, user: no repeated per-member tables): these totals are shown on members.html
    # (write_profiles, built after this) instead of an "Every member" table here
    WAR_AGG.clear(); WAR_AGG.update({str(a["id"]): a for a in rows_})
    body = (site_menu("") + tab_bar(HISTORY_TABS, "wars.html") + "<h2>⚔️ War Summary</h2>" + summary_html
            + f'<h2 id="paid">All ranked wars <span class="tag">(tap a column to sort)</span></h2>'
            # "Paid wars only" (the old War Payouts page = wars.html#paid)
            '<label style="color:#9a9a9c;font-size:13px;display:flex;gap:6px;align-items:center;margin:0 0 8px">'
            '<input type="checkbox" id="pdo"> Paid wars only (each opens its War Report &amp; Payout)</label>'
            '<script>(function(){var c=document.getElementById("pdo"),f=function(){document.querySelectorAll("tr[data-paid]").forEach('
            'function(r){r.style.display=c.checked&&r.dataset.paid!=="1"?"none":""})};c.onchange=f;'
            'if(location.hash==="#paid"){c.checked=true;document.addEventListener("DOMContentLoaded",f)}})();</script>'
            '<table class="srt"><tr><th>Date</th><th>Result</th><th>Score</th><th>Hits</th><th>Respect</th>'
            "<th>Took part</th><th>Links</th></tr>")
    rec = _latest_receipts()
    for k, w in wars:
        mt = meta.get(k, {})
        when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y")
        ms_ = w.get("members", [])
        res = ((f'<span class="{"w" if mt.get("won") else "d"}">{"Victory" if mt.get("won") else "Defeat"}</span> '
                f'vs {_html.escape(str(mt.get("opponent", "?")))}') if mt else "?") + \
              ('<span class="trm" title="Termed - not counted against participation or reliability">Termed</span>'
               if str(k) in tw else "")
        links = []
        if (REPORTS_DIR / f"war-{k}.json").exists():
            links.append(f'<a href="reports/war-{k}.html">{"Report &amp; Payout" if k in rec else "Report"}</a>')
        elif k in rec:
            links.append(f'<a href="payouts/war-{k}.html">Payout</a>')
        hits, resp = sum(m["attacks"] for m in ms_), sum(m.get("score", 0) for m in ms_)
        took = sum(1 for m in ms_ if m["attacks"] > 0)
        body += (f'<tr data-paid="{1 if k in rec else 0}"><td data-v="{w["end"]}">{when}</td><td data-v="{1 if mt.get("won") else 0}">{res}</td>'
                 f'<td data-v="{mt.get("our", 0)}">{fmt_int(mt.get("our", 0))} - {fmt_int(mt.get("their", 0))}</td>'
                 f'<td data-v="{hits}">{fmt_int(hits)}</td><td data-v="{resp:.2f}">{resp:,.0f}</td>'
                 f'<td data-v="{took / len(ms_) if ms_ else 0:.4f}">{took}/{len(ms_)}</td><td>{" · ".join(links) or "-"}</td></tr>')
    body += "</table>" + SORT_JS
    _hub_page(mout / "wars.html", "War History", "The war summary, then every ranked war on record", body, fresh=["wars"])


def discord_post_wars(raw: dict, summary: dict, cfg: dict):
    """#war-reports (DISCORD_WEBHOOK_SLACKERS): ONE hub post - war reports and war payouts in one place (Nov 2026;
    the separate #war-payouts posts were merged in here):
         embed 1  ⚔️ War Leaderboard          the SAME war leaderboard as the announcement (draw_leaderboard)
         embed 2  🏆/💀 Latest War             its War Report image - once the war is paid out, the combined
                                               War Report & Payout image + the payout summary (edited in place)
         embed 3  📚 War Report Directory      previous wars, easy to scan: result + opponent, date + score,
                                               🤝 Termed when flagged, 💰 when paid, report link
       + buttons: Latest Report (& Payout) · War History.
    Each finished war's report page is saved; a NEW war re-posts the hub (newest message, notifies); a payout, a
    corrected receipt, a termed flag or new numbers EDIT it in place (only when its content changed)."""
    import hashlib
    dcfg = cfg.get("discord", {})
    url = os.environ.get("DISCORD_WEBHOOK_SLACKERS", "").strip()
    if not dcfg.get("enabled", False) or not url or "_war_history" not in raw:
        return
    wars = raw["_war_history"].get("wars", {})
    if not wars:
        return
    try:
        state = json.loads(DISCORD_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        newest = max(wars.items(), key=lambda kv: kv[1]["end"])[0]
        state = {"posted": [k for k in wars if k != newest]}
    posted = set(state.get("posted", []))
    todo = sorted((k for k in wars if k not in posted), key=lambda k: wars[k]["end"])
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    # EVERY war in the history has a report page in the current format (refresh_war_reports: the War Summary,
    # the payout when the war was paid, every member who was in the war) - drawn from saved data, no API calls.
    refresh_war_reports(raw, cfg, set(todo))
    for wid in todo:
        print(f"War report saved: {wid}")
    posted |= set(wars)
    state["posted"] = sorted(posted)
    order = sorted(wars, key=lambda k: -wars[k]["end"])
    # ---- hub ----
    base = member_base()
    lk = order[0]
    w0 = _one_war(raw, lk, my_id, cfg)
    lcfg = cfg.get("announcements", {}).get("leaderboard", {})
    # the announcement's War Leaderboards panel, as is (this month + all time, every current member)
    board = frame_png(draw_leaderboard(lcfg, summary, heading=False), bar=lcfg.get("war_group_title", "War Leaderboards"))
    rep_png = REPORTS_DIR / f"war-{lk}.png"
    latest = rep_png.read_bytes() if rep_png.exists() else war_card_png(w0, wars[lk])
    meta = war_meta(raw, my_id)
    rec = _latest_receipts()
    tw_ = termed_wars(cfg)                     # termed wars are marked in the directory + on the latest war
    # directory: two short lines per war - easy to scan on a phone
    #   ✅ **Victory** vs **Opponent** · 🤝 Termed
    #   -# Nov 03 · 1,234 - 567 · 💰 Paid · [Report & Payout](link)
    lines = []
    for k in order[1:WAR_HUB_DIRECTORY + 1]:
        mt = meta.get(k, {})
        when = datetime.fromtimestamp(wars[k]["end"], timezone.utc).strftime("%b %d, %Y")
        head = ((f"{'✅ **Victory**' if mt.get('won') else '❌ **Defeat**'} vs **{mt.get('opponent', '?')}**") if mt else "**?**") \
            + (" · 🤝 Termed" if str(k) in tw_ else "")
        sub = [when] + ([f"{fmt_int(mt.get('our', 0))} - {fmt_int(mt.get('their', 0))}"] if mt else []) \
            + (["💰 Paid"] if k in rec else [])
        if (REPORTS_DIR / f"war-{k}.json").exists():
            sub.append(f"[Report{' & Payout' if k in rec else ''}]({base}/reports/war-{k}.html)")
        lines.append(head + "\n-# " + " · ".join(sub))
    more = len(order) - 1 - len(lines)
    won = sum(1 for k in order if meta.get(k, {}).get("won"))
    termed0 = str(lk) in tw_
    desc = ""
    if w0:
        desc = (f"<t:{w0['end']}:f>" + (f" · {_dur(w0.get('start'), w0['end'])}" if w0.get("start") else "")
                + f"\nScore **{fmt_int(w0['our_score'])}** - **{fmt_int(w0['their_score'])}**"
                + (f" · Rank **{w0['rank_after']}**" if w0.get("rank_after") else "")
                + (f"\n**{w0['hit']}/{w0['present']}** members hit" if w0.get("present") else ""))
    if termed0:
        desc += "\n🤝 **Termed war**"
    # the payout, once it's been made (the receipt) - the image is the combined War Report & Payout then
    pay_txt = ""
    if lk in rec:
        try:
            r_ = json.loads((PAYOUT_DIR / f"{rec[lk]}.json").read_text(encoding="utf-8"))
            paid_n = sum(1 for m in r_.get("members", []) if m.get("pay"))
            pay_txt = f"\n\n💰 **Payout:** ${r_.get('paid', 0):,} to **{paid_n}** member{'s' if paid_n != 1 else ''}"
            try:
                vm = (json.loads(PAYOUT_VAULT_PATH.read_text(encoding="utf-8")).get(rec[lk]) or {}).get("members") or {}
            except (OSError, ValueError):
                vm = {}
            nbad = sum(1 for v in vm.values() if v.get("st") != "ok")
            if vm:
                pay_txt += f"\n{'⚠️ ' + str(nbad) + ' not found in the vault log yet' if nbad else '✅ all found in the vault log'}"
            if r_.get("paid_by"):
                pay_txt += f"\n-# Paid by {r_['paid_by']}"
        except (OSError, ValueError):
            pass
    else:
        pay_txt = "\n\n-# 💰 Payout not made yet - this post updates when it is."
    title = (f"{'🏆 Victory' if w0.get('won') else '💀 Defeat'} vs {w0.get('opponent', '?')}" if w0 else "Latest War") \
        + (" · 🤝 Termed" if termed0 else "")
    embeds = [
        {"title": "⚔️ War Leaderboard", "color": 0xe8be5a, "image": {"url": "attachment://war-leaderboard.png"}},
        {"title": ("📄 Latest War Report & Payout · " if lk in rec else "📄 Latest War Report · ") + title[:200],
         "url": f"{base}/reports/war-{lk}.html", "color": 0x78c878 if (w0 or {}).get("won") else 0xe4382e,
         "description": (desc + pay_txt)[:4000], "image": {"url": "attachment://latest-war.png"}},
        {"title": "📚 War Report Directory", "color": 0x2b2d31,
         "description": ("\n\n".join(lines) or "No earlier wars yet.")[:3900]
                        + (f"\n\n-# …and {more} older - see the full War History" if more > 0 else ""),
         "footer": {"text": f"{len(order)} ranked wars on record · {won} won · {len(order) - won} lost"
                            + (f" · {sum(1 for k in order if str(k) in tw_)} termed" if any(str(k) in tw_ for k in order) else "")}}]
    # the latest war's report page includes its payout once paid (War Report & Payout)
    btns = [{"type": 2, "style": 5, "label": "Latest Report & Payout" if lk in rec else "Latest Report",
             "url": f"{base}/reports/war-{lk}.html"},
            {"type": 2, "style": 5, "label": "War History", "url": f"{base}/wars.html"}]
    payload = {"username": dcfg.get("username", "War Reports"),
               "content": f"## ⚔️ War Reports\n-# updated <t:{int(datetime.now(timezone.utc).timestamp())}:R>",
               "embeds": embeds,
               "attachments": [{"id": 0, "filename": "war-leaderboard.png"}, {"id": 1, "filename": "latest-war.png"}],
               "components": [{"type": 1, "components": btns}], "allowed_mentions": {"parse": []}}
    files = [("war-leaderboard.png", board), ("latest-war.png", latest)]
    # b"v3": bump when the hub's buttons/layout change so the existing post is edited (v3: payouts merged in, Nov 2026)
    h = hashlib.sha1(b"v3" + board + latest + json.dumps(embeds, sort_keys=True).encode() + base.encode()).hexdigest()[:12]
    hub = state.get("hub_id")
    if not (hub and not todo and state.get("hub_hash") == h):
        try:
            if hub and not todo:
                try:
                    _discord_request(f"{url}/messages/{hub}?with_components=true", "PATCH", payload, files)
                    print("Discord: war hub updated")
                except urllib.error.HTTPError as e:
                    if e.code != 404:
                        raise
                    hub = None
            if not hub or todo:
                if hub:
                    try:
                        _discord_request(f"{url}/messages/{hub}", "DELETE")
                    except Exception:
                        pass
                hub = _discord_request(f"{url}?wait=true&with_components=true", "POST", payload, files).get("id")
                print("Discord: war hub posted")
            state["hub_id"], state["hub_hash"] = hub, h
            discord_msg_save("war:hub", hub)
            # tidy: the old one-post-per-war report(s) whose ids are known
            if not state.get("old_posts_removed"):
                old = set(state.get("last_message_ids") or []) | {v["id"] for k_, v in discord_msgs().items()
                                                                  if k_.startswith("war:") and k_ != "war:hub"}
                for mid in old:
                    try:
                        _discord_request(f"{url}/messages/{mid}", "DELETE")
                    except Exception:
                        pass
                for k_ in [k_ for k_ in discord_msgs() if k_.startswith("war:") and k_ != "war:hub"]:
                    discord_msg_save(k_, None, drop=True)
                state["old_posts_removed"] = True
                state.pop("last_message_ids", None)
        except Exception as e:      # never print the URL
            print(f"Discord: war hub failed: {type(e).__name__}")
    DISCORD_STATE_PATH.parent.mkdir(exist_ok=True)
    DISCORD_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------
# Monthly recap: Discord (DISCORD_WEBHOOK_RECAP) + newsletter copy page
# --------------------------------------------------------------------------
def war_meta(raw: dict, my_id) -> dict:
    """{war id: {opponent, won, our, their}} from the ranked war list."""
    out = {}
    for w in _as_list((raw.get("rankedwars") or {}).get("rankedwars")):
        facs = _as_list(w.get("factions"))
        me = next((f for f in facs if str(f.get("id")) == str(my_id)), None)
        them = next((f for f in facs if str(f.get("id")) != str(my_id)), None)
        if me and them:
            out[str(w.get("id"))] = {"opponent": them.get("name", "?"), "won": str(w.get("winner")) == str(my_id),
                                     "our": me.get("score") or 0, "their": them.get("score") or 0}
    return out


def recap_data(start: int, end: int, label: str, whist: dict, chist: dict, members: list,
               meta: dict = None, gym_top: list = None) -> dict:
    """Everything that happened between start and end (UTC timestamps),
    from the saved war + chain history. Current members only on boards.
    meta = war_meta() (opponent/result); gym_top = [(name, energy)] for the
    month (Gym Rat) from gym.json "prev"."""
    meta = meta or {}
    names = {m.get("id"): m.get("name", "?") for m in members}
    cur = set(names)
    wars = sorted((dict(w, _id=k) for k, w in whist.get("wars", {}).items() if start <= w["end"] < end),
                  key=lambda w: w["end"])
    chains = sorted((c for c in chist.get("chains", {}).values() if start <= c["end"] < end), key=lambda c: c["end"])
    wh, wr, ch_h, ch_r, rets, war_in, war_hit = {}, {}, {}, {}, {}, {}, {}
    asts, bons = {}, {}
    war_rows = []
    for w in wars:
        ms = w["members"]
        hit = [m for m in ms if m["attacks"] > 0]
        for m in ms:
            wh[m["id"]] = wh.get(m["id"], 0) + m["attacks"]
            wr[m["id"]] = wr.get(m["id"], 0) + m["score"]
            war_in[m["id"]] = war_in.get(m["id"], 0) + 1
            war_hit[m["id"]] = war_hit.get(m["id"], 0) + (m["attacks"] > 0)
            names.setdefault(m["id"], m.get("name", "?"))
        mt = meta.get(str(w["_id"]), {})
        war_rows.append({"end": w["end"], "dur": _dur(w.get("start"), w["end"]),
                         "opponent": mt.get("opponent", ""), "won": mt.get("won"),
                         "score": (f"{fmt_int(mt['our'])} - {fmt_int(mt['their'])}" if mt else ""),
                         "hit": len(hit), "present": len(ms),
                         "hits": sum(m["attacks"] for m in ms), "respect": sum(m["score"] for m in ms),
                         "rank": (w.get("rank") or {}).get("after", ""),
                         "top": max(ms, key=lambda m: m["attacks"]).get("name", "?") if ms else ""})
    for c in chains:
        for a in c.get("attackers", []):
            ch_h[a["id"]] = ch_h.get(a["id"], 0) + a["hits"]
            ch_r[a["id"]] = ch_r.get(a["id"], 0) + a["respect"]
            rets[a["id"]] = rets.get(a["id"], 0) + a.get("rets", 0)
            asts[a["id"]] = asts.get(a["id"], 0) + (a.get("assists") or 0)
        for b in c.get("bonuses", []):            # chains read since bonus hits were saved
            bons[b["id"]] = bons.get(b["id"], 0) + 1
    def top(d, n=5):
        return [(names.get(i, f"[{i}]"), v) for i, v in sorted(d.items(), key=lambda kv: -kv[1])
                if i in cur and v > 0][:n]   # (opted-out members stay in the recap - it's a report, user Nov 13 2026)
    perfect = sorted((names[i] for i in cur if war_in.get(i) and war_hit.get(i) == war_in[i]
                      and war_in[i] == len(wars)), key=str.lower) if wars else []
    big = max(chains, key=lambda c: c["length"]) if chains else None
    # extra awards
    single = {}                                    # best single-war hits
    for w in wars:
        for m in w["members"]:
            single[m["id"]] = max(single.get(m["id"], 0), m["attacks"])
    # respect / hit - chain bonus respect included (Nov 2026)
    war_rph = {i: wr[i] / wh[i] for i in wh if wh[i] >= 50}          # 50+ war hits
    ch_rph = {i: ch_r[i] / ch_h[i] for i in ch_h if ch_h[i] >= 100}  # 100+ chain hits
    bigc = {}
    for c in chains:
        if c["length"] >= 1000:
            for a in c.get("attackers", []):
                if a["hits"] > 0:
                    bigc[a["id"]] = bigc.get(a["id"], 0) + 1
    chain_gain = sum(c.get("respect") or sum(a["respect"] for a in c.get("attackers", [])) for c in chains)
    return {"label": label, "start": start, "end": end,
            "war_reward": sum(w.get("reward", 0) for w in wars),
            "has_reward": any("reward" in w for w in wars),
            "chain_gain": chain_gain, "big_chain_n": sum(1 for c in chains if c["length"] >= 1000),
            "wins": sum(1 for r_ in war_rows if r_.get("won") is True),
            "losses": sum(1 for r_ in war_rows if r_.get("won") is False),
            "wars": war_rows, "n_wars": len(wars),
            "war_hits": sum(r["hits"] for r in war_rows), "war_respect": sum(r["respect"] for r in war_rows),
            "n_chains": len(chains), "chain_hits": sum(c["length"] for c in chains),
            "chain_respect": sum(a["respect"] for c in chains for a in c.get("attackers", [])),
            "big_chain": big["length"] if big else 0,
            "big_chains": sum(1 for c in chains if c["length"] >= 1000),
            "top_war_hits": top(wh), "top_war_resp": top(wr), "top_chain_hits": top(ch_h),
            "top_chain_resp": top(ch_r), "top_rets": top(rets, 3), "perfect": perfect,
            "top_single": top(single, 3), "top_war_rph": top(war_rph, 3), "top_chain_rph": top(ch_rph, 3),
            "top_bigc": top(bigc, 3), "top_bonus": top(bons, 3), "top_assists": top(asts, 3),
            "top_gym": [t for t in (gym_top or []) if t[1] > 0][:3]}


def recap_image(r: dict) -> bytes:
    import io
    pad, row_h = LB_CARD_PAD, 34
    ix, iw = CX0 + pad, CW - 2 * pad
    f_n, f_v = font("SemiBold", 23), font("Medium", 22)
    # awards: the headline ones from each leaderboard (gold / silver / bronze)
    aw = r.get("awards") or {}
    # one row per leaderboard (skipped if that board has no awards this month)
    board_of = {"WAR": "war", "CHAIN": "chain", "GYM": "gym", "ORGANIZED CRIMES": "oc"}
    award_rows = []
    for g_, ids in RECAP_AWARD_GROUPS:
        # preferred 3 first; if one has no data this month, fill the gap
        # with the next award from the same leaderboard (catalog order)
        pick = [k for k in ids if k in aw]
        pick += [k for k, *_ in AWARDS if k in aw and k not in pick and aw[k]["board"] == board_of[g_]
                 and k != "gym_nerd"]
        award_rows.append((g_, [aw[k] for k in pick[:3]]))
    award_rows = [(g_, lst) for g_, lst in award_rows if lst]
    awards = [a for _, lst in award_rows for a in lst]
    MEDALS = MEDAL_COLS
    perfect_rows = (len(r["perfect"]) + 3) // 4
    TH = 98                          # tile height in the head card
    broken = r.get("broken") or []
    BR_H = 168                       # broken-record tile height (bigger than awards)
    br_rows = (len(broken) + 1) // 2
    br_block = (28 + br_rows * (BR_H + 12) + 6) if broken else 0
    cards = [("head", LB_HEAD_H + 40 + 4 * (28 + TH + 10) + 2 * pad),
             ("awards", LB_HEAD_H + 6 + br_block + len(award_rows) * (28 + award_box_h(5) + 10) + 2 * pad),
             ("wars", LB_HEAD_H + 6 + 30 + max(1, len(r["wars"])) * row_h + 2 * pad),
             ("perfect", LB_HEAD_H + 30 + max(1, perfect_rows) * row_h + 2 * pad)]
    img, d = layer(PAD_TOP + sum(c[1] + LB_ROW_GAP for c in cards) + PAD_BOT - 10)
    y = PAD_TOP

    def head(title, colour=RED, rule=None):
        d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
        ty = y + pad
        draw_text(d, (ix + iw / 2, ty + 26), title, font("Bold", 26), colour, track=2, anchor="ms")
        d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
        if rule:
            draw_text(d, (ix + iw / 2, ty + LB_HEAD_H + 16), rule, font("Medium", 21), (140, 140, 142), anchor="ms")
            return ty + LB_HEAD_H + 30
        return ty + LB_HEAD_H + 6

    def tiles(ty, items, h=84):
        """items: (label, value[, sub line[, value colour]])"""
        tw = iw / len(items)
        for k, it in enumerate(items):
            lab, val = it[0], it[1]
            sub = it[2] if len(it) > 2 else ""
            col = it[3] if len(it) > 3 else TEXT
            cx = ix + tw * k + tw / 2
            d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + h], radius=8,
                                fill=(24, 12, 13, 255), outline=RULE, width=2)
            draw_text(d, (cx, ty + (42 if sub else 50)), val,
                      fit_font(val, "Bold", 34 if len(val) <= 10 else 28, tw - 30, 16), col, anchor="ms")
            if sub:
                draw_text(d, (cx, ty + 68), sub, fit_font(sub, "Medium", 18, tw - 24, 12), (150, 150, 152),
                          shadow=False, anchor="ms")
            draw_text(d, (cx, ty + h - 12), lab.upper(), font("SemiBold", 18), SUB, track=1, anchor="ms")

    def group(ty, label):
        """Small centred group heading between rule lines: --- WARS ---"""
        f = font("Bold", 18)
        lw = tracked_len(label, f, 3)
        draw_text(d, (ix + iw / 2, ty + 18), label, f, (196, 160, 90), track=3, anchor="ms")
        d.line([(ix + 6, ty + 11), (ix + iw / 2 - lw / 2 - 14, ty + 11)], fill=RULE, width=1)
        d.line([(ix + iw / 2 + lw / 2 + 14, ty + 11), (ix + iw - 6, ty + 11)], fill=RULE, width=1)
        return ty + 28

    for key, ch in cards:
        if key == "head":
            ty = head(f"{r['label'].upper()} RECAP")
            sub = (datetime.fromtimestamp(r["start"], timezone.utc).strftime("%b %d") + " - "
                   + datetime.fromtimestamp(r["end"] - 1, timezone.utc).strftime("%b %d, %Y"))
            draw_text(d, (ix + iw / 2, ty + 18), sub, font("Medium", 21), (150, 150, 152), anchor="ms")
            ty += 40
            # grouped rows: respect / wars / chains / crimes (TH = tile height)
            sg = lambda v: f"{'+' if v >= 0 else ''}{fmt_int(round(v))}"
            ty = group(ty, "RESPECT")
            if r.get("net_respect") is not None:
                fac = ("Faction Respect", sg(r["net_respect"]), "",
                       (120, 200, 120) if r["net_respect"] >= 0 else RED)
            else:
                fac = ("Faction Respect", fmt_int(r["respect_end"]) if r.get("respect_end") else "-")
            tiles(ty, [fac,
                       ("War Respect Gain", sg(r["war_reward"]) if r.get("has_reward") else "-"),
                       ("Chain Respect Gain", sg(r["chain_gain"])),
                       ("Crime Respect Gain", sg((r.get("oc") or {}).get("respect", 0)))], TH)
            ty += TH + 10
            ty = group(ty, "WARS")
            tiles(ty, [("Ranked Wars", f"{r['n_wars']}  ({r['wins']}W - {r['losses']}L)"),
                       ("War Hits", fmt_int(r["war_hits"]))], TH)
            ty += TH + 10
            ty = group(ty, "CHAINS")
            tiles(ty, [("Chains", str(r["n_chains"])),
                       ("Biggest Chain", fmt_int(r["big_chain"])),
                       ("Chain Hits", fmt_int(r["chain_hits"]))], TH)
            ty += TH + 10
            ty = group(ty, "ORGANIZED CRIMES")
            oc = r.get("oc") or {}
            tiles(ty, [("Crimes", f"{oc.get('won', 0)}/{oc.get('total', 0)}",
                        f"{round(100 * oc['won'] / oc['total'])}% success" if oc.get("total") else ""),
                       ("Crime Income", _short_money(oc.get("money", 0)))], TH)
        elif key == "awards":
            ty = head("AWARDS", (232, 190, 90))
            if broken:
                # RECORDS BROKEN: large gold tiles, 2 per row, only when any were broken
                ty = group(ty, "RECORDS BROKEN")
                hw = (iw - 12) / 2
                GOLD = (232, 190, 90)
                for k, b in enumerate(broken):
                    rr, cc = divmod(k, 2)
                    x0, y0 = ix + cc * (hw + 12), ty + rr * (BR_H + 12)
                    if len(broken) % 2 and k == len(broken) - 1:
                        x0 = ix + (iw - hw) / 2          # odd one out: centred
                    d.rounded_rectangle([x0, y0, x0 + hw, y0 + BR_H], radius=10, fill=(34, 22, 12, 255),
                                        outline=GOLD, width=3)
                    bw_ = font("Bold", 16).getlength("NEW RECORD") + 18
                    d.rounded_rectangle([x0 + hw / 2 - bw_ / 2, y0 + 10, x0 + hw / 2 + bw_ / 2, y0 + 34],
                                        radius=6, fill=GOLD)
                    draw_text(d, (x0 + hw / 2, y0 + 28), "NEW RECORD", font("Bold", 16), (40, 24, 8),
                              shadow=False, anchor="ms")
                    t = b["title"].upper()
                    draw_text(d, (x0 + hw / 2, y0 + 64), t, fit_font(t, "Bold", 24, hw - 30, 14), GOLD,
                              track=1, anchor="ms")
                    v = b["value"]
                    draw_text(d, (x0 + hw / 2, y0 + 108), v, fit_font(v, "Bold", 46, hw - 40, 20),
                              (250, 235, 190), anchor="ms")
                    who = f"{b['holder']} · {b['when']}"
                    draw_text(d, (x0 + hw / 2, y0 + 136), who, fit_font(who, "SemiBold", 22, hw - 30, 13), TEXT,
                              anchor="ms")
                    if b.get("prev_value"):
                        pv = f"Previous: {b['prev_value']} ({b['prev_holder']})"
                        draw_text(d, (x0 + hw / 2, y0 + 158), pv, fit_font(pv, "Medium", 18, hw - 30, 12),
                                  (150, 150, 152), shadow=False, anchor="ms")
                ty += br_rows * (BR_H + 12) + 6
            tw = iw / 3
            for g_, lst in award_rows:
                ty = group(ty, g_)
                for cc, a in enumerate(lst):
                    draw_award_box(d, ix + cc * tw + 6, ty, tw - 12, a, 5)
                ty += award_box_h(5) + 10
        elif key == "wars":
            ty = head("RANKED WARS")
            cols = [("ENDED", ix + 6, "l"), ("OPPONENT", ix + 100, "l"), ("SCORE", ix + 560, "r"),
                    ("PARTICIPATION", ix + 740, "r"), ("HITS", ix + 840, "r"), ("TOP HITTER", ix + 870, "l")]
            fh = font("SemiBold", 17)
            for lab, x, al in cols:
                draw_text(d, (x - (tracked_len(lab, fh, 1) if al == "r" else 0), ty + 20), lab, fh, SUB,
                          track=1, shadow=False)
            for k, w in enumerate(r["wars"]):
                base = ty + 30 + k * row_h + 23
                if k % 2 == 0:
                    d.rectangle([ix, base - 23, ix + iw, base + 9], fill=(255, 255, 255, 10))
                res = ("W " if w["won"] else "L ") if w.get("won") is not None else ""
                vals = [datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d"),
                        w.get("opponent") or "-", res + (w.get("score") or ""),
                        f"{w['hit']}/{w['present']} ({round(100 * w['hit'] / w['present'])}%)",
                        fmt_int(w["hits"]), w["top"]]
                widths = [None, 300, None, None, None, iw - 876]
                for (lab, x, al), v, mw in zip(cols, vals, widths):
                    fnt = fit_font(v, "Medium", 22, mw, 13) if mw else f_v
                    col = ((120, 200, 120) if w.get("won") else RED) if lab == "SCORE" and res else TEXT
                    draw_text(d, (x - (fnt.getlength(v) if al == "r" else 0), base), v, fnt, col, shadow=False)
            if not r["wars"]:
                draw_text(d, (ix + iw / 2, ty + 54), "None", f_n, SUB, anchor="ms")
        elif key == "perfect":
            ty = head(f"PERFECT WAR ATTENDANCE  ({len(r['perfect'])})", (120, 200, 120),
                      "Hit in every ranked war this period")
            cw = (iw - 90) / 4
            for k, nm in enumerate(r["perfect"]):
                rr, cc = divmod(k, 4)
                draw_text(d, (ix + cc * (cw + 30) + 4, ty + rr * row_h + 24), nm,
                          fit_font(nm, "SemiBold", 23, cw - 8, 13), TEXT)
            if not r["perfect"]:
                draw_text(d, (ix + iw / 2, ty + 24), "None", f_n, SUB, anchor="ms")
        y += ch + LB_ROW_GAP
    # split into framed images like the announcement: 1) header + totals
    # (Monthly Recap header art), 2) awards, 3) ranked wars + perfect attendance
    tops = []
    yy = PAD_TOP
    for key, ch in cards:
        tops.append((key, yy, ch))
        yy += ch + LB_ROW_GAP
    groups = [["head"], ["awards"], ["wars", "perfect"]]
    parts = []
    for g_ in groups:
        sel = [t for t in tops if t[0] in g_]
        y0, y1 = sel[0][1] - 18, sel[-1][1] + sel[-1][2] + 18
        part = img.crop((0, max(0, y0), img.width, y1))
        parts.append(frame_png(part, "Monthly Recap" if g_[0] == "head" else None))
    return parts


# ---- Recap detail panels (newsletter buttons) ----------------------------
MEDAL_COLS = [(232, 190, 90), (192, 196, 204), (205, 127, 70)]


def recap_detail(start: int, end: int, whist: dict, chist: dict, members: list,
                 meta: dict = None, gym_gains: dict = None, gym_month: str = None,
                 crimes: dict = None) -> dict:
    """Per-member and per-war/chain breakdowns for the month, used by the
    War/Chain/Gym Leaderboard and War/Chain Summary panels."""
    meta = meta or {}
    names = {m.get("id"): m.get("name", "?") for m in members}
    cur = set(names)
    nm = lambda i: names.get(i, f"[{i}]")
    wars = sorted((dict(w, _id=k) for k, w in whist.get("wars", {}).items() if start <= w["end"] < end),
                  key=lambda w: w["end"])
    chains = sorted((dict(c, _id=k) for k, c in chist.get("chains", {}).items() if start <= c["end"] < end),
                    key=lambda c: c["end"])
    # --- wars
    wl = {}
    war_cards = []
    for w in wars:
        ms = w["members"]
        for m in ms:
            t = wl.setdefault(m["id"], {"name": m.get("name") or nm(m["id"]), "in": 0, "hit": 0, "hits": 0,
                                        "resp": 0.0, "best": 0, "resp_nb": 0.0, "hits_nb": 0})
            t["in"] += 1; t["hit"] += m["attacks"] > 0; t["hits"] += m["attacks"]; t["resp"] += m["score"]
            r_nb, h_nb = nb(m)                 # Respect / Hit (chain bonus respect included)
            t["resp_nb"] += r_nb; t["hits_nb"] += h_nb
            t["best"] = max(t["best"], m["attacks"])
            t["low"] = min(t.get("low", m["attacks"]), m["attacks"])
            t["n_month"] = len(wars)
        mt = meta.get(str(w["_id"]), {})
        war_cards.append({"end": w["end"], "start": w.get("start"), "opponent": mt.get("opponent", "Unknown"),
                          "won": mt.get("won"), "our": mt.get("our"), "their": mt.get("their"),
                          "rank": w.get("rank") or {}, "present": len(ms), "hit": sum(m["attacks"] > 0 for m in ms),
                          "hits": sum(m["attacks"] for m in ms), "resp": sum(m["score"] for m in ms),
                          "top_hits": [(m.get("name", "?"), m["attacks"]) for m in
                                       sorted(ms, key=lambda m: -m["attacks"])[:5] if m["attacks"]],
                          "top_resp": [(m.get("name", "?"), m["score"]) for m in
                                       sorted(ms, key=lambda m: -m["score"])[:5] if m["score"]],
                          "missed": sorted((m.get("name", "?") for m in ms if m["attacks"] == 0), key=str.lower)})
    war_board = sorted((dict(v, id=i) for i, v in wl.items() if i in cur),   # opted-out members included (report)
                       key=lambda v: (-v["hits"], -v["resp"]))
    # habitual war slackers: current members with no hits in 2+ of the month's wars
    habitual = sorted(((v["name"], v["in"] - v["hit"], v["in"]) for i, v in wl.items()
                       if i in cur and v["in"] - v["hit"] >= 2), key=lambda t: (-t[1], t[0].lower()))
    # --- chains
    cl = {}
    chain_rows = []
    for c in chains:
        att = c.get("attackers", [])
        for a in att:
            t = cl.setdefault(a["id"], {"name": nm(a["id"]), "chains": 0, "big": 0, "hits": 0, "resp": 0.0,
                                        "rets": 0, "assists": 0, "bonus": 0, "war": 0})
            t["war"] += a.get("war", 0)
            if a["hits"] > 0:
                t["chains"] += 1; t["big"] += c["length"] >= 1000
            t["hits"] += a["hits"]; t["resp"] += a["respect"]; t["rets"] += a.get("rets", 0)
            t["assists"] += a.get("assists") or 0
        for b in c.get("bonuses", []):
            t = cl.setdefault(b["id"], {"name": nm(b["id"]), "chains": 0, "big": 0, "hits": 0, "resp": 0.0,
                                        "rets": 0, "assists": 0, "bonus": 0, "war": 0})
            t["bonus"] += 1
            t["bonus_resp"] = t.get("bonus_resp", 0.0) + b.get("respect", 0)   # recorded (bonus respect counts in every figure)
        top = max(att, key=lambda a: a["hits"]) if att else None
        chain_rows.append({"end": c["end"], "start": c.get("start"), "length": c["length"],
                           "dur": (c["end"] - c["start"]) if c.get("start") else 0,
                           "resp": sum(a["respect"] for a in att), "hitters": sum(a["hits"] > 0 for a in att),
                           "top": (nm(top["id"]), top["hits"]) if top else ("-", 0),
                           "top_hits": [(nm(a["id"]), a["hits"]) for a in sorted(att, key=lambda a: -a["hits"])[:5]],
                           "top_resp": [(nm(a["id"]), a["respect"]) for a in sorted(att, key=lambda a: -a["respect"])[:5]],
                           "rets": sum(a.get("rets", 0) for a in att)})
    chain_board = sorted((dict(v, id=i) for i, v in cl.items() if i in cur), key=lambda v: (-v["hits"], -v["resp"]))   # opted out included (report)
    # --- gym (energy trained in the month, per stat)
    # --- gym: {stat: {member id: energy trained this period}}
    gym_board = []
    for i in cur:                            # opted-out members included (the recap is a report)
        row = {"name": names[i], "id": i}
        for st, _ in GYM_STATS:
            row[st] = int((gym_gains or {}).get(st, {}).get(str(i), 0))
        if row["gymtotal"] > 0:
            gym_board.append(row)
    gym_board.sort(key=lambda r: -r["gymtotal"])
    # every current member (incl. 0 energy) - for the Book Nerds award; only
    # when the period has gym data at all
    gym_all = []
    if gym_gains:
        for i in cur:
            gym_all.append({"name": names[i], "id": i,
                            "gymtotal": int(gym_gains.get("gymtotal", {}).get(str(i), 0))})
    # --- organized crimes executed this period
    call = (crimes or {}).get("crimes", {})
    # member income: the faction keeps CRIME_TAX (20%), the rest is split evenly between everyone in the crime
    # AND its prerequisite crime(s) (crime_shares - e.g. No Reserve's members share Bidding War's payout)
    sh_ = [{"id": int(k) if str(k).isdigit() else k, "prev": v.get("prev"), "money": v.get("money", 0),
            "status": v.get("status"), "name": v.get("name"), "m": v.get("members", [])} for k, v in call.items()]
    crime_shares(sh_)
    share_of = {str(x["id"]): x["share"] for x in sh_}
    oc = [dict(c, _id=k) for k, c in call.items() if start <= c["executed_at"] < end]
    ol = {}
    for c in oc:
        ok = str(c.get("status", "")).lower().startswith("success")
        share = share_of.get(str(c["_id"]), 0)
        for i in c["members"]:
            t = ol.setdefault(i, {"name": nm(i), "crimes": 0, "won": 0, "lost": 0, "diff": 0, "money": 0.0,
                                  "respect": 0.0})
            t["crimes"] += 1
            if ok:
                t["won"] += 1; t["diff"] += int(c.get("difficulty") or 0); t["money"] += share
                t["respect"] += c["respect"] / max(1, len(c["members"]))
            else:
                t["lost"] += 1
    for v in ol.values():
        v["avgd"] = v["diff"] / v["won"] if v["won"] else 0
    oc_board = sorted((dict(v, id=i) for i, v in ol.items() if i in cur),
                      key=lambda v: (-v["money"], -v["won"], -v["avgd"]))
    oc_sum = {"total": len(oc), "won": sum(1 for c in oc if str(c.get("status", "")).lower().startswith("success")),
              "money": sum(c["money"] for c in oc), "respect": sum(c["respect"] for c in oc),
              "by_name": {}}
    oc_sum["diff"] = sum(int(c.get("difficulty") or 0) for c in oc
                         if str(c.get("status", "")).lower().startswith("success"))
    for c in oc:
        t = oc_sum["by_name"].setdefault(c["name"], [0, 0, c.get("difficulty") or 0, 0, 0, False])
        okc = str(c.get("status", "")).lower().startswith("success")
        t[0] += 1; t[1] += okc; t[3] += c["money"]
        if okc:
            t[4] += c.get("items") or 0
            t[5] = t[5] or "items" in c      # item data known for this crime
    return {"wars": war_cards, "war_board": war_board, "chains": chain_rows, "chain_board": chain_board,
            "gym_board": gym_board, "gym_all": gym_all, "gym_month": gym_month, "oc_board": oc_board,
            "oc": oc_sum, "habitual": habitual,
            # everyone who took part (incl. members who left) - leaderboard totals
            "war_all": list(wl.values()), "chain_all": list(cl.values()), "oc_all": list(ol.values()),
            "war_single": {}}


def frame_png(content: Image.Image, title: str = None, fmt: str = "PNG", bar: str = None) -> bytes:
    """Wrap a content layer (width W, drawn between CX0..CX1) in the faction
    frame used by the description banner / announcement: compact header art
    with `title` (or just the frame top when title is None), the red body
    panel, and the frame bottom. Returns image bytes."""
    import io
    body = body_strip(content.height + 12)
    body.alpha_composite(content)
    if title:
        head = [compact_header(title)]           # big Heart Breakers header art
    elif bar:
        top = piece("section_top")               # frame top + section title bar
        draw_text(ImageDraw.Draw(top), (136, 76), bar.upper(), font("Bold", 52), TITLE, track=3)
        head = [frame_top(), top]
    else:
        head = [frame_top()]
    blocks = head + [body, final_end()]
    im = Image.new("RGBA", (W, sum(b.height for b in blocks)), (0, 0, 0, 0))
    y = 0
    for b in blocks:
        im.alpha_composite(b, (0, y))
        y += b.height
    im = pad_transparent(cut_outside_frame(im), OUTER_PAD)
    if im.height > 16383 and fmt == "WEBP":
        im = im.resize((int(im.width * 16383 / im.height), 16383), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, fmt, optimize=True) if fmt == "PNG" else im.save(buf, fmt, quality=90, method=6)
    return buf.getvalue()


def stack_pngs(parts: list) -> bytes:
    """Several framed PNGs stacked into one image (archive / full copy)."""
    import io
    ims = [Image.open(io.BytesIO(p)) for p in parts]
    out = Image.new("RGBA", (max(i.width for i in ims), sum(i.height for i in ims)), (0, 0, 0, 0))
    y = 0
    for i in ims:
        out.alpha_composite(i.convert("RGBA"), (0, y))
        y += i.height
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _panel_out(img, bar: str = None) -> bytes:
    """Recap pages: the same faction frame + title bar as the announcement images."""
    return frame_png(img, bar=bar)


def _panel_out_plain(img) -> bytes:
    import io
    crop = img.crop((CX0 - 12, 0, CX1 + 12, img.height))
    bg = Image.new("RGBA", crop.size, (16, 10, 11, 255))
    bg.alpha_composite(crop)
    buf = io.BytesIO()
    bg.convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


class _Canvas:
    """Tiny helper: stacked cards on a tall layer (sized after a dry run)."""
    def __init__(self, height):
        self.img, self.d = layer(height)
        self.y = PAD_TOP

    def card(self, h, title, colour=RED, sub=None):
        d, pad = self.d, LB_CARD_PAD
        ix, iw = CX0 + pad, CW - 2 * pad
        d.rounded_rectangle([CX0, self.y, CX1, self.y + h], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
        ty = self.y + pad
        draw_text(d, (ix + iw / 2, ty + 26), title, font("Bold", 26), colour, track=2, anchor="ms")
        d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
        ty += LB_HEAD_H + 6
        if sub:
            draw_text(d, (ix + iw / 2, ty + 14), sub, font("Medium", 21), (150, 150, 152), anchor="ms")
            ty += 30
        return ty

    def tiles(self, ty, items, h=84):
        d, ix, iw = self.d, CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
        tw = iw / len(items)
        for k, it in enumerate(items):
            lab, val = it[0], it[1]
            col = it[2] if len(it) > 2 else TEXT
            cx = ix + tw * k + tw / 2
            d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + h], radius=8,
                                fill=(24, 12, 13, 255), outline=RULE, width=2)
            # long values (e.g. $1,165,111,000) get a smaller font so they sit inside the tile
            draw_text(d, (cx, ty + h * 0.52), val,
                      fit_font(val, "Bold", 32 if len(val) <= 10 else 25, tw - 32, 14), col, anchor="ms")
            draw_text(d, (cx, ty + h - 12), lab.upper(), font("SemiBold", 17), SUB, track=1, anchor="ms")
        return ty + h + 12

    def table(self, ty, cols, rows, x0=None, w=None, row_h=32, medals=True, start_rank=1, name_label="NAME",
              total=None, ranks=True):
        """cols: [(label, width, fmt)] after the NAME column; rows: [(name, [values])].
        total: optional (label, [values]) drawn as a highlighted last row -
        totals over EVERYONE (incl. members not listed), averages for %s."""
        d = self.d
        x0 = CX0 + LB_CARD_PAD if x0 is None else x0
        w = CW - 2 * LB_CARD_PAD if w is None else w
        fr, fh = font("Medium", 21), font("SemiBold", 16)
        rights, xr = [], x0 + w - 6
        for lab, cw in reversed(cols):
            rights.insert(0, xr); xr -= cw
        name_w = xr - (x0 + 46) - 8
        draw_text(d, (x0 + 46, ty + 18), name_label, fh, SUB, track=1, shadow=False)
        for (lab, cw), rx in zip(cols, rights):
            draw_text(d, (rx - tracked_len(lab, fh, 1), ty + 18), lab, fh, SUB, track=1, shadow=False)
        for k, row in enumerate(rows):
            # optional 3rd item = highlight colour for the whole row (e.g. receipt: payout not found in vault)
            name, vals, hl = row[0], row[1], (row[2] if len(row) > 2 else None)
            base = ty + 28 + k * row_h + 23
            if hl:
                d.rectangle([x0, base - 23, x0 + w, base + 9], fill=hl[:3] + (45,))
            elif k % 2 == 0:
                d.rectangle([x0, base - 23, x0 + w, base + 9], fill=(255, 255, 255, 10))
            rank = start_rank + k
            if medals and rank <= 3:
                cy = base - 8
                d.ellipse([x0 + 8, cy - 11, x0 + 30, cy + 11], fill=MEDAL_COLS[rank - 1])
                draw_text(d, (x0 + 19, cy + 6), str(rank), font("Bold", 15), (30, 15, 15), shadow=False, anchor="ms")
            elif ranks:  # ranks=False: plain list (e.g. receipt Metrics), no "1." numbers
                draw_text(d, (x0 + 6, base), f"{rank}.", fr, SUB, shadow=False)
            draw_text(d, (x0 + 46, base), name, fit_font(name, "SemiBold", 22, name_w, 13),
                      hl or ((245, 225, 170) if medals and rank == 1 else TEXT), shadow=False)
            for v, rx in zip(vals, rights):
                draw_text(d, (rx - fr.getlength(v), base), v, fr, hl or TEXT, shadow=False)
        if total:
            base = ty + 28 + len(rows) * row_h + 10 + 23
            d.line([(x0, base - 30), (x0 + w, base - 30)], fill=(232, 190, 90), width=2)
            d.rectangle([x0, base - 27, x0 + w, base + 9], fill=(232, 190, 90, 26))
            fb = font("Bold", 21)
            draw_text(d, (x0 + 46, base), total[0], font("Bold", 20), (232, 190, 90), track=2, shadow=False)
            for v, rx in zip(total[1], rights):
                draw_text(d, (rx - fb.getlength(v), base), v, fb, (245, 225, 170), shadow=False)
            return ty + 28 + len(rows) * row_h + 10 + row_h + 6
        return ty + 28 + len(rows) * row_h + 6

    def two_lists(self, ty, left, right, row_h=32):
        """Side-by-side top-5 lists: (title, [(name, value_str)])."""
        d, ix, iw = self.d, CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
        half = (iw - 30) / 2
        f = font("Medium", 21)
        n = 0
        for col, (title, lst) in enumerate([left, right]):
            x = ix + col * (half + 30)
            draw_text(d, (x + half / 2, ty + 22), title.upper(), font("Bold", 20), TITLE, track=2, anchor="ms")
            d.line([(x + 4, ty + 32), (x + half - 4, ty + 32)], fill=RULE, width=2)
            for k, (nme, v) in enumerate(lst):
                base = ty + 40 + k * row_h + 22
                draw_text(d, (x + 4, base), f"{k + 1}.", f, MEDAL_COLS[k] if k < 3 else SUB, shadow=False)
                draw_text(d, (x + 36, base), nme, fit_font(nme, "SemiBold", 22, half - 140, 13), TEXT, shadow=False)
                draw_text(d, (x + half - 4 - f.getlength(v), base), v, f, TEXT, shadow=False)
            n = max(n, len(lst))
        return ty + 40 + n * row_h + 8

    def wrap_names(self, ty, label, nms, colour=RED):
        d, ix, iw = self.d, CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
        f = font("Medium", 20)
        text = f"{label}: " + (", ".join(nms) if nms else "None")
        lines = wrap(text, f, iw - 12)
        for k, ln in enumerate(lines):
            draw_text(d, (ix + 6, ty + 22 + k * 28), ln, f, colour if k == 0 and not nms else SUB, shadow=False)
        return ty + 14 + len(lines) * 28


def _height_of(draw_fn) -> int:
    """Run a panel's drawing on a huge throwaway canvas to measure it."""
    c = _Canvas(12000)
    draw_fn(c)
    return c.y + PAD_BOT


def _render(draw_fn, bar: str = None) -> bytes:
    c = _Canvas(_height_of(draw_fn))
    draw_fn(c)
    return _panel_out(c.img, bar)


def panel_war_board(r: dict, label: str, aw: dict = None) -> bytes:
    rows = [(v["name"], [f"{v['hit']}/{v['in']}", fmt_int(v["hits"]), fmt_int(round(v["resp"])),
                         f"{v['hits'] / v['in']:.0f}", f"{v['resp_nb'] / v['hits_nb']:.1f}" if v["hits_nb"] else "-",
                         f"{round(100 * v['hit'] / v['in'])}%"]) for v in r["war_board"]]
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 28 + (len(rows) + 1) * 32 + 10 + 6 + 2 * LB_CARD_PAD
        if aw:
            draw_awards(c, board_awards(aw, "war"))
        ty = c.card(h, "WAR LEADERBOARD", sub=f"{label} · {len(r['wars'])} ranked wars · sorted by hits")
        A = r.get("war_all") or []
        th, tr = sum(v["hits"] for v in A), sum(v["resp"] for v in A)
        ti, tht = sum(v["in"] for v in A), sum(v["hit"] for v in A)
        c.table(ty, [("WARS", 70), ("HITS", 80), ("RESPECT", 100), ("HITS/WAR", 100), ("RESP/HIT", 100),
                     ("ATTEND", 86)], rows,
                total=("TOTAL / AVG", [str(len(r["wars"])), fmt_int(th), fmt_int(round(tr)),
                                 f"{th / ti:.0f}" if ti else "-", f"{tr / th:.1f}" if th else "-",
                                 f"{round(100 * tht / ti)}%" if ti else "-"]))
        c.y += h + LB_ROW_GAP
    return _render(draw, "War Leaderboard")


def panel_chain_board(r: dict, label: str, aw: dict = None) -> bytes:
    show_ast = any(v["assists"] for v in r["chain_board"])
    show_bon = any(v["bonus"] for v in r["chain_board"])
    rows = [(v["name"], [str(v["chains"]), fmt_int(v["hits"]), fmt_int(round(v["resp"])),
                         f"{v['resp'] / v['hits']:.1f}" if v["hits"] > 0 else "-", fmt_int(v["rets"])]
             + ([fmt_int(v["assists"])] if show_ast else []))
            for v in r["chain_board"]]
    cols = [("CHAINS", 86), ("HITS", 86), ("RESPECT", 106), ("AVG", 70), ("RETALS", 86)] \
        + ([("ASSISTS", 96)] if show_ast else [])
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 28 + (len(rows) + 1) * 32 + 10 + 6 + 2 * LB_CARD_PAD
        if aw:
            draw_awards(c, board_awards(aw, "chain"))
        ty = c.card(h, "CHAIN LEADERBOARD",
                    sub=f"{label} · {len(r['chains'])} chains")
        A = r.get("chain_all") or []
        th, tr = sum(v["hits"] for v in A), sum(v["resp"] for v in A)
        c.table(ty, cols, rows,
                total=("TOTAL / AVG", [str(len(r["chains"])), fmt_int(th), fmt_int(round(tr)),
                                 f"{tr / th:.1f}" if th else "-", fmt_int(sum(v["rets"] for v in A))]
                       + ([fmt_int(sum(v["assists"] for v in A))] if show_ast else [])))
        c.y += h + LB_ROW_GAP
    return _render(draw, "Chain Leaderboard")


def panel_gym_board(r: dict, label: str, aw: dict = None) -> bytes:
    rows = [(v["name"], [fmt_int(v["gymstrength"]), fmt_int(v["gymspeed"]), fmt_int(v["gymdefense"]),
                         fmt_int(v["gymdexterity"]), fmt_int(v["gymtotal"])]) for v in r["gym_board"]]
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 28 + (max(1, len(rows)) + 1) * 32 + 10 + 6 + 2 * LB_CARD_PAD
        if aw:
            draw_awards(c, board_awards(aw, "gym"))
        ty = c.card(h, "GYM LEADERBOARD", colour=(232, 190, 90),
                    sub=f"{r.get('gym_month') or label} · energy trained while in the faction")
        G = r["gym_board"]
        c.table(ty, [("STRENGTH", 120), ("SPEED", 120), ("DEFENSE", 120), ("DEXTERITY", 120), ("TOTAL", 130)], rows,
                total=("TOTAL", [fmt_int(sum(v[st] for v in G)) for st in
                                 ("gymstrength", "gymspeed", "gymdefense", "gymdexterity", "gymtotal")]))
        c.y += h + LB_ROW_GAP
    return _render(draw, "Gym Leaderboard")


def panel_war_summary(r: dict, label: str) -> bytes:
    wars = r["wars"]
    won = sum(1 for w in wars if w["won"]); lost = sum(1 for w in wars if w["won"] is False)
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 96 + 2 * LB_CARD_PAD
        ty = c.card(h, "WAR SUMMARY", sub=label)
        att = [w["hit"] / w["present"] for w in wars if w["present"]]
        c.tiles(ty, [("Wars", str(len(wars))), ("Record", f"{won}W - {lost}L"),
                     ("Hits", fmt_int(sum(w["hits"] for w in wars))),
                     ("Respect", fmt_int(round(sum(w["resp"] for w in wars)))),
                     ("Avg Attendance", f"{round(100 * sum(att) / len(att))}%" if att else "-")])
        c.y += h + LB_ROW_GAP
        # habitual war slackers: no hits in 2+ of this month's wars
        hb = r.get("habitual", [])
        hrows = (len(hb) + 3) // 4
        h = LB_HEAD_H + 6 + 30 + max(1, hrows) * 34 + 2 * LB_CARD_PAD
        ty = c.card(h, f"HABITUAL WAR SLACKERS  ({len(hb)})", colour=RED,
                    sub="No hits in 2 or more of this month's ranked wars")
        cw4 = (CW - 2 * LB_CARD_PAD - 90) / 4
        for k, (nme, miss, tot) in enumerate(hb):
            rr, cc = divmod(k, 4)
            x = CX0 + LB_CARD_PAD + cc * (cw4 + 30)
            base = ty + rr * 34 + 24
            v = f"{miss}/{tot}"
            fv = font("Medium", 20)
            draw_text(c.d, (x + 4, base), nme, fit_font(nme, "SemiBold", 22, cw4 - fv.getlength(v) - 16, 13), TEXT)
            draw_text(c.d, (x + cw4 - 4 - fv.getlength(v), base), v, fv, RED)
        if not hb:
            draw_text(c.d, (W / 2, ty + 24), "None", font("SemiBold", 22), SUB, anchor="ms")
        c.y += h + LB_ROW_GAP
        for w in wars:
            n = max(len(w["top_hits"]), len(w["top_resp"]), 1)
            mnames = w["missed"]
            miss_lines = len(wrap("War Slackers: " + (", ".join(mnames) or "None"), font("Medium", 20), CW - 40))
            h = LB_HEAD_H + 6 + 30 + 96 + 40 + n * 32 + 8 + 14 + miss_lines * 28 + 2 * LB_CARD_PAD
            res = "VICTORY" if w["won"] else ("DEFEAT" if w["won"] is False else "WAR")
            col = (120, 200, 120) if w["won"] else (RED if w["won"] is False else TITLE)
            dates = (datetime.fromtimestamp(w["start"], timezone.utc).strftime("%b %d") + " - "
                     if w.get("start") else "") + datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d")
            rk = w["rank"]
            rank = (f"{rk.get('before')} > {rk.get('after')}" if rk.get("before") != rk.get("after")
                    else str(rk.get("after", "-")))
            ty = c.card(h, f"{res} VS {w['opponent'].upper()}", colour=col,
                        sub=f"{dates} · {_dur(w.get('start'), w['end'])} · Rank {rank}")
            score = f"{fmt_int(w['our'])} - {fmt_int(w['their'])}" if w.get("our") is not None else "-"
            ty = c.tiles(ty, [("Score", score, col), ("Participation",
                              f"{w['hit']}/{w['present']} ({round(100 * w['hit'] / w['present'])}%)"),
                              ("Hits", fmt_int(w["hits"])), ("Respect", fmt_int(round(w["resp"])))])
            ty = c.two_lists(ty, ("Top Hits", [(a, fmt_int(b)) for a, b in w["top_hits"]]),
                             ("Top Respect", [(a, fmt_int(round(b))) for a, b in w["top_resp"]]))
            c.wrap_names(ty, "War Slackers", mnames)
            c.y += h + LB_ROW_GAP
    return _render(draw, "War Summary")


def panel_chain_summary(r: dict, label: str, big_min: int = 500, table_min: int = 50) -> bytes:
    ch = r["chains"]
    listed = sorted((x for x in ch if x["length"] >= table_min), key=lambda x: (-x["length"], x["end"]))
    small = [x for x in ch if x["length"] < table_min]
    big = sorted((x for x in ch if x["length"] >= big_min), key=lambda x: -x["length"])   # detail cards
    longest = max(ch, key=lambda x: x.get("dur", 0), default=None)
    half = (len(listed) + 1) // 2
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 96 + 2 * LB_CARD_PAD
        ty = c.card(h, "CHAIN SUMMARY", sub=label)
        c.tiles(ty, [("Chains", str(len(ch))), ("Hits", fmt_int(sum(x["length"] for x in ch))),
                     ("Respect", fmt_int(round(sum(x["resp"] for x in ch)))),
                     ("Biggest", fmt_int(max((x["length"] for x in ch), default=0))),
                     ("Longest", _dur(longest.get("start"), longest["end"]) if longest and longest.get("dur") else "-")])
        c.y += h + LB_ROW_GAP
        # every chain (50+) in two halves
        h = LB_HEAD_H + 6 + 30 + 28 + max(1, half) * 32 + 6 + 2 * LB_CARD_PAD
        ty = c.card(h, f"ALL CHAINS {table_min}+  ({len(listed)})",
                    sub=f"Plus {len(small)} smaller chains ({sum(x['length'] for x in small):,} hits)" if small else None)
        hw = (CW - 2 * LB_CARD_PAD - 30) / 2
        for side in range(2):
            part = listed[side * half:(side + 1) * half]
            c.table(ty, [("HITS", 80), ("RESPECT", 100), ("MEMBERS", 96), ("DURATION", 110)],
                    [(datetime.fromtimestamp(x["end"], timezone.utc).strftime("%b %d"),
                      [fmt_int(x["length"]), fmt_int(round(x["resp"])), str(x["hitters"]),
                       _dur(x.get("start"), x["end"]) if x.get("dur") else "-"]) for x in part],
                    x0=CX0 + LB_CARD_PAD + side * (hw + 30), w=hw, medals=False, start_rank=side * half + 1,
                    name_label="ENDED")
        c.y += h + LB_ROW_GAP
        for x in big:
            n = max(len(x["top_hits"]), 1)
            h = LB_HEAD_H + 6 + 30 + 96 + 40 + n * 32 + 8 + 2 * LB_CARD_PAD
            dates = (datetime.fromtimestamp(x["start"], timezone.utc).strftime("%b %d") + " - "
                     if x.get("start") else "Ended ") + datetime.fromtimestamp(x["end"], timezone.utc).strftime("%b %d")
            ty = c.card(h, f"CHAIN {fmt_int(x['length'])}", sub=dates + (f" · {_dur(x.get('start'), x['end'])}"
                                                                         if x.get("start") else ""))
            ty = c.tiles(ty, [("Hits", fmt_int(x["length"])), ("Respect", fmt_int(round(x["resp"]))),
                              ("Members Involved", str(x["hitters"])), ("Retaliations", str(x["rets"]))])
            c.two_lists(ty, ("Top Hits", [(a, fmt_int(b)) for a, b in x["top_hits"]]),
                        ("Top Respect", [(a, fmt_int(round(b))) for a, b in x["top_resp"]]))
            c.y += h + LB_ROW_GAP
    return _render(draw, "Chain Summary")


# Award catalog: id -> (board, title, value(row), rows key, min filter, decimals)
AWARDS = [
    ("war_hits", "war", "Top War Hitter", "war_board", lambda v: v["hits"], None, 0),
    ("war_resp", "war", "Top War Respect", "war_board", lambda v: v["resp"], None, 0),
    ("war_single", "war", "Best Single War", "war_board", lambda v: v["best"], None, 0),
    ("war_rph", "war", "War Respect / Hit", "war_board", lambda v: v["resp_nb"] / v["hits_nb"] if v["hits_nb"] else 0,
     lambda v: v["hits_nb"] >= 50, 1),
    ("war_attend", "war", "Iron Heart", "war_board", lambda v: v["low"],
     lambda v: v["hit"] == v["in"] and v["in"] == v["n_month"], 0),
    ("chain_hits", "chain", "Top Chain Hitter", "chain_board", lambda v: v["hits"], None, 0),
    ("chain_resp", "chain", "Top Chain Respect", "chain_board", lambda v: v["resp"], None, 0),
    ("chain_rph", "chain", "Chain Respect / Hit", "chain_board",
     lambda v: v["resp"] / v["hits"] if v["hits"] > 0 else 0,       # chain bonus respect included (Nov 2026)
     lambda v: v["hits"] >= 100, 1),
    ("rets", "chain", "Most Retaliations", "chain_board", lambda v: v["rets"], None, 0),
    ("chain_war", "chain", "War Chainer", "chain_board", lambda v: v["war"], None, 0),
    ("assists", "chain", "Team Player", "chain_board", lambda v: v["assists"], None, 0),
    ("gym_total", "gym", "Gym Rat", "gym_board", lambda v: v["gymtotal"], None, 0),
    ("gym_str", "gym", "Strength", "gym_board", lambda v: v["gymstrength"], None, 0),
    ("gym_spd", "gym", "Speed", "gym_board", lambda v: v["gymspeed"], None, 0),
    ("gym_def", "gym", "Defense", "gym_board", lambda v: v["gymdefense"], None, 0),
    ("gym_dex", "gym", "Dexterity", "gym_board", lambda v: v["gymdexterity"], None, 0),
    ("gym_nerd", "gym", "Book Nerds", "gym_all", lambda v: v["gymtotal"], None, "asc"),
    ("oc_boss", "oc", "Crime Boss", "oc_board", lambda v: v["won"] + v["avgd"] / 100, None, "boss"),
    ("oc_mind", "oc", "Mastermind", "oc_board", lambda v: v["diff"], None, 0),
    ("oc_clean", "oc", "Clean Getaway", "oc_board", lambda v: v["won"] / v["crimes"] * 1000 + v["won"],
     lambda v: v["crimes"] >= 5, "count"),
    ("oc_money", "oc", "Big Earner", "oc_board", lambda v: v["money"], None, "money"),
]
# Award names + how to earn them (shown under each award). Override per
# award in config.json: recap.awards.<id> = {"name": ..., "desc": ...}
AWARD_TEXT = {
    "war_hits": ("War Machine", "Most hits across all ranked wars"),
    "war_resp": ("Respect Reaper", "Most respect earned in ranked wars"),
    "war_single": ("One-Man Army", "Most hits in a single ranked war"),
    "war_rph": ("Sharpshooter", "Best respect per war hit (50+ war hits)"),
    "war_attend": ("Iron Heart", "Most hits in their weakest war (must hit in every war)"),
    "chain_hits": ("Chain Champion", "Most chain hits"),
    "chain_resp": ("Respect Magnet", "Most respect earned from chain hits"),
    "chain_rph": ("Precision Striker", "Best respect per chain hit (100+ chain hits)"),
    "rets": ("Avenger", "Most retaliation hits during chains"),
    "chain_war": ("War Chainer", "Most ranked war hits made during chains"),
    "assists": ("Wingman", "Most assists on chain hits"),
    "gym_total": ("Gym Rat", "Most total energy trained in the gym"),
    "gym_str": ("Powerhouse", "Most energy trained in Strength"),
    "gym_spd": ("Speedster", "Most energy trained in Speed"),
    "gym_def": ("Brick Wall", "Most energy trained in Defense"),
    "gym_dex": ("Escape Artist", "Most energy trained in Dexterity"),
    "gym_nerd": ("Book Nerds", "Least energy trained in the gym - hit the books instead?"),
    "oc_boss": ("Crime Boss", "Most successful crimes (ties: higher avg difficulty)"),
    "oc_mind": ("Mastermind", "Highest total difficulty (1-7) of successful crimes"),
    "oc_clean": ("Clean Getaway", "Best success rate, shown as crimes won/run (5+ crimes)"),
    "oc_money": ("Big Earner", "Most crime income (80% of each payout, split evenly)"),
}
_AWARD_OVERRIDES = {}      # filled from config by build_recap

# Recap page: the 3 headline awards from each leaderboard, one row per board
RECAP_AWARD_GROUPS = [("WAR", ["war_hits", "war_resp", "war_single"]),
                      ("CHAIN", ["chain_hits", "chain_resp", "chain_war"]),
                      ("GYM", ["gym_total", "gym_str", "gym_def"]),
                      ("ORGANIZED CRIMES", ["oc_boss", "oc_mind", "oc_money"])]
RECAP_AWARDS = [k for _, ids in RECAP_AWARD_GROUPS for k in ids]


def _short_money(v: float) -> str:
    """Money is always shown as the true value, to the dollar: $1,165,111,000"""
    return f"${int(round(float(v))):,}"


def award_table(det: dict, n: int = 5) -> dict:
    """id -> {board, title, top: [(name, value_str)]} (empty awards dropped)."""
    out = {}
    for aid, board, title, key, val, flt, dec in AWARDS:
        if dec == "asc":           # "slacker" award: lowest first, zeros count
            rows = [v for v in det.get(key, []) if flt is None or flt(v)]
            rows.sort(key=lambda v: (val(v), v["name"].lower()))
        else:
            rows = [v for v in det.get(key, []) if (flt is None or flt(v)) and val(v) > 0]
            rows.sort(key=lambda v: -val(v))
        top = []
        for v in rows[:n]:
            x = val(v)
            if dec == "asc":
                txt = fmt_int(round(x))
            elif dec == "boss":
                txt = f"{v['won']} · {v['avgd']:.1f} avg"
            elif dec == "count":
                txt = f"{v['won']}/{v['crimes']}"
            elif dec == "rate":
                txt = f"{round(100 * v['won'] / v['crimes'])}%"
            elif dec == "money":
                txt = _short_money(x)
            elif dec:
                txt = f"{x:.1f}"
            else:
                txt = fmt_int(round(x))
            top.append((v["name"], txt))
        if top:
            nm_, desc = AWARD_TEXT.get(aid, (title, ""))
            o = _AWARD_OVERRIDES.get(aid, {})
            out[aid] = {"board": board, "title": o.get("name", nm_), "desc": o.get("desc", desc), "top": top}
    return out


def award_box_h(places: int) -> int:
    return 108 + places * 34


def draw_award_box(d, x0, y0, cw, a: dict, places: int = 3):
    """One award: NAME, how-to-earn line(s), then medal rows."""
    ah = award_box_h(places)
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ah], radius=8, fill=(24, 12, 13, 255), outline=RULE, width=2)
    t = a["title"].upper()
    draw_text(d, (x0 + cw / 2, y0 + 30), t, fit_font(t, "Bold", 22, cw - 20, 13), (232, 190, 90),
              track=1, anchor="ms")
    fd = font("Medium", 19)
    lines = wrap(a.get("desc", ""), fd, cw - 24)[:2]
    for k, ln in enumerate(lines):
        draw_text(d, (x0 + cw / 2, y0 + (64 if len(lines) == 1 else 55 + k * 21)), ln, fd,
                  (165, 165, 168), shadow=False, anchor="ms")
    d.line([(x0 + 14, y0 + 86), (x0 + cw - 14, y0 + 86)], fill=RULE, width=1)
    f_v = font("Medium", 22)
    for j, (nme, val) in enumerate(a["top"][:places]):
        base = y0 + 120 + j * 34
        cy = base - 8
        if j < 3:
            d.ellipse([x0 + 14, cy - 10, x0 + 34, cy + 10], fill=MEDAL_COLS[j], outline=(40, 20, 20), width=2)
            draw_text(d, (x0 + 24, cy + 6), str(j + 1), font("Bold", 15), (30, 15, 15), shadow=False, anchor="ms")
        else:
            draw_text(d, (x0 + 24, base), str(j + 1), font("Medium", 19), SUB, shadow=False, anchor="ms")
        vw = f_v.getlength(val)
        draw_text(d, (x0 + 44, base), nme, fit_font(nme, "SemiBold", 23, cw - 64 - vw, 13),
                  (245, 225, 170) if j == 0 else TEXT)
        draw_text(d, (x0 + cw - 12 - vw, base), val, f_v, MEDAL_COLS[j] if j < 3 else SUB)


def _awards_card_h(n_awards: int, places: int) -> int:
    rows = (n_awards + 2) // 3
    return LB_HEAD_H + 6 + rows * (award_box_h(places) + 10) + 2 * LB_CARD_PAD


def draw_awards(c, awards: list, places: int = 5, title: str = "AWARDS"):
    """Award cards, 3 per row, each with `places` medal rows."""
    d = c.d
    ix, iw = CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
    h = _awards_card_h(len(awards), places)
    ty = c.card(h, title, colour=(232, 190, 90))
    tw = iw / 3
    for k, a in enumerate(awards):
        rr, cc = divmod(k, 3)
        draw_award_box(d, ix + cc * tw + 6, ty + rr * (award_box_h(places) + 10), tw - 12, a, places)
    c.y += h + LB_ROW_GAP


def board_awards(aw: dict, board: str) -> list:
    return [dict(v, id=k) for k, v in aw.items() if v["board"] == board]


def _crime_money_cell(v: list) -> str:
    """By Crime money: cash if any; successful crimes with no cash show
    "Item Rewards" (paid in items) or "Prerequisite" (no cash and no items -
    a setup crime for a bigger one)."""
    run, won, _lvl, money, items, known = v
    if money or not won:
        return _short_money(money)
    if items:
        return "Item Rewards"
    return "Prerequisite" if known else "-"


def panel_oc_board(r: dict, label: str, aw: dict = None) -> bytes:
    rows = [(v["name"], [str(v["crimes"]), str(v["won"]), str(v["lost"]),
                         f"{round(100 * v['won'] / v['crimes'])}%", str(v["diff"]), _short_money(v["money"])])
            for v in r["oc_board"]]
    o = r["oc"]
    types = sorted(o["by_name"].items(), key=lambda kv: (-kv[1][2], kv[0]))
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 96 + 2 * LB_CARD_PAD
        ty = c.card(h, "ORGANIZED CRIMES", sub=label)
        c.tiles(ty, [("Crimes", str(o["total"])), ("Successful", str(o["won"])),
                     ("Success Rate", f"{round(100 * o['won'] / o['total'])}%" if o["total"] else "-"),
                     ("Money", _short_money(o["money"])),
                     (f"Faction Tax ({round(CRIME_TAX * 100)}%)", _short_money(o["money"] * CRIME_TAX)),
                     ("Respect", fmt_int(o["respect"]))])
        c.y += h + LB_ROW_GAP
        if aw:
            draw_awards(c, board_awards(aw, "oc"))
        h = LB_HEAD_H + 6 + 28 + len(types) * 32 + 6 + 2 * LB_CARD_PAD
        ty = c.card(h, "BY CRIME")
        c.table(ty, [("LEVEL", 80), ("RUN", 70), ("SUCCESS", 100), ("MONEY", 200)],
                [(n, [str(v[2]), str(v[0]), f"{v[1]}/{v[0]}", _crime_money_cell(v)]) for n, v in types],
                medals=False, name_label="CRIME")
        c.y += h + LB_ROW_GAP
        h = LB_HEAD_H + 6 + 30 + 28 + (max(1, len(rows)) + 1) * 32 + 10 + 6 + 2 * LB_CARD_PAD
        ty = c.card(h, "OC LEADERBOARD",
                    sub=f"Sorted by income · income = {100 - round(CRIME_TAX * 100)}% of each payout split evenly "
                        f"({round(CRIME_TAX * 100)}% faction tax) · LEVEL PTS = difficulty of successful crimes")
        # totals count each crime once; income = everything paid out to members (after tax)
        c.table(ty, [("CRIMES", 80), ("WON", 60), ("FAILED", 76), ("RATE", 66), ("LEVEL PTS", 106), ("INCOME", 180)], rows,
                total=("TOTAL / AVG", [str(o["total"]), str(o["won"]), str(o["total"] - o["won"]),
                                 f"{round(100 * o['won'] / o['total'])}%" if o["total"] else "-",
                                 str(o.get("diff", 0)), _short_money(o["money"] * (1 - CRIME_TAX))]))
        c.y += h + LB_ROW_GAP
    return _render(draw, "Crime Leaderboard")


def panel_awards(aw: dict, label: str) -> bytes:
    boards = [("war", "WAR AWARDS"), ("chain", "CHAIN AWARDS"), ("gym", "GYM AWARDS"), ("oc", "ORGANIZED CRIME AWARDS")]
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 2 * LB_CARD_PAD
        c.card(h, f"{label.split()[0].upper()} AWARDS", colour=(232, 190, 90),
               sub=f"{label} · top 5 in every category")
        c.y += h + LB_ROW_GAP
        for b, title in boards:
            lst = board_awards(aw, b)
            if lst:
                draw_awards(c, lst, places=5, title=title)
    return _render(draw, "Awards")


def faction_records(raw: dict, start: int = None, end: int = None) -> list:
    """All-time records from the saved war / chain / crime history.
    Returns [(section, [{title, holder, value, when, new}])] - new = set
    between start and end (the recap period), shown with a NEW badge."""
    whist = raw.get("_war_history", {}).get("wars", {})
    chains = list(raw.get("_chain_history", {}).get("chains", {}).values())
    crimes = list((raw.get("_crime_history") or {}).get("crimes", {}).values())
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    meta = war_meta(raw, my_id)
    names = {}
    for w in whist.values():
        for m in w["members"]:
            names[m["id"]] = m.get("name", "?")
    for m in _as_list(raw["members"].get("members")):
        names[m.get("id")] = m.get("name", "?")
    nm = lambda i: names.get(i, f"[{i}]")
    day = lambda ts: datetime.fromtimestamp(ts, timezone.utc).strftime("%b %d, %Y") if ts else ""
    mon = lambda ts: datetime.fromtimestamp(ts, timezone.utc).strftime("%B %Y")
    isnew = lambda ts: bool(start and end and ts and start <= ts < end)
    rec = lambda title, holder, value, ts, when=None: {"title": title, "holder": holder, "value": value,
                                                       "when": when or day(ts), "new": isnew(ts)}
    out = []
    # ---- wars
    wl = []
    wars = sorted(whist.items(), key=lambda kv: kv[1]["end"])
    if wars:
        best_m = max(((m, w) for _, w in wars for m in w["members"]), key=lambda x: x[0]["attacks"])
        wl.append(rec("Most hits in one war", best_m[0].get("name", "?"), fmt_int(best_m[0]["attacks"]), best_m[1]["end"]))
        best_r = max(((m, w) for _, w in wars for m in w["members"]), key=lambda x: x[0]["score"])
        wl.append(rec("Most respect in one war", best_r[0].get("name", "?"), fmt_int(round(best_r[0]["score"])),
                      best_r[1]["end"]))
        k, w = max(wars, key=lambda kv: sum(m["attacks"] for m in kv[1]["members"]))
        opp = meta.get(k, {}).get("opponent", "")
        wl.append(rec("Most faction hits in one war", f"vs {opp}" if opp else "Faction",
                      fmt_int(sum(m["attacks"] for m in w["members"])), w["end"]))
        # best monthly war attendance: members who hit / members in the wars, per month
        mo = {}
        for k, w in wars:
            t = mo.setdefault(datetime.fromtimestamp(w["end"], timezone.utc).strftime("%Y-%m"), [0, 0, 0, 0])
            t[0] += sum(m["attacks"] > 0 for m in w["members"]); t[1] += len(w["members"])
            t[2] = max(t[2], w["end"]); t[3] += 1
        mk, t = max(mo.items(), key=lambda kv: (kv[1][0] / max(1, kv[1][1]), kv[1][3], kv[1][2]))
        wl.append(rec("Best monthly war attendance", f"Faction ({t[3]} war{'s' if t[3] != 1 else ''})",
                      f"{round(100 * t[0] / max(1, t[1]))}%", t[2], mon(t[2])))
        wonl = [(k, w, meta[k]) for k, w in wars if k in meta]
        if wonl:
            k, w, mt = max(wonl, key=lambda x: x[2]["our"])
            wl.append(rec("Highest war score", f"vs {mt['opponent']}", fmt_int(mt["our"]), w["end"]))
            wins = [x for x in wonl if x[2]["won"]]
            if wins:
                k, w, mt = max(wins, key=lambda x: x[2]["our"] - x[2]["their"])
                wl.append(rec("Biggest win margin", f"vs {mt['opponent']}", f"+{fmt_int(mt['our'] - mt['their'])}", w["end"]))
            run, best, best_end = 0, 0, 0
            for k, w, mt in wonl:
                run = run + 1 if mt["won"] else 0
                if run > best:
                    best, best_end = run, w["end"]
            if best:
                wl.append(rec("Longest win streak", "Faction", f"{best} wars", best_end))
        out.append(("WAR RECORDS", wl))
    # ---- chains
    cl = []
    if chains:
        c = max(chains, key=lambda c: (c["length"], -c["end"]))
        cl.append(rec("Biggest chain", "Faction", fmt_int(c["length"]), c["end"]))
        c = max(chains, key=lambda c: sum(a["respect"] for a in c.get("attackers", [])))
        cl.append(rec("Most respect in one chain", f"Chain {fmt_int(c['length'])}",
                      fmt_int(round(sum(a["respect"] for a in c.get("attackers", [])))), c["end"]))
        a, c = max(((a, c) for c in chains for a in c.get("attackers", [])), key=lambda x: x[0]["hits"])
        cl.append(rec("Most hits in one chain", nm(a["id"]), fmt_int(a["hits"]), c["end"]))
        a, c = max(((a, c) for c in chains for a in c.get("attackers", [])), key=lambda x: x[0]["respect"])
        cl.append(rec("Most respect in one chain (member)", nm(a["id"]), fmt_int(round(a["respect"])), c["end"]))
        mh = {}
        for c in chains:
            key = datetime.fromtimestamp(c["end"], timezone.utc).strftime("%Y-%m")
            for a in c.get("attackers", []):
                mh[(a["id"], key)] = mh.get((a["id"], key), (0, c["end"]))[0] + a["hits"], c["end"]
        (i, mk), (v, ts) = max(mh.items(), key=lambda kv: kv[1][0])
        cl.append(rec("Most chain hits in a month", nm(i), fmt_int(v), ts, mon(ts)))
        fm = {}
        for c in chains:
            key = datetime.fromtimestamp(c["end"], timezone.utc).strftime("%Y-%m")
            fm[key] = (fm.get(key, (0, 0))[0] + c["length"], c["end"])
        mk, (v, ts) = max(fm.items(), key=lambda kv: kv[1][0])
        cl.append(rec("Most faction chain hits in a month", "Faction", fmt_int(v), ts, mon(ts)))
        out.append(("CHAIN RECORDS", cl))
    # ---- organized crimes
    ol = []
    if crimes:
        c = max(crimes, key=lambda c: c["money"])
        ol.append(rec("Biggest crime payout", c.get("name", "?"), _short_money(c["money"]), c["executed_at"]))
        okc = lambda c: str(c.get("status", "")).lower().startswith("success")
        fm = {}
        for c in crimes:
            key = datetime.fromtimestamp(c["executed_at"], timezone.utc).strftime("%Y-%m")
            t = fm.setdefault(key, [0, 0, c["executed_at"]])
            t[0] += okc(c); t[1] += c["money"]; t[2] = max(t[2], c["executed_at"])
        mk, t = max(fm.items(), key=lambda kv: kv[1][0])
        ol.append(rec("Most successful crimes in a month", "Faction", fmt_int(t[0]), t[2], mon(t[2])))
        mk, t = max(fm.items(), key=lambda kv: kv[1][1])
        ol.append(rec("Most crime money in a month", "Faction", _short_money(t[1]), t[2], mon(t[2])))
        out.append(("ORGANIZED CRIME RECORDS", ol))
    return out


def panel_records(recs: list, label: str = None) -> bytes:
    """All-time records, one card per section: RECORD | HOLDER | VALUE | WHEN.
    Records set in the recap period get a NEW badge."""
    def draw(c):
        h = LB_HEAD_H + 6 + 30 + 2 * LB_CARD_PAD
        c.card(h, "FACTION RECORDS", colour=(232, 190, 90),
               sub="All-time bests" + (f" · NEW = set in {label}" if label else ""))
        c.y += h + LB_ROW_GAP
        d = c.d
        ix, iw = CX0 + LB_CARD_PAD, CW - 2 * LB_CARD_PAD
        fr, fh, fb = font("Medium", 21), font("SemiBold", 16), font("SemiBold", 22)
        for title, rows in recs:
            h = LB_HEAD_H + 6 + 28 + len(rows) * 38 + 6 + 2 * LB_CARD_PAD
            ty = c.card(h, title)
            cols = [("RECORD", ix + 6, "l"), ("HOLDER", ix + 470, "l"), ("VALUE", ix + 820, "r"),
                    ("WHEN", ix + iw - 6, "r")]
            for lab, x, al in cols:
                draw_text(d, (x - (tracked_len(lab, fh, 1) if al == "r" else 0), ty + 18), lab, fh, SUB,
                          track=1, shadow=False)
            for k, r_ in enumerate(rows):
                base = ty + 28 + k * 38 + 26
                if k % 2 == 0:
                    d.rectangle([ix, base - 26, ix + iw, base + 10], fill=(255, 255, 255, 10))
                tx = ix + 6
                if r_["new"]:
                    bw_ = fh.getlength("NEW") + 14
                    d.rounded_rectangle([tx, base - 20, tx + bw_, base + 4], radius=5, fill=(120, 200, 120))
                    draw_text(d, (tx + bw_ / 2, base - 1), "NEW", fh, (16, 30, 16), shadow=False, anchor="ms")
                    tx += bw_ + 10
                draw_text(d, (tx, base), r_["title"], fit_font(r_["title"], "Medium", 21, ix + 455 - tx, 13), TEXT,
                          shadow=False)
                draw_text(d, (ix + 470, base), r_["holder"], fit_font(r_["holder"], "SemiBold", 22, 230, 13),
                          (245, 225, 170), shadow=False)
                draw_text(d, (ix + 820 - fb.getlength(r_["value"]), base), r_["value"], fb, (232, 190, 90),
                          shadow=False)
                draw_text(d, (ix + iw - 6 - fr.getlength(r_["when"]), base), r_["when"], fr, SUB, shadow=False)
            c.y += h + LB_ROW_GAP
    return _render(draw, "Faction Records")


RECAP_BUTTONS = [("War Leaderboard", "gi-crossed-swords", "war-leaderboard"),
                 ("War Summary", "gi-scroll-unfurled", "war-summary"),
                 ("Chain Leaderboard", "gi-bolt-shield", "chain-leaderboard"),
                 ("Chain Summary", "gi-stopwatch", "chain-summary"),
                 ("Gym Leaderboard", "gi-weight-lifting-up", "gym-leaderboard"),
                 ("Crime Leaderboard", "gi-lockpicks", "oc-leaderboard"),
                 ("Awards", "gi-trophy", "awards"),
                 ("Faction Records", "gi-police-badge", "records"),
                 ("Past Recaps", "gi-open-book", "")]


CRIME_HIST_PATH = ROOT / "data" / "crime_history.json"
CRIME_HIST_HOURS = 6  # completed-crime history refresh interval
CRIME_TAX = 0.20      # faction's cut of every crime payout (rest split evenly between members)
RESPECT_LOG_PATH = ROOT / "data" / "respect_log.json"


def oc_role(label) -> str:
    """'Muscle #2' -> 'Muscle' (numbered copies of a role share one pass rate) - the same rule as the OC Optimizer
    script's baseRole, so the Hub's rates and the script's shared rates use the same "Crime|Role" keys."""
    import re
    return re.sub(r"\s+", " ", re.sub(r"#\s*\d+", "", str(label or ""))).strip()


def oc_slot_label(sl: dict) -> str:
    pi = sl.get("position_info") if isinstance(sl.get("position_info"), dict) else {}
    return str(pi.get("label") or sl.get("position") or "")


def oc_slots(c: dict) -> list:
    """[[member id or 0, role label, pass rate % or null], ...] for one crime's slots."""
    out = []
    for sl in _as_list(c.get("slots")):
        r = sl.get("checkpoint_pass_rate")
        out.append([int(_slot_user(sl) or 0), oc_slot_label(sl), round(float(r)) if isinstance(r, (int, float)) else None])
    return out


def oc_reward_items(rw) -> list:
    """[[item id, quantity], ...] from a completed crime's rewards (some crimes pay in items, not cash)."""
    out = []
    for it in _as_list((rw or {}).get("items")) if isinstance(rw, dict) else []:
        if isinstance(it, dict):
            iid = it.get("id") or it.get("item_id") or it.get("ID")
            if iid:
                out.append([int(iid), int(it.get("quantity") or it.get("amount") or 1)])
    return out


def oc_payout_pct(rw):
    """% of a completed crime's reward paid out to its members (rewards.payout.percentage; the faction keeps the
    rest) - None when the API doesn't say (not paid out yet / older crimes)."""
    po = (rw or {}).get("payout") if isinstance(rw, dict) else None
    v = po.get("percentage") if isinstance(po, dict) else None
    return int(v) if isinstance(v, (int, float)) else None


OC_PRICES_PATH = ROOT / "data" / "oc_item_prices.json"   # reward item id -> market price, weekly


def oc_item_prices(key: str, ids: set) -> dict:
    """Market prices of the items OCs reward ({id: price}), in data/oc_item_prices.json - re-read once a week
    (weekly slot, like the OC catalog) or when a new reward item turns up. API: torn/items, up to 100 ids a call."""
    try:
        c = json.loads(OC_PRICES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        c = {"fetched": 0, "prices": {}}
    have = c.setdefault("prices", {})
    need = sorted(str(i) for i in ids if str(i) not in have)
    want = sorted(str(i) for i in ids) if due("item_types", c.get("fetched")) else need
    if key and want:
        try:
            for i in range(0, len(want), 100):
                # API: OC Management - reward item market prices (Torn V2 /torn/items)
                data = fetch_url(f"https://api.torn.com/v2/torn/items?ids={','.join(want[i:i + 100])}", key)
                items = data.get("items")
                for it in (items.values() if isinstance(items, dict) else _as_list(items)):
                    if isinstance(it, dict) and it.get("id"):
                        have[str(it["id"])] = int(((it.get("value") or {}).get("market_price")) or 0)
            c["fetched"] = int(datetime.now(timezone.utc).timestamp())
            OC_PRICES_PATH.write_text(json.dumps(c, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
            print(f"OC item prices: {len(want)} read")
        except SystemExit as e:
            print(f"OC item prices skipped: {e}")
    return have


def oc_values(crimes, prices: dict, recent: int = 25) -> dict:
    """Pay value per crime name for the Team Builder, from the latest `recent` SUCCESSFUL completed crimes:
    {name: {g: average gross reward $ (cash + items at today's market price), pp: typical payout % to members,
    n: crimes averaged, ok: success % of all of that crime's completed crimes}}."""
    by = {}
    for c in crimes:
        by.setdefault(c.get("name"), []).append(c)
    out = {}
    for name, lst in by.items():
        good = sorted((c for c in lst if c.get("status") == "Successful"), key=lambda c: -int(c.get("executed_at") or 0))[:recent]
        if not good:
            continue
        g = [int(c.get("money") or 0) + sum(int(prices.get(str(i)) or 0) * q for i, q in c.get("ritems") or []) for c in good]
        pps = sorted(c["pp"] for c in good if isinstance(c.get("pp"), int))
        out[name] = {"g": round(sum(g) / len(g)), "pp": pps[len(pps) // 2] if pps else None, "n": len(good),
                     "ok": round(100 * sum(1 for c in lst if c.get("status") == "Successful") / len(lst))}
    return out


OC_CATALOG_PATH = ROOT / "data" / "oc_catalog.json"
OC_ACTIVE_PATH = ROOT / "data" / "oc_active.json"
OC_POOL_PATH = ROOT / "data" / "oc_pool.json"     # members + history rates, written only by OC Management's Refresh


def oc_catalog(key: str) -> dict:
    """Every OC scenario (torn/organizedcrimes): {name: {difficulty, roles: [slot labels], prereq}} - refreshed once a
    week (1 call, weekly slot like item_types) into data/oc_catalog.json. Structure only (Torn gives no rewards here)."""
    import time
    try:
        c = json.loads(OC_CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        c = {"fetched": 0, "crimes": {}}
    if key and (due("item_types", c.get("fetched")) or not c.get("crimes")):
        try:
            data = fetch_url("https://api.torn.com/v2/torn/organizedcrimes", key)
            cr = {}
            for x in _as_list(data.get("organizedcrimes")):
                if isinstance(x, dict) and x.get("name"):
                    cr[x["name"]] = {"difficulty": x.get("difficulty"),
                                     "roles": [oc_slot_label(sl) or f"Role {i + 1}" for i, sl in enumerate(_as_list(x.get("slots")))],
                                     "prereq": (x.get("prerequisite") or {}).get("name") if isinstance(x.get("prerequisite"), dict)
                                               else x.get("prerequisite")}
            if cr:
                c = {"fetched": int(time.time()), "crimes": cr}
                OC_CATALOG_PATH.write_text(json.dumps(c, indent=0, sort_keys=True) + "\n", encoding="utf-8")
                print(f"OC catalog: {len(cr)} crimes")
        except SystemExit as e:
            print(f"OC catalog skipped: {e}")
    return c.get("crimes", {})


def update_crime_history(key: str) -> dict:
    """Completed Organized Crimes (OC leaderboard / recap). Saved slim in
    data/crime_history.json: {id: {name, difficulty, status, executed_at,
    members: [ids], money, respect}}. First run reads the whole history,
    later runs only pages with unsaved crimes."""
    try:
        hist = json.loads(CRIME_HIST_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        hist = {"crimes": {}}
    saved = hist.setdefault("crimes", {})
    # saved before item rewards / prerequisite links / slot roles + pass rates were recorded -> read the whole
    # history once more (slots added Nov 2026 for the OC Management Team Builder)
    # (Nov 2026: + "ritems" reward item ids and "pp" payout % for the Team Builder's pay-per-day values)
    refill = any("items" not in c or "prev" not in c or "slots" not in c or "ritems" not in c for c in saved.values())
    now_ = int(datetime.now(timezone.utc).timestamp())
    if saved and not refill and not due("crimes", hist.get("fetched")):
        return hist                         # read once per 3-hour clock slot (FIXED CLOCK SCHEDULE)
    hist["fetched"] = now_
    try:
        crimes, _ = all_pages("crimes", "crimes", key, "Completed crimes", {"cat": "completed"},
                              stop_ids=set(saved) if saved and not refill else None)
    except SystemExit as e:
        print(f"Crime history skipped: {e}")
        return hist
    if crimes and not hist.get("_shape_logged"):
        print(f"--- completed crime shape ---\n{describe_shape(crimes[0], max_depth=5)}")
    added = 0
    for c in crimes:
        cid = str(c.get("id"))
        rw = c.get("rewards") or {}
        n_items = sum(int(x.get("quantity") or 1) for x in _as_list(rw.get("items"))) if isinstance(rw, dict) else 0
        if cid in saved and ("items" not in saved[cid] or "prev" not in saved[cid] or "slots" not in saved[cid]
                             or "ritems" not in saved[cid]):
            saved[cid]["items"] = n_items
            saved[cid]["prev"] = c.get("previous_crime_id")
            saved[cid]["slots"] = oc_slots(c)
            saved[cid]["ritems"] = oc_reward_items(rw)
            saved[cid]["pp"] = oc_payout_pct(rw)
            added += 1
            continue
        if cid in saved or not c.get("executed_at"):
            continue
        saved[cid] = {"name": c.get("name"), "difficulty": c.get("difficulty"),
                      "status": c.get("status"), "executed_at": int(c.get("executed_at") or 0),
                      "members": [u for u in (_slot_user(sl) for sl in _as_list(c.get("slots"))) if u],
                      "money": int(rw.get("money") or 0) if isinstance(rw, dict) else 0,
                      "respect": int(rw.get("respect") or 0) if isinstance(rw, dict) else 0,
                      # number of items rewarded (crimes that pay in items, not cash)
                      "items": n_items,
                      # prerequisite crime (e.g. No Reserve before Bidding War): its members share this payout
                      "prev": c.get("previous_crime_id"),
                      # [member id, role, checkpoint pass rate %] per slot - the Team Builder's history rates
                      "slots": oc_slots(c),
                      # [[item id, quantity]] rewarded + % of the reward paid out to members (Team Builder $/day)
                      "ritems": oc_reward_items(rw), "pp": oc_payout_pct(rw)}
        added += 1
    if True:                                # always save (records the fetch time)
        CRIME_HIST_PATH.parent.mkdir(exist_ok=True)
        CRIME_HIST_PATH.write_text(json.dumps(hist, separators=(",", ":"), sort_keys=True) + "\n",
                                   encoding="utf-8")
    print(f"Crime history: {added} new, {len(saved)} saved")
    return hist


def log_respect(raw: dict):
    """Daily faction respect snapshot (data/respect_log.json, "YYYY-MM-DD":
    respect, last value of the day) - recap Net Respect = end - start."""
    b = raw["basic"].get("basic", raw["basic"])
    if b.get("respect") is None:
        return
    try:
        log = json.loads(RESPECT_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log = {}
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if log.get(day) != int(b["respect"]):
        log[day] = int(b["respect"])
        RESPECT_LOG_PATH.parent.mkdir(exist_ok=True)
        RESPECT_LOG_PATH.write_text(json.dumps(log, sort_keys=True) + "\n", encoding="utf-8")


RECAP_DIR = ROOT / "data" / "recaps"
RECAP_STATE_PATH = ROOT / "data" / "recap_state.json"


def net_respect(start: int, end: int):
    """(net change, end value, start value) from data/respect_log.json: last snapshot
    before/at the period start vs the last one before its end. None if the
    log doesn't cover the period."""
    try:
        log = json.loads(RESPECT_LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, None
    day = lambda ts: datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
    s_day, e_day = day(start), day(end)          # end = first day of the next period
    before = [k for k in sorted(log) if k <= s_day]
    upto = [k for k in sorted(log) if k <= e_day]
    if not before or not upto:
        return None, (log[upto[-1]] if upto else None), None
    return log[upto[-1]] - log[before[-1]], log[upto[-1]], log[before[-1]]


def broken_records(raw: dict, start: int, end: int) -> list:
    """Records set during the period, each with the record it beat (the
    best from before the period): [{title, holder, value, when, prev_holder,
    prev_value}]."""
    before = dict(raw)
    before["_war_history"] = {"wars": {k: w for k, w in raw.get("_war_history", {}).get("wars", {}).items()
                                       if w["end"] < start}}
    before["_chain_history"] = {"chains": {k: c for k, c in raw.get("_chain_history", {}).get("chains", {}).items()
                                           if c["end"] < start}}
    before["_crime_history"] = {"crimes": {k: c for k, c in (raw.get("_crime_history") or {}).get("crimes", {}).items()
                                           if c["executed_at"] < start}}
    old = {r_["title"]: r_ for _, rows in faction_records(before) for r_ in rows}
    out = []
    for _, rows in faction_records(raw, start, end):
        for r_ in rows:
            if r_["new"]:
                p_ = old.get(r_["title"])
                out.append(dict(r_, prev_holder=p_["holder"] if p_ else "", prev_value=p_["value"] if p_ else ""))
    return out


def build_recap(start: int, end: int, label: str, raw: dict, gym_gains: dict = None,
                gym_label: str = None) -> dict:
    """All recap images for a period: {"recap": png, "<panel slug>": png}."""
    _AWARD_OVERRIDES.clear()
    _AWARD_OVERRIDES.update(load_config().get("recap", {}).get("awards", {}))
    members = _as_list(raw["members"].get("members"))
    my_id = raw["basic"].get("basic", raw["basic"]).get("id")
    meta = war_meta(raw, my_id)
    whist, chist = raw.get("_war_history", {}), raw.get("_chain_history", {})
    det = recap_detail(start, end, whist, chist, members, meta, gym_gains, gym_label or label,
                       raw.get("_crime_history"))
    aw = award_table(det)
    r = recap_data(start, end, label, whist, chist, members, meta)
    r["awards"], r["oc"] = aw, det["oc"]
    r["net_respect"], r["respect_end"], r["respect_start"] = net_respect(start, end)
    r["broken"] = broken_records(raw, start, end)
    parts = recap_image(r)
    return {"recap": stack_pngs(parts), "recap_parts": parts,
            "war-leaderboard": panel_war_board(det, label, aw),
            "war-summary": panel_war_summary(det, label),
            "chain-leaderboard": panel_chain_board(det, label, aw),
            "chain-summary": panel_chain_summary(det, label),
            "gym-leaderboard": panel_gym_board(det, label, aw),
            "oc-leaderboard": panel_oc_board(det, label, aw),
            "awards": panel_awards(aw, label),
            "records": panel_records(faction_records(raw, start, end), label)}


def recap_components(month: str) -> list:
    """Discord link buttons under a recap post (same pages as the newsletter
    buttons). Max 5 per row. Webhooks may send link buttons when the request
    has ?with_components=true."""
    base_url = member_base()
    btns = []
    for lab, _icon, slug in RECAP_BUTTONS:
        if slug and not (RECAP_DIR / month / f"{slug}.png").exists():
            continue
        url = f"{base_url}/recaps/{month}/{slug}.html" if slug else f"{base_url}/recaps.html"
        btns.append({"type": 2, "style": 5, "label": lab, "url": url})
    return [{"type": 1, "components": btns[k:k + 5]} for k in range(0, len(btns), 5)]


def save_recap_files(month: str, imgs: dict) -> list:
    """data/recaps/YYYY-MM.png (full stacked copy), data/recaps/YYYY-MM/
    recap-1..n.png (the framed parts, shown in order) and the button pages.
    Returns the part bytes."""
    imgs = dict(imgs)
    parts = imgs.pop("recap_parts")
    RECAP_DIR.mkdir(parents=True, exist_ok=True)
    (RECAP_DIR / f"{month}.png").write_bytes(imgs.pop("recap"))
    d_ = RECAP_DIR / month
    d_.mkdir(exist_ok=True)
    for old in d_.glob("recap-*.png"):
        old.unlink()
    for k, b in enumerate(parts, 1):
        (d_ / f"recap-{k}.png").write_bytes(b)
    for slug, data in imgs.items():
        (d_ / f"{slug}.png").write_bytes(data)
    return parts


# Summary images shown under the recap in Discord. Leaderboards, awards and records are NOT
# previewed - they're reached with the buttons. Bump RECAP_PREVIEW_V to re-send (edits the message).
RECAP_PREVIEWS = ("war-summary", "chain-summary")
RECAP_PREVIEW_V = "3"


def discord_recap_previews(month: str, url: str, rcfg: dict, edit_id: str = None):
    """Post the month's panel images (war/chain/gym/crime boards, summaries, awards, records) as a
    gallery under the recap. Split into several messages if the files are too big for one
    (Discord: max 10 files, keep each message under ~9 MB). Returns the first message id or None."""
    d_ = RECAP_DIR / month
    files = [(lab, d_ / f"{slug}.png") for lab, _i, slug in RECAP_BUTTONS
             if slug in RECAP_PREVIEWS and (d_ / f"{slug}.png").exists()]
    if not files:
        return None
    groups, cur, size = [], [], 0
    for lab, f in files:
        n = f.stat().st_size
        if cur and (len(cur) == 10 or size + n > 9_000_000):
            groups.append(cur); cur, size = [], 0
        cur.append((lab, f)); size += n
    groups.append(cur)
    title = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    first = None
    for gi, grp in enumerate(groups):
        names = " · ".join(lab for lab, _ in grp)
        text = (f"## 📊 {title} Summaries\n-# {names} · tap an image to open it · leaderboards are under the buttons"
                if gi == 0 else f"-# {names}")
        payload = {"username": rcfg.get("username", "Monthly Recap"), "content": text,
                   "attachments": [{"id": k, "filename": f.name} for k, (_l, f) in enumerate(grp)],
                   "allowed_mentions": {"parse": []}}
        if gi == len(groups) - 1:
            payload["components"] = recap_components(month)
        try:
            if edit_id and gi == 0:     # replace the earlier preview message's images + text
                _discord_request(f"{url}/messages/{edit_id}?with_components=true", "PATCH", payload,
                                 [(f.name, f.read_bytes()) for _l, f in grp])
                first = edit_id
            else:
                msg = _discord_request(f"{url}?wait=true&with_components=true", "POST", payload,
                                       [(f.name, f.read_bytes()) for _l, f in grp])
                first = first or msg.get("id")
        except Exception as e:     # never print the URL
            print(f"Discord: recap previews failed: {type(e).__name__}")
            return first
    print(f"Discord: posted {month} recap summary previews ({len(files)} images)")
    return first


def recap_part_files(month: str) -> list:
    d_ = RECAP_DIR / month
    return sorted(d_.glob("recap-*.png"), key=lambda p: int(p.stem.split("-")[1])) if d_.exists() else []


def monthly_recap(raw: dict, cfg: dict, out: Path):
    """Full runs: once a month ends, build last month's recap image, save it
    (data/recaps/YYYY-MM.png, kept in the repo), post it to Discord
    (DISCORD_WEBHOOK_RECAP) and list it on newsletter.html (copy-ready HTML
    for Torn's faction newsletter). Waits for the gym roll-over so Gym Rat
    has last month's numbers."""
    rcfg = cfg.get("recap", {})
    if not rcfg.get("enabled", False):
        return
    out = member_out(out)                 # member-only: inside the secret folder
    now = datetime.now(timezone.utc)
    this = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    prev = datetime(this.year - (this.month == 1), 12 if this.month == 1 else this.month - 1, 1, tzinfo=timezone.utc)
    target = prev.strftime("%Y-%m")
    try:
        state = json.loads(RECAP_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {"posted": []}
    gym = raw.get("_gym") or {}
    gym_ready = not gym.get("month") or gym.get("month") == this.strftime("%Y-%m")
    png_path = RECAP_DIR / f"{target}.png"
    if target in state["posted"] and not (RECAP_DIR / target).exists() and gym_ready:
        # posted before the newsletter buttons existed: build the pages (no re-post)
        prevg = gym.get("prev") or {}
        imgs = build_recap(int(prev.timestamp()), int(this.timestamp()), prev.strftime("%B %Y"), raw,
                           prevg.get("gains") if prevg.get("month") == target else None)
        save_recap_files(target, imgs)
        print(f"Recap {target}: newsletter pages built")
    if target not in state["posted"] and gym_ready:
        prevg = gym.get("prev") or {}
        gains = prevg.get("gains") if prevg.get("month") == target else None
        imgs = build_recap(int(prev.timestamp()), int(this.timestamp()), prev.strftime("%B %Y"), raw, gains)
        parts = save_recap_files(target, imgs)
        url = os.environ.get("DISCORD_WEBHOOK_RECAP", "").strip()
        ok = True
        if url:
            try:
                # announcement line, e.g. "@everyone October Recap is available!"
                text = fill(rcfg.get("message", "@everyone {month} Recap is available!"),
                            {"month": prev.strftime("%B"), "month_year": prev.strftime("%B %Y")})
                msg = _discord_request(f"{url}?wait=true&with_components=true", "POST",
                                       {"username": rcfg.get("username", "Monthly Recap"), "content": text,
                                        "components": recap_components(target),
                                        "attachments": [{"id": k, "filename": f"recap-{target}-{k + 1}.png"}
                                                        for k in range(len(parts))],
                                        "allowed_mentions": {"parse": ["everyone"] if "@everyone" in text else []}},
                                       [(f"recap-{target}-{k + 1}.png", b) for k, b in enumerate(parts)])
                state.setdefault("message_ids", {})[target] = msg.get("id")
                discord_msg_save(f"recap:{target}", msg.get("id"))
                print(f"Discord: posted {target} recap")
            except Exception as e:     # never print the URL
                ok = False
                print(f"Discord: recap post failed: {type(e).__name__}")
        if ok:
            state["posted"].append(target)
            RECAP_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
    # Summary previews: right after a recap is posted, a second message carries every summary /
    # leaderboard panel as images (Discord shows them as a gallery - tap to open full size).
    # Only the newest posted month; done once per month (state["previews"]).
    purl = os.environ.get("DISCORD_WEBHOOK_RECAP", "").strip()
    if purl and not rcfg.get("previews", True):
        # summaries turned off: delete any summary posts already sent
        for pm, mid_ in list((state.get("previews") or {}).items()):
            try:
                _discord_request(f"{purl}/messages/{mid_}", "DELETE")
                print(f"Discord: removed {pm} recap summaries post")
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    print(f"Discord: recap summaries delete failed ({e.code})")
                    continue
            except Exception as e:
                print(f"Discord: recap summaries delete failed: {type(e).__name__}")
                continue
            state["previews"].pop(pm, None)
            state.get("preview_v", {}).pop(pm, None)
            discord_msg_save(f"recap-previews:{pm}", None, drop=True)
            RECAP_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
    if purl and state.get("posted") and rcfg.get("previews", True):
        pm = sorted(state["posted"])[-1]
        prev_ = state.get("previews", {}).get(pm)
        if state.get("preview_v", {}).get(pm) != RECAP_PREVIEW_V:
            mid_ = discord_recap_previews(pm, purl, rcfg, edit_id=prev_)
            if mid_:
                state.setdefault("previews", {})[pm] = mid_
                discord_msg_save(f"recap-previews:{pm}", mid_)
                state.setdefault("preview_v", {})[pm] = RECAP_PREVIEW_V
                RECAP_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
    # Re-send an already posted recap by EDITING its Discord message:
    # config recap.edit = {"month": "YYYY-MM", "message_id": "<id>"} (once per id;
    # the id is also saved automatically for recaps posted from now on).
    ed = rcfg.get("edit") or {}
    url = os.environ.get("DISCORD_WEBHOOK_RECAP", "").strip()
    stamp = str(ed.get("id", ""))          # bump to edit the same message again
    emonth = ed.get("month")
    mid = str(ed.get("message_id") or state.get("message_ids", {}).get(emonth or "", "") or "")
    if url and emonth and mid and state.get("edited", {}).get(emonth) != mid + stamp \
            and (RECAP_DIR / f"{emonth}.png").exists():
        try:
            eparts = recap_part_files(emonth)
            files_ = ([(p_.name, p_.read_bytes()) for p_ in eparts] if eparts
                      else [(f"recap-{emonth}.png", (RECAP_DIR / f"{emonth}.png").read_bytes())])
            _discord_request(f"{url}/messages/{mid}?with_components=true", "PATCH",
                             {"attachments": [{"id": k, "filename": n} for k, (n, _) in enumerate(files_)],
                              "components": recap_components(emonth),
                              "allowed_mentions": {"parse": []}}, files_)
            state.setdefault("edited", {})[emonth] = mid + stamp
            state.setdefault("message_ids", {})[emonth] = mid
            RECAP_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
            print(f"Discord: edited {emonth} recap")
        except Exception as e:     # never print the URL
            print(f"Discord: recap edit failed: {type(e).__name__}")
    # newsletter page: every saved recap, newest first, with copy-ready HTML
    # (recap image + buttons to that month's leaderboard / summary pages)
    import html as _html, shutil
    files = sorted(RECAP_DIR.glob("*.png"), reverse=True) if RECAP_DIR.exists() else []
    if RECAP_DIR.exists():
        shutil.copytree(RECAP_DIR, out / "recaps", dirs_exist_ok=True)
    base_url = member_base()
    bw = int(rcfg.get("button_width", 240))
    for lab, icon, slug in RECAP_BUTTONS:
        render_button(lab, icon).save(out / f"recap-btn-{slug or 'past'}.webp", format="WEBP", quality=92, method=6)
    items = []
    for f in files:
        label = datetime.strptime(f.stem, "%Y-%m").strftime("%B %Y")
        btns = []
        k = 0
        for lab, icon, slug in RECAP_BUTTONS:
            if slug and not (RECAP_DIR / f.stem / f"{slug}.png").exists():
                continue
            link = f"{base_url}/recaps/{f.stem}/{slug}.html" if slug else f"{base_url}/recaps.html"
            btns.append(f'<a href="{link}"><img src="{base_url}/recap-btn-{slug or "past"}.webp" '
                        f'alt="{_html.escape(lab)}" width="{bw}"></a>')
            k += 1
            if k % 2 == 0:
                btns.append("<br>")
        pfiles = recap_part_files(f.stem)
        srcs = ([f"recaps/{f.stem}/{p_.name}" for p_ in pfiles] if pfiles else [f"recaps/{f.name}"])
        nw = int(rcfg.get("newsletter_width", 600))
        snippet = "\n".join(f'<p style="text-align: center;"><a href="{base_url}/{s_.rsplit(".", 1)[0]}.html">'
                            f'<img src="{base_url}/{s_}" alt="{label} Recap" width="{nw}"></a></p>' for s_ in srcs)
        # one page per recap image and per button page (image + its markup)
        btn_titles = {slug: lab for lab, _i, slug in RECAP_BUTTONS if slug}
        for s_ in srcs:
            if "/" in s_.split("recaps/", 1)[1]:
                nm_ = s_.rsplit("/", 1)[1]
                image_page(out / (s_.rsplit(".", 1)[0] + ".html"), f"{label} Recap ({nm_.split('.')[0][-1]})",
                           nm_, f'<p style="text-align: center;"><a href="{base_url}/{s_.rsplit(".", 1)[0]}.html">'
                                f'<img src="{base_url}/{s_}" alt="{label} Recap" width="{nw}"></a></p>', "../../")
        for slug, lab in btn_titles.items():
            if (RECAP_DIR / f.stem / f"{slug}.png").exists():
                pth = f"recaps/{f.stem}/{slug}"
                image_page(out / f"{pth}.html", f"{label} - {lab}", f"{slug}.png",
                           f'<p style="text-align: center;"><a href="{base_url}/{pth}.html">'
                           f'<img src="{base_url}/{pth}.png" alt="{label} {lab}" width="{nw}"></a></p>', "../../")
        snippet += f'\n<p style="text-align: center;">{"".join(btns)}</p>'
        items.append(f"""<section id="{f.stem}"><h2>{label}</h2>
<div class="p">{snippet}</div>
</section>""")
    (out / "newsletter.html").write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Monthly Recaps</title>
<style>body{{background:#100a0b;color:#ddd;font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:16px}}
h1,h2{{color:#e4382e}}img{{max-width:100%;border-radius:8px}}textarea{{width:100%;height:70px;background:#1a1012;color:#ddd;border:1px solid #5c1c1a}}
button{{background:#e4382e;color:#fff;border:0;padding:8px 14px;border-radius:6px;margin:6px 0 30px}}
section{{display:none}}section.on{{display:block}}
.pick{{text-align:center;margin:6px 0 16px}}select{{background:#1a1012;color:#ddd;border:1px solid #5c1c1a;padding:6px 10px;border-radius:6px;font-size:15px}}
.pick a{{color:#e8be5a;margin-left:10px}}</style></head>
<body>{site_menu("")}<h1>Heart Breakers - Monthly Recaps</h1>
<!-- only the latest recap shows by default; pick another month (or open
     newsletter.html#YYYY-MM) to see an older one -->
<div class="pick"><select id="m" onchange="show(this.value)">{"".join(
    f'<option value="{f.stem}">{datetime.strptime(f.stem, "%Y-%m").strftime("%B %Y")}'
    f'{" (latest)" if k == 0 else ""}</option>' for k, f in enumerate(files))}</select>
<a href="recaps.html">Recap archive</a></div>
{''.join(items) or '<p>No recaps yet.</p>'}
<script>
function show(id){{var ss=document.querySelectorAll("section"),hit=false;
ss.forEach(function(x){{var on=x.id===id;x.classList.toggle("on",on);if(on)hit=true;}});
if(!hit&&ss.length){{ss[0].classList.add("on");id=ss[0].id;}}
var m=document.getElementById("m");if(m)m.value=id;
if(location.hash.slice(1)!==id&&ss.length&&id!==ss[0].id)history.replaceState(null,"","#"+id);
else if(id===(ss[0]||{{}}).id&&location.hash)history.replaceState(null,"",location.pathname);}}
show(location.hash.slice(1));window.addEventListener("hashchange",function(){{show(location.hash.slice(1));}});
</script></body></html>""", encoding="utf-8")
    # recaps.html: the archive ("Past Recaps" button) - every saved month with
    # its recap image and links to all of its pages. Copies live in
    # data/recaps/ in the repo, so nothing is ever lost between runs.
    cards = []
    for f in files:
        label = datetime.strptime(f.stem, "%Y-%m").strftime("%B %Y")
        links = "".join(
            f'<a class="b" href="recaps/{f.stem}/{slug}.html">{_html.escape(lab)}</a>'
            for lab, _i, slug in RECAP_BUTTONS if slug and (RECAP_DIR / f.stem / f"{slug}.png").exists())
        cards.append(f"""<section id="{f.stem}"><h2>{label}</h2>
<a href="recaps/{f.name}"><img src="recaps/{f.name}" alt="{label} recap" loading="lazy"></a>
<div class="links">{links}<a class="b n" href="newsletter.html#{f.stem}">View recap</a></div></section>""")
    (out / "recaps.html").write_text(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Heart Breakers - Recap Archive</title>
<style>body{{background:#100a0b;color:#ddd;font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:16px}}
h1{{color:#e4382e;text-align:center}}h2{{color:#e8be5a;margin:28px 0 10px}}
nav{{text-align:center;margin-bottom:10px}}nav a{{color:#e8be5a;margin:0 8px}}
section{{border:1px solid #5c1c1a;border-radius:10px;padding:12px 14px 16px;margin-bottom:24px;background:#160d0e}}
img{{max-width:100%;border-radius:8px;display:block;margin:auto}}
.links{{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:center}}
.b{{background:#2a1416;border:1px solid #6b2420;color:#eee;text-decoration:none;padding:8px 12px;border-radius:6px;font-size:14px}}
.b.n{{background:#e4382e;border-color:#e4382e;color:#fff}}</style></head>
<body>{site_menu("")}<h1>Monthly Recap Archive</h1>
<nav>{" ".join(f'<a href="#{f.stem}">{datetime.strptime(f.stem, "%Y-%m").strftime("%b %Y")}</a>' for f in files)}</nav>
{''.join(cards) or '<p>No recaps yet.</p>'}</body></html>""", encoding="utf-8")


# --------------------------------------------------------------------------
# War payouts: calculator (leadership) + receipts archive (members) + Discord
# --------------------------------------------------------------------------
# The calculator (tools/payout_calculator.html) is published as payout.html in
# the LEADERSHIP secret folder (LEADER_DIR secret). Its "Save receipt" button
# opens GitHub with data/payouts/<war>-<YYYYMMDDHHMM>.json pre-filled; once
# committed, the next run draws the receipt (faction frame), lists it on
# (payouts.html now forwards to War History's paid wars) and posts it to Discord
# (DISCORD_WEBHOOK_PAYOUTS). A later file for the same war = revised receipt.
PAYOUT_DIR = ROOT / "data" / "payouts"
PAYOUT_STATE_PATH = ROOT / "data" / "payout_state.json"
# PRIVATE repo with config.json + data/ (receipts, history, Discord IDs) - the leaders' tools save there.
# The code (this file) lives in the public CODE_REPO, whose workflows check the data repo out next to it.
REPO = os.environ.get("DATA_REPO", "S1SEVEN17/HeartBreakersLogo")
CODE_REPO = os.environ.get("GITHUB_REPOSITORY", "S1SEVEN17/HeartBreakersSite")


def leader_dir() -> str:
    """Leadership-only folder (LEADER_DIR Actions secret; with the gatekeeper on, a derived hidden name)."""
    raw_ = os.environ.get("LEADER_DIR", "").strip().strip("/")
    return _gate_phys(raw_) if raw_ and gate_cfg() else raw_


def leader_base() -> str:
    """Address leaders use: the gatekeeper's /l when it's on, else the GitHub Pages folder."""
    g_ = gate_cfg()
    if g_:
        return g_["url"].rstrip("/") + "/l"
    return f"{BANNER_URL.rsplit('/', 1)[0]}/{leader_dir()}" if leader_dir() else ""


_PAYOUT_RAW = {}          # the run's raw data (ranked war list) for write_payout_data


def write_payout_data(d_: Path, raw: dict):
    """payout_data/index.json + payout_data/<war>.json in the LEADER folder:
    every saved war's result and per-member stats (war report + attack log),
    so the calculator loads them instantly with no API key. Wars whose attack
    log isn't read yet are listed with ready=false (calculator uses the API)."""
    hist = raw.get("_war_history") or {}
    if not hist and WAR_HIST_PATH.exists():
        hist = json.loads(WAR_HIST_PATH.read_text(encoding="utf-8"))
    my_id = raw.get("basic", {}).get("basic", raw.get("basic", {})).get("id") if raw.get("basic") else None
    meta = war_meta(raw, my_id) if raw.get("rankedwars") else {}
    pd = d_ / "payout_data"
    pd.mkdir(parents=True, exist_ok=True)
    index = []
    for wid, w in sorted(hist.get("wars", {}).items(), key=lambda kv: -kv[1]["end"]):
        mt = meta.get(wid, {})
        ready = (w.get("attack_log") or 0) >= 7      # 7+ = payout stats saved
        index.append({"id": int(wid), "end": w["end"], "start": w.get("start"), "opp": mt.get("opponent", "?"),
                      "won": mt.get("won"), "ready": ready})
        if not ready:
            continue
        (pd / f"{wid}.json").write_text(json.dumps({
            "id": int(wid), "start": w.get("start"), "end": w["end"], "opp": mt.get("opponent", "?"),
            "opp_id": w.get("opp_id"), "won": mt.get("won"), "our": mt.get("our"), "their": mt.get("their"),
            "rank": w.get("rank") or {},
            "members": [{k_: m.get(k_) for k_ in ("id", "name", "attacks", "score", "assists", "hosps",
                                                   "bonus_resp", "war_hits", "resp_war", "out", "out_all",
                                                   "resp_out", "out_bonus_resp", "mugs", "stealth", "losses")}
                        for m in w["members"]]}, separators=(",", ":")), encoding="utf-8")
    (pd / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")


def _latest_receipts() -> dict:
    """{war_id: receipt file stem} - the newest receipt saved for each war."""
    best = {}
    for f in sorted(PAYOUT_DIR.glob("*.json")) if PAYOUT_DIR.exists() else []:
        try:
            r = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        wid = str(r.get("war", {}).get("id", ""))
        if wid and (wid not in best or r.get("created", 0) >= best[wid][1]):
            best[wid] = (f.stem, r.get("created", 0))
    return {k: v[0] for k, v in best.items()}


def write_payout_calculator(cfg: dict, out: Path):
    if not leader_dir():
        print("Payout calculator: LEADER_DIR secret not set - not published")
        return
    pcfg = cfg.get("payouts", {})
    conf = {"repo": REPO, "branch": "main", "ghproxy": gh_proxy_url(), "faction_id": 51384,
            "receipts_url": f"{member_base()}/wars.html#paid",
            "member_base": member_base(),
            # newest saved receipt per war -> Create Newsletter links its image
            "receipts": _latest_receipts(),
            "termed": sorted(termed_wars(cfg)),        # the Termed yes / no question shows the current setting
            # wars with a saved war report (reports/war-<id>.png) -> Create Newsletter adds the report image
            "war_reports": sorted(f.stem[4:] for f in REPORTS_DIR.glob("war-*.png")) if REPORTS_DIR.exists() else [],
            "defaults": pcfg.get("defaults", {
                "mode": "pct", "budget": 0, "minHits": 1,
                "expenses": [{"label": "Faction tax", "type": "pct", "value": 10}],
                "filters": {"chainOnly": True, "noBonus": False, "warRespect": True},
                "weights": {"war": 75, "out": 25, "resp": 0, "assists": 0, "hosps": 0, "mugs": 0, "stealth": 0},
                "rules": [], "adjust": []})}
    html_ = (ROOT / "tools" / "payout_calculator.html").read_text(encoding="utf-8")
    write_payout_data(out / leader_dir(), _PAYOUT_RAW.get("raw") or {})
    d_ = out / leader_dir()
    d_.mkdir(parents=True, exist_ok=True)
    # the calculator's settings for the "Heart Breakers Hub" userscript's Payout tab (leaders - op "read"
    # l db/payout_cfg.json; its saved wars are l payout_data/*.json) - no repo / token details
    _jdump(d_ / "db" / "payout_cfg.json", {k: v for k, v in conf.items() if k not in ("repo", "ghproxy")})
    (d_ / "payout.html").write_text(html_.replace("__CONFIG__", json.dumps(conf)).replace("__MENU__", leader_menu("")),
                                   encoding="utf-8")
    # Torn-side userscript that fills the faction newsletter from "Create Newsletter" (leaders install it)
    (d_ / "hb-newsletter-filler.user.js").write_text(
        (ROOT / "tools" / "hb-newsletter-filler.user.js").read_text(encoding="utf-8"), encoding="utf-8")


PAYOUT_METRIC_LABELS = {"war": "War Hits", "out": "Outside Hits", "resp": "Respect", "assists": "Assists",
                        "hosps": "Hosps", "mugs": "Mugs", "stealth": "Stealth Hits"}


def payout_metrics(r: dict) -> list:
    """Per-metric breakdown of how the net was split: [{k, label, weight, pool,
    units, per}]. Newer receipts carry it; older ones are rebuilt from the
    member rows (qualified = war + outside >= min hits)."""
    if r.get("metrics"):
        return r["metrics"]
    field = {"war": "w", "out": "o", "resp": "r", "assists": "a", "hosps": "h"}
    mh = r.get("min_hits", 1)
    qual = [m for m in r.get("members", []) if m.get("w", 0) + m.get("o", 0) >= mh]
    flat = r.get("mode") == "flat"
    res = []
    for k, w in (r.get("weights") or {}).items():
        if not w or k not in field:
            continue
        units = sum(m.get(field[k], 0) for m in qual)
        pool = w * units if flat else r.get("net", 0) * w / 100
        res.append({"k": k, "label": PAYOUT_METRIC_LABELS.get(k, k), "weight": None if flat else w,
                    "pool": round(pool), "units": units, "per": w if flat else (pool / units if units else 0)})
    return res


UNPAID_RED = (240, 90, 80)
PAYOUT_VAULT_PATH = ROOT / "data" / "payout_vault.json"
VAULT_CHECK_DAYS = 21          # look for payments from war end until this many days later


def vault_payments(key: str, start: int, end: int):
    """Money added to members' faction balances in [start, end], from
    /v2/faction/news?cat=depositFunds. Rows look like:
      <a ...XID=1>Leader</a> increased <a ...XID=2>Member</a>'s money balance by $1,234 from $0 to $1,234
    Returns ({member id: [amount, ...]}, rows read) or None on error (key needs faction API access)."""
    import html as _h, re, time
    pat = re.compile(r"increased\s*<a[^>]*XID=(\d+)[^>]*>[^<]*</a>\s*'s money balance by \$([\d,]+)", re.I)
    pays, seen, rows = {}, set(), 0
    try:
        data = fetch_section("news", key, {"cat": "depositFunds", "from": start, "to": end, "limit": 100, "sort": "ASC"})
    except SystemExit as e:
        print(f"Vault check skipped: {e}")
        return None
    for _ in range(40):                       # 40 pages x 100 rows is plenty for 3 weeks
        items = _as_list(data.get("news"))
        for n in items:
            if n.get("id") in seen:
                continue
            seen.add(n.get("id"))
            rows += 1
            m = pat.search(_h.unescape(str(n.get("text", ""))))
            if m:
                pays.setdefault(m.group(1), []).append(int(m.group(2).replace(",", "")))
        nxt = ((data.get("_metadata") or {}).get("links") or {}).get("next")
        if not nxt or not items:
            break
        time.sleep(API_PAGE_DELAY)
        try:
            data = fetch_url(nxt, key)
        except SystemExit as e:
            print(f"Vault check incomplete, will retry: {e}")
            return None
    return pays, rows


def vault_status(r: dict, found: dict) -> dict:
    """Per paid member: "ok" (a payment, or several together, equal to the payout, within $1),
    "diff" (money sent, different amount) or "missing" (nothing found)."""
    res = {}
    for m in r.get("members", []):
        pay = int(m.get("pay") or 0)
        if pay <= 0:
            continue
        got = found.get(str(m["id"]), [])
        if any(abs(a - pay) <= 1 for a in got) or (got and abs(sum(got) - pay) <= len(got)):
            st = "ok"
        elif got:
            st = "diff"
        else:
            st = "missing"
        res[str(m["id"])] = {"st": st, "got": sum(got)}
    return res


def update_vault_checks(latest: dict, key: str) -> dict:
    """Check each war's CURRENT receipt against the vault log. Re-checked every run until every
    payment is found or VAULT_CHECK_DAYS have passed since the war ended. Saved in
    data/payout_vault.json {receipt stem: {"checked": ts, "final": bool, "members": {...}}}."""
    import time
    try:
        vs = json.loads(PAYOUT_VAULT_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        vs = {}
    if not key:
        return vs
    now = int(time.time())
    for wid, (f, r) in latest.items():
        cur = vs.get(f.stem)
        if cur and (cur.get("final") or not due("vault", cur.get("checked"))):
            continue                       # done, or already checked this 3-hour slot (a new receipt: straight away)
        end = int(r["war"].get("end") or r.get("created", now))
        stop = min(now, end + VAULT_CHECK_DAYS * 86400)
        got = vault_payments(key, end - 3600, stop)
        if got is None:
            continue
        found, rows = got
        st = vault_status(r, found)
        ok = sum(1 for v in st.values() if v["st"] == "ok")
        vs[f.stem] = {"checked": now, "members": st,
                      "final": ok == len(st) or now >= end + VAULT_CHECK_DAYS * 86400}
        print(f"Vault check war {wid}: {rows} vault rows, {ok}/{len(st)} payouts found")
    PAYOUT_VAULT_PATH.write_text(json.dumps(vs, indent=1) + "\n", encoding="utf-8")
    return vs


def payout_war_card(wid: str):
    """War Summary printout (result, score, duration, rank, participation, Top Hits / Most Respect)
    for a payout receipt - built from this run's ranked war list + saved war history. None if unknown."""
    raw = _PAYOUT_RAW.get("raw") or {}
    if "rankedwars" not in raw or "basic" not in raw:
        return None
    try:
        my_id = raw["basic"].get("basic", raw["basic"]).get("id")
        one = normalize_wars(dict(raw, rankedwars={"rankedwars": [
            w for w in _as_list(raw["rankedwars"].get("rankedwars")) if str(w.get("id")) == str(wid)]}),
            my_id, dict(load_config().get("ranked_wars", {}), count=1, top_hitters=5))
        return war_summary_card(one[0]) if one else None
    except Exception as e:
        print(f"Payout receipt: war summary for {wid} skipped ({type(e).__name__})")
        return None


def payout_receipt_image(r: dict, vault: dict = None, war_card=None, layer: bool = False):
    """Framed receipt: war result, budget / expenses / paid tiles, then every
    member's payout (two columns of the table when long) and a total.
    layer=True: the unframed content layer (PAYOUT SUMMARY heading) for the combined War Report & Payout."""
    if layer and war_card is None:
        war_card = True                        # -> the "PAYOUT SUMMARY" heading (result/score are in the war summary)
    w = r["war"]
    mem = [m for m in r["members"] if m.get("pay", 0) > 0]
    unpaid = [m for m in r["members"] if not m.get("pay")]
    def draw(c):
        res = "VICTORY" if w.get("won") else "DEFEAT"
        when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y") if w.get("end") else ""
        sub = f"{when} · Score {fmt_int(w.get('our', 0))} - {fmt_int(w.get('their', 0))}"
        if w.get("rank_before") and w.get("rank_after"):
            sub += f" · Rank {w['rank_before']} > {w['rank_after']}"
        h = LB_HEAD_H + 6 + 30 + 96 + 2 * LB_CARD_PAD + (34 if r.get("expenses") else 0)
        if war_card is not None:      # result/score are in the war summary above
            ty = c.card(h, "PAYOUT SUMMARY", colour=(232, 190, 90), sub=f"{when} · War vs {w.get('opponent', '?')}")
        else:
            ty = c.card(h, f"{res} VS {str(w.get('opponent', '?')).upper()}",
                        colour=(120, 200, 120) if w.get("won") else RED, sub=sub)
        exp = sum(e["amount"] for e in r.get("expenses", []))
        ty = c.tiles(ty, [("Budget", _short_money(r.get("budget", 0))), ("Expenses", "-" + _short_money(exp)),
                          ("Paid to Members", _short_money(r.get("paid", 0)), (232, 190, 90)),
                          ("Members Paid", str(len(mem)))])
        if r.get("expenses"):
            ex = " · ".join(f"{e['label']}{' (' + format(float(e['pct']), 'g') + '%)' if e.get('pct') else ''}: "
                            f"{_short_money(e['amount'])}" for e in r["expenses"])
            draw_text(c.d, (W / 2, ty + 18), ex, fit_font(ex, "Medium", 20, CW - 40, 13), (150, 150, 152),
                      shadow=False, anchor="ms")
        c.y += h + LB_ROW_GAP
        # Metrics - how the net was broken down: weight -> pool -> total units -> $ per unit
        mets = payout_metrics(r)
        if mets:
            flat = r.get("mode") == "flat"
            adj = r.get("adj") or {}
            mrows = [(m["label"], ([] if flat else [format(float(m["weight"]), "g") + "%"]) +
                      [_short_money(m["pool"]),
                       f"{m['units']:,.1f}" if m["k"] == "resp" else fmt_int(round(m["units"])),
                       f"${m['per']:,.2f}"]) for m in mets]
            blank = [""] * (3 if flat else 4)
            if adj.get("bonus"):
                mrows.append(("Bonuses", blank[:-3] + ["+" + _short_money(adj["bonus"]), "", ""]))
            if adj.get("penalty"):
                mrows.append(("Penalties", blank[:-3] + ["-" + _short_money(adj["penalty"]), "", ""]))
            nq = sum(1 for m in r.get("members", []) if m.get("w", 0) + m.get("o", 0) >= r.get("min_hits", 1))
            sub = (f"{'Flat rate per unit' if flat else 'Percentage split of ' + _short_money(r.get('net', 0))}"
                   f" · Qualify: {r.get('min_hits', 1)}+ total hits · {nq} qualified")
            h = LB_HEAD_H + 6 + 30 + 28 + len(mrows) * 32 + 10 + 2 * LB_CARD_PAD
            ty = c.card(h, "METRICS", sub=sub)
            cols = ([] if flat else [("WEIGHT", 110)]) + [("POOL", 170), ("TOTAL", 130), ("PER UNIT", 190)]
            c.table(ty, cols, mrows, name_label="METRIC", medals=False, ranks=False)
            c.y += h + LB_ROW_GAP
        # Vault check - payouts found / not found in the faction's vault log (depositFunds news)
        vm = (vault or {}).get("members") or {}
        if vm:
            bad = [m for m in mem if vm.get(str(m["id"]), {}).get("st") in ("missing", "diff")]
            okn = sum(1 for m in mem if vm.get(str(m["id"]), {}).get("st") == "ok")
            if bad:
                lines = [f"{m['n']} - {_short_money(m['pay'])} owed, " +
                         ("nothing found" if vm[str(m["id"])]["st"] == "missing"
                          else f"{_short_money(vm[str(m['id'])]['got'])} found") for m in bad]
                head = f"{okn} of {len(mem)} payouts found · {len(bad)} unaccounted"
            else:
                lines, head = [], f"All {len(mem)} payouts found in the vault log"
            chk = datetime.fromtimestamp(vault.get("checked", 0), timezone.utc).strftime("%b %d, %H:%M TCT")
            h = LB_HEAD_H + 6 + 30 + 34 + len(lines) * 30 + 2 * LB_CARD_PAD
            ty = c.card(h, "VAULT CHECK", colour=RED if bad else (120, 200, 120), sub=f"Checked {chk}")
            draw_text(c.d, (W / 2, ty + 22), head, font("SemiBold", 24),
                      UNPAID_RED if bad else (120, 200, 120), shadow=False, anchor="ms")
            for k, ln in enumerate(lines):
                draw_text(c.d, (W / 2, ty + 56 + k * 30), ln, fit_font(ln, "Medium", 21, CW - 60, 13),
                          UNPAID_RED, shadow=False, anchor="ms")
            c.y += h + LB_ROW_GAP
        else:
            bad = []
        badids = {str(m["id"]) for m in bad}
        rows = [(m["n"], [fmt_int(m.get("w", 0)), fmt_int(m.get("o", 0)), f"{m.get('r', 0):,.1f}",
                          ("+" + _short_money(m["b"]) if m.get("b") else "") + ("-" + _short_money(m["p"]) if m.get("p") else ""),
                          _short_money(m["pay"])]) + ((UNPAID_RED,) if str(m["id"]) in badids else ())
                for m in mem]
        h = LB_HEAD_H + 6 + 30 + 28 + (len(rows) + 1) * 32 + 10 + 6 + 2 * LB_CARD_PAD
        ty = c.card(h, "MEMBER PAYOUTS", sub="War = hits on the enemy · Outside = other hits during the war · "
                                             "Adj. = bonus / penalty")
        c.table(ty, [("WAR", 70), ("OUTSIDE", 96), ("RESPECT", 110), ("ADJ.", 170), ("PAYOUT", 190)], rows,
                total=("TOTAL", [fmt_int(sum(m.get("w", 0) for m in mem)), fmt_int(sum(m.get("o", 0) for m in mem)),
                                 f"{sum(m.get('r', 0) for m in mem):,.1f}", "", _short_money(r.get("paid", 0))]))
        c.y += h + LB_ROW_GAP
        foot = []
        if unpaid:
            foot.append("Not paid: " + ", ".join(m["n"] for m in unpaid))
        made = datetime.fromtimestamp(r.get("created", 0), timezone.utc).strftime("%b %d, %Y %H:%M TCT")
        foot.append(f"Receipt {made}" + (f" · Paid by {r['paid_by']}" if r.get("paid_by") else "")
                    + (f" · {r['note']}" if r.get("note") else ""))
        lines = [ln for t in foot for ln in wrap(t, font("Medium", 20), CW - 40)]
        h = 20 + len(lines) * 28 + 2 * LB_CARD_PAD
        c.d.rounded_rectangle([CX0, c.y, CX1, c.y + h], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
        for k, ln in enumerate(lines):
            draw_text(c.d, (W / 2, c.y + LB_CARD_PAD + 24 + k * 28), ln, font("Medium", 20), (165, 165, 168),
                      shadow=False, anchor="ms")
        c.y += h + LB_ROW_GAP
    cv = _Canvas(_height_of(draw))
    draw(cv)
    img = cv.img
    if layer:
        return img
    if war_card is not None:      # the war's summary printout (same card as the war report) on top
        both = Image.new("RGBA", (img.width, war_card.height + img.height - PAD_TOP), (0, 0, 0, 0))
        both.alpha_composite(war_card, (0, 0))
        both.alpha_composite(img.crop((0, PAD_TOP, img.width, img.height)), (0, war_card.height))
        img = both
    return frame_png(img, bar="War Payout Receipt")


PAYOUT_POST_V = b"9"       # 9: one combined War Report & Payout image


def payout_newsletter(r: dict, wid: str) -> tuple:
    """(title, body HTML) - same newsletter as the calculator's Create Newsletter."""
    w, base_url = r["war"], member_base()
    won = w.get("won")
    col = "#2e8b3a" if won else "#c0261d"
    when = datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y") if w.get("end") else ""
    rank = ""
    if w.get("rank_before") and w.get("rank_after"):
        rank = (f" · Rank {w['rank_after']}" if w["rank_before"] == w["rank_after"]
                else f" · Rank {w['rank_before']} → {w['rank_after']}")
    paid_n = sum(1 for m in r["members"] if m.get("pay"))
    exp = ", ".join(f"{e['label']}{' ' + format(float(e['pct']), 'g') + '%' if e.get('pct') else ''}: ${e['amount']:,}"
                    for e in r.get("expenses", []))
    unit = {"war": "war hit", "out": "outside hit", "resp": "respect", "assists": "assist", "hosps": "hosp",
            "mugs": "mug", "stealth": "stealth hit"}
    split = "<br>".join(
        f"{m['label']}: " + (f"{format(float(m['weight']), 'g')}% → " if m.get("weight") is not None else "")
        + f"<strong>${m['per']:,.2f}</strong> per {unit.get(m['k'], 'unit')}" for m in payout_metrics(r))
    title = f"War Payout - {'Victory' if won else 'Defeat'} vs {w.get('opponent', '?')}"
    body = nl_join([
        nl_p('<strong><span style="font-size:20px;color:#c0261d">WAR PAYOUT</span></strong>'),
        nl_p(f'<strong><span style="font-size:16px;color:{col}">{"Victory" if won else "Defeat"} vs {w.get("opponent", "?")}'
             f'</span></strong><br>{when} · Score {fmt_int(w.get("our", 0))} - {fmt_int(w.get("their", 0))}{rank}'),
        nl_p(f'Payouts have been sent to your <strong>faction balance</strong>.<br><strong>${r.get("paid", 0):,}</strong> '
             f'was paid to <strong>{paid_n}</strong> members from a ${r.get("budget", 0):,} budget' + (f" ({exp})" if exp else "") + "."),
        nl_p("<strong>How it was split</strong><br>" + split) if split else "",
        nl_p(f'<a href="{base_url}/payouts/war-{wid}.html"><img src="{base_url}/payouts/war-{wid}.png" '
             f'alt="War payout receipt" width="600"></a>'),
        nl_p(f'Full report &amp; past payouts: <a href="{base_url}/wars.html#paid">War History - paid wars</a>'
             + (f"<br>Paid by {r['paid_by']}" if r.get("paid_by") else "") + (f" · {r['note']}" if r.get("note") else ""),
             "font-size:12px")])
    return title, body


def payout_discord_text(r: dict, corrected: bool, vm: dict) -> str:
    """Discord message for a payout receipt, in sections (Discord markdown: ## heading, -# small
    text, > quote blocks):  heading + date line, Result, Payout, Rates, vault status, paid-by footer."""
    w = r["war"]
    head = f"## 💰 War Payout{' (Corrected)' if corrected else ''}\n**{'Victory' if w.get('won') else 'Defeat'} vs {w.get('opponent', '?')}**"
    sub = []
    if w.get("end"):
        sub.append(datetime.fromtimestamp(w["end"], timezone.utc).strftime("%b %d, %Y"))
    if w.get("start") and w.get("end"):
        mins = int(round((w["end"] - w["start"]) / 60))
        sub.append(f"{mins // 60}h {mins % 60}m war")
    out = [head + (f"\n-# {' · '.join(sub)}" if sub else ""), ""]
    res = [f"> Score **{fmt_int(w.get('our', 0))}** - **{fmt_int(w.get('their', 0))}**"]
    if w.get("rank_before") and w.get("rank_after"):
        res.append("> Rank **" + (w["rank_after"] if w["rank_before"] == w["rank_after"]
                                  else f"{w['rank_before']} → {w['rank_after']}") + "**")
    out += ["**⚔️ Result**"] + res + [""]
    paid_n = sum(1 for m in r["members"] if m.get("pay"))
    pay = [f"> **${r.get('paid', 0):,}** paid to **{paid_n}** members", f"> Budget ${r.get('budget', 0):,}"]
    for e in r.get("expenses", []):
        pay.append(f"> {e['label']}{' (' + format(float(e['pct']), 'g') + '%)' if e.get('pct') else ''}: -${e['amount']:,}")
    out += ["**💵 Payout**"] + pay + [""]
    unit = {"war": "War hits", "out": "Outside hits", "resp": "Respect", "assists": "Assists", "hosps": "Hosps",
            "mugs": "Mugs", "stealth": "Stealth hits"}
    mets = payout_metrics(r)
    if mets:
        out += ["**📊 Rates**"] + [f"> {unit.get(m['k'], m['label'])}: **${m['per']:,.2f}** each · {m['units']:,.0f} total"
                                   for m in mets] + [""]
    if vm:
        bad = [m for m in r["members"] if vm.get(str(m["id"]), {}).get("st") in ("missing", "diff")]
        if bad:
            out += ["**⚠️ Not found in the vault log**"] + [f"> {m['n']} - ${m['pay']:,}" for m in bad] + [""]
        else:
            out += [f"✅ All {paid_n} payouts found in the vault log", ""]
    foot = [x for x in (f"Paid by {r['paid_by']}" if r.get("paid_by") else "", r.get("note", "")) if x]
    if foot:
        out.append("-# " + " · ".join(foot))
    return "\n".join(out).rstrip()


def update_payouts(cfg: dict, out: Path):
    """Render every saved receipt (data/payouts/*.json), keep member pages +
    payouts.html (forwards to War History, paid wars), post NEW receipts to Discord."""
    files = sorted(PAYOUT_DIR.glob("*.json")) if PAYOUT_DIR.exists() else []
    mout = member_out(out)
    base_url = member_base()
    try:
        state = json.loads(PAYOUT_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {"posted": []}
    # Discord: war payouts are no longer posted on their own (Nov 2026) - the #war-reports hub (discord_post_wars)
    # shows the latest war's War Report & Payout and is edited when a receipt is saved. #war-payouts is retired, so
    # the DISCORD_WEBHOOK_PAYOUTS secret isn't used any more (the old per-war post code below is kept, switched off).
    url = ""
    latest, cards = {}, []
    receipts = []
    for f in files:
        try:
            r = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            print(f"Payout receipt {f.name}: not valid JSON - skipped")
            continue
        receipts.append((f, r))
        wid = str(r["war"]["id"])
        if wid not in latest or r.get("created", 0) >= latest[wid][1].get("created", 0):
            latest[wid] = (f, r)
    (mout / "payouts").mkdir(parents=True, exist_ok=True)
    # vault log check (full runs only - a few news calls per unchecked receipt)
    key_ = os.environ.get("TORN_API_KEY", "").strip() if os.environ.get("RUN_KIND", "full") == "full" else ""
    vault = update_vault_checks(latest, key_)
    # the combined War Report & Payout images (saved data only) - drawn now so the post below uses them
    if (_PAYOUT_RAW.get("raw") or {}).get("_war_history"):
        refresh_war_reports(_PAYOUT_RAW["raw"], load_config())
    # Stable link per war: payouts/war-<war id>.html/.png always shows the CURRENT (corrected) receipt.
    # Every receipt version's own name (<war>-<stamp>.html/.png) is also kept: its page forwards to the
    # war's link and its image is the current one - so links already in Discord / newsletters never break.
    discord_imgs = {}       # war id -> [(filename, bytes)] for the War Payouts post
    for wid, (f, r) in latest.items():
        card = payout_war_card(wid)
        png = payout_receipt_image(r, vault.get(f.stem), card)
        # Discord War Payouts post = the War Report + the payout breakdown (receipt without the war card,
        # so the war summary isn't shown twice). War Report: the one posted after the war (data/reports),
        # else the war summary on its own in the War Report frame.
        rep_png = REPORTS_DIR / f"war-{wid}.png"
        war_rep = rep_png.read_bytes() if rep_png.exists() else (frame_png(card, bar="War Report") if card is not None else None)
        discord_imgs[wid] = ([(f"war-report-{wid}.png", war_rep)] if war_rep else []) + \
                            [(f"war-payout-{wid}.png", payout_receipt_image(r, vault.get(f.stem)) if war_rep else png)]
        # the war's combined War Report & Payout (when it's up to date with this receipt) = ONE image
        try:
            _m = json.loads((REPORTS_DIR / f"war-{wid}.json").read_text(encoding="utf-8"))
            if rep_png.exists() and _m.get("pay") and _m.get("pay") == war_payout_sig(wid)[2]:
                discord_imgs[wid] = [(f"war-report-payout-{wid}.png", rep_png.read_bytes())]
        except (OSError, ValueError):
            pass
        slug = f"war-{wid}"
        (mout / "payouts" / f"{slug}.png").write_bytes(png)
        markup = (f'<p style="text-align:center;"><a href="{base_url}/payouts/{slug}.html">'
                  f'<img src="{base_url}/payouts/{slug}.png" alt="War payout receipt" width="600"></a></p>')
        image_page(mout / "payouts" / f"{slug}.html",
                   f"War Payout - vs {r['war'].get('opponent', '?')}", f"{slug}.png", markup, "../")
        for g, x in receipts:
            if str(x["war"]["id"]) != wid:
                continue
            (mout / "payouts" / f"{g.stem}.png").write_bytes(png)
            (mout / "payouts" / f"{g.stem}.html").write_text(
                f'<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">'
                f'<meta http-equiv="refresh" content="0;url={slug}.html"><title>War Payout</title></head>'
                f'<body style="background:#100a0b;color:#ddd;font-family:sans-serif;text-align:center">'
                f'<p><a href="{slug}.html" style="color:#e8be5a">Open the current receipt</a></p></body></html>',
                encoding="utf-8")
    # Discord: ONE message per war, kept in step with that war's newest receipt.
    # state["messages"][war_id] = {"id": message id, "file": receipt file, "hash": content hash}
    # - first receipt for a war -> POST, save the message id
    # - receipt edited or a newer revision saved -> PATCH that same message (marked "corrected")
    # - message gone (deleted in Discord) -> post a fresh one
    # config payouts.replace {war_id: message_id} adopts an older post whose id wasn't saved.
    import hashlib
    msgs = state.setdefault("messages", {})
    for wid_, mid in (cfg.get("payouts", {}).get("replace") or {}).items():
        if str(wid_) not in msgs or msgs[str(wid_)].get("id") != str(mid):
            msgs[str(wid_)] = {"id": str(mid), "file": "", "hash": ""}
    for wid, (f, r) in (latest.items() if url else []):
        # hash covers the receipt AND its vault check, so a new check result updates the post too
        # PAYOUT_POST_V: bump when the post's text/layout changes so existing posts are refreshed
        h = hashlib.sha1(PAYOUT_POST_V + base_url.encode() + f.read_bytes() + json.dumps((vault.get(f.stem) or {}).get("members", {}),
                                                     sort_keys=True).encode()).hexdigest()[:12]
        cur = msgs.get(wid)
        if cur and cur.get("hash") == h and cur.get("file") == f.name:
            continue
        rhash = hashlib.sha1(f.read_bytes()).hexdigest()[:12]
        # "corrected" = the receipt itself changed (not just a new vault check result)
        corrected = (bool(cur) and (cur.get("file") != f.name or cur.get("rhash", "") != rhash)) or \
                    (not cur and f.name in state.get("posted", []))
        vm = (vault.get(f.stem) or {}).get("members") or {}
        nbad = sum(1 for v in vm.values() if v["st"] != "ok")
        vtxt = "" if not vm else (f" · ⚠️ {nbad} payout{'s' if nbad != 1 else ''} not found in the vault log"
                                  if nbad else " · ✅ all found in the vault log")
        text = payout_discord_text(r, corrected, vm)
        payload = {"username": cfg.get("payouts", {}).get("username", "War Payouts"), "content": text,
                   "attachments": [{"id": k, "filename": n} for k, (n, _b) in enumerate(discord_imgs[wid])],
                   "components": [{"type": 1, "components": [
                       {"type": 2, "style": 5, "label": "Report & Payout", "url": f"{base_url}/reports/war-{wid}.html"},
                       {"type": 2, "style": 5, "label": "All paid wars", "url": f"{base_url}/wars.html#paid"}]}],
                   "allowed_mentions": {"parse": []}}
        files_ = discord_imgs[wid]
        mid = None
        if cur and cur.get("id"):
            try:
                _discord_request(f"{url}/messages/{cur['id']}?with_components=true", "PATCH",
                                 payload, files_)
                mid = cur["id"]
                print(f"Discord: payout receipt for war {wid} replaced (message {mid})")
            except urllib.error.HTTPError as e:
                print(f"Discord: payout message {cur['id']} not editable ({e.code}) - posting new")
            except Exception as e:      # never print the URL
                print(f"Discord: payout receipt edit failed: {type(e).__name__}")
                continue
        if mid is None:
            try:
                res = _discord_request(f"{url}?wait=true&with_components=true", "POST",
                                       payload, files_)
                mid = str(res.get("id", ""))
                print(f"Discord: posted payout receipt for war {wid} (message {mid})")
            except Exception as e:      # never print the URL
                print(f"Discord: payout receipt post failed: {type(e).__name__}")
                continue
        msgs[wid] = {"id": mid, "file": f.name, "hash": h, "rhash": rhash}
        discord_msg_save(f"payout:{wid}", mid)
        if f.name not in state.setdefault("posted", []):
            state["posted"].append(f.name)
    PAYOUT_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")
    # payouts.html: merged into War History (Nov 2026) - every paid war is there with its War Report & Payout;
    # the old address opens War History filtered to paid wars
    (mout / "payouts.html").write_text('<!DOCTYPE html><meta charset="utf-8"><title>War Payouts</title>'
                                       '<script>location.replace("wars.html#paid")</script>', encoding="utf-8")


# --------------------------------------------------------------------------
# Organized Crime delay alerts (Discord, DISCORD_WEBHOOK_CRIMES)
# --------------------------------------------------------------------------
DISCORD_CRIME_STATE_PATH = ROOT / "data" / "discord_crime_state.json"


def _discord_id(user_id, key: str):
    """The member's linked Discord user ID (GET /v2/user/{id}/discord), or
    None if they haven't linked one. Never saved or logged."""
    try:
        data = fetch_url(f"https://api.torn.com/v2/user/{user_id}/discord", key)
    except SystemExit:
        return None
    def find(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower().replace("_", "") in ("discordid",) and v and str(v).isdigit():
                    return str(v)
                r = find(v)
                if r:
                    return r
        return None
    return find(data)


def _slot_user(slot: dict):
    u = slot.get("user")
    if isinstance(u, dict) and u.get("id"):
        return u.get("id")
    return slot.get("user_id") or (u if isinstance(u, int) else None)


def delayed_crimes(crimes: list, members: list, now: int) -> list:
    """OCs that are READY (ready_at has passed, every slot filled) but haven't
    started because a member can't take part - travelling/abroad, in
    hospital, jail or federal jail. Returns
      [{id, name, difficulty, ready_at, culprits: [{id, name, position, status}]}]"""
    mem = {m.get("id"): m for m in members}
    out = []
    for c in crimes:
        if str(c.get("status", "")).lower() not in ("planning", "ready", "delayed", ""):
            continue
        ready = c.get("ready_at")
        slots = _as_list(c.get("slots"))
        if not ready or int(ready) > now or not slots:
            continue
        if any(not _slot_user(sl) for sl in slots):
            continue                       # still recruiting
        culprits = []
        for sl in slots:
            uid = _slot_user(sl)
            m = mem.get(uid, {})
            st = m.get("status") or {}
            if str(st.get("state", "Okay")).lower() != "okay":
                culprits.append({"id": uid, "name": m.get("name", f"[{uid}]"),
                                 "position": sl.get("position", ""),
                                 "status": st.get("description") or st.get("state", "")})
        if culprits:
            out.append({"id": str(c.get("id")), "name": c.get("name", "Organized Crime"),
                        "difficulty": c.get("difficulty"), "ready_at": int(ready),
                        "culprits": culprits})
    return out


def crime_alert_image(cr: dict, now: int) -> bytes:
    """One card: crime name, how long it's been waiting, who's delaying it."""
    import io
    pad, row_h = LB_CARD_PAD, 40
    ix, iw = CX0 + pad, CW - 2 * pad
    ch = LB_HEAD_H + 40 + 92 + 20 + 40 + len(cr["culprits"]) * row_h + 2 * pad
    img, d = layer(PAD_TOP + ch + PAD_BOT - 10)
    y = PAD_TOP
    d.rounded_rectangle([CX0, y, CX1, y + ch], radius=10, fill=CARD_FILL, outline=CARD_EDGE, width=2)
    ty = y + pad
    draw_text(d, (ix + iw / 2, ty + 26), "ORGANIZED CRIME DELAYED", font("Bold", 26), (232, 140, 60),
              track=2, anchor="ms")
    d.line([(ix + 4, ty + 38), (ix + iw - 4, ty + 38)], fill=RULE, width=2)
    ty += LB_HEAD_H + 6
    when = datetime.fromtimestamp(cr["ready_at"], timezone.utc).strftime("%b %d, %H:%M TCT")
    draw_text(d, (ix + iw / 2, ty + 18), f"Ready since {when}", font("Medium", 21), (150, 150, 152), anchor="ms")
    ty += 40
    tiles = [("Crime", cr["name"]), ("Difficulty", str(cr["difficulty"] or "-")),
             ("Waiting", _dur(cr["ready_at"], now) or "<1m")]
    tw = iw / len(tiles)
    for k, (lab, val) in enumerate(tiles):
        cx = ix + tw * k + tw / 2
        d.rounded_rectangle([ix + tw * k + 6, ty, ix + tw * (k + 1) - 6, ty + 84], radius=8,
                            fill=(24, 12, 13, 255), outline=RULE, width=2)
        draw_text(d, (cx, ty + 44), val, fit_font(val, "Bold", 32, tw - 28, 16), TEXT, anchor="ms")
        draw_text(d, (cx, ty + 72), lab.upper(), font("SemiBold", 18), SUB, track=1, anchor="ms")
    ty += 92 + 20
    draw_text(d, (ix + iw / 2, ty + 22), "DELAYED BY", font("Bold", 22), TITLE, track=2, anchor="ms")
    d.line([(ix + 4, ty + 32), (ix + iw - 4, ty + 32)], fill=RULE, width=2)
    ty += 40
    f_n, f_s = font("SemiBold", 26), font("Medium", 22)
    for k, m in enumerate(cr["culprits"]):
        base = ty + k * row_h + 28
        nm = f"{m['name']}" + (f"  ({m['position']})" if m.get("position") else "")
        draw_text(d, (ix + 6, base), nm, fit_font(nm, "SemiBold", 26, iw / 2 - 10, 16), TEXT)
        sw = f_s.getlength(m["status"])
        draw_text(d, (ix + iw - 6 - sw, base), m["status"], f_s, (232, 140, 60))
    return frame_png(img, bar="Organized Crimes")      # same faction frame as everything else


ITEM_NAMES_PATH = ROOT / "data" / "item_names.json"     # item id -> name (OC item requirements), cached forever


def item_names(ids: set, key: str) -> dict:
    """Names for item ids - cached in data/item_names.json, so only new ids cost an API call."""
    try:
        cache = json.loads(ITEM_NAMES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    need = sorted(str(i) for i in ids if i and str(i) not in cache)
    if need:
        try:
            data = fetch_url(f"https://api.torn.com/v2/torn/items?ids={','.join(need)}", key)
            items = data.get("items")
            for it in (items.values() if isinstance(items, dict) else _as_list(items)):
                if isinstance(it, dict) and it.get("id"):
                    cache[str(it["id"])] = it.get("name", f"Item #{it['id']}")
            ITEM_NAMES_PATH.write_text(json.dumps(cache, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        except SystemExit as e:
            print(f"Item names skipped: {e}")
    return cache


OC_STATE_ICONS = {"traveling": "✈️", "abroad": "✈️", "hospital": "🏥", "jail": "⛓️", "federal": "⛓️"}


def crime_issues(c: dict, mem: dict, names: dict) -> list:
    """Members in a crime who can't finish it right now:
      ✈️/🏥/⛓️ not Okay (travelling / abroad / hospital / jail), 🧰 missing the slot's required item,
      🚪 no longer in the faction.  -> [{id, name, position, icon, text}]"""
    out = []
    for sl in _as_list(c.get("slots")):
        uid = _slot_user(sl)
        if not uid:
            continue
        m = mem.get(uid) or mem.get(str(uid))
        pos = sl.get("position", "")
        if not m:
            out.append({"id": uid, "name": f"[{uid}]", "position": pos, "icon": "🚪", "text": "no longer in the faction"})
            continue
        st = m.get("status") or {}
        state = str(st.get("state", "Okay")).lower()
        if state != "okay":
            out.append({"id": uid, "name": m.get("name", "?"), "position": pos,
                        "icon": OC_STATE_ICONS.get(state, "⚠️"), "text": st.get("description") or st.get("state", "")})
        req = sl.get("item_requirement") or {}
        if req and req.get("is_available") is False:
            out.append({"id": uid, "name": m.get("name", "?"), "position": pos, "icon": "🧰",
                        "text": f"missing {names.get(str(req.get('id')), 'the required item')}"})
    return out


def oc_overview_payload(crimes: list, mem: dict, names: dict, now: int, ocfg: dict) -> dict:
    """The single Overview post, as a GRID: every crime is an inline field (Discord shows up to 3 side by
    side on desktop; phones stack them). Live countdown to ready (<t:..:R> ticks by itself), members
    filled, and who can't finish it.
      embed "Planning"        - all slots filled, by time remaining (closest first)
      embed "Recruiting"      - crimes with open slots
      embed "DELAYED CRIMES"  - red, at the TOP (above both categories), only when any"""
    rows = []
    for c in crimes:
        st = str(c.get("status", "")).lower()
        if st not in ("planning", "recruiting", "ready", "delayed", ""):
            continue
        slots = _as_list(c.get("slots"))
        filled = sum(1 for sl in slots if _slot_user(sl))
        open_ = len(slots) - filled
        issues = crime_issues(c, mem, names)
        ready = int(c.get("ready_at") or 0)
        recruiting = bool(open_ or not ready)
        if recruiting:
            timer, late = f"📝 {open_} open slot{'s' if open_ != 1 else ''}", False
        elif ready > now:
            timer, late = f"⏳ <t:{ready}:R>", False
        elif issues:
            timer, late = f"🔴 **Late** <t:{ready}:R>", True
        else:
            timer, late = "🟢 Starting now", False
        lines = [timer, f"👥 {filled}/{len(slots)}"]
        # short issue lines so three crimes fit side by side
        lines += [f"{x['icon']} **{x['name']}** · {x['text'].replace('missing ', 'needs ')}" for x in issues] or (
            ["✅ All set"] if filled and not open_ else [])
        rows.append((late, ready or 9e12, recruiting, {"name": f"{'🔴 ' if late else ''}{c.get('name', 'Organized Crime')} · D{c.get('difficulty', '?')}"[:256],
                                           # trailing blank line (zero-width space - Discord trims plain newlines)
                                           # = a gap between crimes when phones stack the tiles
                                           "value": ("\n".join(lines))[:1000] + "\n\u200b", "inline": True}))
    rows.sort(key=lambda r: r[1])
    # three groups: Planning (all slots filled, counting down) · Recruiting (open slots) · Delayed (bottom, red)
    planning = [r[3] for r in rows if not r[0] and not r[2]]
    recruiting = [r[3] for r in rows if not r[0] and r[2]]
    late = [r[3] for r in rows if r[0]]

    def grid(fields, title, colour, desc=None):
        # max 25 fields per embed: split long lists over several embeds
        out = []
        for k in range(0, len(fields), 24):
            e = {"color": colour, "fields": fields[k:k + 24]}
            if k == 0:
                e["title"] = title
                if desc:
                    e["description"] = desc
            out.append(e)
        return out
    embeds = []
    if late:          # delayed crimes first, above both categories
        embeds += grid(late, f"🚨 DELAYED CRIMES ({len(late)})", 0xe4382e,
                       "Ready but held up - the members below need to sort it out **now**.")
    if planning:
        embeds += grid(planning, f"⏳ Planning ({len(planning)})", 0xe8be5a)
    # recruiting crimes have their own post since Nov 2026 (oc_recruit_payload) - below this one
    head = (f"## 🕵️ Organized Crimes\n-# {len(planning)} planning · "
            + (f"**{len(late)} delayed**" if late else "no delays") + f" · updated <t:{now}:R>")
    if not planning and not late:
        head += "\nNo crimes planning right now."
    return {"username": ocfg.get("username", "Organized Crimes"), "content": head, "embeds": embeds[:10],
            "allowed_mentions": {"parse": []}}


OC_RECENT_DELAY_DAYS = 7      # "Recent Delays" list: delays that began in the last N days (crimes_alert.recent_delay_days)
OC_RECENT_DELAY_MAX = 20


def oc_recent_delays(now: int, days: int) -> list:
    """From the delay log (data/crime_delays.json): one line per member per delayed crime that began in the last
    `days` days - newest first - with how long they held it up and the ORIGINAL reason (the first one logged for
    them on that crime, e.g. "In hospital for 3 hrs" - later reasons are the same delay carrying on)."""
    try:
        log = json.loads(CRIME_DELAYS_PATH.read_text(encoding="utf-8")).get("delays", [])
    except (OSError, ValueError):
        return []
    by = {}
    for e in log:
        if int(e.get("start") or 0) < now - days * 86400:
            continue
        k = (str(e.get("crime")), str(e.get("member")))
        g_ = by.setdefault(k, {"name": e.get("member_name", "?"), "crime": e.get("name", "Organized Crime"),
                               "start": int(e["start"]), "first": None, "end": 0, "open": False})
        if g_["first"] is None or int(e.get("start") or 0) <= g_["first"][0]:
            g_["first"] = (int(e.get("start") or 0), e.get("icon", "⚠️"), str(e.get("reason") or ""))
        if e.get("end") is None:
            g_["open"] = True
        else:
            g_["end"] = max(g_["end"], int(e["end"]))
    out = []
    for g_ in by.values():
        end = now if g_["open"] else (g_["end"] or now)
        icon, reason = g_["first"][1], g_["first"][2]
        out.append({"name": g_["name"], "crime": g_["crime"], "start": g_["start"], "open": g_["open"],
                    "dur": (_dur(g_["start"], end) or "<1m").removeprefix("0h "), "icon": icon, "reason": reason[:1].upper() + reason[1:]})
    return sorted(out, key=lambda x: -x["start"])


def oc_recruit_payload(crimes: list, mem: dict, now: int, ocfg: dict) -> dict:
    """The SECOND Organized Crimes post (Nov 2026):
      embed "📝 Recruiting"     crimes still filling up that already have at least ONE member in them (empty ones
                                aren't shown) - who's in, which roles are still open
      embed "🕐 Recent Delays"  members who held up a crime in the last recent_delay_days (7) and the original
                                reason - from the delay log (no durations)"""
    # ASSIGNMENTS (Nov 13 2026, user: "Show members who are assigned to crimes and their roles for each crime"): every
    # recruiting crime with someone in it OR someone ASSIGNED to it by the deployed OC plan (crimes.yml reads it from
    # D1 into OC_PLAN_FILE), role by role: ✅ joined (their pass rate), 📌 assigned - can join now, ⏳ assigned -
    # joins after their current crime, ➖ open. Team success = the plan's (🎲 = tornprobability's calculated chance).
    # Pings for the assigned members are the gatekeeper's (gate/worker.js ocAssignPings) - this post never mentions.
    plan_by = {}
    try:
        pf = os.environ.get("OC_PLAN_FILE", "")
        pl = json.loads(Path(pf).read_text(encoding="utf-8")) if pf and Path(pf).exists() and Path(pf).stat().st_size else {}
        for t in pl.get("teams") or []:
            if t.get("kind") == "live" and t.get("crime_id") is not None:
                plan_by[str(t["crime_id"])] = t
    except (OSError, ValueError):
        plan_by = {}
    fields = []
    for c in crimes:
        slots = _as_list(c.get("slots"))
        filled = [sl for sl in slots if _slot_user(sl)]
        open_ = [sl for sl in slots if not _slot_user(sl)]
        team = plan_by.get(str(c.get("id"))) or {}
        roles = [r for r in (team.get("roles") or []) if r.get("pid") is not None and not r.get("existing")]
        if not open_ or not (filled or roles):
            continue                     # full (it's in the Overview) / nobody in it or assigned to it (not shown)
        nm = lambda uid: (mem.get(uid) or mem.get(str(uid)) or {}).get("name", f"[{uid}]")
        lines, left = [], list(roles)
        for sl in slots:
            lab, uid = oc_slot_label(sl), _slot_user(sl)
            if uid:
                pr = sl.get("checkpoint_pass_rate")
                lines.append(f"✅ **{lab}** · {nm(uid)}" + (f" ({round(pr)}%)" if isinstance(pr, (int, float)) else ""))
                continue
            r = next((x for x in left if x.get("position") == lab), None)
            if r:
                left.remove(r)
                rt = f" ({round(r['rate'])}%)" if isinstance(r.get("rate"), (int, float)) else ""
                lines.append(f"{'⏳' if r.get('queued') else '📌'} **{lab}** · {r.get('name') or nm(r.get('pid'))}{rt}"
                             + (" · after current crime" if r.get("queued") else ""))
            else:
                lines.append(f"➖ **{lab}** · open")
        su = team.get("succ")
        head_ = f"[Open crime #{c.get('id')}](https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId={c.get('id')})"
        tail = f"\n{'🎲' if team.get('succ_calc') else '🎯'} Team success **{round(su)}%**" if isinstance(su, (int, float)) else ""
        fields.append((-(len(filled) + len(roles)) / max(1, len(slots)), int(c.get("difficulty") or 0),
                       {"name": f"{c.get('name', 'Organized Crime')} · D{c.get('difficulty', '?')} · {len(filled)}/{len(slots)}"[:256],
                        "value": (head_ + "\n" + "\n".join(lines) + tail)[:1000] + "\n\u200b",
                        "inline": True}))
    fields = [f[2] for f in sorted(fields, key=lambda f: (f[0], -f[1]))]      # closest to full first
    embeds = []
    for k in range(0, len(fields), 24):
        e = {"color": 0x6b6b70, "fields": fields[k:k + 24]}
        if k == 0:
            e["title"] = f"📝 Recruiting ({len(fields)})"
            e["description"] = ("Crimes filling up. ✅ joined · 📌 assigned - join now · ⏳ assigned - after their current crime"
                                " · ➖ open - jump in if you can take it.")
        embeds.append(e)
    if not fields:
        embeds.append({"title": "📝 Recruiting", "color": 0x6b6b70,
                       "description": "No crimes with members waiting on recruits right now."})
    days = int(ocfg.get("recent_delay_days", OC_RECENT_DELAY_DAYS))
    rd = oc_recent_delays(now, days)
    # (no delay duration - removed Nov 2026; ⏳ = still holding it up)
    lines = [f"{x['icon']} **{x['name']}** · {x['reason'] or 'not ready'}{' · ⏳ still delayed' if x['open'] else ''}"
             f"\n-# {x['crime']} · <t:{x['start']}:R>" for x in rd[:OC_RECENT_DELAY_MAX]]
    desc = "\n".join(lines) if lines else f"Nobody has delayed a crime in the last {days} days. 👏"
    if len(rd) > OC_RECENT_DELAY_MAX:
        desc += f"\n-# …and {len(rd) - OC_RECENT_DELAY_MAX} more"
    embeds.append({"title": f"🕐 Recent Delays (last {days} days)", "color": 0xd08a3a, "description": desc[:4000],
                   "footer": {"text": "Members who held up a ready crime, with the original reason"}})
    head = f"## 📝 Recruiting & Recent Delays\n-# {len(fields)} recruiting · {len(rd)} recent delay{'s' if len(rd) != 1 else ''} · updated <t:{now}:R>"
    return {"username": ocfg.get("username", "Organized Crimes"), "content": head, "embeds": embeds[:10],
            "allowed_mentions": {"parse": []}}


def oc_fetch_active(key: str) -> list:
    """Every ACTIVE organized crime (recruiting + planning) in ONE call - Torn's "available" category (Nov 2026;
    before, only "planning" was read). If Torn ever refuses that category (code 21), it falls back to two calls."""
    try:
        return _as_list(fetch_section("crimes", key, {"cat": "available"}).get("crimes"))
    except SystemExit as e:
        if "'code': 21" not in str(e) and "Incorrect category" not in str(e):
            raise
        print("Crime check: 'available' category refused - reading planning + recruiting")
        return (_as_list(fetch_section("crimes", key, {"cat": "planning"}).get("crimes"))
                + _as_list(fetch_section("crimes", key, {"cat": "recruiting"}).get("crimes")))


CRIME_DELAY_KEEP_DAYS = 365


def log_crime_delays(delayed: dict, now: int):
    """Crime delay log (data/crime_delays.json - leaders' monitor + reliability score).
    One entry per member per reason per delayed crime:
      {crime, name, diff, ready, member, member_name, reason, icon, start, end, minutes}
    start = when the crime was ready (the delay begins there), end = first check it was no longer
    held up by them (None while still open). Kept CRIME_DELAY_KEEP_DAYS days."""
    try:
        log = json.loads(CRIME_DELAYS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log = {"delays": []}
    items = log.setdefault("delays", [])
    live = set()
    for cid, cr in delayed.items():
        for m in cr["culprits"]:
            k = (str(cid), str(m["id"]), m["icon"])
            live.add(k)
            if not any((e["crime"], str(e["member"]), e["icon"]) == k and e["end"] is None for e in items):
                items.append({"crime": str(cid), "name": cr["name"], "diff": cr.get("difficulty"),
                              "ready": cr["ready_at"], "member": m["id"], "member_name": m["name"],
                              "reason": m["status"], "icon": m["icon"], "start": cr["ready_at"],
                              "end": None, "minutes": None})
    for e in items:
        if e["end"] is None and (e["crime"], str(e["member"]), e["icon"]) not in live:
            e["end"] = now
            e["minutes"] = max(0, (now - e["start"]) // 60)
    cutoff = now - CRIME_DELAY_KEEP_DAYS * 86400
    log["delays"] = [e for e in items if (e["end"] or now) >= cutoff]
    log["updated"] = now
    CRIME_DELAYS_PATH.write_text(json.dumps(log, indent=1) + "\n", encoding="utf-8")


def oc_pool_refresh(key: str, members: list, now: int):
    """OC Management's Refresh button (crimes.yml with oc_refresh=1): the current members (from the members call this
    check already made) + history pass rates, including crimes completed since the last full update (completed crimes,
    newest first, stopping at the first one already saved - normally 1 call; NOT saved to crime_history.json, the
    full update does that). Written to data/oc_pool.json {members, hist, t}; the page uses it when newer than its copy."""
    try:
        cur = {str(m.get("id")): m.get("name", "?") for m in members if m.get("id")}
        try:
            saved = json.loads(CRIME_HIST_PATH.read_text(encoding="utf-8")).get("crimes", {})
        except (OSError, ValueError):
            saved = {}
        crimes = dict(saved)
        try:
            # API: OC Management refresh - completed crimes since the last saved one (Torn V2 /faction/crimes)
            new, _ = all_pages("crimes", "crimes", key, "Completed crimes", {"cat": "completed"}, stop_ids=set(saved) or None)
            for c in new:
                if str(c.get("id")) not in crimes and c.get("executed_at"):
                    crimes[str(c.get("id"))] = {"name": c.get("name"), "executed_at": int(c.get("executed_at") or 0),
                                                "slots": oc_slots(c)}
        except SystemExit as e:
            print(f"OC refresh: new completed crimes skipped: {e}")
        hist = oc_hist(crimes.values(), cur)
        OC_POOL_PATH.write_text(json.dumps({"members": cur, "hist": hist, "t": now}, separators=(",", ":"),
                                           sort_keys=True) + "\n", encoding="utf-8")
        print(f"OC refresh: {len(cur)} members, {len(hist)} crime roles, {len(crimes) - len(saved)} new completed crimes")
    except Exception as e:
        print(f"OC refresh not saved: {type(e).__name__}")


def discord_crime_alerts(key: str, cfg: dict):
    """Every 15 minutes (crimes.yml), to DISCORD_WEBHOOK_CRIMES:
      1. OVERVIEW - one post, edited every run (re-posted if deleted): every planning crime with a live
         countdown and the members who can't finish it (away / hospital / jail / missing item / left).
      2. DELAY - a crime that's READY but held up by someone: a post pinging them (Discord linked to Torn).
         After escalate_hours (2): a second ping here + a Leader Alerts post.
      3. CLEAN-UP - once the crime goes through (or nobody's holding it any more) its delay posts are deleted,
         so with no delays only the Overview is in the channel.
      1b. RECRUITING & RECENT DELAYS - a second post, edited every run: crimes still recruiting that already have a
         member in them, and who held up a crime in the last 7 days (how long, the original reason).
    API: every active crime (recruiting + planning, one call) + members (2 calls), item names only for new item ids,
    1 Discord-link lookup per ping."""
    ocfg = cfg.get("crimes_alert", {})
    url = os.environ.get("DISCORD_WEBHOOK_CRIMES", "").strip()
    if not ocfg.get("enabled", False) or not url or not key:
        return
    now = int(datetime.now(timezone.utc).timestamp())
    try:
        crimes = oc_fetch_active(key)            # recruiting + planning, one call
        members = _as_list(fetch_section("members", key).get("members"))
    except SystemExit as e:
        print(f"Crime check skipped: {e}")
        return
    mem = {m.get("id"): m for m in members}
    names = item_names({(sl.get("item_requirement") or {}).get("id") for c in crimes for sl in _as_list(c.get("slots"))}, key)
    try:
        state = json.loads(DISCORD_CRIME_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    if state.get("webhook_v") != ocfg.get("webhook_v", 1):
        # new channel / webhook: old message ids belong to the old channel - start fresh
        state = {"webhook_v": ocfg.get("webhook_v", 1)}
    name = ocfg.get("username", "Organized Crimes")

    # ---- 1. overview ----
    ov = oc_overview_payload(crimes, mem, names, now, ocfg)
    mid = state.get("overview_id")
    try:
        if mid:
            try:
                _discord_request(f"{url}/messages/{mid}", "PATCH", ov)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                mid = None
        if not mid:
            mid = _discord_request(f"{url}?wait=true", "POST", ov).get("id")
            discord_msg_save("crime:overview", mid)
            print("Discord: crime overview posted")
        state["overview_id"] = mid
    except Exception as e:      # never print the URL
        print(f"Discord: crime overview failed: {type(e).__name__}")

    # ---- 2. delays ----
    delayed = {}
    for c in crimes:
        ready, slots = int(c.get("ready_at") or 0), _as_list(c.get("slots"))
        if not ready or ready > now or not slots or any(not _slot_user(sl) for sl in slots):
            continue
        iss = crime_issues(c, mem, names)
        if iss:
            delayed[str(c.get("id"))] = {"id": str(c.get("id")), "name": c.get("name", "Organized Crime"),
                                         "difficulty": c.get("difficulty"), "ready_at": ready,
                                         "culprits": [{"id": x["id"], "name": x["name"], "position": x["position"],
                                                       "status": x["text"][:1].upper() + x["text"][1:],   # image: plain text (font has no emoji)
                                                       "icon": x["icon"]} for x in iss]}
    print(f"Crime check: {len(crimes)} active, {len(delayed)} delayed")
    # the active crimes (who's in which role, their pass rate) for the leaders' OC Management page - read live from
    # the data repo through the gatekeeper, so it's never more than one crime check (15 min) old
    try:
        act = [{"id": c.get("id"), "name": c.get("name"), "difficulty": c.get("difficulty"), "status": c.get("status"),
                "ready_at": c.get("ready_at"), "slots": oc_slots(c)} for c in crimes]
        old = OC_ACTIVE_PATH.read_text(encoding="utf-8") if OC_ACTIVE_PATH.exists() else ""
        body = json.dumps({"crimes": act}, separators=(",", ":"), sort_keys=True)
        # only rewrite when something changed (fewer data commits) - or when OC Management's Refresh asked for this check
        if not old.startswith(body[:-1]) or os.environ.get("OC_FORCE_ACTIVE") == "1":
            OC_ACTIVE_PATH.write_text(json.dumps({"crimes": act, "t": now}, separators=(",", ":"), sort_keys=True) + "\n",
                                      encoding="utf-8")
    except Exception as e:
        print(f"OC active crimes not saved: {type(e).__name__}")
    if os.environ.get("OC_FORCE_ACTIVE") == "1":
        oc_pool_refresh(key, members, now)
    log_crime_delays(delayed, now)

    # ---- 1b. second post: Recruiting (crimes with at least one member) + Recent Delays (Nov 2026) ----
    # edited every run like the Overview; posted once (below the Overview) and re-posted if deleted
    if ocfg.get("recruiting_post", True):
        rp = oc_recruit_payload(crimes, mem, now, ocfg)
        rid = state.get("recruit_id")
        try:
            if rid:
                try:
                    _discord_request(f"{url}/messages/{rid}", "PATCH", rp)
                except urllib.error.HTTPError as e:
                    if e.code != 404:
                        raise
                    rid = None
            if not rid:
                rid = _discord_request(f"{url}?wait=true", "POST", rp).get("id")
                discord_msg_save("crime:recruiting", rid)
                print("Discord: crime recruiting post posted")
            state["recruit_id"] = rid
        except Exception as e:      # never print the URL
            print(f"Discord: crime recruiting post failed: {type(e).__name__}")
    esc = float(cfg.get("leader_alerts", {}).get("crime_escalate_hours", 2)) * 3600
    dl = state.setdefault("delays", {})
    ids_cache = {}

    def ping(cr, who, text, image=True):
        # every member is written as their in-game name + ID, with a Discord mention in front when
        # they've linked one. A webhook can't tell whether that Discord account is in the server
        # (an account outside it shows as "@unknown-user"), so the name + ID always shows who it is.
        ids, tags = [], []
        for m in who:
            if m["id"] not in ids_cache:
                ids_cache[m["id"]] = _discord_id(m["id"], key)
            did = ids_cache[m["id"]]
            if did:
                ids.append(did)
            tags.append((f"<@{did}> " if did else "") + f"**{m['name']}** [{m['id']}]")
        tag = ", ".join(tags)
        payload = {"username": name, "content": fill(text, {"ping": tag, "crime": cr["name"]}).strip(),
                   "allowed_mentions": {"parse": [], "users": ids}}
        if image:
            payload["attachments"] = [{"id": 0, "filename": "crime_delayed.png"}]
        msg = _discord_request(f"{url}?wait=true", "POST", payload, crime_alert_image(cr, now) if image else None)
        return (msg or {}).get("id")

    for cid, cr in delayed.items():
        d = dl.setdefault(cid, {"first": now, "msgs": [], "pinged": [], "escalated": False})
        new_who = [m for m in cr["culprits"] if str(m["id"]) not in d["pinged"]]
        try:
            if new_who:      # first notice (and anyone who newly starts holding it up)
                d["msgs"].append(ping(cr, new_who, ocfg.get("message", "{ping} **{crime}** is ready and waiting on you.")))
                d["pinged"] += sorted({str(m["id"]) for m in new_who})
                print(f"Discord: crime {cid} delay alert ({len(new_who)} member(s))")
            # 2h is counted from when the crime became READY; never in the same run as the first notice
            if not d["escalated"] and not new_who and now - cr["ready_at"] >= esc:
                hrs = format(esc / 3600, "g")
                d["msgs"].append(ping(cr, cr["culprits"], ocfg.get(
                    "escalate_message", "⏰ {ping} **{crime}** has been delayed for over " + hrs +
                    " hours - please sort it out now. Leaders have been notified."), image=False))
                who = ", ".join(f"{m['icon']} {m['name']} ({m['status']})" for m in cr["culprits"])
                _leader_post(cfg, [("⏳ Organized crime delayed " + hrs + "h+",
                                    [f"{cr['name']} - waiting {_dur(cr['ready_at'], now)} · {who}"])])
                d["escalated"] = True
                print(f"Discord: crime {cid} escalated")
        except Exception as e:      # never print the URL
            print(f"Discord: crime {cid} alert failed: {type(e).__name__}")

    # ---- 3. clean-up: crimes no longer held up (done, expired or fixed) ----
    for cid in [k for k in dl if k not in delayed]:
        for m_ in dl[cid].get("msgs", []):
            if not m_:
                continue
            try:
                _discord_request(f"{url}/messages/{m_}", "DELETE")
            except Exception:
                pass
        print(f"Discord: crime {cid} no longer delayed - {len(dl[cid].get('msgs', []))} post(s) removed")
        del dl[cid]
    DISCORD_CRIME_STATE_PATH.parent.mkdir(exist_ok=True)
    DISCORD_CRIME_STATE_PATH.write_text(json.dumps(state) + "\n", encoding="utf-8")


# ==========================================================================
# Leader-only alerts (DISCORD_WEBHOOK_LEADERS - a private leaders channel)
# ==========================================================================
LEADER_STATE_PATH = ROOT / "data" / "leader_alerts.json"


def _leader_state() -> dict:
    try:
        return json.loads(LEADER_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _leader_post(cfg: dict, sections: list) -> bool:
    """One message: '## 🛡️ Leader Alerts' + sections [(heading, [lines])]. Text only, no pings."""
    url = os.environ.get("DISCORD_WEBHOOK_LEADERS", "").strip()
    if not url or not sections:
        return False
    lcfg = cfg.get("leader_alerts", {})
    parts = ["## 🛡️ Leader Alerts"]
    for head, lines in sections:
        parts += ["", f"**{head}**"] + [f"> {ln}" for ln in lines]
    text = "\n".join(parts)
    if len(text) > 1990:                       # Discord's 2,000 character limit
        text = text[:1950].rsplit("\n", 1)[0] + "\n> …and more"
    try:
        import time as _t
        lmsg = _discord_request(f"{url}?wait=true&with_components=true", "POST",
                         {"username": lcfg.get("username", "Leader Alerts"), "content": text,
                          "components": [{"type": 1, "components": [
                              {"type": 2, "style": 5, "label": "Announcements", "url": f"{leader_base()}/announcements.html"}]}],
                          "allowed_mentions": {"parse": []}})
        discord_msg_save(f"leader:{int(_t.time())}", (lmsg or {}).get("id"))
        print(f"Discord: leader alert posted ({len(sections)} section(s))")
        return True
    except Exception as e:      # never print the URL
        print(f"Discord: leader alert failed: {type(e).__name__}")
        return False


def leader_alerts(raw: dict, summary: dict, cfg: dict):
    """Full runs. New items only (each alerted once, state in data/leader_alerts.json):
      💸 Payouts not found in the vault log  - receipt saved > vault_grace_hours (6) ago
         ✅ and when they're found later ("resolved")
      🧹 Slacker Watch after each new war      - Review + Warning tiers
      💤 Inactive members                      - no action for inactive_days (3)+, again once active + idle again"""
    lcfg = cfg.get("leader_alerts", {})
    if not lcfg.get("enabled", True) or not os.environ.get("DISCORD_WEBHOOK_LEADERS", "").strip():
        return
    import time
    now = int(time.time())
    st = _leader_state()
    # Private links posted to the leader channel only - never in the public repo/logs. Trimmed (Nov 2026): the hubs
    # (homepage) reach every page now, so the post just has the way in: Home (Leaders Hub for leaders), Members Hub
    # and the two leader tools used straight from Discord. The post is edited in place whenever its content changes
    # (or config leader_alerts.links_post is bumped).
    lp = str(lcfg.get("links_post", ""))
    if lp:
        import hashlib
        mb, lb = member_base(), leader_base()
        g_ = gate_cfg()
        home = (g_["url"].rstrip("/") + "/") if g_ else f"{mb}/index.html"
        member_links = [("Home", home), ("Members Hub", f"{mb}/index.html")]
        leader_links = ([("Leaders Hub", f"{lb}/index.html"), ("Payout Calculator", f"{lb}/payout.html")] if lb else [])
        text = "\n".join(
            ["## 🔗 Faction Pages", "-# Everything else is in the site's header menus.",
             "", "### 👥 Members", "-# Safe to share with faction members (never publicly)."]
            + [f"> **{t}:** <{u}>" for t, u in member_links]
            + (["", "### 🛡️ Leaders", "-# Leaders only - do NOT share with members."]
               + [f"> **{t}:** <{u}>" for t, u in leader_links] if leader_links else []))
        rows = [{"type": 1, "components": [{"type": 2, "style": 5, "label": f"{'🛡️' if (t, u) in leader_links else '👥'} {t}", "url": u}
                                           for t, u in member_links + leader_links][:5]}]
        payload = {"username": lcfg.get("username", "Leader Alerts"), "content": text, "components": rows,
                   "allowed_mentions": {"parse": []}}
        sig = lp + ":" + hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]
        if st.get("links_posted") != sig:
            url_ = os.environ["DISCORD_WEBHOOK_LEADERS"].strip()
            try:
                mid = st.get("links_message")
                if mid:          # edit the earlier links post in place
                    try:
                        _discord_request(f"{url_}/messages/{mid}?with_components=true", "PATCH", payload)
                    except urllib.error.HTTPError:
                        mid = None
                if not mid:
                    mid = _discord_request(f"{url_}?wait=true&with_components=true", "POST", payload).get("id")
                st["links_posted"], st["links_message"] = sig, mid
                discord_msg_save("links:pages", mid)
                print("Discord: page links in the leader channel updated")
            except Exception as e:      # never print the URL
                print(f"Discord: leader links failed: {type(e).__name__}")
    sections = []
    # --- vault ---
    try:
        vault = json.loads(PAYOUT_VAULT_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        vault = {}
    seen = st.setdefault("vault", {})          # "<war>:<member id>" -> "missing"/"diff"
    grace = float(lcfg.get("vault_grace_hours", 6)) * 3600
    bad_l, ok_l = [], []
    for wid, stem in _latest_receipts().items():
        try:
            r = json.loads((PAYOUT_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        vm = (vault.get(stem) or {}).get("members") or {}
        if not vm or now - int(r.get("created", now)) < grace:
            continue
        opp = r["war"].get("opponent", "?")
        for m in r["members"]:
            k, v = f"{wid}:{m['id']}", vm.get(str(m["id"]))
            if not v:
                continue
            if v["st"] in ("missing", "diff") and seen.get(k) != v["st"]:
                bad_l.append(f"{m['n']} - ${m['pay']:,} for vs {opp}" +
                             ("" if v["st"] == "missing" else f" (${v['got']:,} found)"))
                seen[k] = v["st"]
            elif v["st"] == "ok" and k in seen:
                ok_l.append(f"{m['n']} - ${m['pay']:,} for vs {opp}")
                seen.pop(k)
    if bad_l:
        sections.append(("💸 Payouts not found in the vault log", bad_l))
    if ok_l:
        sections.append(("✅ Now found in the vault log", ok_l))
    # --- slacker watch after a new war ---
    wars = (raw.get("_war_history") or {}).get("wars", {})
    newest = max(wars, key=lambda k: wars[k]["end"]) if wars else None
    sw = (summary.get("slacker_watch") or {}).get("tiers") or {}
    if newest and st.get("slacker_war") != newest:
        if st.get("slacker_war") is not None:          # first run: just remember the newest war
            lines = [f"🔴 {e['name']} - {', '.join(e['reasons'])}" for e in sw.get("review", [])] + \
                    [f"🟠 {e['name']} - {', '.join(e['reasons'])}" for e in sw.get("warning", [])]
            if lines:
                sections.append((f"🧹 War Report - slackers (last {summary['slacker_watch'].get('wars', 3)} wars)", lines))
        st["slacker_war"] = newest
    # --- inactive members ---
    days = float(lcfg.get("inactive_days", 3))
    idle = st.setdefault("inactive", {})
    cur = {}
    for m in _as_list((raw.get("members") or {}).get("members")):
        la = m.get("last_action")
        la = la.get("timestamp") if isinstance(la, dict) else la
        if la and now - int(la) >= days * 86400:
            cur[str(m.get("id"))] = (m.get("name", "?"), int((now - int(la)) / 86400))
    new_idle = [f"{n} - {d} days" for i, (n, d) in sorted(cur.items(), key=lambda kv: -kv[1][1]) if i not in idle]
    st["inactive"] = {i: True for i in cur}
    if new_idle:
        sections.append((f"💤 Inactive {int(days)}+ days", new_idle))
    _leader_post(cfg, sections)
    LEADER_STATE_PATH.write_text(json.dumps(st, indent=1) + "\n", encoding="utf-8")


# ==========================================================================
# 4. MAIN
# ==========================================================================
def main():
    ap = argparse.ArgumentParser(description="Render the faction banner.")
    ap.add_argument("--mock", help="Use a saved JSON file instead of the API "
                                   "(keys: basic, members, positions, upgrades)")
    ap.add_argument("--out", default="site", help="Output folder (default: site)")
    args = ap.parse_args()
    load_lb_hidden()                              # LEADERBOARD OPT-OUT: members left off every leaderboard

    # CHAIN WATCH (chainwatch.yml, every 15 min): Ongoing Chain section; 5-minute refresh while a chain runs
    if not args.mock and os.environ.get("RUN_KIND") == "chainwatch":
        key = os.environ.get("TORN_API_KEY", "").strip()
        if not key:
            sys.exit("TORN_API_KEY is not set (add it under Settings → Secrets → Actions).")
        chain_watch(key, load_config())
        return

    # CRIMES run (crimes.yml, every 15 min): only the Organized Crime delay
    # check - 1 API call, 2 when a crime is ready to start
    if not args.mock and os.environ.get("RUN_KIND") == "crimes":
        key = os.environ.get("TORN_API_KEY", "").strip()
        if not key:
            sys.exit("TORN_API_KEY is not set (add it under Settings → Secrets → Actions).")
        discord_crime_alerts(key, load_config())
        return

    # Hourly CHAIN run (no war, not a 3-hourly full run): only look for newly
    # finished chains and post their Chain Reports. ~1 API call + 1 per new
    # chain report. Faction data comes from the cache; nothing is rendered.
    if not args.mock and os.environ.get("RUN_KIND") == "chain":
        key = os.environ.get("TORN_API_KEY", "").strip()
        if not key:
            sys.exit("TORN_API_KEY is not set (add it under Settings → Secrets → Actions).")
        cfg = load_config()
        raw = core_sections(key, cfg)
        raw["_chain_history"] = update_chain_history(raw, cfg, key)
        discord_post_chains(raw, cfg, _as_list(raw["members"].get("members")))
        try:                                   # war attack-log queue (one war per run)
            wh = json.loads(WAR_HIST_PATH.read_text(encoding="utf-8"))
            my_id = str(raw["basic"].get("basic", raw["basic"]).get("id"))
            if fill_war_attack_log(wh, key, my_id):
                WAR_HIST_PATH.write_text(json.dumps(wh, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        except (OSError, ValueError) as e:
            print(f"War attack log queue skipped: {type(e).__name__}")
        return

    if args.mock:
        raw = json.loads(Path(args.mock).read_text(encoding="utf-8"))
    else:
        key = os.environ.get("TORN_API_KEY", "").strip()
        if not key:
            sys.exit("TORN_API_KEY is not set (add it under Settings → Secrets → Actions).")
        raw = fetch_all(key, load_config())

    # Structure only, never values - safe for a public Actions log.
    for name, data in raw.items():
        print(f"--- {name} response shape ---\n{describe_shape(data)}")

    cfg = load_config()
    if "achievements" in cfg.get("section_order", []):
        raw["_achievements"] = update_chain_achievements(
            raw, cfg, None if args.mock else os.environ.get("TORN_API_KEY", "").strip())
    api_key = None if args.mock else os.environ.get("TORN_API_KEY", "").strip()
    if "rankedwars" in raw:
        n_recent = max(int(cfg.get("ranked_wars", {}).get("count", 3)),
                       int(cfg.get("announcements", {}).get("ranked_wars", {}).get("count", 5)))
        raw["_war_history"] = update_war_history(raw, api_key, n_recent)
        my_id = raw["basic"].get("basic", raw["basic"]).get("id")
        raw["rankedwarreports"] = reports_from_history(raw["_war_history"], my_id)
    if cfg.get("announcements", {}).get("leaderboard", {}).get("enabled", True):
        if cfg["announcements"]["leaderboard"].get("chains", True):
            raw["_chain_history"] = update_chain_history(raw, cfg, api_key)
        if cfg["announcements"]["leaderboard"].get("gym", True):
            raw["_gym"] = update_gym(raw, cfg, api_key)
    summary = normalize(raw, cfg)
    CURRENT_MEMBERS.update({str(m.get("id")): m.get("name", "?") for m in _as_list((raw.get("members") or {}).get("members"))})
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    prepare_stamps(summary, cfg, persist=not args.mock)
    size = render(summary, cfg, out)
    write_announcements(cfg, summary, out)
    write_panel_preview_kit(out, summary)
    # (description.html at the public root is gone - the leaders' Description page has the HTML)
    _PAYOUT_RAW["raw"] = raw
    write_payout_calculator(cfg, out)
    update_payouts(cfg, out)
    if raw.get("_war_history"):
        refresh_war_reports(raw, cfg)             # war reports (+ their payouts merged in) - saved data only
    write_report_pages(out)
    if raw.get("_chain_history"):
        chain_history_page(out, raw["_chain_history"], cfg.get("chain_report", {}))
    if raw.get("_war_history") and "rankedwars" in raw:
        war_history_page(out, raw, cfg)
    write_message_builder(out)
    write_homepages(out, cfg)
    if not args.mock and os.environ.get("RUN_KIND", "full") == "full":
        OPTIN_DATA["v"] = optin_update(raw)       # opted-in members' battle / work stats (their own keys)
        item_types(api_key)                       # item categories for the Armory Monitor (weekly, 1 call)
        _b = raw["basic"].get("basic", raw["basic"])
        update_armory_log(api_key, int(datetime.now(timezone.utc).timestamp()) - int(_b.get("days_old") or 0) * 86400
                          if _b.get("days_old") else 0)
        #   ^ armory usage: everything new, then older months a few pages at a time back to the faction's founding
        update_armory_loans(api_key)              # who has which armory items on loan now (1 call)
    db_ = write_databases(out, raw, cfg)          # shared data layer (db/*.json)
    write_profiles(out, db_)
    write_profile_layouts(out, cfg)               # profile layouts (members' own + the leaders' default) + editors
    write_monitor(out, db_, cfg)
    write_greasyfork(out)                         # scripts directory: Greasy Fork name / version / install link
    if not args.mock:
        write_war_targets(out, raw)               # War targets page data (enemy estimates via FFScouter)
    write_home_data(out, db_, raw)               # hubs: welcome numbers, war snapshot, needs attention
    write_freshness(out, db_, bool(args.mock))    # db/freshness.json - every page's "data read ... / on record since" line
    # (write_legacy_images: only for the GitHub Pages days - the site is now on Cloudflare, so the old
    #  github.io image addresses are gone and there's nothing to keep there)
    # keep search engines out of the whole site
    (out / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    save_stamps()
    if not args.mock:
        discord_post_wars(raw, summary, cfg)
        if os.environ.get("RUN_KIND", "full") == "full":
            leader_alerts(raw, summary, cfg)
        discord_post_chains(raw, cfg, _as_list(raw["members"].get("members")))
        # reports saved while posting (new / back-filled chains) -> their pages go out in THIS deploy
        write_report_pages(out)
        if raw.get("_chain_history"):
            chain_history_page(out, raw["_chain_history"], cfg.get("chain_report", {}))
        if raw.get("_war_history") and "rankedwars" in raw:
            war_history_page(out, raw, cfg)
        if os.environ.get("RUN_KIND", "full") == "full":
            log_respect(raw)
            raw["_crime_history"] = update_crime_history(api_key)
            oc_catalog(api_key)                  # weekly: OC structure for the OC Management page
            # weekly (or on a new reward item): market prices of OC reward items, for the Team Builder's $/day
            oc_item_prices(api_key, {i for c in raw["_crime_history"].get("crimes", {}).values() for i, _ in c.get("ritems") or []})
        monthly_recap(raw, cfg, out)
    if not args.mock:
        write_run_state(summary, cfg)
    # run summary: members-only (inside the members' folder), not at the public root
    (member_out(out) / "data.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {', '.join(OUTPUTS)} {size[0]}x{size[1]}: {summary['values']['members']} members, "
          f"{len(summary['roles'])} roles, {len(summary['upgrades']['branches'])} "
          f"{summary['upgrades']['tree']} branches (active: {summary['upgrades']['state']})")


if __name__ == "__main__":
    main()

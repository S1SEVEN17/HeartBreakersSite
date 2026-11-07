#!/usr/bin/env python3
"""
DATA VERIFICATION (workflow "Verify data" - run by hand, or when this file changes).

Re-reads a sample of everything the site shows straight from Torn with the faction key and compares it with what's
saved in the private data repo. Writes data/verify_report.json there (member ids only - nothing is printed to the
public Actions log except pass / fail counts).

Checks
  members    current member list: ids, positions, days in faction  vs  data/core_cache.json
  wars       ranked war list (start / end / scores)  vs  data/war_history.json; the 5 newest finished wars' reports:
             every member's attacks + score; and the faction's score = the sum of its members' scores
  chains     newest chain list (length / end)  vs  data/chain_history.json; the 5 newest 100+ chains' reports:
             every attacker's hits / respect / retaliations; hits add up to the chain length
  crimes     newest completed crimes page: status, money, members  vs  data/crime_history.json; the 20% / 80% split
  gym        contributors (4 stats)  vs  data/gym.json "current" (equal, or higher = trained since the last read)
  armory     newest 3 pages of armory news: every line classified by the Armory Monitor's parser; lines it doesn't
             recognise are grouped into anonymised patterns (names / numbers removed) so new formats show up; parsed
             uses inside the recorded window must all be in data/armory_log.json
  payouts    every receipt: member payouts add up to "paid"; paid + expenses = budget; members' hits vs war history
  stats      internal: members' totals in the published data = the sums over wars / chains / crimes
Usage: python tools/verify.py   (TORN_API_KEY, data linked by tools/store.sh link)
"""
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import generate as g  # noqa: E402

KEY = os.environ.get("TORN_API_KEY", "").strip()
OUT = ROOT / "data" / "verify_report.json"
R = {"run": int(time.time()), "checks": {}}


def check(name):
    def deco(fn):
        try:
            res = fn()
        except SystemExit as e:              # fetch_section's errors (never contain the key)
            res = {"ok": False, "error": str(e)[:200]}
        except Exception as e:
            res = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}
        R["checks"][name] = res
        print(f"{name}: {'OK' if res.get('ok') else 'CHECK'} {res.get('summary', res.get('error', ''))}")
        return fn
    return deco


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


@check("members")
def _members():
    live = {str(m["id"]): m for m in g._as_list(g.fetch_section("members", KEY).get("members"))}
    cache = load(g.CORE_CACHE_PATH)
    saved = {str(m["id"]): m for m in g._as_list((cache.get("members") or {}).get("members"))}
    joined, left = sorted(set(live) - set(saved)), sorted(set(saved) - set(live))
    pos = [i for i in live if i in saved and live[i].get("position") != saved[i].get("position")]
    days = [i for i in live if i in saved and abs(int(live[i].get("days_in_faction") or 0) - int(saved[i].get("days_in_faction") or 0)) > 1]
    age_h = round((time.time() - cache.get("fetched", 0)) / 3600, 1)
    # joins / leaves / promotions since the cached list are expected (it's refreshed every core_refresh_hours) -
    # only days-in-faction that disagree for the same member point to a real problem
    ok = not days
    return {"ok": ok, "summary": f"{len(live)} live, {len(saved)} saved ({age_h} h old): {len(joined)} joined since, "
            f"{len(left)} left since, {len(pos)} position changes, {len(days)} days-in-faction off",
            "joined": joined, "left": left, "position": pos, "days": days, "cache_age_h": age_h}


@check("wars")
def _wars():
    my_id = str(load(g.CORE_CACHE_PATH)["basic"].get("basic", load(g.CORE_CACHE_PATH)["basic"]).get("id"))
    lst = g._as_list(g.fetch_section("rankedwars", KEY, {"limit": 100}).get("rankedwars"))
    hist = load(g.WAR_HIST_PATH)["wars"]
    now = time.time()
    done = [w for w in lst if w.get("end") and w["end"] < now]
    missing = [str(w["id"]) for w in done if str(w["id"]) not in hist]
    extra = [k for k in hist if k not in {str(w["id"]) for w in lst}]
    end_off = [str(w["id"]) for w in done if str(w["id"]) in hist and int(hist[str(w["id"])]["end"]) != int(w["end"])]
    detail, member_off, score_off = [], [], []
    for w in sorted(done, key=lambda w: -w["end"])[:5]:
        wid = str(w["id"])
        rep = g.fetch_section(f"{wid}/rankedwarreport", KEY).get("rankedwarreport", {})
        mine = next((f for f in g._as_list(rep.get("factions")) if str(f.get("id")) == my_id), {})
        live = {str(m["id"]): (int(m.get("attacks") or 0), round(float(m.get("score") or 0), 2)) for m in g._as_list(mine.get("members"))}
        saved = {str(m["id"]): (m["attacks"], round(m["score"], 2)) for m in hist.get(wid, {}).get("members", [])}
        diff = [i for i in set(live) | set(saved) if live.get(i) != saved.get(i)]
        fs = float(mine.get("score") or 0)
        ms = sum(v[1] for v in live.values())
        detail.append({"war": wid, "members_live": len(live), "members_saved": len(saved), "member_diffs": len(diff),
                       "faction_score": fs, "sum_member_scores": round(ms, 2)})
        if diff:
            member_off.append({"war": wid, "ids": diff[:20]})
        if abs(fs - ms) > max(1.0, 0.001 * fs):
            score_off.append(wid)
        time.sleep(g.API_PAGE_DELAY)
    ok = not missing and not end_off and not member_off
    return {"ok": ok, "summary": f"{len(done)} finished wars on Torn, {len(hist)} saved; missing {len(missing)}, "
            f"end time off {len(end_off)}; newest 5 reports: {sum(d['member_diffs'] for d in detail)} member differences, "
            f"faction score vs member sum differs in {len(score_off)}",
            "missing": missing, "not_on_torn": extra, "end_off": end_off, "member_off": member_off,
            "score_vs_members": score_off, "detail": detail}


@check("chains")
def _chains():
    lst = g._as_list(g.fetch_section("chains", KEY, {"limit": 100}).get("chains"))
    hist = load(g.CHAIN_HIST_PATH)
    saved = hist["chains"]
    now = time.time()
    settled = [c for c in lst if c.get("end") and c["end"] < now - g.CHAIN_SETTLE and int(c.get("chain") or 0) >= hist.get("min_length", 10)]
    missing = [str(c["id"]) for c in settled if str(c["id"]) not in saved]
    len_off = [str(c["id"]) for c in settled if str(c["id"]) in saved and saved[str(c["id"])]["length"] != int(c["chain"])]
    sum_off = [k for k, c in saved.items() if sum(a["hits"] for a in c["attackers"]) != c["length"]]
    detail, att_off = [], []
    for c in sorted((c for c in settled if int(c["chain"]) >= 100), key=lambda c: -c["end"])[:5]:
        cid = str(c["id"])
        rep = g.fetch_section(f"{cid}/chainreport", KEY).get("chainreport", {})
        live = {}
        for a in g._as_list(rep.get("attackers")):
            at, rs = a.get("attacks") or {}, a.get("respect") or {}
            live[str(a["id"])] = (int(at.get("total") or 0), round(float(rs.get("total") or 0), 2), int(at.get("retaliations") or 0))
        sv = {str(a["id"]): (a["hits"], round(a["respect"], 2), a["rets"]) for a in saved.get(cid, {}).get("attackers", [])}
        diff = [i for i in set(live) | set(sv) if live.get(i) != sv.get(i)]
        detail.append({"chain": cid, "length": int(c["chain"]), "attackers": len(live), "diffs": len(diff)})
        if diff:
            att_off.append({"chain": cid, "ids": diff[:20]})
        time.sleep(g.API_PAGE_DELAY)
    # chain bonus respect: Torn's bonus values are fixed - a chain's bonus total must match its length
    B = [(10, 10), (25, 20), (50, 40), (100, 80), (250, 160), (500, 320), (1000, 640), (2500, 1280), (5000, 2560),
         (10000, 5120), (25000, 10240), (50000, 20480), (100000, 40960)]
    bon_off = [k for k, c in saved.items() if c.get("bonuses") and
               round(sum(x["respect"] for x in c["bonuses"])) != sum(v for m, v in B if m <= c["length"])]
    no_bonus = sum(1 for c in saved.values() if c["length"] >= 10 and "bonuses" not in c)
    ok = not missing and not len_off and not sum_off and not att_off and not bon_off
    return {"ok": ok, "summary": f"{len(settled)} settled on Torn's newest page; missing {len(missing)}, length off {len(len_off)}; "
            f"hits = length for {len(saved) - len(sum_off)}/{len(saved)}; newest 5 reports: {sum(d['diffs'] for d in detail)} attacker "
            f"differences; bonus totals off {len(bon_off)}; chains without the bonus breakdown {no_bonus}",
            "missing": missing, "length_off": len_off, "hits_vs_length": sum_off, "attacker_off": att_off,
            "bonus_off": bon_off, "no_bonus_breakdown": no_bonus, "detail": detail}


@check("crimes")
def _crimes():
    lst = g._as_list(g.fetch_section("crimes", KEY, {"cat": "completed", "limit": 100, "sort": "DESC"}).get("crimes"))
    saved = load(g.CRIME_HIST_PATH)["crimes"]
    missing, off = [], []
    for c in lst:
        cid = str(c.get("id"))
        if not c.get("executed_at"):
            continue
        if cid not in saved:
            missing.append(cid)
            continue
        s = saved[cid]
        rw = c.get("rewards") or {}
        live = (c.get("status"), int(rw.get("money") or 0) if isinstance(rw, dict) else 0,
                sorted(u for u in (g._slot_user(sl) for sl in g._as_list(c.get("slots"))) if u))
        if live != (s.get("status"), s.get("money", 0), sorted(s.get("members", []))):
            off.append(cid)
    # the published split: share x split = 80% of the money (whole dollars, rounded down)
    crimes = [{"id": int(k) if k.isdigit() else k, "prev": v.get("prev"), "t": v.get("executed_at"), "status": v.get("status"),
               "money": v.get("money", 0), "m": v.get("members", []), "name": v.get("name")} for k, v in saved.items()]
    g.crime_shares(crimes)
    # only crimes that paid cash themselves (a prerequisite like No Reserve takes a share of the crime it led to - "via")
    split_off = [c["id"] for c in crimes if c.get("split") and c.get("money") and not c.get("via")
                 and abs(c["share"] * c["split"] - c["money"] * (1 - g.CRIME_TAX)) > c["split"]]
    ok = not off and not split_off and len(missing) <= 2
    return {"ok": ok, "summary": f"newest {len(lst)} completed on Torn: {len(missing)} not saved yet (read once "
            f"per 3-hour slot), {len(off)} with different status / money / members; payout split off {len(split_off)}",
            "missing": missing, "different": off, "split_off": split_off}


@check("gym")
def _gym():
    gym = load(g.GYM_PATH)
    res, lower = {}, []
    for st, _l in g.GYM_FETCH:
        data = g.fetch_section("contributors", KEY, {"stat": st, "cat": "current"})
        live = {str(c.get("id")): int(c.get("value") or 0) for c in g._as_list(data.get("contributors"))}
        sv = {str(k): int(v) for k, v in (gym.get("current", {}).get(st) or {}).items()}
        eq = sum(1 for i in live if live[i] == sv.get(i))
        hi = sum(1 for i in live if i in sv and live[i] > sv[i])
        lo = [i for i in live if i in sv and live[i] < sv[i]]
        lower += lo
        res[st] = {"live": len(live), "saved": len(sv), "equal": eq, "trained_since": hi, "lower": len(lo)}
        time.sleep(1)
    base = gym.get("baseline", {})
    neg = sum(1 for st, _ in g.GYM_FETCH for i, v in (gym.get("current", {}).get(st) or {}).items()
              if int(v) < int((base.get(st) or {}).get(i, 0)))
    age_h = round((time.time() - gym.get("fetched", 0)) / 3600, 1)
    return {"ok": not lower and not neg, "summary": f"saved {age_h} h ago; "
            + "; ".join(f"{k[3:]}: {v['equal']} equal, {v['trained_since']} trained since" for k, v in res.items())
            + f"; lower than saved {len(lower)}; month gains below 0: {neg}", "stats": res, "lower": sorted(set(lower))}


@check("armory")
def _armory():
    log = load(g.ARMORY_LOG_PATH)
    have = {(e[0], e[1], log["items"][e[2]]) for e in log["events"]}
    data = g.fetch_section("news", KEY, {"cat": "armoryAction", "limit": 100, "sort": "DESC"})
    kinds, unknown, checked, absent = {}, {}, 0, 0
    for _ in range(3):
        for n in g._as_list(data.get("news")):
            p = g._armory_parse(n.get("text", ""))
            if p:
                kinds[p[3]] = kinds.get(p[3], 0) + 1
                t = int(n.get("timestamp") or 0)
                if log.get("oldest", 0) <= t <= log.get("last", 0):
                    checked += 1
                    absent += (t, p[0], p[1]) not in have
            else:
                import html as _h
                txt = re.sub(r"<[^>]+>[^<]*</a>", "<name>", _h.unescape(str(n.get("text", ""))))
                txt = re.sub(r"<[^>]+>", "", txt)
                txt = re.sub(r"\d[\d,]*", "#", txt).strip()
                kinds["other"] = kinds.get("other", 0) + 1
                unknown[txt] = unknown.get(txt, 0) + 1
        nxt = ((data.get("_metadata") or {}).get("links") or {}).get("next")
        if not nxt:
            break
        time.sleep(g.API_PAGE_DELAY)
        data = g.fetch_url(nxt, KEY)
    types = g.item_types("")
    untyped = [n for n in log["items"] if g.armory_cat(n, types) == "Other"]
    return {"ok": absent == 0, "summary": f"newest {sum(kinds.values())} armory lines: used {kinds.get('u', 0)}, refills "
            f"{kinds.get('r', 0)}, loaned {kinds.get('l', 0)}, given {kinds.get('g', 0)}, not usage {kinds.get('other', 0)}; "
            f"{checked} uses inside the recorded window, {absent} missing from the log; items with no category {len(untyped)}",
            "kinds": kinds, "not_usage_patterns": sorted(unknown.items(), key=lambda kv: -kv[1])[:25],
            "missing_from_log": absent, "uncategorised_items": untyped}


@check("payouts")
def _payouts():
    hist = load(g.WAR_HIST_PATH)["wars"]
    rows, bad = [], []
    for f in sorted(g.PAYOUT_DIR.glob("*.json")):
        r = load(f)
        paid = sum(int(m.get("pay") or 0) for m in r.get("members", []))
        exp = sum(int(e.get("amount") or 0) for e in r.get("expenses", []))
        wid = str(r["war"]["id"])
        wm = {str(m["id"]): m for m in hist.get(wid, {}).get("members", [])}
        # receipts pay on Torn's official war report hits ("attacks"); the attack log's own count (war_hits - attacked /
        # hospitalized / mugged only) can be a little lower and is reported for information
        hits_off = [str(m["id"]) for m in r.get("members", []) if str(m["id"]) in wm
                    and int(m.get("w") or 0) != int(wm[str(m["id"])]["attacks"])]
        log_gap = [str(m["id"]) for m in r.get("members", []) if str(m["id"]) in wm and "war_hits" in wm[str(m["id"])]
                   and int(wm[str(m["id"])]["war_hits"]) != int(wm[str(m["id"])]["attacks"])]
        x = {"receipt": f.stem, "paid_field": r.get("paid"), "sum_member_pay": paid, "budget": r.get("budget"),
             "expenses": exp, "net": r.get("net"), "rounding_over_net": int(r.get("paid") or 0) - int(r.get("net") or 0),
             "war_hits_off": hits_off[:20], "attack_log_count_differs": log_gap[:20]}
        # paid may exceed net by < $1 per member (each payout is rounded UP to the whole dollar - by design)
        over = int(r.get("paid") or 0) - int(r.get("net") or 0)
        if paid != int(r.get("paid") or 0) or hits_off or not (0 <= over <= len(r.get("members", []))):
            bad.append(f.stem)
        rows.append(x)
    return {"ok": not bad, "summary": f"{len(rows)} receipts: {len(bad)} with a total or hits mismatch", "receipts": rows, "bad": bad}


@check("published_totals")
def _totals():
    """members' totals (db/members.json t) = recomputed sums from the saved history (same rules: termed wars with no
    hits don't count)."""
    hist, ch = load(g.WAR_HIST_PATH)["wars"], load(g.CHAIN_HIST_PATH)["chains"]
    tw = g.termed_wars()
    wars, hits = {}, {}
    for k, w in hist.items():
        for m in w["members"]:
            if k in tw and m["attacks"] == 0:
                continue
            i = str(m["id"]); wars[i] = wars.get(i, 0) + 1; hits[i] = hits.get(i, 0) + m["attacks"]
    chh = {}
    for c in ch.values():
        for a in c["attackers"]:
            chh[str(a["id"])] = chh.get(str(a["id"]), 0) + a["hits"]
    raw = {"basic": load(g.CORE_CACHE_PATH)["basic"], "members": load(g.CORE_CACHE_PATH)["members"],
           "_war_history": {"wars": hist}, "_chain_history": {"chains": ch}}
    db = g.build_databases(raw, g.load_config())
    off = [m["id"] for m in db["members"]["members"] if
           (m["t"]["wars"], m["t"]["war_hits"], m["t"]["chain_hits"]) != (wars.get(str(m["id"]), 0), hits.get(str(m["id"]), 0), chh.get(str(m["id"]), 0))]
    return {"ok": not off, "summary": f"{len(db['members']['members'])} members: {len(off)} with totals that don't match the history",
            "off": off[:30]}


OUT.write_text(json.dumps(R, indent=1) + "\n", encoding="utf-8")
fails = [k for k, v in R["checks"].items() if not v.get("ok")]
print(f"Verification: {len(R['checks']) - len(fails)}/{len(R['checks'])} OK" + (f" - check: {', '.join(fails)}" if fails else ""))

#!/usr/bin/env python3
"""tornprobability.com payouts -> the Hub (Nov 2026).

The user: tornprobability.com's recorded scenario outcomes (collected from many factions) are the AUTHORITATIVE
payout data for the Hub's OC tools - maximum pay per day, item rewards and their values. Chase the TRUE maximum
(the best recorded run, items at their recorded quantity); keep the Hub's own best if it's ever higher (that rule is
applied in the Worker, gate/worker.js ocSummaries, where our history lives); show an average alongside.

Runs once a day from .github/workflows/tp_payouts.yml (started by the gatekeeper's timer) - NOT in the Worker:
the answers are up to ~8 MB per crime, far more than the Worker's CPU allows.

  1. crime names     GET tornprobability.com:3000/api/GetRoleNames            (keyless)
  2. item ids        GET api.torn.com/v2/torn/items                            (1 call, key in the header)
  3. each crime      GET tornprobability.com:3000/api/scenarios?name=<crime>   (keyless, one at a time)
  4. writes $OUT (an SQL file) - one oc_snap row per crime: env 'hub', ds 'tpp:<crime>', data =
       {runs, total, cashAvg, cashMin, cashMax, respAvg, respMin, respMax,
        items: {id: average quantity per successful run},
        outs:  [[cash, {id: qty}], ...]   <- the runs that can be the best / worst once priced (see keep_outs)
        ids:   [every reward item id], unmatched: N (item names not found in Torn's list)}
     The Worker prices the outcomes with its own daily market prices (net of the 5% fee) and the faction cut.

Successful runs only: a record with no money and no items is a failure (pays $0) and is dropped.
The workflow log shows counts only.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TP = "https://tornprobability.com:3000/api"
UA = "HeartBreakersHub/1.0 (GitHub Actions; daily payout stats)"


def get(url: str, headers: dict = None, timeout: int = 120):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def torn_items(key: str) -> dict:
    """{lower-case item name: (id, net market price)} - the price only ranks outcomes here; the Worker re-prices."""
    # API: Heart Breakers Hub - tornprobability payouts (item names -> ids), 1 call a day, key in the header
    d = get("https://api.torn.com/v2/torn/items?comment=" + urllib.parse.quote("Heart Breakers Hub"),
            {"Authorization": f"ApiKey {key}"}, timeout=60)
    if isinstance(d, dict) and d.get("error"):
        raise SystemExit("Torn API error (item list)")
    items = d.get("items")
    out = {}
    for it in (items.values() if isinstance(items, dict) else items or []):
        if isinstance(it, dict) and it.get("name") and it.get("id"):
            price = ((it.get("value") or {}).get("market_price") or 0) * 0.95
            out[str(it["name"]).strip().lower()] = (int(it["id"]), price)
    return out


def keep_outs(outs: list, price: dict) -> list:
    """The outcomes worth sending: the 25 best + 10 worst by today's estimated value, and for every item the run
    with its highest recorded quantity (the user: value items at the maximum quantity). Deduped."""
    val = lambda o: o[0] + sum(q * price.get(i, 0) for i, q in o[1].items())
    by = sorted(outs, key=val, reverse=True)
    keep = by[:25] + by[-10:]
    for i in {i for o in outs for i in o[1]}:
        keep.append(max(outs, key=lambda o: (o[1].get(i, 0), val(o))))
    seen, res = set(), []
    for o in keep:
        k = json.dumps(o, sort_keys=True)
        if k not in seen:
            seen.add(k)
            res.append(o)
    return res


def crime_stats(recs: list, names: dict) -> dict:
    price = {i: p for i, p in names.values()}
    outs, resp, unmatched = [], [], set()
    for r in recs if isinstance(recs, list) else []:
        rw = (r or {}).get("rewards") or {}
        cash = int(rw.get("money") or 0)
        its = {}
        for it in rw.get("items") or []:
            nm = str((it or {}).get("name") or "").strip()
            q = int((it or {}).get("quantity") or 1)
            hit = names.get(nm.lower())
            if hit:
                its[hit[0]] = its.get(hit[0], 0) + q
            elif nm:
                unmatched.add(nm)
        if cash <= 0 and not its:
            continue                                  # a failure - pays nothing
        outs.append([cash, its])
        if rw.get("respect") is not None:
            resp.append(float(rw["respect"]))
    if not outs:
        return None
    n = len(outs)
    cash = [o[0] for o in outs]
    items = {}
    for o in outs:
        for i, q in o[1].items():
            items[i] = items.get(i, 0) + q
    return {"runs": n, "total": len(recs),
            "cashAvg": round(sum(cash) / n), "cashMin": min(cash), "cashMax": max(cash),
            "respAvg": round(sum(resp) / len(resp)) if resp else None,
            "respMin": min(resp) if resp else None, "respMax": max(resp) if resp else None,
            "items": {str(i): round(q / n, 2) for i, q in items.items()},
            "outs": [[c, {str(i): q for i, q in its.items()}] for c, its in keep_outs(outs, price)],
            "ids": sorted(items), "unmatched": len(unmatched)}


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main():
    key = os.environ.get("TORN_API_KEY", "").strip()
    out_path = os.environ.get("OUT") or "tpp.sql"
    if not key:
        sys.exit("TORN_API_KEY is not set")
    crimes = sorted(get(TP + "/GetRoleNames", timeout=60).keys())      # tornprobability: the crime list (keyless)
    names = torn_items(key)
    now = int(time.time() * 1000)
    stmts, ok, empty, failed, unmatched = [], 0, 0, 0, 0
    for c in crimes:
        try:
            # tornprobability.com scenarios (keyless): every recorded outcome path of this crime
            recs = get(TP + "/scenarios?" + urllib.parse.urlencode({"name": c}), timeout=180)
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            failed += 1                               # this crime keeps yesterday's figures
            continue
        s = crime_stats(recs, names)
        if not s:
            empty += 1
            continue
        unmatched += s["unmatched"]
        data = json.dumps(s, separators=(",", ":"))
        stmts.append("INSERT INTO oc_snap (env, ds, as_of, data, by) VALUES ('hub', " + sql_str("tpp:" + c) + f", {now}, "
                     + sql_str(data) + ", 'tp') ON CONFLICT (env, ds) DO UPDATE SET as_of = excluded.as_of, "
                     "data = excluded.data, by = excluded.by;")
        ok += 1
        time.sleep(2)                                 # polite: one crime at a time
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(stmts) + "\n")
    print(f"tornprobability: {len(crimes)} crimes, {ok} with payouts, {empty} without successful runs, "
          f"{failed} not reachable, {unmatched} unmatched item names")
    if not ok:
        sys.exit("No payout data from tornprobability today - the Hub keeps the last good figures")


if __name__ == "__main__":
    main()

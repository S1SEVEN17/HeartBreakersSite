#!/usr/bin/env python3
"""
Workflow gate - decides what kind of run this is (no API calls).

The workflow is scheduled HOURLY, but a normal ("full") run is only wanted
every 3 hours. In between, an hourly "war" run happens only while a ranked
war is ongoing or about to start (data/run_state.json, written by
generate.py). War runs refresh just the ranked war data (~2 API calls) and
reuse the cached faction info / gym data.

Every other hour is a "chain" run: it only checks for newly finished
chains and posts their Discord Chain Reports (~1 API call), with no
banner render or Pages deploy.

Prints to $GITHUB_OUTPUT:  run=true|false   kind=full|war|chain   deploy=true|false
Manual and push-triggered runs are always full.
"""
import json
import os
import time
from pathlib import Path

FULL_EVERY = 3 * 3600 - 20 * 60      # 3 h, with 20 min slack for late starts

event = os.environ.get("GITHUB_EVENT_NAME", "")
# hourly runs are started by the gatekeeper's Cloudflare timer (gate/worker.js scheduled) as a workflow_dispatch
# with input scheduled=1 - treat those exactly like GitHub's own schedule
if os.environ.get("HB_SCHEDULED") == "1":
    event = "schedule"
now = int(time.time())
try:
    st = json.loads(Path("data/run_state.json").read_text())
except (OSError, ValueError):
    st = {}
if event != "schedule" or now - int(st.get("last_full", 0)) >= FULL_EVERY:
    run, kind = "true", "full"
elif st.get("war_active"):
    run, kind = "true", "war"
else:
    run, kind = "true", "chain"
deploy = "true" if kind in ("full", "war") else "false"
print(f"gate: run={run} kind={kind} deploy={deploy}")
with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a") as f:
    f.write(f"run={run}\nkind={kind}\ndeploy={deploy}\n")

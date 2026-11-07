#!/usr/bin/env python3
"""
Workflow gate - decides what kind of run this is (no API calls).

FIXED CLOCK SCHEDULE (TCT = UTC, Nov 2026). The gatekeeper's Cloudflare timer starts this workflow at :00 every hour
(workflow_dispatch with scheduled=1). The run kind follows the CLOCK, not the time since the last run:
  full   the first scheduled run in each 3-hour slot - 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
         (a missed slot - e.g. GitHub was down - is caught up by the next hourly run)
  war    other hours while a ranked war is on or starts within war_lookahead_hours (run_state.json war_active)
  chain  every other hour: newly finished chains only, no deploy
Runs started any other way (a leader saving something, an opt-in change, a code push, Run workflow) are "full"
renders: every Torn dataset is read only when its own clock slot has come round (see SCHEDULE in generate.py), so
these just rebuild the site from saved data straight away.
Prints to $GITHUB_OUTPUT:  run=true|false   kind=full|war|chain   deploy=true|false
"""
import json
import os
import time
from pathlib import Path

FULL_SLOT = 3 * 3600                 # full updates on the 3-hour clock slots (UTC/TCT)

event = os.environ.get("GITHUB_EVENT_NAME", "")
if os.environ.get("HB_SCHEDULED") == "1":
    event = "schedule"
now = int(time.time())
slot = now - now % FULL_SLOT          # start of the current 3-hour slot
try:
    st = json.loads(Path("data/run_state.json").read_text())
except (OSError, ValueError):
    st = {}
# last_slot_full = the slot the last SCHEDULED full update belonged to (triggered renders don't count)
if event != "schedule" or int(st.get("last_slot_full", 0)) < slot:
    run, kind = "true", "full"
elif st.get("war_active"):
    run, kind = "true", "war"
else:
    run, kind = "true", "chain"
deploy = "true" if kind in ("full", "war") else "false"
print(f"gate: run={run} kind={kind} deploy={deploy} ({'scheduled' if event == 'schedule' else 'triggered'})")
with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a") as f:
    f.write(f"run={run}\nkind={kind}\ndeploy={deploy}\nscheduled={'true' if event == 'schedule' else 'false'}\n")

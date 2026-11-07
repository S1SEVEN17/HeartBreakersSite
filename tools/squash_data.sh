#!/usr/bin/env bash
# Monthly squash of the PRIVATE data repo's history (banner.yml, 1st of the month, 03:00 TCT full update).
#
# Every update commits generated data files, so the repo's history grows by thousands of commits a month. This
# replaces the history with ONE commit holding the current files (nothing in the files changes):
#   - the old history is pushed to the "previous-history" branch first (overwritten each month, so one month of
#     history stays available to roll back to)
#   - main is force-pushed with --force-with-lease, so if anything saved data in the meantime the squash is
#     simply skipped this month (nothing is lost)
#   - "[bot]" in the message: the data repo's notify workflow doesn't start an update for it
# Other writers carry on normally: the gatekeeper writes through GitHub's contents API (file-based, unaffected),
# and tools/store.sh save falls back to "latest files + this run's changes" when its rebase can't follow the
# new history (e.g. chain watch saving after a long chain).
# Quiet on purpose (public log): counts only.
set -euo pipefail
cd store
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch -q origin main
HEAD_SHA=$(git rev-parse FETCH_HEAD)
TREE=$(git rev-parse "FETCH_HEAD^{tree}")
NEW=$(git commit-tree "$TREE" -m "History squashed $(date -u +%Y-%m) - previous history on branch previous-history [bot]")
git push -q --force origin "$HEAD_SHA:refs/heads/previous-history"
if git push -q --force-with-lease="main:$HEAD_SHA" origin "$NEW:refs/heads/main"; then
  git reset -q --hard "$NEW"
  echo "Data history squashed to 1 commit (previous history kept on branch previous-history)"
else
  echo "::warning::Data history squash skipped (data changed during the squash) - next month"
fi

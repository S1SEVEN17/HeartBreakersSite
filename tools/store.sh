#!/usr/bin/env bash
# Private data repo helper (the data lives in DATA_REPO, checked out at ./store by each workflow).
#   tools/store.sh link                 -> ./data and ./config.json point into ./store (generate.py reads/writes them)
#   tools/store.sh save "message" [paths relative to the data repo, default: data config.json]
#                                       -> commit what changed there and push (retries; on a clash keeps THIS
#                                          run's newer copy). "[bot]" in the message tells the data repo's notify
#                                          workflow not to start another update.
set -euo pipefail
cmd="${1:-}"; shift || true
case "$cmd" in
  link)
    [ -d store/data ] || { echo "::error::data repo not checked out at ./store"; exit 1; }
    rm -rf data config.json
    ln -s store/data data
    ln -s store/config.json config.json
    ;;
  save)
    msg="$1"; shift || true
    paths=("$@"); [ ${#paths[@]} -gt 0 ] || paths=(data config.json)
    cd store
    if [ -z "$(git status --porcelain -- "${paths[@]}" 2>/dev/null)" ]; then echo "Data: nothing to save"; exit 0; fi
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    for p in "${paths[@]}"; do [ -e "$p" ] && git add -A -- "$p"; done
    # this run's changes, kept aside for the fallback below (changed/added files + deleted paths)
    keep="$(mktemp -d)"
    git diff --cached --name-only --diff-filter=d -z | xargs -0 -r cp --parents -t "$keep"
    git diff --cached --name-only --diff-filter=D > "$keep.deleted"
    git commit -q -m "$msg [bot]"
    for i in 1 2 3 4; do
      git pull -q --rebase -X theirs origin main && git push -q && { echo "Data: saved"; exit 0; }
      git rebase --abort 2>/dev/null || true
      # Fallback (Nov 2026 - also covers the monthly history squash, after which a rebase can't follow): start
      # from the latest data and lay THIS run's changed files over it - same "this run's newer copy" rule.
      if git fetch -q origin main && git reset -q --hard FETCH_HEAD; then
        cp -a "$keep/." .
        while IFS= read -r d; do [ -n "$d" ] && git rm -q --ignore-unmatch -- "$d"; done < "$keep.deleted"
        for p in "${paths[@]}"; do [ -e "$p" ] && git add -A -- "$p"; done
        if [ -z "$(git status --porcelain -- "${paths[@]}")" ]; then echo "Data: nothing to save"; exit 0; fi
        git commit -q -m "$msg [bot]"
        git push -q && { echo "Data: saved"; exit 0; }
      fi
      sleep $((i * 5))
    done
    echo "::warning::Data: couldn't push after 4 tries"
    ;;
  *) echo "usage: store.sh link | save MSG [paths]"; exit 2 ;;
esac

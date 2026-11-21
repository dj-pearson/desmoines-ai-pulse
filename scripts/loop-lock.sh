#!/usr/bin/env bash
# Single-runner lock for improvement-loop rounds, held as the remote branch
# loops-lock. The branch points at a commit on an empty tree whose message is
# "<owner> <epoch>"; nothing else lives on it.
#
#   scripts/loop-lock.sh acquire <owner>  # exit 0 = you hold it, 1 = someone else does
#   scripts/loop-lock.sh refresh <owner>  # heartbeat; call before every round
#   scripts/loop-lock.sh release <owner>  # mark it stale if you hold it (the git
#                                         # proxy refuses branch deletes)
#
# A lock whose heartbeat is older than STALE_SECONDS (default 75 min) is
# treated as abandoned and can be taken over.
set -euo pipefail

cmd="${1:?usage: loop-lock.sh acquire|refresh|release <owner>}"
owner="${2:?owner id required}"
ref="loops-lock"
stale="${STALE_SECONDS:-4500}"
now="$(date +%s)"

read_lock() {
  if git fetch -q origin "+refs/heads/$ref:refs/remotes/origin/$ref" 2>/dev/null; then
    git log -1 --format=%s "origin/$ref"
  fi
}

write_lock() {
  local beat_at="${1:-$now}" tree sha
  tree="$(git hash-object -t tree -w /dev/null)"
  sha="$(git commit-tree "$tree" -m "$owner $beat_at")"
  git -c push.negotiate=false push -q --force origin "$sha:refs/heads/$ref"
}

current="$(read_lock || true)"
holder="${current%% *}"
beat="${current##* }"

case "$cmd" in
  acquire|refresh)
    if [ -n "$current" ] && [ "$holder" != "$owner" ] && [ $((now - beat)) -lt "$stale" ]; then
      echo "held by $holder, heartbeat $(( (now - beat) / 60 )) min ago"
      exit 1
    fi
    write_lock
    echo "lock held by $owner"
    ;;
  release)
    if [ "$holder" = "$owner" ]; then
      write_lock 0
      echo "released"
    else
      echo "not held by $owner; left alone"
    fi
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac

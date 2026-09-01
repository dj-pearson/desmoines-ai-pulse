#!/usr/bin/env bash
# Archive-then-delete every remote branch except main and develop.
#
# Branches whose commits are all reachable from origin/develop are deleted
# outright - nothing is lost. Branches that still carry unique commits get an
# annotated archive/<branch> tag pushed first, so the commits stay reachable
# forever and the branch can be restored with:
#
#     git branch <name> archive/<name> && git push origin <name>
#
# Merge status is recomputed at run time, not read from a baked-in list, so the
# script stays correct as branches come and go. The checked-out branch is never
# touched; merge any open PR before running, since deleting a PR head closes it.
# Dry run by default.
#
#     scripts/branch-cleanup.sh            # report only
#     scripts/branch-cleanup.sh --apply    # push tags, delete branches

set -euo pipefail

REMOTE=${REMOTE:-origin}
BASE=${BASE:-develop}
KEEP_RE='^(main|develop)$'
# The checked-out branch is kept too: deleting its remote would close any PR
# open against it. Merge and re-run if you want it gone.
CURRENT=$(git rev-parse --abbrev-ref HEAD)
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

cd "$(git rev-parse --show-toplevel)"

if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "==> unshallowing clone (full history is required to judge merge status)"
  git fetch --unshallow "$REMOTE" '+refs/heads/*:refs/remotes/'"$REMOTE"'/*'
fi

echo "==> fetching all branches from $REMOTE"
git fetch --prune "$REMOTE" '+refs/heads/*:refs/remotes/'"$REMOTE"'/*'

if ! git rev-parse --verify -q "$REMOTE/$BASE" >/dev/null; then
  echo "error: $REMOTE/$BASE does not exist" >&2
  exit 1
fi

# main must be contained in the base branch, or "merged into develop" would not
# imply "already released".
if [ "$(git rev-list --count "$REMOTE/$BASE".."$REMOTE/main")" -ne 0 ]; then
  echo "error: $REMOTE/main has commits not in $REMOTE/$BASE - reconcile them first" >&2
  exit 1
fi

merged=()
ahead=()
while read -r name; do
  [[ "$name" =~ $KEEP_RE ]] && continue
  [ "$name" = "$CURRENT" ] && { echo "keeping checked-out branch: $name"; continue; }
  if [ "$(git rev-list --count "$REMOTE/$BASE".."$REMOTE/$name")" -eq 0 ]; then
    merged+=("$name")
  else
    ahead+=("$name")
  fi
done < <(git for-each-ref --format='%(refname:strip=3)' "refs/remotes/$REMOTE" | grep -v '^HEAD$')

echo
echo "fully merged into $BASE (delete, nothing lost): ${#merged[@]}"
echo "carrying unique commits (tag, then delete):     ${#ahead[@]}"
for name in "${ahead[@]}"; do
  printf '  %s  %-4s commits ahead  %s\n' \
    "$(git log -1 --format=%cs "$REMOTE/$name")" \
    "$(git rev-list --count "$REMOTE/$BASE".."$REMOTE/$name")" "$name"
done

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "dry run - nothing changed. Re-run with --apply to execute."
  exit 0
fi

echo
echo "==> tagging ${#ahead[@]} branches"
tagrefs=()
for name in "${ahead[@]}"; do
  n=$(git rev-list --count "$REMOTE/$BASE".."$REMOTE/$name")
  git tag -f -a "archive/$name" \
    -m "Archived branch $name: $n commit(s) not in $BASE as of $(date -u +%Y-%m-%d). Restore with: git branch $name archive/$name" \
    "$REMOTE/$name" >/dev/null
  tagrefs+=("refs/tags/archive/$name")
done
git push --force "$REMOTE" "${tagrefs[@]}"

echo
echo "==> deleting $(( ${#merged[@]} + ${#ahead[@]} )) branches"
printf '%s\n' "${merged[@]}" "${ahead[@]}" \
  | xargs -n 40 sh -c 'git push '"$REMOTE"' --delete "$@" || exit 255' sh

echo
echo "==> done. Remaining branches:"
git fetch --prune "$REMOTE" >/dev/null 2>&1
git for-each-ref --format='  %(refname:strip=3)' "refs/remotes/$REMOTE" | grep -v '^  HEAD$'

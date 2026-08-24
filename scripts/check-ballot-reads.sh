#!/usr/bin/env bash
#
# WEB-SEC-025: no client may read the raw `votes` table except its own row.
#
# WHY THIS EXISTS. Step 3 of the story replaces the "Public read votes" SELECT
# policy (roles={public} USING (true)) with an own-rows-plus-admin policy. That
# is only safe once no shipped client reads the raw table for tallies, and the
# three clients were migrated to voting_category_tallies() / voting_results() /
# voting_winners() one at a time. Nothing stops the next leaderboard feature
# from reaching straight back into `votes` - it type-checks, it compiles, and it
# works right up until the policy changes, at which point it returns an empty
# array rather than an error.
#
# WHAT IS ALLOWED, and why each one survives the tightened policy:
#   - a select filtered to the caller's own user_id (the ballot UI's "you voted
#     for X")
#   - inserts and upserts (the INSERT policy is unchanged)
#   - deletes of the caller's own row
#
# Usage: scripts/check-ballot-reads.sh
# Exit: 0 clean, 1 a read that step 3 would break.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Every line that names the votes table in a data-access position, across the
# three clients. Comments are excluded by the grep below rather than by hand.
HITS="$(grep -rnE "from\(['\"]votes['\"]\)" \
          src/ ios/DesMoinesInsider/ android/app/src/main/ \
          --include=*.ts --include=*.tsx --include=*.swift --include=*.kt \
        | grep -vE "^\s*[^:]+:[0-9]+:\s*(//|\*|/\*|#)" || true)"

if [ -z "$HITS" ]; then
  echo "OK: no client references the votes table at all."
  exit 0
fi

BAD=0
echo "References to the raw votes table:"
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  file="${hit%%:*}"
  rest="${hit#*:}"
  line="${rest%%:*}"

  # Read a small window after the call so a chained .eq("user_id", ...) or an
  # .insert/.upsert/.delete on the following lines is seen. The calls are
  # formatted across lines in all three languages.
  window="$(sed -n "${line},$((line + 8))p" "$file")"

  # user_id must be the FILTER argument, not merely present in the window. The
  # old test matched any mention of user_id or userId - including a
  # .select(...) that RETURNS the column, which is the leak this guard exists
  # to stop rather than evidence against it. Negative-controlled: a tally read
  # selecting entity_id and user_id, filtered only by category_id, was reported
  # "ok" before this change.
  #
  # The pattern deliberately avoids embedding quote characters - the three
  # client dialects quote differently and a bash string carrying both quote
  # kinds is how this script broke while being fixed. Requiring user_id right
  # after eq( covers all three:
  #   web      .eq(user_id...   iOS  .eq(user_id...   Android  eq(user_id...
  if grep -qE "eq\(\s*.?user_id" <<< "$window" \
     || grep -qE "\.(insert|upsert|delete)\(" <<< "$window"; then
    echo "  ok    ${file}:${line}"
  else
    echo "  BREAKS STEP 3  ${file}:${line}"
    BAD=$((BAD + 1))
  fi
done <<< "$HITS"

echo
if [ "$BAD" -gt 0 ]; then
  echo "FAIL: ${BAD} read(s) of the raw votes table are not scoped to the caller's" >&2
  echo "      own row and are not writes. They return ballots today and will return" >&2
  echo "      an empty array once WEB-SEC-025 step 3 lands - silently, because a" >&2
  echo "      denied SELECT under RLS is an empty result, not an error." >&2
  echo "      Use voting_category_tallies(), voting_results(uuid) or voting_winners()." >&2
  exit 1
fi

echo "OK: every votes reference is own-row or a write."

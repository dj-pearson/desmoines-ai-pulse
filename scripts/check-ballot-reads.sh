#!/usr/bin/env bash
#
# WEB-SEC-025: no client may read a USING(true) tally table except its own row.
#
# AC7's sweep found seventeen public tables carrying a user identity under a
# SELECT policy whose USING clause is literally `true`, and sorted them: some are
# authored content where showing the author IS the feature, and eight have the
# `votes` shape - the UI renders a count while the table exposes who cast it.
# This guard now covers `votes` plus those eight, because the argument below
# ("nothing stops the next leaderboard feature") is not specific to votes and
# the other eight are where the next one is most likely to land.
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
# The votes shape: a count is rendered, a user identity is exposed. Excludes the
# authored-content tables from the same sweep (event_reviews, event_tips,
# user_ratings, event_photos, event_live_feed, user_reputation), where a public
# item with a hidden author is not the product.
TABLES="votes brewery_trail_checkins content_helpful_votes discussion_likes \
event_attendance event_checkins event_discussion_reactions photo_likes \
rating_helpful_votes"

# Known tally reads that predate this guard, keyed on FILE and TABLE rather than
# on a line number - a line-keyed entry is invalidated by any edit above it,
# which is the defect WEB-BE-032 had to fix in two other checks.
#
# Each entry is a real instance of the defect, not an exemption from it: it reads
# the raw table to compute a count and will return only the caller's row once the
# policy tightens. Clearing one means giving that table a SECURITY DEFINER
# aggregate, the way voting_category_tallies() cleared votes. Do not add to this
# list to make a new feature pass.
#
# EMPTY as of 2026-08-27. Its only entry was
#   src/hooks/useCommunityFeatures.ts:event_attendance
# and it is cleared: getEventCheckIns now calls event_attendance_tallies(uuid)
# (migration 20260827000002) instead of selecting `status` for every attendee.
# So no client read of any of these nine tables depends on the permissive policy
# any more. An empty list is not a dead variable - it is the state the guard was
# built to reach, and a new entry appearing here means the defect came back.
ALLOWED_TALLY_READS=""

TABLE_RE="$(echo "$TABLES" | tr -s ' \n' '|' | sed 's/|$//')"

HITS="$(grep -rnE "from\(['\"](${TABLE_RE})['\"]\)" \
          src/ ios/DesMoinesInsider/ android/app/src/main/ \
          --include=*.ts --include=*.tsx --include=*.swift --include=*.kt \
        | grep -vE "^\s*[^:]+:[0-9]+:\s*(//|\*|/\*|#)" || true)"

if [ -z "$HITS" ]; then
  echo "OK: no client references any of the tally tables."
  exit 0
fi

BAD=0
echo "References to raw tally tables:"
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  file="${hit%%:*}"
  rest="${hit#*:}"
  line="${rest%%:*}"

  # Read to the end of the STATEMENT, not a fixed number of lines. The window
  # was 8 lines, which is enough for a chained .eq() but not for a multi-line
  # .select(`...`) template - ProfilePage.tsx's two event_attendance queries put
  # .eq('user_id', user.id) eleven lines below the .from(), so a fixed window
  # reported two correctly-scoped reads as leaks. Capped at 40 lines so an
  # unterminated statement cannot swallow the next query.
  window="$(sed -n "${line},$((line + 40))p" "$file" | sed -n '1,/;/p')"

  table="$(sed -n "${line}p" "$file" | grep -oE "from\(['\"][a-z_]+['\"]\)" | grep -oE "[a-z_]+" | tail -1)"

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
    echo "  ok       ${file}:${line}  (${table})"
  elif grep -qxF "${file}:${table}" <<< "$(tr ' ' '\n' <<< "$ALLOWED_TALLY_READS")"; then
    echo "  known    ${file}:${line}  (${table}) - needs a SECURITY DEFINER tally"
  else
    echo "  BREAKS   ${file}:${line}  (${table})"
    BAD=$((BAD + 1))
  fi
done <<< "$HITS"

echo
if [ "$BAD" -gt 0 ]; then
  echo "FAIL: ${BAD} read(s) of a raw tally table are not scoped to the caller's" >&2
  echo "      own row and are not writes. They return ballots today and will return" >&2
  echo "      an empty array once WEB-SEC-025 step 3 lands - silently, because a" >&2
  echo "      denied SELECT under RLS is an empty result, not an error." >&2
  echo "      Aggregates that exist: voting_category_tallies(), voting_results(uuid)," >&2
  echo "      voting_winners(), event_attendance_tallies(uuid). A table with no" >&2
  echo "      aggregate yet needs one written before it can be read for a count." >&2
  exit 1
fi

echo "OK: every tally-table reference is own-row, a write, or a known instance."

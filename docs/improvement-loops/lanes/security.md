# Lane: security

**Mission.** No data leaves the database that the caller shouldn't see; no endpoint does work for a caller it shouldn't.

**Owns.** supabase/migrations (RLS), supabase/functions/** auth, _shared/cors + rateLimiter, public/_headers (CSP), anon-exposure-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-SEC, WEB-AUTH, WEB-LEGAL. See `../README.md` for the loop.

## Handoff

WEB-SEC-054, one step left, and it needs production credentials. Done: check-identity-read-policies.mjs expands policy statements run through EXECUTE format(...) in DO blocks (the 20260612000001 'table:policy' loop and the 20260709000052 crm loop) and fails on any dynamic policy statement it cannot resolve; the check now prints "Down 1: user_subscriptions". Next: with VITE_SUPABASE_URL and the anon key in the environment, `curl -s -H "apikey: $VITE_SUPABASE_ANON_KEY" "$VITE_SUPABASE_URL/rest/v1/user_subscriptions?select=id&limit=1"`. If it returns [], run `node scripts/check-identity-read-policies.mjs --write` (baseline 13 -> 12) and close the story. Trap: until that entry is removed, a new public read on user_subscriptions still passes the CLI check, because the baseline allows it; the negative control holds at the computeExposure level (scripts/__tests__/check-identity-read-dynamic.test.mjs).

(2026-11-07, round 4: still no Supabase credentials in the container, so this handoff was left as is and WEB-SEC-055 taken instead.)

(2026-11-07, round 5: still no credentials; left as is again, and WEB-SEC-057 found and done instead.)

(2026-11-07, round 6: still no credentials; left as is, and WEB-SEC-058 done instead.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-SEC-052 | this commit | Done. event_checkins (user_id plus the GPS fix of each check-in) was anon-readable through three USING(true) SELECT policies; now owner and admin only. Readers enumerated: web reads its own row, iOS/Android none. identity-read baseline 14 -> 13. Not applied to production from here. |
| 2026-11-07 | WEB-SEC-053 | this commit | Done. Owners could INSERT or PATCH event_checkins with is_verified=true and any distance, bypassing checkin_to_event(). BEFORE trigger now restores the four server-owned columns outside the RPC; RPC also clamps its acos() argument (a caller on the venue's exact coordinates got "input is out of range"). Both reproduced and fixed on local Postgres 16; new offline suite event-checkin-verified (16 checks fail without the migration). Not applied to production from here. |
| 2026-11-07 | WEB-SEC-054 | this commit | Split. The identity-read check now reads policies changed through EXECUTE format(...) in DO blocks and fails on dynamic policy SQL it cannot resolve. It found a second blind spot beyond the story: the crm_pipeline loop's six policies (authenticated-only, so no exposure). user_subscriptions reports Down 1; baseline left at 13 pending a production probe (no credentials here). New offline suite, 8 tests including two negative controls; test:offline 59/59. |
| 2026-11-07 | WEB-SEC-055 | this commit | Done. checkin_to_event now rejects out-of-range, NULL, NaN and infinite coordinates (22023), caps a user at 10 check-ins per rolling hour (54000, advisory-locked), and verifies only from 2h before start to 2h after end (start + 6h when end_date is NULL, whole day for time_tbd). Found on the way: the WEB-SEC-053 clamp turned lat = NaN into a verified 0 m from any venue. All cases reproduced before and checked after on local Postgres 16; new offline suite event-checkin-bounds (14 checks fail without the migration); test:offline 60/60. Signature and return shape unchanged; no client calls the RPC. Not applied to production from here. |
| 2026-11-07 | WEB-SEC-057 | this commit | Done. play-rtdn-webhook checked the Google signature, issuer, audience and expiry but not the `email` claim, so any Google account or service account could mint a passing token for the function's public URL and post RTDN messages (the voided-purchase branch revokes by purchase token without asking Google). Claim checks moved to _shared/pubsubOidc.ts and now require email_verified === true and email == PLAY_RTDN_SERVICE_ACCOUNT; unset, the webhook answers 500 like an unset PLAY_RTDN_AUDIENCE, so Pub/Sub redelivers. New Deno suite pubsubOidc.test.ts (6 tests, 3 fail with the email checks removed), added to subscription-sync-tests.yml. OWNER, before deploying: set PLAY_RTDN_SERVICE_ACCOUNT to the push subscription's service account. Not deployed from here. |
| 2026-11-07 | WEB-SEC-058 | this commit | Done. play-rtdn-webhook's voided-purchase branch cancelled the matching Android user_subscriptions row on the message's word. It now revokes only when purchases.voidedpurchases.list (type=1, window from a day before eventTimeMillis, clamped to Play's 30 days, paged) carries the token; unlisted or a permanent Play refusal logs void_unconfirmed and acks without revoking; a transient failure answers 503 with nothing logged so Pub/Sub redelivers; no matching row skips the Play call. Logic in _shared/playVoidedPurchase.ts; new Deno suite playVoidedPurchase.test.ts (9 tests; the unconfirmed case fails with the guard removed), added to subscription-sync-tests.yml. OWNER, before deploying: the Play service account needs Play Console's "View financial data" permission, or every refund is logged void_unconfirmed and left entitled until validate-android-receipt reconciles. Not deployed from here. |

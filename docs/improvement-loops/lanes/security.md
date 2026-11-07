# Lane: security

**Mission.** No data leaves the database that the caller shouldn't see; no endpoint does work for a caller it shouldn't.

**Owns.** supabase/migrations (RLS), supabase/functions/** auth, _shared/cors + rateLimiter, public/_headers (CSP), anon-exposure-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-SEC, WEB-AUTH, WEB-LEGAL. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-SEC-052 | this commit | Done. event_checkins (user_id plus the GPS fix of each check-in) was anon-readable through three USING(true) SELECT policies; now owner and admin only. Readers enumerated: web reads its own row, iOS/Android none. identity-read baseline 14 -> 13. Not applied to production from here. |
| 2026-11-07 | WEB-SEC-053 | this commit | Done. Owners could INSERT or PATCH event_checkins with is_verified=true and any distance, bypassing checkin_to_event(). BEFORE trigger now restores the four server-owned columns outside the RPC; RPC also clamps its acos() argument (a caller on the venue's exact coordinates got "input is out of range"). Both reproduced and fixed on local Postgres 16; new offline suite event-checkin-verified (16 checks fail without the migration). Not applied to production from here. |

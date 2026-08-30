# Certificate pin rotation runbook (IOS-AUDIT-SEC-013 AC3)

Pinning is the one control in this app that can take every installed binary
offline with no server-side remedy. If the pins stop matching the live chain and
enforcement is on, the app cannot reach Supabase, and it cannot fetch a config
that would tell it to stop. The only fix is a store release, which is days.

Everything below exists to keep that from happening.

## Where the pins live

`ios/DesMoinesInsider/Services/CertificatePinningService.swift`, in
`pinnedSPKIHashes`. They are SHA-256 hashes of the DER SubjectPublicKeyInfo, not
of the certificate, so they survive a reissue that keeps the same key pair.

Current set, all three verified against the live host on 2026-08-22:

| Role | Subject | Rotates |
|---|---|---|
| leaf | `CN=supabase.co` | ~90 days (GTS issues short-lived certs) |
| intermediate | Google Trust Services, `CN=WE1` | years |
| root | Google Trust Services LLC, `CN=GTS Root R4` | ~decade |

The root pin is the backup AC3 asks for. It is deliberately broad: any
GTS-issued certificate satisfies it, which is weaker than pinning the leaf
alone, and it is the only pin that survives both a leaf and an intermediate
reissue. Dropping it would be stronger and would brick clients on the next
rotation with nothing to fall back to.

## Check the pins

```bash
scripts/verify-cert-pins.sh          # prints the SPKI hash of every cert in the live chain
```

It exits non-zero if fewer than two of the pinned hashes appear in the live
chain. Two is the bar because one is not a fallback: if the only matching pin is
the leaf, the next 90-day reissue locks every client out.

This runs in CI (`.github/workflows/ios-ci.yml`). A red run means the pin set is
drifting from the live chain, not that the build is broken.

## Rotating a pin

The order matters, and it is the same shape as every other deprecation in this
repo: add the new thing, ship it, wait for it to be everywhere, then remove the
old one.

1. **Add the new hash alongside the old.** Never replace. The accept set is a
   union, so a build carrying both works before and after the server switches.
2. **Ship that build and wait.** Until `MIN_SUPPORTED_APP_VERSION` (see
   `supabase/functions/_shared/minSupportedVersions.ts`) is at or above the build
   carrying the new pin, older binaries in the wild still have only the old one.
3. **Then remove the old hash**, in a later release.

Compressing 1 and 3 into one release is what bricks clients. It looks safe
because the app you are testing has the new pin.

## Before flipping enforcement (`Config.certificatePinningEnforced`)

This is AC2 and it is not done. What has to be true first:

- [x] All three pins verified present in the live chain (2026-08-22).
- [x] At least two pins present, so one rotation cannot lock everyone out.
- [x] A backup pin that outlives leaf rotation (`GTS Root R4`).
- [x] Mismatch telemetry reaching the backend, so the report-only window
      produces evidence rather than silence. `CertificatePinningService`
      posts to `log-error` under component `ios-cert-pin`; one report per host
      per app run, since a mismatch repeats on every request.
- [ ] **A report-only window with real traffic and zero `ios-cert-pin` rows.**
      This is the gate that is still open, and it cannot be closed by reading
      code. Query:

      ```sql
      SELECT action, count(*), max(created_at)
      FROM error_events
      WHERE component = 'ios-cert-pin'
        AND created_at > now() - interval '14 days'
      GROUP BY action;
      ```

      Zero rows over a window with real installs is the argument for enforcing.
      Any rows name the host, and are the reason not to.

- [ ] **A store release cut immediately after the flip is available to roll
      back to.** Enforcement failures are invisible to us and total for the
      user, so the recovery path has to exist before the flip, not after.

## What enforcement does not protect

`URLSession.shared` is unpinned, and everything outside `pinnedDomains`
(currently only `supabase.co`) uses default trust evaluation. That includes the
`log-error` post above, deliberately: a pin-mismatch report has to survive the
pin mismatch it is reporting.

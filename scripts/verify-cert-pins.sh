#!/usr/bin/env bash
#
# Print the SHA-256 SPKI hash of every certificate in the live TLS chain, in the
# exact base64 form used by ios/DesMoinesInsider/Services/CertificatePinningService.swift,
# and check the declared pins against it.
#
# WHY (IOS-AUDIT-SEC-001 / SEC-013)
# Certificate pinning is wired up but ships report-only, because enforcing stale
# pins bricks every client's API connectivity with no remote fix. This script is
# the check that has to pass before `Config.certificatePinningEnforced` is
# flipped on, and the check to re-run whenever the CA rotates.
#
# The pinning delegate accepts if ANY cert in the chain matches ANY pin, so a
# pin that is not in the live chain does not add resilience - it only widens
# what the app will accept. Prune anything this script reports as absent.
#
# THE CHECK: at least two declared pins must appear in the live chain. One is
# not a fallback. If the only match is the leaf, the next ~90-day reissue locks
# out every client running an enforcing build, and there is no server-side
# remedy - only a store release. Runs in iOS CI so drift surfaces before a
# release rather than after (IOS-AUDIT-SEC-013 AC5).
#
# Usage:
#   scripts/verify-cert-pins.sh [host]           # defaults to the Supabase host
#
# Exit codes: 0 = at least two pins present in the live chain
#             1 = host unreachable, pins unreadable, or fewer than two present.

set -euo pipefail

HOST="${1:-wtkhfqpmcegzcbngroui.supabase.co}"
PORT=443
PIN_SOURCE="ios/DesMoinesInsider/Services/CertificatePinningService.swift"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Fetching TLS chain for ${HOST}:${PORT} ..."
echo

CHAIN="$(mktemp)"
trap 'rm -f "$CHAIN" "${CHAIN}"-*.pem' EXIT

if ! openssl s_client -connect "${HOST}:${PORT}" -servername "${HOST}" -showcerts </dev/null 2>/dev/null > "$CHAIN"; then
  echo "ERROR: could not connect to ${HOST}:${PORT}" >&2
  exit 1
fi

if ! grep -q "BEGIN CERTIFICATE" "$CHAIN"; then
  echo "ERROR: no certificates returned by ${HOST}" >&2
  exit 1
fi

# Split the PEM bundle into individual certs. -z drops the empty leading chunk
# (hashing that yields the SHA-256 of empty input, 47DEQpj8..., which is not a
# real pin and has confused this check before).
csplit -sz -f "${CHAIN}-" -b "%d.pem" "$CHAIN" '/BEGIN CERTIFICATE/' '{*}'

LIVE_HASHES=""
printf "%-72s %s\n" "SUBJECT" "SPKI SHA-256 (base64)"
printf "%-72s %s\n" "------------------------------------------------------------------------" "---------------------------------------------"

for cert in "${CHAIN}"-*.pem; do
  # csplit's first chunk is openssl's preamble, not a certificate. Skip anything
  # without a PEM block rather than letting openssl error out under `set -e`.
  if ! grep -q "BEGIN CERTIFICATE" "$cert"; then
    continue
  fi

  subject="$(openssl x509 -in "$cert" -noout -subject 2>/dev/null | sed 's/^subject=//')"
  hash="$(openssl x509 -in "$cert" -pubkey -noout 2>/dev/null \
          | openssl pkey -pubin -outform der 2>/dev/null \
          | openssl dgst -sha256 -binary \
          | base64)"

  if [ -n "$subject" ]; then
    printf "%-72s %s\n" "$subject" "$hash"
    LIVE_HASHES+="${hash}"$'\n'
  fi
done

echo

# --- Check the live chain against the declared pins --------------------------
#
# Pins are read out of the Swift source rather than duplicated here. A second
# copy would drift, and it would drift silently: a check comparing stale
# constants against the live chain still passes.
PIN_FILE="${REPO_ROOT}/${PIN_SOURCE}"
if [ ! -f "$PIN_FILE" ]; then
  echo "ERROR: cannot find ${PIN_SOURCE} - not checking pins." >&2
  exit 1
fi

# A base64 SHA-256 is 43 characters plus "=". Matching that shape rather than
# the array syntax keeps this working if the declaration is reformatted.
PINS="$(grep -oE '"[A-Za-z0-9+/]{43}="' "$PIN_FILE" | tr -d '"' | sort -u)"
PIN_COUNT="$(printf '%s\n' "$PINS" | grep -c . || true)"

if [ "$PIN_COUNT" -eq 0 ]; then
  echo "ERROR: no pins found in ${PIN_SOURCE}." >&2
  exit 1
fi

MATCHED=0
echo "Pins declared in ${PIN_SOURCE}:"
while IFS= read -r pin; do
  [ -n "$pin" ] || continue
  if grep -qxF "$pin" <<< "$LIVE_HASHES"; then
    echo "  present  $pin"
    MATCHED=$((MATCHED + 1))
  else
    # Absent is not a failure on its own - it only widens the accept set, which
    # is worth pruning rather than worth failing a build over.
    echo "  ABSENT   $pin"
  fi
done <<< "$PINS"

echo
if [ "$MATCHED" -lt 2 ]; then
  echo "FAIL: only ${MATCHED} of ${PIN_COUNT} declared pin(s) appear in the live chain." >&2
  echo "      Two is the floor - with one, the next rotation locks out every" >&2
  echo "      enforcing client and there is no remote fix." >&2
  echo "      See docs/CERT_PIN_ROTATION.md: add the new hash alongside the old" >&2
  echo "      one, ship that build, and only then remove the old one." >&2
  exit 1
fi

echo "OK: ${MATCHED} of ${PIN_COUNT} declared pins present in the live chain."

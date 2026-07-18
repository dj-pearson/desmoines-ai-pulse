#!/usr/bin/env bash
#
# Print the SHA-256 SPKI hash of every certificate in the live TLS chain, in the
# exact base64 form used by ios/DesMoinesInsider/Services/CertificatePinningService.swift.
#
# WHY (IOS-AUDIT-SEC-001 / SEC-013)
# Certificate pinning is wired up but ships report-only, because enforcing stale
# pins bricks every client's API connectivity with no remote fix. This script is
# the check that has to pass before `Config.certificatePinningEnforced` is
# flipped on, and the check to re-run whenever the CA rotates.
#
# The pinning delegate accepts if ANY cert in the chain matches ANY pin, so a
# pin that is not in the live chain does not add resilience — it only widens
# what the app will accept. Prune anything this script does not print.
#
# Usage:
#   scripts/verify-cert-pins.sh [host]           # defaults to the Supabase host
#
# Exit codes: 0 = chain fetched and hashed, 1 = could not reach host.

set -euo pipefail

HOST="${1:-wtkhfqpmcegzcbngroui.supabase.co}"
PORT=443

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
  fi
done

echo
echo "Compare against pinnedSPKIHashes in:"
echo "  ios/DesMoinesInsider/Services/CertificatePinningService.swift"
echo
echo "Before enabling enforcement, confirm at least TWO of the pins above are"
echo "present in this chain, so one rotation cannot lock every client out."

#!/usr/bin/env bash
#
# Fail unless an Android App Bundle is signed, and optionally unless it is
# signed by the expected upload key.
#
# WHY (AND-OVH-016)
# The release workflow used to run `jarsigner -verify ... | tail -20 || ...`.
# Without pipefail the pipeline's status is tail's, so the error branch could
# never run. Pipefail alone would not have fixed it: jarsigner -verify exits 0
# on an unsigned AAB and says so only in its output ("jar is unsigned."), which
# was checked against the local unsigned app-release.aab. So this script reads
# the output instead of trusting the exit code.
#
# Usage:
#   scripts/android/verify-aab-signature.sh <aab> [expected-sha1]
#
# The expected SHA-1 can also come from EXPECTED_UPLOAD_SHA1. The argument
# wins when both are set. Colons, spaces and case are ignored when comparing,
# so the Play Console form and the keytool form both work. Empty means "skip
# the fingerprint match"; the signature itself is still required.
#
# Prints the signer certificate fingerprint (public, not a secret). It never
# prints the expected value, which comes from a repository secret in CI.
#
# Exit codes: 0 = signed, verified, and matching when an expected SHA-1 is set
#             1 = unsigned, unverifiable, mismatched, or a tool is missing
#             2 = usage error

set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 <aab> [expected-sha1]" >&2
  exit 2
fi

AAB="$1"
EXPECTED_RAW="${2:-${EXPECTED_UPLOAD_SHA1:-}}"

err() {
  # ::error:: is an annotation on GitHub Actions and plain text elsewhere.
  echo "::error::$*" >&2
}

normalize_sha1() {
  tr -d ':[:space:]' | tr '[:lower:]' '[:upper:]'
}

for tool in jarsigner keytool; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "$tool not found on PATH; cannot verify the AAB signature."
    exit 1
  fi
done

if [ ! -f "$AAB" ]; then
  err "AAB not found: $AAB"
  exit 1
fi

# jarsigner's exit status is not evidence (see WHY), but a non-zero one still
# means something is wrong, so it fails too.
if ! VERIFY_OUT="$(jarsigner -verify -verbose -certs "$AAB" 2>&1)"; then
  echo "$VERIFY_OUT" | tail -20
  err "jarsigner -verify failed on $AAB."
  exit 1
fi

echo "$VERIFY_OUT" | tail -20
echo

if grep -qi 'jar is unsigned' <<<"$VERIFY_OUT"; then
  err "$AAB is unsigned. Play rejects an unsigned bundle; check the signingConfig and keystore secrets."
  exit 1
fi

if ! grep -q 'jar verified\.' <<<"$VERIFY_OUT"; then
  err "jarsigner did not report 'jar verified.' for $AAB."
  exit 1
fi

if ! CERT_OUT="$(keytool -printcert -jarfile "$AAB" 2>&1)"; then
  echo "$CERT_OUT"
  err "keytool -printcert failed on $AAB."
  exit 1
fi

# The first SHA1 line is the first signer's certificate. An upload-key-signed
# AAB has exactly one signer.
ACTUAL_SHA1="$(awk -F': ' '/SHA1:/ {print $2; exit}' <<<"$CERT_OUT" | normalize_sha1)"
if [ -z "$ACTUAL_SHA1" ]; then
  echo "$CERT_OUT"
  err "Could not read a signer certificate SHA-1 from $AAB."
  exit 1
fi

echo "Signer certificate SHA-1: $ACTUAL_SHA1"

EXPECTED_SHA1="$(printf '%s' "$EXPECTED_RAW" | normalize_sha1)"
if [ -n "$EXPECTED_SHA1" ]; then
  if [ "$ACTUAL_SHA1" != "$EXPECTED_SHA1" ]; then
    err "AAB signer SHA-1 does not match the expected upload key. Play Console will reject it with the 'wrong key' error."
    exit 1
  fi
  echo "Signer matches the expected upload key SHA-1."
else
  echo "No expected SHA-1 given; skipped the upload key match."
fi

echo "AAB signature verified: $AAB"

#!/usr/bin/env bash
#
# Fail unless the manifest inside a built Android App Bundle carries what Play
# needs, checked on the artifact itself rather than on the source manifest.
#
# WHY (AND-OVH-018)
# The May 2026 rejection was a manifest-content bug: the AAB shipped with no
# com.google.android.geo.API_KEY meta-data, so the Map tab crashed on open and
# Play reviewed it as Broken Functionality. Every check upstream of the build
# looked at inputs (secrets, local.properties). This one reads the merged,
# compiled manifest that Play will read, so a placeholder that slipped through,
# a manifest merger that re-added AD_ID, or a stale versionCode patch all fail
# the run before the artifact is uploaded.
#
# Usage:
#   scripts/android/assert-aab-manifest.sh <aab> <expectedVersionCode> [bundletool.jar]
#
# The bundletool jar can also come from BUNDLETOOL_JAR. The argument wins when
# both are set. With neither, the pinned release below is downloaded to a temp
# dir and its SHA-256 checked before it is run.
#
# Asserts:
#   - bundletool validate passes
#   - com.google.android.geo.API_KEY is present, non-empty, not a placeholder,
#     and shaped like a Google API key (AIza + 35 characters)
#   - versionCode equals <expectedVersionCode>
#   - targetSdkVersion >= 36
#   - com.google.android.gms.permission.AD_ID and every
#     android.permission.ACCESS_ADSERVICES_* permission are absent
#
# The Maps key is a secret in CI. It is reported only as present or absent,
# never printed, and the full manifest is never dumped to the log.
#
# Exit codes: 0 = every assertion holds
#             1 = an assertion failed, or a tool or download failed
#             2 = usage error

set -euo pipefail

BUNDLETOOL_VERSION="1.17.2"
BUNDLETOOL_URL="https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar"
BUNDLETOOL_SHA256="2d4ad908faea64047c1cc9cb747e6aa667c6ab192e09607bd16b67246a8cd6ae"
MIN_TARGET_SDK=36
MAPS_KEY_NAME="com.google.android.geo.API_KEY"

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 <aab> <expectedVersionCode> [bundletool.jar]" >&2
  exit 2
fi

AAB="$1"
EXPECTED_VERSION_CODE="$2"
BUNDLETOOL="${3:-${BUNDLETOOL_JAR:-}}"

err() {
  # ::error:: is an annotation on GitHub Actions and plain text elsewhere.
  echo "::error::$*" >&2
}

if ! [[ "$EXPECTED_VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "expectedVersionCode '$EXPECTED_VERSION_CODE' is not a whole number" >&2
  exit 2
fi

if ! command -v java >/dev/null 2>&1; then
  err "java not found on PATH; cannot run bundletool."
  exit 1
fi

if [ ! -f "$AAB" ]; then
  err "AAB not found: $AAB"
  exit 1
fi

TMP_DIR=""
cleanup() {
  if [ -n "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    return 1
  fi
}

if [ -z "$BUNDLETOOL" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    err "curl not found on PATH and no bundletool jar given; cannot download bundletool."
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  BUNDLETOOL="$TMP_DIR/bundletool-all-${BUNDLETOOL_VERSION}.jar"
  echo "Downloading bundletool ${BUNDLETOOL_VERSION}"
  if ! curl -sSfL --retry 3 -o "$BUNDLETOOL" "$BUNDLETOOL_URL"; then
    err "Could not download bundletool from $BUNDLETOOL_URL"
    exit 1
  fi
  if ! ACTUAL_SHA256="$(sha256_of "$BUNDLETOOL")"; then
    err "Neither sha256sum nor shasum is on PATH; cannot check the bundletool download."
    exit 1
  fi
  if [ "$ACTUAL_SHA256" != "$BUNDLETOOL_SHA256" ]; then
    err "bundletool download SHA-256 is $ACTUAL_SHA256, expected $BUNDLETOOL_SHA256. Refusing to run it."
    exit 1
  fi
elif [ ! -f "$BUNDLETOOL" ]; then
  err "bundletool jar not found: $BUNDLETOOL"
  exit 1
fi

bundletool() {
  java -jar "$BUNDLETOOL" "$@"
}

# One attribute (or attribute list) from the compiled manifest. bundletool
# prints CRLF on Windows; strip it so comparisons work on every runner.
manifest_xpath() {
  bundletool dump manifest --bundle="$AAB" --xpath "$1" | tr -d '\r'
}

FAILURES=0
fail() {
  err "$*"
  FAILURES=$((FAILURES + 1))
}

# ---- bundletool validate ---------------------------------------------------
# Its output lists bundle files, not manifest values, but it is only shown on
# failure to keep the log short.
if VALIDATE_OUT="$(bundletool validate --bundle="$AAB" 2>&1)"; then
  echo "bundletool validate: ok"
else
  echo "$VALIDATE_OUT" | tail -20
  fail "bundletool validate failed on $AAB."
fi

# ---- Maps API key ----------------------------------------------------------
# Never echo MAPS_KEY. Every message below says present or absent only.
MAPS_KEY="$(manifest_xpath "/manifest/application/meta-data[@android:name='${MAPS_KEY_NAME}']/@android:value" | head -1)"
MAPS_KEY_LOWER="$(printf '%s' "$MAPS_KEY" | tr '[:upper:]' '[:lower:]')"
if [ -z "$MAPS_KEY" ]; then
  fail "${MAPS_KEY_NAME}: absent. The Map tab crashes without it, which is the Broken Functionality rejection Play issued in May 2026. Set the GOOGLE_MAPS_API_KEY secret."
elif [[ "$MAPS_KEY_LOWER" == *placeholder* || "$MAPS_KEY_LOWER" == *changeme* \
     || "$MAPS_KEY_LOWER" == *your_* || "$MAPS_KEY_LOWER" == *your-* \
     || "$MAPS_KEY" == *'${'* || "$MAPS_KEY_LOWER" == *xxxx* ]]; then
  fail "${MAPS_KEY_NAME}: present but a placeholder. Set the GOOGLE_MAPS_API_KEY secret to the real Android-restricted key."
elif ! [[ "$MAPS_KEY" =~ ^AIza[0-9A-Za-z_-]{35}$ ]]; then
  fail "${MAPS_KEY_NAME}: present but not shaped like a Google API key (AIza followed by 35 characters). Check the GOOGLE_MAPS_API_KEY secret."
else
  echo "${MAPS_KEY_NAME}: present"
fi
unset MAPS_KEY MAPS_KEY_LOWER

# ---- versionCode -----------------------------------------------------------
VERSION_CODE="$(manifest_xpath "/manifest/@android:versionCode" | head -1)"
if [ "$VERSION_CODE" != "$EXPECTED_VERSION_CODE" ]; then
  fail "versionCode is '${VERSION_CODE:-absent}', expected $EXPECTED_VERSION_CODE. The build.gradle.kts patch did not reach the bundle."
else
  echo "versionCode: $VERSION_CODE"
fi

# ---- targetSdkVersion ------------------------------------------------------
TARGET_SDK="$(manifest_xpath "/manifest/uses-sdk/@android:targetSdkVersion" | head -1)"
if ! [[ "$TARGET_SDK" =~ ^[0-9]+$ ]]; then
  fail "targetSdkVersion is '${TARGET_SDK:-absent}', not a number."
elif [ "$TARGET_SDK" -lt "$MIN_TARGET_SDK" ]; then
  fail "targetSdkVersion is $TARGET_SDK; Play requires at least $MIN_TARGET_SDK."
else
  echo "targetSdkVersion: $TARGET_SDK"
fi

# ---- Advertising ID permissions --------------------------------------------
# AndroidManifest.xml removes these with tools:node="remove". A library bump
# can bring them back through the merger, and AD_ID without a use is an
# advertising-ID declaration Play holds the app to.
PERMISSIONS="$(manifest_xpath "/manifest/uses-permission/@android:name | /manifest/uses-permission-sdk-23/@android:name")"
FORBIDDEN="$(printf '%s\n' "$PERMISSIONS" \
  | grep -E '^(com\.google\.android\.gms\.permission\.AD_ID|android\.permission\.ACCESS_ADSERVICES_.*)$' || true)"
if [ -n "$FORBIDDEN" ]; then
  while IFS= read -r perm; do
    fail "Forbidden permission in the bundle manifest: $perm"
  done <<<"$FORBIDDEN"
else
  echo "AD_ID and ACCESS_ADSERVICES_*: absent"
fi

if [ "$FAILURES" -gt 0 ]; then
  err "$FAILURES manifest assertion(s) failed for $AAB."
  exit 1
fi

echo "AAB manifest assertions passed: $AAB"

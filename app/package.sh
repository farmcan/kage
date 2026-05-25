#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="KAGE"
VERSION="${KAGE_APP_VERSION:-0.1.0}"
BUILD_DIR="$SCRIPT_DIR/.build/release"
APP_PATH="$BUILD_DIR/$APP_NAME.app"
PACKAGE_DIR="$BUILD_DIR/package"
DMG_STAGING_DIR="$PACKAGE_DIR/dmg-root"
DMG_PATH="$BUILD_DIR/$APP_NAME-$VERSION.dmg"

cd "$SCRIPT_DIR"

APP_PATH="$("$SCRIPT_DIR/bundle.sh" | tail -n 1)"

if [[ -n "${KAGE_CODESIGN_IDENTITY:-}" ]]; then
  echo "Signing app with identity: $KAGE_CODESIGN_IDENTITY"
  codesign --force --deep --options runtime --sign "$KAGE_CODESIGN_IDENTITY" "$APP_PATH"
else
  echo "KAGE_CODESIGN_IDENTITY not set; leaving app unsigned."
fi

rm -rf "$PACKAGE_DIR" "$DMG_PATH"
mkdir -p "$DMG_STAGING_DIR"
cp -R "$APP_PATH" "$DMG_STAGING_DIR/$APP_NAME.app"
ln -s /Applications "$DMG_STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

if [[ -n "${KAGE_CODESIGN_IDENTITY:-}" ]]; then
  echo "Signing dmg with identity: $KAGE_CODESIGN_IDENTITY"
  codesign --force --sign "$KAGE_CODESIGN_IDENTITY" "$DMG_PATH"
fi

if [[ -n "${KAGE_NOTARY_PROFILE:-}" ]]; then
  echo "Submitting dmg for notarization with keychain profile: $KAGE_NOTARY_PROFILE"
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$KAGE_NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG_PATH"
else
  echo "KAGE_NOTARY_PROFILE not set; skipping notarization."
fi

echo "$DMG_PATH"

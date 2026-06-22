#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="KAGE"
EXECUTABLE_NAME="kage-menubar"
BUILD_DIR="$SCRIPT_DIR/.build/release"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
CLI_BUNDLE_DIR="$RESOURCES_DIR/kage-cli"
CLI_LAUNCHER="$RESOURCES_DIR/kage"
ICON_NAME="AppIcon"
RESOURCE_SOURCE_DIR="$SCRIPT_DIR/Resources"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_VERSION="$(sed -n 's/.*"version": "\(.*\)".*/\1/p' "$REPO_ROOT/package.json" | head -n 1)"
VERSION="${KAGE_APP_VERSION:-$PACKAGE_VERSION}"
BUILD_REVISION="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || true)"
BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

cd "$SCRIPT_DIR"
swift build -c release

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$CLI_BUNDLE_DIR"
cp "$BUILD_DIR/$EXECUTABLE_NAME" "$MACOS_DIR/$EXECUTABLE_NAME"
if [[ -d "$RESOURCE_SOURCE_DIR" ]]; then
  find "$RESOURCE_SOURCE_DIR" -maxdepth 1 -type f -exec cp {} "$RESOURCES_DIR/" \;
fi
cp -R "$REPO_ROOT/src" "$CLI_BUNDLE_DIR/src"
cp "$REPO_ROOT/package.json" "$CLI_BUNDLE_DIR/package.json"
cp "$REPO_ROOT/README.md" "$CLI_BUNDLE_DIR/README.md"
cp "$REPO_ROOT/LICENSE" "$CLI_BUNDLE_DIR/LICENSE"
cat > "$CLI_BUNDLE_DIR/build-info.json" <<JSON
{
  "source": "app-bundle",
  "revision": "$BUILD_REVISION",
  "installedAt": "$BUILD_TIME",
  "tarballUrl": null
}
JSON
if [[ -d "$REPO_ROOT/node_modules/qrcode-terminal" ]]; then
  mkdir -p "$CLI_BUNDLE_DIR/node_modules"
  cp -R "$REPO_ROOT/node_modules/qrcode-terminal" "$CLI_BUNDLE_DIR/node_modules/qrcode-terminal"
fi
cat > "$CLI_LAUNCHER" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /usr/bin/env node "$SCRIPT_DIR/kage-cli/src/cli.js" "$@"
SH
chmod +x "$CLI_LAUNCHER"

cat > "$CONTENTS_DIR/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>kage-menubar</string>
  <key>CFBundleIdentifier</key>
  <string>dev.farmcan.kage.menubar</string>
  <key>CFBundleIconFile</key>
  <string>$ICON_NAME</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>KAGE</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHumanReadableCopyright</key>
  <string>MIT</string>
  <key>NSUserNotificationAlertStyle</key>
  <string>alert</string>
</dict>
</plist>
PLIST

echo "$APP_DIR"

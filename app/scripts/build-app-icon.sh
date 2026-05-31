#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"
SOURCE_SVG="${1:-$REPO_ROOT/docs/assets/kage-logo.svg}"
RESOURCES_DIR="$APP_DIR/Resources"
ICONSET_DIR="$RESOURCES_DIR/AppIcon.iconset"
OUTPUT_ICON="$RESOURCES_DIR/AppIcon.icns"
MENU_BAR_SOURCE_SVG="$RESOURCES_DIR/MenuBarIconTemplate.svg"
MENU_BAR_OUTPUT_PNG="$RESOURCES_DIR/MenuBarIconTemplate.png"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR" "$ICONSET_DIR"
}
trap cleanup EXIT

mkdir -p "$RESOURCES_DIR" "$ICONSET_DIR"

SOURCE_PNG="$TMP_DIR/AppIcon-1024.png"
sips -s format png -z 1024 1024 "$SOURCE_SVG" --out "$SOURCE_PNG" >/dev/null

make_icon() {
  local base_size="$1"
  local scale="$2"
  local pixels=$((base_size * scale))
  local suffix=""

  if [[ "$scale" -eq 2 ]]; then
    suffix="@2x"
  fi

  sips -z "$pixels" "$pixels" "$SOURCE_PNG" \
    --out "$ICONSET_DIR/icon_${base_size}x${base_size}${suffix}.png" \
    >/dev/null
}

make_icon 16 1
make_icon 16 2
make_icon 32 1
make_icon 32 2
make_icon 128 1
make_icon 128 2
make_icon 256 1
make_icon 256 2
make_icon 512 1
make_icon 512 2

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICON"

if [[ -f "$MENU_BAR_SOURCE_SVG" ]]; then
  sips -s format png -z 36 36 "$MENU_BAR_SOURCE_SVG" --out "$MENU_BAR_OUTPUT_PNG" >/dev/null
fi

echo "$OUTPUT_ICON"

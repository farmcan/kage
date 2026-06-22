#!/usr/bin/env bash

set -euo pipefail

REPO_TARBALL_URL="https://github.com/farmcan/kage/archive/refs/heads/main.tar.gz"
REPO_REF_URL="https://api.github.com/repos/farmcan/kage/git/ref/heads/main"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node is required. Install Node.js 20+ first."
command -v npm >/dev/null 2>&1 || fail "npm is required. Install npm first."

node_major="$(node -p "process.versions.node.split('.')[0]")"
case "$node_major" in
  ''|*[!0-9]*)
    fail "unable to determine Node.js version."
    ;;
esac

if [ "$node_major" -lt 20 ]; then
  fail "Node.js 20+ is required. Current version: $(node -v)"
fi

printf 'Installing KAGE from %s\n' "$REPO_TARBALL_URL"
install_revision="$(curl -fsSL "$REPO_REF_URL" | sed -n 's/.*"sha": "\([0-9a-f]\{7,40\}\)".*/\1/p' | head -n 1 || true)"
if npm list -g agent-session-bridge >/dev/null 2>&1; then
  printf 'Removing old agent-session-bridge package...\n'
  npm uninstall -g agent-session-bridge >/dev/null
fi

npm install -g --force "$REPO_TARBALL_URL"

package_dir="$(npm root -g)/kage"
if [ -d "$package_dir" ]; then
  installed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  cat > "$package_dir/build-info.json" <<JSON
{
  "source": "main",
  "revision": "$install_revision",
  "installedAt": "$installed_at",
  "tarballUrl": "$REPO_TARBALL_URL"
}
JSON
fi

installed_version="$(kage --version 2>/dev/null || true)"
if [ -n "$installed_version" ]; then
  printf '\nInstalled %s.\n' "$installed_version"
else
  printf '\nInstalled KAGE.\n'
fi
printf 'Try:\n'
printf '  kage c2x\n'
printf '  kage x2c\n'
printf '  kage x2x\n'

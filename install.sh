#!/usr/bin/env bash

set -euo pipefail

REPO_TARBALL_URL="https://github.com/farmcan/kage/archive/refs/heads/main.tar.gz"

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
if npm list -g agent-session-bridge >/dev/null 2>&1; then
  printf 'Removing old agent-session-bridge package...\n'
  npm uninstall -g agent-session-bridge >/dev/null
fi

npm install -g --force "$REPO_TARBALL_URL"

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

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("install.sh exists and documents the GitHub installer flow", async () => {
  const installPath = path.join(__dirname, "..", "install.sh");
  const content = await fs.readFile(installPath, "utf8");

  assert.match(content, /^#!\/usr\/bin\/env bash/m);
  assert.match(content, /node/i);
  assert.match(content, /npm/i);
  assert.match(content, /https:\/\/github\.com\/farmcan\/kage\/archive\/refs\/heads\/main\.tar\.gz/);
  assert.match(content, /npm list -g agent-session-bridge/);
  assert.match(content, /npm uninstall -g agent-session-bridge/);
  assert.match(content, /npm install -g --force/);
  assert.match(content, /kage --version/);
  assert.match(content, /kage c2x/);
});

test("menu bar bundle script ships the KAGE CLI resources", async () => {
  const bundlePath = path.join(__dirname, "..", "app", "bundle.sh");
  const content = await fs.readFile(bundlePath, "utf8");

  assert.match(content, /RESOURCES_DIR="\$CONTENTS_DIR\/Resources"/);
  assert.match(content, /kage-cli/);
  assert.match(content, /cp -R "\$REPO_ROOT\/src"/);
  assert.match(content, /node_modules\/qrcode-terminal/);
  assert.match(content, /exec \/usr\/bin\/env node "\$SCRIPT_DIR\/kage-cli\/src\/cli\.js"/);
  assert.match(content, /chmod \+x "\$CLI_LAUNCHER"/);
});

test("homepage and release notes track the package version", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  const version = packageJson.version;
  const tag = `v${version}`;
  const dmgName = `KAGE-${version}.dmg`;
  const expectedDownload = `https://github.com/farmcan/kage/releases/download/${tag}/${dmgName}`;
  const homepage = await fs.readFile(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  const releaseNotes = await fs.readFile(path.join(__dirname, "..", "docs", "release-notes", `${tag}.md`), "utf8");

  assert.match(homepage, new RegExp(`Latest: ${tag}`));
  assert.equal(homepage.split(expectedDownload).length - 1, 2);
  assert.match(releaseNotes, new RegExp(`# KAGE ${tag}`));
  assert.match(releaseNotes, new RegExp(`releases/download/${tag}/${dmgName}`));
});

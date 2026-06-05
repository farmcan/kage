#!/usr/bin/env node
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const svgFiles = [
  path.join("docs", "assets", "kage-logo.svg"),
  ...fs
    .readdirSync(path.join(repoRoot, "docs", "assets", "screenshots"))
    .filter((fileName) => fileName.endsWith(".svg"))
    .sort()
    .map((fileName) => path.join("docs", "assets", "screenshots", fileName)),
];

const steps = [
  {
    label: "JavaScript syntax",
    command: "node",
    args: ["--check", "src/cli.js"],
  },
  {
    label: "Check script syntax",
    command: "node",
    args: ["--check", "scripts/check-all.mjs"],
  },
  {
    label: "Real E2E script syntax",
    command: "node",
    args: ["--check", "scripts/e2e-real.mjs"],
  },
  {
    label: "Whitespace diff check",
    command: "git",
    args: ["diff", "--check"],
  },
  {
    label: "Serve UI build",
    command: "npm",
    args: ["run", "build:serve-ui"],
  },
  {
    label: "SVG XML validation",
    command: "xmllint",
    args: ["--noout", ...svgFiles],
  },
  {
    label: "Node test suite",
    command: "npm",
    args: ["test"],
  },
  {
    label: "Swift release build",
    command: "swift",
    args: ["build", "--package-path", "app"],
  },
  {
    label: "Swift contract smoke",
    command: "swift",
    args: ["run", "--package-path", "app", "kage-contract-smoke"],
  },
  {
    label: "Package unsigned DMG",
    command: "./package.sh",
    args: [],
    cwd: path.join(repoRoot, "app"),
  },
  {
    label: "Real packaged E2E",
    command: "npm",
    args: ["run", "test:e2e:real"],
  },
];

function runStep(step, index) {
  const cwd = step.cwd ?? repoRoot;
  const title = `[${index + 1}/${steps.length}] ${step.label}`;
  console.log(`\n==> ${title}`);
  console.log(`$ ${[step.command, ...step.args].join(" ")}`);

  const startedAt = Date.now();
  const result = childProcess.spawnSync(step.command, step.args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.status !== 0) {
    console.error(`\nFAIL ${title} after ${seconds}s`);
    process.exit(result.status ?? 1);
  }

  console.log(`PASS ${title} in ${seconds}s`);
}

console.log("KAGE comprehensive check");
for (const [index, step] of steps.entries()) {
  runStep(step, index);
}
console.log("\nKAGE comprehensive check passed.");

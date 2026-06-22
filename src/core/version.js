import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..", "..");

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function gitRevision() {
  for (const gitBin of ["git", "/usr/bin/git"]) {
    try {
      return childProcess
        .execFileSync(gitBin, ["-C", packageRoot, "rev-parse", "--short=12", "HEAD"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
        .trim();
    } catch {
      // Keep trying common git locations; packaged builds normally use build-info.json.
    }
  }
  return null;
}

export async function getCliVersionInfo() {
  const packageJson = await readJsonIfPresent(path.join(packageRoot, "package.json"));
  const buildInfo = await readJsonIfPresent(path.join(packageRoot, "build-info.json"));
  const revision = buildInfo?.revision ?? process.env.KAGE_BUILD_REVISION ?? gitRevision();
  const source = buildInfo?.source ?? (revision ? "git" : null);

  return {
    version: packageJson?.version ?? "0.0.0",
    build: revision
      ? {
          revision,
          source,
          installedAt: buildInfo?.installedAt ?? null,
          tarballUrl: buildInfo?.tarballUrl ?? null,
        }
      : null,
  };
}

export function formatBuildLabel(build) {
  if (!build?.revision) {
    return null;
  }
  return `${build.source ?? "build"} ${build.revision}`;
}

export function formatCliVersion(info) {
  const buildLabel = formatBuildLabel(info.build);
  return buildLabel ? `kage ${info.version} (${buildLabel})` : `kage ${info.version}`;
}

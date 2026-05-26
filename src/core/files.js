import fs from "node:fs/promises";
import path from "node:path";

export async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return entry.name.endsWith(".jsonl") ? [fullPath] : [];
    }),
  );

  return files.flat();
}

export async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function samePath(leftPath, rightPath) {
  try {
    const [leftRealPath, rightRealPath] = await Promise.all([fs.realpath(leftPath), fs.realpath(rightPath)]);
    return leftRealPath === rightRealPath;
  } catch {
    return path.resolve(leftPath) === path.resolve(rightPath);
  }
}

async function realOrResolved(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export async function sameOrSubpath(candidatePath, parentPath) {
  const [candidate, parent] = await Promise.all([realOrResolved(candidatePath), realOrResolved(parentPath)]);
  if (candidate === parent) {
    return true;
  }

  const relativePath = path.relative(parent, candidate);
  return (
    Boolean(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

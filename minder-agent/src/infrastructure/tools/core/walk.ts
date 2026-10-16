import { lstat, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveConfinedPath } from "./paths.js";

export interface WalkEntry {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
}

const DEFAULT_EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "coverage",
]);
const DEFAULT_EXCLUDED_SUFFIXES = [".min.js", ".min.css", ".map"];

export async function resolveSearchRoot(
  workspaceRoot: string,
  requested: string | undefined,
): Promise<string> {
  return resolveConfinedPath(workspaceRoot, requested ?? ".");
}

export async function walkFiles(
  root: string,
  start: string,
): Promise<WalkEntry[]> {
  const entries: WalkEntry[] = [];
  const startStat = await stat(start);
  if (startStat.isFile()) {
    entries.push({
      absolutePath: start,
      relativePath: relative(root, start).split("\\").join("/"),
      size: startStat.size,
      mtimeMs: startStat.mtimeMs,
    });
    return entries;
  }
  if (!startStat.isDirectory()) return entries;

  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      if (
        DEFAULT_EXCLUDED_NAMES.has(child.name) ||
        DEFAULT_EXCLUDED_SUFFIXES.some((suffix) => child.name.endsWith(suffix))
      )
        continue;
      if (child.isSymbolicLink()) continue;
      const absolutePath = join(directory, child.name);
      if (child.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!child.isFile()) continue;
      const metadata = await lstat(absolutePath);
      entries.push({
        absolutePath,
        relativePath: relative(root, absolutePath).split("\\").join("/"),
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
      });
    }
  }

  await visit(start);
  return entries;
}

export function globMatches(pattern: string, value: string): boolean {
  if (pattern === "**") return false;
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === undefined) continue;
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
      continue;
    }
    if (character === "*") {
      expression += "[^/]*";
      continue;
    }
    if (character === "?") {
      expression += "[^/]";
      continue;
    }
    if (character === "{") {
      const end = pattern.indexOf("}", index + 1);
      if (end >= 0) {
        const alternatives = pattern
          .slice(index + 1, end)
          .split(",")
          .map(escapeRegex)
          .join("|");
        expression += `(?:${alternatives})`;
        index = end;
        continue;
      }
    }
    expression += escapeRegex(character);
  }
  return new RegExp(`^${expression}$`).test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

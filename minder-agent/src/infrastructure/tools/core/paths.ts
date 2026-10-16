import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export async function resolveConfinedPath(
  workspaceRoot: string,
  requested: string,
): Promise<string> {
  const root = await realpath(workspaceRoot);
  const candidate = resolve(root, requested);
  let probe = candidate;
  const missing: string[] = [];
  let existing: string;

  while (true) {
    try {
      existing = await realpath(probe);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(probe);
      if (parent === probe)
        throw new Error("Path could not be resolved.", { cause: error });
      missing.unshift(probe.slice(parent.length + 1));
      probe = parent;
    }
  }

  if (!isWithin(root, existing))
    throw new Error("Path resolves outside the workspace.");
  const result = missing.reduce(
    (current, part) => join(current, part),
    existing,
  );
  if (!isWithin(root, result))
    throw new Error("Path resolves outside the workspace.");
  return result;
}

function isWithin(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  return (
    distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))
  );
}

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbidden = new RegExp(
  [
    "@earendil-works" + "/",
    ".references/" + "pi",
    ".references\\\\" + "pi",
  ].join("|"),
);

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat();
}

describe("Phase 2 dependency boundary", () => {
  it("contains no Pi dependency or reference path", async () => {
    const root = process.cwd();
    const roots = [join(root, "src")];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const manifests = [
      join(root, "package.json"),
      join(root, "package-lock.json"),
    ];
    for (const path of [...files, ...manifests]) {
      if (path.endsWith("src/tests/phase-2/no-pi-dependency.test.ts")) continue;
      if (!/(?:package\.json|package-lock\.json|\.ts|\.mts|\.cts)$/.test(path))
        continue;
      expect(await readFile(path, "utf8"), path).not.toMatch(forbidden);
    }
  });
});

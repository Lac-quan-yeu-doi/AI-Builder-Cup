import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbidden = new RegExp(
  ["@earendil-works" + "/", "pi-" + "agent", ".references/" + "pi"].join("|"),
);

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat();
}

describe("Phase 4 dependency boundary", () => {
  it("keeps PostgreSQL durability independent from Pi", async () => {
    const root = process.cwd();
    const paths = [
      ...(await files(join(root, "src"))),
      join(root, "package.json"),
      join(root, "package-lock.json"),
    ].filter((path) => /(?:package\.json|package-lock\.json|\.ts)$/.test(path));
    for (const path of paths) {
      if (path.endsWith("src/tests/phase-4/no-pi-dependency.test.ts")) continue;
      expect(await readFile(path, "utf8"), path).not.toMatch(forbidden);
    }
  });
});

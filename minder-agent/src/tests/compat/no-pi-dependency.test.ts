import { access, readFile, readdir, rename } from "node:fs/promises";
import { spawn } from "node:child_process";
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
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat();
}

function runNpm(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, { cwd: process.cwd(), stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

describe("Phase 0 dependency boundary", () => {
  it("contains no Pi package or reference-path dependency", async () => {
    const root = process.cwd();
    const files = [
      ...(await sourceFiles(join(root, "src"))),
      join(root, "package.json"),
      join(root, "package-lock.json"),
    ];
    const checked = files.filter((path) =>
      /(?:package\.json|package-lock\.json|\.ts|\.mts|\.cts)$/.test(path),
    );
    await Promise.all(
      checked.map(async (path) => {
        if (path.endsWith("src/tests/compat/no-pi-dependency.test.ts")) return;
        expect(await readFile(path, "utf8"), path).not.toMatch(forbidden);
      }),
    );
  });

  it("passes the compatibility tests without the Pi reference directory", async () => {
    const root = process.cwd();
    const reference = join(root, ".references", "pi");
    const hidden = join(root, ".references", "pi.phase-0-hidden");
    try {
      await access(reference);
    } catch {
      return;
    }
    await rename(reference, hidden);
    try {
      expect(await runNpm(["run", "test:compat"])).toBe(0);
    } finally {
      await rename(hidden, reference);
    }
  });
});

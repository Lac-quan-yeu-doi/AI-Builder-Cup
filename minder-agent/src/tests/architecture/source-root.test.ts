import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "generated",
  "vendor",
  "target",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const activeExtensions = new Set([
  ...sourceExtensions,
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
]);
const inactiveRoots = new Set(["agents", "docs", "parity", ".superpowers"]);
const testPathPattern = /(?:^|\/)tests?(?:\/|$)/i;
const shellTestPattern = /(?:^|\/)[^/]*(?:test|smoke)[^/]*\.sh$/i;
const configTypeScriptFiles = new Set(["prisma.config.ts", "vitest.config.ts"]);

function repositoryFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];

      const path = join(directory, entry.name);
      return entry.isDirectory() ? repositoryFiles(path) : [path];
    });
}

const files = repositoryFiles(repositoryRoot).map((path) => ({
  path,
  relativePath: relative(repositoryRoot, path).split(sep).join("/"),
}));

test("requires the Nest monolith bootstrap source root", () => {
  expect(
    existsSync(resolve(repositoryRoot, "src/bootstrap/app.module.ts")),
  ).toBe(true);
});

test("keeps the legacy workspace directories out of the source tree", () => {
  const legacyRoots = ["apps", "packages"].filter((root) =>
    existsSync(resolve(repositoryRoot, root)),
  );
  const legacyPaths = files
    .filter(({ relativePath }) =>
      relativePath
        .split("/")
        .some((segment) => ["apps", "packages"].includes(segment)),
    )
    .map(({ relativePath }) => relativePath);

  expect([...legacyRoots, ...legacyPaths]).toEqual([]);
});

test("keeps workspace imports out of active source and config files", () => {
  const workspaceReference = ["@", "minder/"].join("");
  const references = files
    .filter(({ relativePath }) => {
      const [root] = relativePath.split("/");
      return (
        activeExtensions.has(extname(relativePath)) &&
        !inactiveRoots.has(root ?? "")
      );
    })
    .filter(({ path }) =>
      readFileSync(path, "utf8").includes(workspaceReference),
    )
    .map(({ relativePath }) => relativePath);

  expect(references).toEqual([]);
});

test("keeps application TypeScript source under src", () => {
  const externalSource = files
    .filter(({ relativePath }) => sourceExtensions.has(extname(relativePath)))
    .filter(({ relativePath }) => !relativePath.startsWith("src/"))
    .filter(({ relativePath }) => {
      const [root] = relativePath.split("/");
      return (
        !inactiveRoots.has(root ?? "") &&
        !configTypeScriptFiles.has(relativePath)
      );
    })
    .map(({ relativePath }) => relativePath);

  const externalShellTests = files
    .filter(({ relativePath }) => extname(relativePath) === ".sh")
    .filter(({ relativePath }) => !relativePath.startsWith("src/"))
    .filter(
      ({ relativePath }) =>
        testPathPattern.test(relativePath) ||
        shellTestPattern.test(relativePath),
    )
    .map(({ relativePath }) => relativePath);

  expect([...externalSource, ...externalShellTests]).toEqual([]);
});

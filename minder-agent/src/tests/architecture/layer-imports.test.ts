import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { expect, test } from "vitest";

test("domain sources do not import framework, infrastructure, or presentation layers", async () => {
  const files = globSync("src/domain/**/*.ts", { cwd: process.cwd() });

  expect(files).not.toHaveLength(0);

  const invalidImport =
    /(?:from\s+|import\s*\(\s*)["']@(nestjs|prisma|infrastructure|presentation)\//;
  const violations = [] as string[];

  for (const file of files) {
    if (invalidImport.test(await readFile(file, "utf8"))) {
      violations.push(file);
    }
  }

  expect(violations).toEqual([]);
});

test("application sources depend on domain and ports, not concrete adapters", async () => {
  const files = globSync("src/application/**/*.ts", { cwd: process.cwd() });
  const invalidImport =
    /(?:from\s+|import\s*\(\s*)["'](?:@infrastructure\/|@nestjs\/|@prisma\/|pg(?:\/|["'])|yaml(?:\/|["'])|node:(?:fs|path|os|child_process)(?:\/|["']))/;
  const violations = [] as string[];

  for (const file of files) {
    if (invalidImport.test(await readFile(file, "utf8"))) violations.push(file);
  }

  expect(violations).toEqual([]);
});

test("native HTTP foundation and controllers are the only presentation HTTP Nest boundary", async () => {
  const files = globSync("src/presentation/http/**/*.ts", {
    cwd: process.cwd(),
  }).filter((file) => !file.endsWith("/adapter.ts"));
  const infrastructureImport =
    /(?:from\s+|import\s*\(\s*)["']@infrastructure\//;
  const nestImport = /(?:from\s+|import\s*\(\s*)["']@nestjs\//;
  const invalidController = /@Controller\s*\(/;
  const violations = [] as string[];
  const newNestFiles = new Set([
    "src/presentation/http/v2/events.controller.ts",
    "src/presentation/http/v2/governance.controller.ts",
    "src/presentation/http/v2/openapi-dtos.ts",
    "src/presentation/http/v2/runs.controller.ts",
    "src/presentation/http/openapi/document.ts",
    "src/presentation/http/contracts/validation.ts",
  ]);

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const nativeFoundation = /^src\/presentation\/http\/common\//.test(file);
    const nativeFeature =
      /^src\/presentation\/http\/(?:operations|catalog|agents|runs|rooms|integrations|workspace|governance|skills|mcp|approvals)\//.test(
        file,
      );
    const nativeController =
      file.endsWith(".controller.ts") &&
      (nativeFeature || newNestFiles.has(file));
    const nativeNest =
      nativeFoundation || nativeFeature || newNestFiles.has(file);
    if (
      infrastructureImport.test(source) ||
      (!nativeNest && nestImport.test(source)) ||
      (!nativeController && invalidController.test(source))
    )
      violations.push(file);
  }

  expect(violations).toEqual([]);
});

test("HTTP controllers do not access the filesystem directly", async () => {
  const files = globSync("src/presentation/http/**/*.controller.ts", {
    cwd: process.cwd(),
  });
  const filesystemImport =
    /(?:from\s+|import\s*\(\s*)["']node:(?:fs|path)(?:\/|["'])/;
  const violations = [] as string[];

  for (const file of files) {
    if (filesystemImport.test(await readFile(file, "utf8")))
      violations.push(file);
  }

  expect(violations).toEqual([]);
});

test("shared HTTP authentication policy is transport neutral", async () => {
  const source = await readFile(
    "src/presentation/http/guards/authentication.ts",
    "utf8",
  );

  const rawHttpSpecifier = ["node", "http"].join(":");
  expect(source).not.toMatch(
    new RegExp(`(?:from\\s+|import\\s*\\(\\s*)["']${rawHttpSpecifier}`),
  );
});

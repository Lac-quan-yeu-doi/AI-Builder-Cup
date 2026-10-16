import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { expect, test } from "vitest";

test("production composition uses Prisma persistence only", async () => {
  const source = await readFile(
    "src/infrastructure/composition/index.ts",
    "utf8",
  );

  expect(source).not.toMatch(
    /prisma-pg|createPostgresPersistence|createPostgresStore/u,
  );
});

test("Prisma application persistence does not call raw SQL APIs", async () => {
  const files = globSync("src/infrastructure/prisma/**/*.ts", {
    cwd: process.cwd(),
  })
    .filter((file) => !file.endsWith("/migration-sql.ts"))
    .filter((file) => !file.endsWith("/schema/migrate.ts"))
    .filter((file) => !file.endsWith("/schema/compact-v2.ts"));
  const violations = [] as string[];

  for (const file of files) {
    if (/\$(?:queryRaw|executeRaw)/u.test(await readFile(file, "utf8")))
      violations.push(file);
  }

  expect(violations).toEqual([]);
});

test("legacy raw persistence adapters are removed", () => {
  expect(
    globSync("src/infrastructure/prisma-pg/**/*.ts", { cwd: process.cwd() }),
  ).toEqual([]);
});

import { vi, type Mock } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => {
    throw new Error(
      "migration SQL asset is unavailable beside the built module",
    );
  }),
}));

import { describe, expect, it } from "vitest";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import type { PrismaService } from "@infrastructure/prisma/prisma.service.js";

describe("Prisma runtime store built path", () => {
  it("migrates without a runtime SQL asset", async () => {
    type Execute = (...args: readonly unknown[]) => Promise<number>;
    type Transaction = (
      operation: (transaction: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    const execute = vi.fn<Execute>(async (..._args) => 0);
    const prisma = {
      $executeRawUnsafe: execute,
      $transaction: vi.fn<Transaction>(async (operation) =>
        operation({ $executeRawUnsafe: execute }),
      ),
    } as unknown as PrismaService & {
      $executeRawUnsafe: Mock<Execute>;
    };

    await new PrismaRuntimeStore({ prisma, schema: "minder_agent" }).migrate();

    const statements = execute.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.filter((sql) => sql.includes("CREATE TABLE IF NOT EXISTS")),
    ).toHaveLength(20);
  });
});

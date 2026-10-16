import { describe, expect, it, vi, type Mock } from "vitest";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import type { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import { buildPrismaDatasourceUrl } from "@infrastructure/prisma/prisma.service.js";

describe("Prisma runtime store boundary", () => {
  it("uses the configured schema and keeps migration ownership in Prisma", async () => {
    expect(
      buildPrismaDatasourceUrl(
        "postgres://minder:minder@localhost/db",
        undefined,
      ),
    ).toBe("postgres://minder:minder@localhost/db?schema=minder_agent");
    expect(
      buildPrismaDatasourceUrl(
        "postgres://minder:minder@localhost/db?sslmode=require",
        "tenant_data",
      ),
    ).toBe(
      "postgres://minder:minder@localhost/db?sslmode=require&schema=tenant_data",
    );

    const prisma = fakePrisma();
    prisma.$transaction.mockImplementation(async (operation) =>
      operation({ $executeRawUnsafe: prisma.$executeRawUnsafe }),
    );
    await new PrismaRuntimeStore({ prisma, schema: "minder_agent" }).migrate();
    expect(prisma.$executeRawUnsafe.mock.calls[0]?.[0]).toBe(
      'CREATE SCHEMA IF NOT EXISTS "minder_agent"',
    );
    expect(prisma.$executeRawUnsafe.mock.calls[1]?.[0]).toBe(
      'SET LOCAL search_path TO "minder_agent", public',
    );
    expect(
      prisma.$executeRawUnsafe.mock.calls.some(([sql]) =>
        String(sql).includes("CREATE TABLE IF NOT EXISTS sessions"),
      ),
    ).toBe(true);
  });

  it("disconnects only the Prisma client owned by the store", async () => {
    const external = fakePrisma();
    await new PrismaRuntimeStore({ prisma: external }).close();
    expect(external.$disconnect).not.toHaveBeenCalled();

    const owned = new PrismaRuntimeStore();
    const disconnect = vi
      .spyOn(owned.prisma, "$disconnect")
      .mockResolvedValue(undefined);
    await owned.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("records recovery evidence through typed Prisma delegates", async () => {
    const prisma = fakePrisma();
    const tx = {
      runApprovalExecutionClaim: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      run: {
        findMany: vi.fn(async () => [
          {
            id: "run-1",
            sessionId: "session-1",
            status: "running",
            responseText: "partial",
            error: null,
            finishedAt: null,
          },
        ]),
        findUnique: vi.fn(async () => ({ sessionId: "session-1" })),
        update: vi.fn(async () => undefined),
      },
      roomRun: { findFirst: vi.fn(async () => null) },
      session: {
        findUnique: vi.fn(async () => ({ owner: "alice" })),
        findFirst: vi.fn(async () => ({ id: "session-1" })),
      },
      runEvent: {
        findFirst: vi.fn(async () => ({ seq: 3 })),
        create: vi.fn(async () => undefined),
      },
      runGovernancePolicy: {
        findUnique: vi.fn(async () => ({ runId: "run-1" })),
      },
      runGovernanceEvidence: {
        findFirst: vi.fn(async () => ({ seq: 4n })),
        create: vi.fn(async (input: { data: { detail: unknown } }) => ({
          id: "evidence-1",
          runId: "run-1",
          owner: "alice",
          seq: 5n,
          kind: "recovery",
          detail: input.data.detail,
          at: new Date(),
        })),
      },
    };
    prisma.$transaction.mockImplementation(async (operation) => operation(tx));

    await new PrismaRuntimeStore({ prisma }).recoverInterrupted();

    expect(tx.runGovernanceEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: "alice",
        runId: "run-1",
        seq: 5n,
      }),
    });
    expect(
      tx.runGovernanceEvidence.create.mock.calls[0]?.[0].data.detail,
    ).toEqual({
      phase: "startup_recovery",
      reason: "run was active when the runtime restarted",
    });
  });
});

type FakePrisma = {
  $executeRawUnsafe: Mock<(...args: readonly unknown[]) => Promise<unknown>>;
  $queryRawUnsafe: Mock<
    (...args: readonly unknown[]) => Promise<readonly unknown[]>
  >;
  $transaction: Mock<
    (operation: (transaction: unknown) => Promise<unknown>) => Promise<unknown>
  >;
  $disconnect: Mock<() => Promise<void>>;
};

function fakePrisma(): FakePrisma & PrismaService {
  return {
    $executeRawUnsafe: vi.fn(async (..._args: readonly unknown[]) => 0),
    $queryRawUnsafe: vi.fn(async (..._args: readonly unknown[]) => []),
    $transaction: vi.fn(
      async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({}),
    ),
    $disconnect: vi.fn(async () => undefined),
  } as unknown as FakePrisma & PrismaService;
}

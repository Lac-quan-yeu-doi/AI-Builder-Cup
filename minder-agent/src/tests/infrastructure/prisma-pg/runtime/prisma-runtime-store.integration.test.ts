import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import type { RuntimeStore } from "@application/runtime/execution/types.js";

const connectionString = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;

describeDatabase("PrismaRuntimeStore", () => {
  const prisma = new PrismaService(
    connectionString === undefined ? {} : { datasourceUrl: connectionString },
  );
  let store: PrismaRuntimeStore;
  let persistence: PrismaRuntimeStore & RuntimeStore;

  beforeAll(async () => {
    await prisma.$connect();
    store = new PrismaRuntimeStore(prisma);
    await store.migrate();
    persistence = store;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("recovers canonical events and approval state through the persistence port", async () => {
    const session = await persistence.getOrCreateSession(
      "prisma-recovery",
      `chat-${randomUUID()}`,
      "interactive",
    );
    const run = await persistence.startRun(session.id, "input", "interactive", {
      source: "test",
    });
    if (!run) throw new Error("expected run");
    await persistence.appendEvent(run.id, { type: "text", data: "hello" });
    await persistence.commitSession(session.id, {
      history: [{ role: "user", content: "input" }],
      pendingApproval: {
        approvalId: "approval-1",
        runId: run.id,
        toolCallId: "call-1",
        action: "write_file",
        argumentsHash: "hash",
        preview: "write file",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const fresh = new PrismaRuntimeStore(prisma) as PrismaRuntimeStore &
      RuntimeStore;
    expect(
      (await fresh.getSession(session.id))?.pendingApproval?.approvalId,
    ).toBe("approval-1");
    expect(
      (await fresh.replay(run.id, 0, 10)).map((event) => event.payload),
    ).toEqual([{ type: "text", data: "hello" }]);
  });
});

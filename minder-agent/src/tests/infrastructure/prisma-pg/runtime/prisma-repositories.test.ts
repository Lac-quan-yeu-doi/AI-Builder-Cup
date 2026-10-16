import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agentConfigurationHash,
  runId as toRunId,
  skillName,
  validateAgentConfiguration,
} from "@domain/index.js";
import type { RunId } from "@domain/index.js";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  PrismaAgentConfigurationStore,
  PrismaApprovalStore,
  PrismaEventJournal,
  PrismaFileAccessPort,
  PrismaRunEvidencePort,
  PrismaSkillStore,
} from "@infrastructure/prisma/repositories/index.js";

const connectionString = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;

describeDatabase("Prisma core repositories", () => {
  const schema = `prisma_test_${randomUUID().replaceAll("-", "")}`;
  process.env.MINDER_DATABASE_SCHEMA = schema;
  const prisma = new PrismaService(
    connectionString === undefined ? {} : { datasourceUrl: connectionString },
  );
  const owner = `prisma-repositories-${randomUUID()}`;
  let runId: RunId;

  beforeAll(async () => {
    await prisma.$connect();
    const runtime = new PrismaRuntimeStore({ prisma, schema });
    await runtime.migrate();
    const session = await runtime.getOrCreateSession(
      owner,
      randomUUID(),
      "interactive",
    );
    const run = await runtime.createRun(session.id, "input", "interactive", {
      source: "test",
    });
    runId = toRunId(run.id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("preserves owner-scoped agent revisions and current records", async () => {
    const store = new PrismaAgentConfigurationStore(prisma);
    const agent = validateAgentConfiguration({
      id: "planner",
      name: "planner",
      toolAllowlist: ["read_file"],
      skills: ["planning"],
      executionStrategy: "react",
    });
    const record = { agent, version: 1, hash: "hash-1" };

    await store.save(owner, record);

    await expect(store.get(owner, agent.id)).resolves.toEqual(record);
    await expect(store.get("other-owner", agent.id)).resolves.toBeUndefined();
    await expect(store.history(owner, agent.id)).resolves.toEqual([record]);

    const archived = await store.archive(owner, agent.id);
    expect(archived?.agent.archivedAt).toBeDefined();
    expect(archived?.hash).toBe(
      agentConfigurationHash(archived!.agent, sha256),
    );
    await expect(store.get(owner, agent.id)).resolves.toEqual(archived);
  });

  it("preserves approval, evidence, file-access, skill, and event journal shapes", async () => {
    const approvals = new PrismaApprovalStore(prisma);
    const approvalId = randomUUID();
    await approvals.save({
      id: approvalId,
      owner,
      runId,
      toolCallId: "call-1",
      action: "write_file",
      argumentsHash: "hash",
      preview: "report.md",
      status: "pending",
      createdAt: "2026-09-20T00:00:00.000Z",
      expiresAt: "2026-09-20T00:05:00.000Z",
    });
    await expect(approvals.list("other-owner", runId)).resolves.toEqual([]);
    await expect(
      approvals.save({
        id: approvalId,
        owner: "other-owner",
        runId,
        toolCallId: "call-2",
        action: "delete_file",
        argumentsHash: "other-hash",
        preview: "other.md",
        status: "approved",
        createdAt: "2026-09-20T00:00:00.000Z",
        expiresAt: "2026-09-20T00:05:00.000Z",
      }),
    ).rejects.toThrow();
    await expect(
      approvals.get(owner, runId, approvalId),
    ).resolves.toMatchObject({
      status: "pending",
      owner,
    });

    const evidence = new PrismaRunEvidencePort(prisma);
    await evidence.saveManifest(owner, {
      runId,
      manifest: {
        name: "planner",
        manifestHash: "manifest-hash",
        manifestName: "planner",
        manifestSourcePath: "agents/planner.yaml",
        manifestYaml: "name: planner",
      },
      createdAt: "2026-09-20T00:00:00.000Z",
      contentHash: "manifest-hash",
    });
    const journal = new PrismaEventJournal(prisma);
    await journal.append({ runId, payload: { type: "text", data: "hello" } });
    await expect(
      evidence.getManifest("other-owner", runId),
    ).resolves.toBeUndefined();
    await expect(evidence.getManifest(owner, runId)).resolves.toMatchObject({
      contentHash: "manifest-hash",
      manifestName: "planner",
      sourcePath: "agents/planner.yaml",
      yaml: "name: planner",
    });
    await evidence.saveManifest(owner, {
      runId,
      manifest: {
        manifestHash: 42,
        manifestName: null,
        manifestSourcePath: [],
        manifestYaml: false,
      },
      createdAt: "2026-09-20T00:00:00.000Z",
    });
    const manifestWithoutStringMetadata = await evidence.getManifest(
      owner,
      runId,
    );
    expect(manifestWithoutStringMetadata).not.toHaveProperty("contentHash");
    expect(manifestWithoutStringMetadata).not.toHaveProperty("manifestName");
    expect(manifestWithoutStringMetadata).not.toHaveProperty("sourcePath");
    expect(manifestWithoutStringMetadata).not.toHaveProperty("yaml");
    await journal.append({ runId, payload: { type: "text", data: "second" } });
    const firstTracePage = await evidence.listTrace(owner, runId, "0", 1);
    expect(firstTracePage.map((record) => record.seq)).toEqual([1, 2]);
    expect(
      (await evidence.listTrace(owner, runId, "1", 1)).map(
        (record) => record.seq,
      ),
    ).toEqual([2]);
    expect(
      (await evidence.listTrace(owner, runId)).map((record) => record.seq),
    ).toEqual([1, 2]);
    await expect(evidence.listValidations(owner, runId)).resolves.toEqual([]);
    await expect(evidence.getReport(owner, runId)).resolves.toBeUndefined();
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "completed",
        responseText: "# Report",
        finishedAt: new Date("2026-09-20T00:00:03.000Z"),
      },
    });
    await expect(evidence.listValidations(owner, runId)).resolves.toMatchObject(
      [
        {
          name: "run_status",
          passed: true,
          details: { status: "completed" },
          createdAt: "2026-09-20T00:00:03.000Z",
        },
      ],
    );
    await expect(evidence.getReport(owner, runId)).resolves.toMatchObject({
      markdown: "# Report",
      artifactId: `${runId}:report`,
      byteSize: Buffer.byteLength("# Report", "utf8"),
      createdAt: "2026-09-20T00:00:03.000Z",
    });

    const fileAccess = new PrismaFileAccessPort(prisma);
    await fileAccess.record({
      runId,
      path: "report.md",
      operation: "write",
      at: "2026-09-20T00:00:04.000Z",
    });
    await expect(fileAccess.list(runId)).resolves.toEqual([
      {
        runId,
        path: "report.md",
        operation: "write",
        at: "2026-09-20T00:00:04.000Z",
      },
    ]);

    const skills = new PrismaSkillStore(prisma, owner);
    const skill = {
      name: skillName("planning"),
      namespace: "project",
      body: "Plan first",
      hash: "skill-hash",
      source: "project" as const,
      readOnly: false,
      createdAt: "2026-09-20T00:00:05.000Z",
      updatedAt: "2026-09-20T00:00:05.000Z",
    };
    await skills.save(skill);
    await expect(skills.get(skill.name)).resolves.toEqual(skill);

    await expect(
      journal.append({ runId, payload: { type: "text", data: "one" } }),
    ).resolves.toMatchObject({ runId, seq: 3 });
    const concurrent = await Promise.all([
      journal.append({ runId, payload: { type: "text", data: "two" } }),
      journal.append({ runId, payload: { type: "text", data: "three" } }),
    ]);
    expect(concurrent.map((event) => event.seq).sort()).toEqual([4, 5]);
    await expect(journal.lastSeq(runId)).resolves.toBe(5);
    expect(
      (await journal.readFrom(runId, 1, 10)).map((event) => event.seq),
    ).toEqual([2, 3, 4, 5]);
  });
});

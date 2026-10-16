import { runId as toRunId, type RunId } from "@domain/index.js";
import type {
  RunEvidencePort,
  RunManifestRecord,
  RunReportRecord,
  RunTraceRecord,
  RunValidationRecord,
} from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { jsonInput, timestamp } from "../mappers/repositories.js";

async function ownedRun(
  prisma: PrismaService,
  owner: string,
  runId: string,
): Promise<boolean> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  return (
    run !== null &&
    (await prisma.session.findFirst({
      where: { id: run.sessionId, owner },
    })) !== null
  );
}

export class PrismaRunEvidencePort implements RunEvidencePort {
  constructor(private readonly prisma: PrismaService) {}

  async saveManifest(owner: string, record: RunManifestRecord): Promise<void> {
    if (!(await ownedRun(this.prisma, owner, record.runId))) return;
    await this.prisma.runManifest.upsert({
      where: { runId: record.runId },
      create: {
        runId: record.runId,
        manifest: jsonInput(record.manifest),
        createdAt: new Date(record.createdAt),
      },
      update: {
        manifest: jsonInput(record.manifest),
        createdAt: new Date(record.createdAt),
      },
    });
  }

  async getManifest(
    owner: string,
    runId: RunId,
  ): Promise<RunManifestRecord | undefined> {
    if (!(await ownedRun(this.prisma, owner, runId))) return undefined;
    const row = await this.prisma.runManifest.findUnique({ where: { runId } });
    if (!row) return undefined;
    const contentHash = manifestField(row.manifest, "manifestHash");
    const manifestName = manifestField(row.manifest, "manifestName");
    const sourcePath = manifestField(row.manifest, "manifestSourcePath");
    const yaml = manifestField(row.manifest, "manifestYaml");
    return {
      runId: toRunId(row.runId),
      manifest: structuredClone(row.manifest),
      createdAt: timestamp(row.createdAt),
      ...(contentHash === undefined ? {} : { contentHash }),
      ...(manifestName === undefined ? {} : { manifestName }),
      ...(sourcePath === undefined ? {} : { sourcePath }),
      ...(yaml === undefined ? {} : { yaml }),
    };
  }

  async listTrace(
    owner: string,
    runId: RunId,
    cursor = "0",
    limit = 100,
  ): Promise<readonly RunTraceRecord[]> {
    if (!(await ownedRun(this.prisma, owner, runId))) return [];
    const after = Number.parseInt(cursor, 10);
    const rows = await this.prisma.runEvent.findMany({
      where: {
        runId,
        seq: { gt: Number.isFinite(after) && after >= 0 ? after : 0 },
      },
      orderBy: { seq: "asc" },
      take: Math.max(1, Math.min(limit, 500)) + 1,
    });
    return rows.map((row) => ({
      runId: toRunId(row.runId),
      seq: row.seq,
      event: structuredClone(row.event),
      createdAt: timestamp(row.createdAt),
    }));
  }

  async listValidations(
    owner: string,
    runId: RunId,
  ): Promise<readonly RunValidationRecord[]> {
    if (!(await ownedRun(this.prisma, owner, runId))) return [];
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run || run.finishedAt === null) return [];
    return [
      {
        runId: toRunId(run.id),
        name: "run_status",
        passed: run.status === "completed",
        details: {
          status: run.status,
          ...(run.error === null ? {} : { error: run.error }),
        },
        createdAt: timestamp(run.finishedAt),
      },
    ];
  }

  async getReport(
    owner: string,
    runId: RunId,
  ): Promise<RunReportRecord | undefined> {
    if (!(await ownedRun(this.prisma, owner, runId))) return undefined;
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    return !run || run.finishedAt === null
      ? undefined
      : {
          runId: toRunId(run.id),
          markdown: run.responseText,
          artifactId: `${run.id}:report`,
          byteSize: Buffer.byteLength(run.responseText, "utf8"),
          createdAt: timestamp(run.finishedAt),
        };
  }
}

function manifestField(manifest: unknown, field: string): string | undefined {
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest)
  )
    return undefined;
  const value = (manifest as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

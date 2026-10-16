import type {
  FileAccessPort,
  FileAccessRecord,
} from "@application/shared/ports/index.js";
import type { RunId } from "@domain/index.js";
import type { PrismaService } from "../prisma.service.js";

export class PrismaFileAccessPort implements FileAccessPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(access: FileAccessRecord): Promise<void> {
    await this.prisma.runFileAccess.create({
      data: {
        runId: access.runId,
        path: access.path,
        operation: access.operation,
        at: new Date(access.at),
      },
    });
  }

  async list(runId: RunId): Promise<readonly FileAccessRecord[]> {
    const rows = await this.prisma.runFileAccess.findMany({
      where: { runId },
      orderBy: { at: "asc" },
    });
    return rows.map((row) => ({
      runId,
      path: row.path,
      operation: row.operation as FileAccessRecord["operation"],
      at: row.at.toISOString(),
    }));
  }
}

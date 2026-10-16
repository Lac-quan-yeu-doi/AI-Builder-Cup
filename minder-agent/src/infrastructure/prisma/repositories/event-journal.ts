import type { JsonValue } from "@domain/shared";
import { runId as toRunId, type RunId } from "@domain/index.js";
import type { EventJournalPort } from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { jsonInput } from "../mappers/repositories.js";
import { serializable } from "../transactions.js";

export class PrismaEventJournal implements EventJournalPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: { runId: RunId; payload: JsonValue }) {
    return serializable(this.prisma, async (tx) => {
      const previous = await tx.runEvent.findFirst({
        where: { runId: input.runId },
        orderBy: { seq: "desc" },
      });
      const seq = (previous?.seq ?? 0) + 1;
      const row = await tx.runEvent.create({
        data: { runId: input.runId, seq, event: jsonInput(input.payload) },
      });
      return {
        runId: toRunId(row.runId),
        seq: row.seq,
        payload: structuredClone(row.event) as JsonValue,
      };
    });
  }

  async readFrom(runId: RunId, afterSeq: number, limit: number) {
    const rows = await this.prisma.runEvent.findMany({
      where: { runId, seq: { gt: afterSeq } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      runId: toRunId(row.runId),
      seq: row.seq,
      payload: structuredClone(row.event) as JsonValue,
    }));
  }

  async lastSeq(runId: RunId): Promise<number> {
    const row = await this.prisma.runEvent.findFirst({
      where: { runId },
      orderBy: { seq: "desc" },
    });
    return row?.seq ?? 0;
  }
}

import type {
  ApprovalRecord,
  ApprovalStore,
} from "@application/runtime/governance/approvals.js";
import type { PrismaService } from "../prisma.service.js";
import { approvalFromRow } from "../mappers/repositories.js";

export class PrismaApprovalStore implements ApprovalStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    owner: string,
    runId: string,
    approvalId: string,
  ): Promise<ApprovalRecord | undefined> {
    const row = await this.prisma.runApproval.findFirst({
      where: { owner, runId, id: approvalId },
    });
    return row ? approvalFromRow(row) : undefined;
  }

  async list(owner: string, runId: string): Promise<readonly ApprovalRecord[]> {
    const rows = await this.prisma.runApproval.findMany({
      where: { owner, runId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(approvalFromRow);
  }

  async save(record: ApprovalRecord): Promise<void> {
    const data = {
      status: record.status,
      decidedAt:
        record.decidedAt === undefined ? null : new Date(record.decidedAt),
    };
    if (
      (
        await this.prisma.runApproval.updateMany({
          where: { id: record.id, owner: record.owner, runId: record.runId },
          data,
        })
      ).count !== 0
    )
      return;
    try {
      await this.prisma.runApproval.create({
        data: {
          id: record.id,
          owner: record.owner,
          runId: record.runId,
          toolCallId: record.toolCallId,
          action: record.action,
          argumentsHash: record.argumentsHash,
          preview: record.preview,
          status: record.status,
          createdAt: new Date(record.createdAt),
          expiresAt: new Date(record.expiresAt),
          decidedAt:
            record.decidedAt === undefined ? null : new Date(record.decidedAt),
        },
      });
    } catch (error) {
      if (
        (
          await this.prisma.runApproval.updateMany({
            where: { id: record.id, owner: record.owner, runId: record.runId },
            data,
          })
        ).count === 0
      )
        throw error;
    }
  }
}

export function createPrismaApprovalStore(
  prisma: PrismaService,
): ApprovalStore {
  return new PrismaApprovalStore(prisma);
}

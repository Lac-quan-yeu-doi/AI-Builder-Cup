import type { PrismaService } from "../prisma.service.js";
import { jsonInput } from "../mappers/repositories.js";
import { roomQueueItemFromRow } from "../mappers/room.js";
import { serializable } from "../transactions.js";
import type {
  RoomQueueItem,
  RoomQueueState,
  RoomQueueStore,
} from "@application/shared/ports/index.js";

export class PrismaRoomQueueStore implements RoomQueueStore {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(item: RoomQueueItem): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { owner: item.owner, id: item.roomId },
      });
      if (room === null) return;
      await tx.roomQueueItem.createMany({
        data: {
          roomId: item.roomId,
          runId: item.runId,
          payload: jsonInput(item.payload),
          position: item.position,
          state: "queued",
          createdAt: new Date(item.createdAt),
        },
        skipDuplicates: true,
      });
    });
  }

  async listQueued(
    owner: string,
    roomId: string,
  ): Promise<readonly RoomQueueItem[]> {
    if (
      (await this.prisma.room.findFirst({ where: { owner, id: roomId } })) ===
      null
    )
      return [];
    const rows = await this.prisma.roomQueueItem.findMany({
      where: { roomId, state: "queued" },
      orderBy: { position: "asc" },
    });
    return rows.map((row) => roomQueueItemFromRow(owner, row));
  }

  async markStarted(
    owner: string,
    roomId: string,
    runId: string,
  ): Promise<boolean> {
    return this.updateState(owner, roomId, runId, "running", ["queued"]);
  }

  async markFinished(
    owner: string,
    roomId: string,
    runId: string,
    state: Extract<RoomQueueState, "completed" | "interrupted">,
  ): Promise<boolean> {
    return this.updateState(owner, roomId, runId, state, ["queued", "running"]);
  }

  async claimNext(
    owner: string,
    roomId: string,
  ): Promise<RoomQueueItem | undefined> {
    return serializable(this.prisma, async (tx) => {
      if ((await tx.room.findFirst({ where: { owner, id: roomId } })) === null)
        return undefined;
      const row = await tx.roomQueueItem.findFirst({
        where: { roomId, state: "queued" },
        orderBy: { position: "asc" },
      });
      if (row === null) return undefined;
      const claimed = await tx.roomQueueItem.updateMany({
        where: { roomId, runId: row.runId, state: "queued" },
        data: { state: "running" },
      });
      return claimed.count === 1
        ? roomQueueItemFromRow(owner, { ...row, state: "running" })
        : undefined;
    });
  }

  async complete(
    owner: string,
    roomId: string,
    runId: string,
    state: Extract<RoomQueueState, "completed" | "interrupted">,
  ): Promise<boolean> {
    return this.updateState(owner, roomId, runId, state, ["running"]);
  }

  private async updateState(
    owner: string,
    roomId: string,
    runId: string,
    state: RoomQueueState,
    from: readonly RoomQueueState[],
  ): Promise<boolean> {
    if (
      (await this.prisma.room.findFirst({ where: { owner, id: roomId } })) ===
      null
    )
      return false;
    const result = await this.prisma.roomQueueItem.updateMany({
      where: {
        roomId,
        runId,
        state: { in: [...from] },
      },
      data: { state },
    });
    return result.count === 1;
  }
}

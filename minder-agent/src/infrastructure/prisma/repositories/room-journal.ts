import type { JsonValue, RoomId } from "@domain/index.js";
import type {
  RoomJournalEvent,
  RoomJournalPort,
} from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { roomJournalEventFromRow } from "../mappers/room.js";
import { jsonInput } from "../mappers/repositories.js";
import { serializable } from "../transactions.js";

export class PrismaRoomJournal implements RoomJournalPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(roomId: RoomId, payload: JsonValue): Promise<RoomJournalEvent> {
    return serializable(this.prisma, async (tx) => {
      const previous = await tx.roomEvent.findFirst({
        where: { roomId: String(roomId) },
        orderBy: { seq: "desc" },
      });
      const seq = BigInt(Number(previous?.seq ?? 0) + 1);
      const row = await tx.roomEvent.create({
        data: { roomId: String(roomId), seq, event: jsonInput(payload) },
      });
      return roomJournalEventFromRow(roomId, row);
    });
  }

  async readFrom(
    roomId: RoomId,
    afterSeq: number,
    limit: number,
  ): Promise<readonly RoomJournalEvent[]> {
    const rows = await this.prisma.roomEvent.findMany({
      where: { roomId: String(roomId), seq: { gt: BigInt(afterSeq) } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => roomJournalEventFromRow(roomId, row));
  }
}

import { randomUUID } from "node:crypto";
import type {
  RoomWebhookRecord,
  RoomWebhookRepository,
} from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { roomWebhookFromRow } from "../mappers/room.js";

export class PrismaRoomWebhookRepository implements RoomWebhookRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: () => string = randomUUID,
  ) {}

  async create(
    input: Omit<RoomWebhookRecord, "id" | "createdAt">,
  ): Promise<RoomWebhookRecord> {
    const room = await this.prisma.room.findFirst({
      where: { id: input.roomId, owner: input.owner },
    });
    if (room === null) throw new Error("room_webhook_not_found");
    const row = await this.prisma.roomWebhook.create({
      data: {
        id: this.ids(),
        owner: input.owner,
        roomId: input.roomId,
        agentName: input.agent,
        source: input.source,
        secretRef: input.secretRef,
      },
    });
    return roomWebhookFromRow(row);
  }

  async get(id: string): Promise<RoomWebhookRecord | undefined> {
    const row = await this.prisma.roomWebhook.findUnique({ where: { id } });
    return row === null ? undefined : roomWebhookFromRow(row);
  }

  async list(
    owner: string,
    roomId: string,
  ): Promise<readonly RoomWebhookRecord[]> {
    const rows = await this.prisma.roomWebhook.findMany({
      where: { owner, roomId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(roomWebhookFromRow);
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.prisma.roomWebhook.deleteMany({ where: { owner, id } });
  }
}

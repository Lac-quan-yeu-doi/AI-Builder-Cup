import { randomUUID } from "node:crypto";
import type {
  CreateRoomInput,
  RoomMemberRepository,
  RoomRecord,
} from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { roomFromRow } from "../mappers/room.js";

export class PrismaRoomRepository implements RoomMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRoomInput): Promise<RoomRecord> {
    const members = [...new Set(input.members)].sort();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.room.create({
        data: {
          id: randomUUID(),
          owner: input.owner,
          name: input.name,
          key: input.key ?? null,
          maxConcurrentRuns: input.maxConcurrentRuns,
          maxQueued: input.maxQueued,
        },
      });
      if (members.length > 0) {
        await tx.roomMember.createMany({
          data: members.map((agentName) => ({ roomId: row.id, agentName })),
          skipDuplicates: true,
        });
      }
      return roomFromRow(row, members);
    });
  }

  async get(owner: string, id: string): Promise<RoomRecord | undefined> {
    const row = await this.prisma.room.findFirst({ where: { owner, id } });
    return row === null ? undefined : this.load(row);
  }

  async getByKey(owner: string, key: string): Promise<RoomRecord | undefined> {
    const row = await this.prisma.room.findFirst({ where: { owner, key } });
    return row === null ? undefined : this.load(row);
  }

  async list(
    owner: string,
    includeClosed: boolean,
  ): Promise<readonly RoomRecord[]> {
    const rows = await this.prisma.room.findMany({
      where: { owner, ...(includeClosed ? {} : { status: "open" }) },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(rows.map((row) => this.load(row)));
  }

  async close(owner: string, id: string): Promise<RoomRecord | undefined> {
    await this.prisma.room.updateMany({
      where: { owner, id, status: "open" },
      data: { status: "closed" },
    });
    return this.get(owner, id);
  }

  async addMember(
    owner: string,
    roomId: string,
    agentName: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({ where: { owner, id: roomId } });
      if (room === null) return;
      await tx.roomMember.createMany({
        data: { roomId, agentName },
        skipDuplicates: true,
      });
    });
  }

  async removeMember(
    owner: string,
    roomId: string,
    agentName: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({ where: { owner, id: roomId } });
      if (room === null) return;
      await tx.roomMember.deleteMany({ where: { roomId, agentName } });
    });
  }

  async members(owner: string, roomId: string): Promise<readonly string[]> {
    if (
      (await this.prisma.room.findFirst({ where: { owner, id: roomId } })) ===
      null
    )
      return [];
    const rows = await this.prisma.roomMember.findMany({
      where: { roomId },
      orderBy: { agentName: "asc" },
    });
    return rows.map((row) => row.agentName);
  }

  async attachRun(owner: string, roomId: string, runId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({ where: { owner, id: roomId } });
      if (room === null) return;
      await tx.roomRun.createMany({
        data: { roomId, runId },
        skipDuplicates: true,
      });
    });
  }

  async runIds(owner: string, roomId: string): Promise<readonly string[]> {
    if (
      (await this.prisma.room.findFirst({ where: { owner, id: roomId } })) ===
      null
    )
      return [];
    const rows = await this.prisma.roomRun.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => row.runId);
  }

  private async load(row: {
    id: string;
    owner: string;
    name: string;
    key: string | null;
    maxConcurrentRuns: number;
    maxQueued: number;
    status: string;
    createdAt: Date;
  }): Promise<RoomRecord> {
    const members = await this.prisma.roomMember.findMany({
      where: { roomId: row.id },
      orderBy: { agentName: "asc" },
    });
    return roomFromRow(
      row,
      members.map((member) => member.agentName),
    );
  }
}

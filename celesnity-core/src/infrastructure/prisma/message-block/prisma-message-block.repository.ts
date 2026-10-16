import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type { IMessageBlockRepository } from '@application/message-block/interfaces/i-message-block.repository';
import type { MessageBlock } from '@domain/message-block/models/message-block';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';

/** An in-flight chat turn may use its verified human MFA for at most 30 minutes. */
const ROOM_MFA_ASSURANCE_TTL_MS = 30 * 60 * 1_000;

@Injectable()
export class PrismaMessageBlockRepository implements IMessageBlockRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async bindRoom(
    roomId: string,
    agentName: string,
    principal: Pick<
      AuthenticatedContext,
      'organizationId' | 'identityId' | 'mfaVerified' | 'mfaRequired'
    >,
  ): Promise<void> {
    const { organizationId, identityId: boundById } = principal;
    const mfaVerifiedUntil =
      !principal.mfaRequired || principal.mfaVerified
        ? new Date(Date.now() + ROOM_MFA_ASSURANCE_TTL_MS)
        : null;
    // A single atomic upsert, not findUnique-then-upsert: the unique
    // constraint on roomId makes the DB the arbiter of room ownership.
    const row = await this.prisma.client.agentRoomBinding.upsert({
      where: { roomId },
      create: { roomId, organizationId, boundById, agentName, mfaVerifiedUntil },
      update: {},
      select: { organizationId: true, boundById: true, agentName: true },
    });
    if (
      row.organizationId !== organizationId ||
      row.boundById !== boundById ||
      (row.agentName !== null && row.agentName !== agentName)
    ) {
      throw new Error('The agent room is already bound to another identity or organization.');
    }
    // Renewal is conditional on both the immutable organization and owner;
    // another member of the same organization cannot renew MFA for this room.
    const renewed = await this.prisma.client.agentRoomBinding.updateMany({
      where: { roomId, organizationId, boundById, OR: [{ agentName: null }, { agentName }] },
      data: { agentName, mfaVerifiedUntil },
    });
    if (renewed.count !== 1) {
      throw new Error('The agent room binding is no longer active.');
    }
  }

  public async create(block: MessageBlock): Promise<MessageBlock> {
    const row = await this.prisma.client.messageBlock.create({
      data: {
        id: block.id,
        roomId: block.roomId,
        runId: block.runId,
        blockType: block.blockType,
        version: block.version,
        payload: block.payload as Prisma.InputJsonObject,
        fallbackText: block.fallbackText,
        publishedAt: block.publishedAt,
      },
    });
    return this.toDomain(row);
  }

  public async listByRoom(
    roomId: string,
    organizationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<readonly MessageBlock[]> {
    if (cursor !== undefined) {
      if (
        typeof cursor !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)
      ) {
        throw MessageBlockError.invalidCursor();
      }
      const anchor = await this.prisma.client.messageBlock.findFirst({
        where: { id: cursor, roomId, organizationId },
        select: { id: true },
      });
      if (!anchor) throw MessageBlockError.invalidCursor();
    }
    const rows = await this.prisma.client.messageBlock.findMany({
      where: { roomId, organizationId },
      orderBy: { publishedAt: 'asc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    roomId: string;
    runId: string | null;
    blockType: string;
    version: number;
    payload: unknown;
    fallbackText: string;
    publishedAt: Date;
  }): MessageBlock {
    return {
      id: row.id,
      roomId: row.roomId,
      runId: row.runId,
      blockType: row.blockType,
      version: row.version,
      payload: row.payload as Record<string, unknown>,
      fallbackText: row.fallbackText,
      publishedAt: row.publishedAt.toISOString(),
    };
  }
}

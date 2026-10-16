import { Injectable } from '@nestjs/common';

import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class RoomOwnershipResolver {
  public constructor(private readonly prisma: PrismaService) {}

  public async ownsRoom(roomId: string, organizationId: string): Promise<boolean> {
    const row = await this.prisma.client.agentRoomBinding.findFirst({
      where: { roomId, organizationId },
      select: { roomId: true },
    });
    return row !== null;
  }
}

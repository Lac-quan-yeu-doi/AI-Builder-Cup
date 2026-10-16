import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuditWriteInput, AuditWriter } from '@application/administration/audit-writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaAuditWriter implements AuditWriter {
  public constructor(private readonly prisma: PrismaService) {}
  public async write(input: AuditWriteInput): Promise<void> {
    await this.prisma.client.auditEvent.create({
      data: { id: randomUUID(), ...input, metadata: input.metadata },
    });
  }
}

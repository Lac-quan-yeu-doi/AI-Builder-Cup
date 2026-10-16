import { Injectable } from '@nestjs/common';

import { guardLost } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { activeScriptAtRevision } from '@infrastructure/prisma/script-authoring/script-criteria';
import {
  SCRIPT_SELECTION,
  ScriptMapper,
} from '@infrastructure/prisma/script-authoring/script.mapper';
import type { IScriptMetadataRepository } from '@application/script-authoring/interfaces/i-script-metadata-repository';
import { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import type { IScriptRepository } from '@application/script-authoring/interfaces/i-script-repository';
import type { ScriptId } from '@domain/script-authoring/value-objects/script-value-objects';

@Injectable()
export class PrismaScriptRepository implements IScriptRepository, IScriptMetadataRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ScriptMapper,
  ) {}

  public async findById(id: ScriptId): Promise<Script | undefined> {
    const record = await this.prisma.client.script.findUnique({
      where: { id: id.value },
      select: SCRIPT_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async create(script: Script): Promise<void> {
    await this.prisma.client.script.create({
      data: {
        id: script.id.value,
        createdAt: script.createdAt,
        ...this.mapper.toPersistence(script),
      },
    });
  }

  public async update(script: Script, expectedRevision: number): Promise<void> {
    const updated = await this.prisma.client.script.updateMany({
      where: activeScriptAtRevision({ scriptId: script.id.value, expectedRevision }),
      data: this.mapper.toPersistence(script),
    });
    if (guardLost(updated)) {
      throw ScriptError.metadataConflict();
    }
  }
}

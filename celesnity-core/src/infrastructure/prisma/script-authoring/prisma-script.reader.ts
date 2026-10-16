import { Injectable } from '@nestjs/common';

import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  PUBLISHED_VERSION_SELECTION,
  SCRIPT_VIEW_SELECTION,
  ScriptViewMapper,
  VERSION_WITH_BUCKET_SELECTION,
} from '@infrastructure/prisma/script-authoring/script-view.mapper';
import type {
  PublishedScriptRecord,
  IScriptReader,
  ScriptVersionView,
  ScriptView,
} from '@application/script-authoring/interfaces/i-script-reader';

/** Only non-archived, active scripts are ever visible to the read side. */
const ACTIVE_SCRIPT = { status: ScriptViewMapper.ACTIVE, archivedAt: null } as const;

/**
 * Caps for the two unpaginated listings, so neither can return the whole table.
 * Versions are capped lower because a single script accumulates them over time
 * while the script list grows only with new scripts.
 */
const MAX_SCRIPTS_LISTED = 500;
const MAX_VERSIONS_LISTED = 200;

@Injectable()
export class PrismaScriptReader implements IScriptReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ScriptViewMapper,
  ) {}

  public async listActive(): Promise<readonly ScriptView[]> {
    const records = await this.prisma.client.script.findMany({
      where: ACTIVE_SCRIPT,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      take: MAX_SCRIPTS_LISTED,
      select: SCRIPT_VIEW_SELECTION,
    });
    return records.map((record) => this.mapper.toScriptView(record));
  }

  public async findActiveById(id: string): Promise<ScriptView | undefined> {
    const record = await this.prisma.client.script.findFirst({
      where: { id, ...ACTIVE_SCRIPT },
      select: SCRIPT_VIEW_SELECTION,
    });
    return record === null ? undefined : this.mapper.toScriptView(record);
  }

  public async listPublishedVersions(scriptId: string): Promise<readonly ScriptVersionView[]> {
    const records = await this.prisma.client.scriptVersion.findMany({
      where: { scriptId, script: ACTIVE_SCRIPT },
      orderBy: { versionNumber: 'desc' },
      take: MAX_VERSIONS_LISTED,
      select: VERSION_WITH_BUCKET_SELECTION,
    });
    return records.map((record) => this.mapper.toJoinedVersionView(record));
  }

  public async findPublishedVersion(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScriptRecord | undefined> {
    const record = await this.prisma.client.scriptVersion.findUnique({
      where: { scriptId_versionNumber: { scriptId, versionNumber } },
      select: PUBLISHED_VERSION_SELECTION,
    });
    return record === null ? undefined : this.mapper.toPublishedRecord(record);
  }
}

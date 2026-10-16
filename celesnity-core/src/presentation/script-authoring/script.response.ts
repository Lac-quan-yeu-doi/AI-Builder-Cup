import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ScriptSourceView } from '@application/script-authoring/script-authoring.use-cases';
import type {
  ScriptVersionView,
  ScriptView,
} from '@application/script-authoring/interfaces/i-script-reader';

export class ScriptVersionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly scriptId!: string;

  @ApiProperty({ minimum: 1 })
  public readonly versionNumber!: number;

  @ApiProperty()
  public readonly artifactBucket!: string;

  @ApiProperty()
  public readonly objectKey!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  public readonly contentSha256!: string;

  @ApiProperty({ minimum: 1 })
  public readonly contentSize!: number;

  @ApiProperty({ format: 'date-time' })
  public readonly publishedAt!: string;

  public static from(view: ScriptVersionView): ScriptVersionResponseDto {
    return Object.assign(new ScriptVersionResponseDto(), {
      id: view.id,
      scriptId: view.scriptId,
      versionNumber: view.versionNumber,
      artifactBucket: view.artifactBucket,
      objectKey: view.objectKey,
      contentSha256: view.contentSha256,
      contentSize: view.contentSize,
      publishedAt: view.publishedAt,
    });
  }
}

export class ScriptResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiPropertyOptional()
  public readonly description?: string;

  @ApiProperty({ format: 'uuid' })
  public readonly connectionId!: string;

  @ApiProperty({ enum: ['ACTIVE'] })
  public readonly status!: 'ACTIVE';

  @ApiPropertyOptional({ type: ScriptVersionResponseDto })
  public readonly currentVersion?: ScriptVersionResponseDto;

  @ApiProperty({ format: 'date-time' })
  public readonly createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: ScriptView): ScriptResponseDto {
    return Object.assign(new ScriptResponseDto(), {
      id: view.id,
      name: view.name,
      description: view.description,
      connectionId: view.connectionId,
      status: view.status,
      currentVersion:
        view.currentVersion === undefined
          ? undefined
          : ScriptVersionResponseDto.from(view.currentVersion),
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    });
  }
}

export class ScriptSourceResponseDto extends ScriptVersionResponseDto {
  @ApiProperty()
  public readonly source!: string;

  public static override from(view: ScriptSourceView): ScriptSourceResponseDto {
    return Object.assign(new ScriptSourceResponseDto(), ScriptVersionResponseDto.from(view), {
      source: view.source,
    });
  }
}

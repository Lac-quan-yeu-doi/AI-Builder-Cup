import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  MetadataCrawlerAssignableDatabaseServiceView,
  MetadataCrawlerDetailsView,
  MetadataCrawlerListPage,
  MetadataCrawlerRunView,
} from '@application/metadata-crawler/read-models/metadata-crawler.view';

export class MetadataCrawlerDatabaseServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly connectorType!: string;
}

export class MetadataCrawlerRunResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly crawlerId!: string;

  @ApiProperty()
  public readonly triggerType!: string;

  @ApiProperty()
  public readonly status!: string;

  @ApiProperty()
  public readonly queuedAt!: string;

  @ApiProperty()
  public readonly attempt!: number;

  @ApiProperty()
  public readonly crawlerRevision!: number;

  @ApiProperty()
  public readonly connectorTypeSnapshot!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly counters!: MetadataCrawlerRunView['counters'];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  public readonly failure?: MetadataCrawlerRunView['failure'];

  public static from(view: MetadataCrawlerRunView): MetadataCrawlerRunResponseDto {
    return Object.assign(new MetadataCrawlerRunResponseDto(), view);
  }
}

export class MetadataCrawlerResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly databaseServiceId!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly state!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly schedule!: MetadataCrawlerDetailsView['schedule'];

  @ApiProperty()
  public readonly enabled!: boolean;

  @ApiProperty()
  public readonly scheduleCron!: string;

  @ApiProperty()
  public readonly scheduleTimezone!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly nextRunAt!: string;

  @ApiProperty()
  public readonly timeoutSeconds!: number;

  @ApiProperty()
  public readonly revision!: number;

  @ApiProperty({ type: MetadataCrawlerDatabaseServiceResponseDto })
  public readonly databaseService!: MetadataCrawlerDatabaseServiceResponseDto;

  @ApiPropertyOptional({ type: MetadataCrawlerRunResponseDto })
  public readonly lastRun?: MetadataCrawlerRunResponseDto;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly discoveryConfig!: MetadataCrawlerDetailsView['discoveryConfig'];

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly snapshotSummary!: MetadataCrawlerDetailsView['snapshotSummary'];

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly archivedAt?: string;

  public static from(view: MetadataCrawlerDetailsView): MetadataCrawlerResponseDto {
    return Object.assign(new MetadataCrawlerResponseDto(), {
      ...view,
      databaseService: Object.assign(
        new MetadataCrawlerDatabaseServiceResponseDto(),
        view.databaseService,
      ),
      lastRun:
        view.lastRun === undefined ? undefined : MetadataCrawlerRunResponseDto.from(view.lastRun),
    });
  }
}

export class MetadataCrawlerListResponseDto {
  @ApiProperty({ type: MetadataCrawlerResponseDto, isArray: true })
  public readonly items!: readonly MetadataCrawlerResponseDto[];

  @ApiProperty()
  public readonly total!: number;

  public static from(page: MetadataCrawlerListPage): MetadataCrawlerListResponseDto {
    return Object.assign(new MetadataCrawlerListResponseDto(), {
      items: page.items.map((item) => MetadataCrawlerResponseDto.from(item)),
      total: page.total,
    });
  }
}

export class MetadataCrawlerAssignableDatabaseServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty()
  public readonly connectorType!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly capabilities!: MetadataCrawlerAssignableDatabaseServiceView['capabilities'];

  public static from(
    view: MetadataCrawlerAssignableDatabaseServiceView,
  ): MetadataCrawlerAssignableDatabaseServiceResponseDto {
    return Object.assign(new MetadataCrawlerAssignableDatabaseServiceResponseDto(), view);
  }
}

export class MetadataCrawlerLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly runId!: string;

  @ApiProperty()
  public readonly content!: string;

  @ApiProperty()
  public readonly byteSize!: number;
}

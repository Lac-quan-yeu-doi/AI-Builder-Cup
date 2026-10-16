import { Prisma } from '@generated/prisma/client';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IMetadataCrawlerSchedule } from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';
import type { IMetadataCrawlerSchedulerStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-scheduler-store';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import { METADATA_CRAWLER_RUN_SELECTION } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import type { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { prepareCrawlerForReplacement } from '@infrastructure/prisma/metadata-crawler/metadata-crawler-run-supersession';

interface DueCrawlerRow {
  readonly id: string;
  readonly organization_id: string;
  readonly schedule_cron: string;
  readonly schedule_timezone: string;
  readonly next_run_at: Date;
  readonly revision: number;
  readonly discovery_config: unknown;
  readonly connector_type: string;
}

/** Atomically turns due schedule ticks into durable queued runs. */
export class PrismaMetadataCrawlerSchedulerStore implements IMetadataCrawlerSchedulerStore {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MetadataCrawlerMapper,
    private readonly schedule: IMetadataCrawlerSchedule,
    private readonly ids: IIdGenerator,
  ) {}

  public async scheduleDue(limit: number, now: Date): Promise<readonly MetadataCrawlerRun[]> {
    if (limit < 1) return [];

    const due = await this.prisma.client.$queryRaw<DueCrawlerRow[]>(Prisma.sql`
        SELECT c.id,
               c.organization_id,
               c.schedule_cron,
               c.schedule_timezone,
               c.next_run_at,
               c.revision,
               c.discovery_config,
               s.connector_type
        FROM "celesnity_app"."metadata_crawlers" c
        JOIN "celesnity_app"."database_metadata_crawlers" d
          ON d.crawler_id = c.id
        JOIN "celesnity_app"."database_services" s
          ON s.id = d.database_service_id
        WHERE c.enabled = TRUE
          AND c.archived_at IS NULL
          AND s.archived_at IS NULL
          AND s.verification_status = 'SUCCEEDED'
          AND c.next_run_at <= ${now}
        ORDER BY c.next_run_at, c.id
        LIMIT ${limit}
        FOR UPDATE OF c SKIP LOCKED
      `);

    const insertedRunIds: string[] = [];
    for (const crawler of due) {
      let nextRunAt: Date;
      try {
        nextRunAt = this.schedule.next(
          crawler.schedule_cron,
          crawler.schedule_timezone,
          crawler.next_run_at,
        );
      } catch {
        throw MetadataCrawlerError.invalidSchedule();
      }

      const scheduledFor = crawler.next_run_at;
      const replacementState = await prepareCrawlerForReplacement(
        this.prisma,
        this.mapper,
        crawler.id,
        now,
      );
      const runId = this.ids.next();
      const result =
        replacementState === 'RUNNING'
          ? 0
          : await this.prisma.client.$executeRaw(Prisma.sql`
          INSERT INTO "celesnity_app"."metadata_crawler_runs" (
            id, organization_id, crawler_id, trigger_type, status, deduplication_key,
            scheduled_for, queued_at, attempt, crawler_revision,
            connector_type_snapshot, safe_config_snapshot
          ) VALUES (
            ${runId}::uuid,
            ${crawler.organization_id}::uuid,
            ${crawler.id}::uuid,
            'SCHEDULED'::"celesnity_app"."MetadataCrawlerTriggerType",
            'QUEUED'::"celesnity_app"."MetadataCrawlerRunStatus",
            ${`${crawler.id}:${scheduledFor.toISOString()}`},
            ${scheduledFor},
            ${now},
            0,
            ${crawler.revision},
            ${crawler.connector_type},
            ${JSON.stringify(asJsonObject(crawler.discovery_config))}::jsonb
          )
          ON CONFLICT DO NOTHING
        `);
      if (Number(result) > 0) {
        insertedRunIds.push(runId);
      }
      await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."metadata_crawlers"
          SET next_run_at = ${nextRunAt}, updated_at = ${now}
          WHERE id = ${crawler.id}::uuid
        `);
    }

    if (insertedRunIds.length === 0) return [];

    const records = await this.prisma.client.metadataCrawlerRun.findMany({
      where: { id: { in: insertedRunIds } },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      select: METADATA_CRAWLER_RUN_SELECTION,
    });
    return records.map((record) => this.mapper.toDomainRun(record));
  }
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw MetadataCrawlerError.validation(
      'Persisted metadata crawler discovery config is invalid.',
    );
  }
  return value as Record<string, unknown>;
}

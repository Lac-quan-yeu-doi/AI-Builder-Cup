import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Prisma as PrismaTypes } from '@generated/prisma/client';
import type {
  AttachWatchSourceAssignmentsToRun,
  CaptureWatchSourceNotification,
  ClaimWatchSourceSources,
  ClaimWatchSourceDeliveryAssignments,
  CompleteWatchSourceCapture,
  EstablishWatchSourceBaseline,
  IWatchSourceRepository,
  RecordWatchSourceCaptureResult,
  WatchSourceHealthView,
  IngestCdcEventResult,
  SealCdcWindowsResult,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import type {
  CreateDataWorkflowWatchSource,
  CreateDataWorkflowWatchSourceSubscription,
  DataWorkflowWatchSource,
  DataWorkflowWatchSourceCheckpoint,
  DataWorkflowWatchSourceDeliveryAssignment,
  DataWorkflowWatchSourceNotification,
  DataWorkflowWatchSourceSubscription,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import type { SynchronizeWatchSourcePublication } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type {
  CdcMetadataEvent,
  CdcWindow,
  CdcWindowRelationSummary,
} from '@domain/data-workflow-watch-source/models/cdc-event';
import type {
  WatchSourceChangeType,
  WatchSourceRelation,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

const SOURCE_SELECTION = {
  id: true,
  organizationId: true,
  databaseServiceId: true,
  adapterKey: true,
  adapterVersion: true,
  trigger: true,
  enabled: true,
  revision: true,
  nextCaptureAt: true,
  lastCaptureAt: true,
  leaseOwner: true,
  leaseToken: true,
  leaseExpiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SUBSCRIPTION_SELECTION = {
  id: true,
  organizationId: true,
  watchSourceId: true,
  workflowId: true,
  workflowVersionId: true,
  actor: true,
  enabled: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} as const;

const CHECKPOINT_SELECTION = {
  id: true,
  organizationId: true,
  watchSourceId: true,
  schemaName: true,
  tableName: true,
  opaqueCheckpoint: true,
  revision: true,
  establishedAt: true,
  advancedAt: true,
} as const;

const ASSIGNMENT_SELECTION = {
  id: true,
  organizationId: true,
  subscriptionId: true,
  notificationId: true,
  workflowId: true,
  workflowVersionId: true,
  workflowRunId: true,
  status: true,
  revision: true,
  leaseOwner: true,
  leaseToken: true,
  leaseExpiresAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const NOTIFICATION_SELECTION = {
  id: true,
  organizationId: true,
  watchSourceId: true,
  batchId: true,
  schemaName: true,
  tableName: true,
  changeTypes: true,
  checkpointFingerprint: true,
  idempotencyKey: true,
  adapterKey: true,
  adapterVersion: true,
  capturedAt: true,
} as const;

const CDC_WINDOW_SELECTION = {
  id: true,
  organizationId: true,
  watchSourceId: true,
  openedAt: true,
  closesAt: true,
  status: true,
  eventCount: true,
  createdAt: true,
  updatedAt: true,
  relations: {
    select: {
      schemaName: true,
      tableName: true,
      changeTypes: true,
      eventCount: true,
      firstEventAt: true,
      lastEventAt: true,
    },
  },
} as const;

interface ClaimedSourceRow {
  readonly id: string;
  readonly organization_id: string;
  readonly database_service_id: string;
  readonly adapter_key: string;
  readonly adapter_version: string;
  readonly trigger: unknown;
  readonly enabled: boolean;
  readonly revision: number;
  readonly next_capture_at: Date;
  readonly last_capture_at: Date | null;
  readonly lease_owner: string | null;
  readonly lease_token: string | null;
  readonly lease_expires_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface ClaimedAssignmentRow {
  readonly id: string;
  readonly organization_id: string;
  readonly subscription_id: string;
  readonly notification_id: string;
  readonly workflow_id: string;
  readonly workflow_version_id: string;
  readonly workflow_run_id: string | null;
  readonly status: string;
  readonly revision: number;
  readonly lease_owner: string | null;
  readonly lease_token: string | null;
  readonly lease_expires_at: Date | null;
  readonly delivered_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

type SourceRow = PrismaTypes.DataWorkflowWatchSourceGetPayload<{
  select: typeof SOURCE_SELECTION;
}>;
type SubscriptionRow = PrismaTypes.DataWorkflowWatchSourceSubscriptionGetPayload<{
  select: typeof SUBSCRIPTION_SELECTION;
}>;
type CheckpointRow = PrismaTypes.DataWorkflowWatchSourceCheckpointGetPayload<{
  select: typeof CHECKPOINT_SELECTION;
}>;
type CdcWindowRow = PrismaTypes.DataWorkflowWatchSourceCdcWindowGetPayload<{
  select: typeof CDC_WINDOW_SELECTION;
}>;
type AssignmentRow = PrismaTypes.DataWorkflowWatchSourceDeliveryAssignmentGetPayload<{
  select: typeof ASSIGNMENT_SELECTION;
}>;
type NotificationRow = PrismaTypes.DataWorkflowWatchSourceNotificationGetPayload<{
  select: typeof NOTIFICATION_SELECTION;
}>;

@Injectable()
export class PrismaWatchSourceRepository implements IWatchSourceRepository {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async synchronizePublication(input: SynchronizeWatchSourcePublication): Promise<void> {
    await this.mutate(async () => {
      const previous = await this.prisma.client.dataWorkflowWatchSourceSubscription.findMany({
        where: {
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          enabled: true,
        },
        select: { watchSourceId: true },
      });
      await this.prisma.client.dataWorkflowWatchSourceSubscription.updateMany({
        where: {
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          enabled: true,
        },
        data: { enabled: false, revision: { increment: 1 }, updatedAt: input.now },
      });
      for (const source of previous) {
        const remaining = await this.prisma.client.dataWorkflowWatchSourceSubscription.count({
          where: {
            organizationId: input.organizationId,
            watchSourceId: source.watchSourceId,
            enabled: true,
          },
        });
        if (remaining === 0) {
          await this.prisma.client.dataWorkflowWatchSource.updateMany({
            where: { organizationId: input.organizationId, id: source.watchSourceId },
            data: { enabled: false, revision: { increment: 1 }, updatedAt: input.now },
          });
        }
      }
      await this.prisma.client.dataWorkflowWatchSource.create({
        data: {
          id: input.sourceId,
          organizationId: input.organizationId,
          databaseServiceId: input.databaseServiceId,
          adapterKey: input.adapterKey,
          adapterVersion: input.adapterVersion,
          trigger: input.trigger as never,
          enabled: true,
          revision: 1,
          nextCaptureAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
      await this.prisma.client.dataWorkflowWatchSourceSubscription.create({
        data: {
          id: input.subscriptionId,
          organizationId: input.organizationId,
          watchSourceId: input.sourceId,
          workflowId: input.workflowId,
          workflowVersionId: input.workflowVersionId,
          actor: input.actor,
          enabled: true,
          revision: 1,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
    });
  }

  public async listActiveCdcDatabaseServiceIds(organizationId: string): Promise<readonly string[]> {
    const rows = await this.prisma.client.dataWorkflowWatchSource.findMany({
      where: { organizationId, enabled: true },
      select: { databaseServiceId: true, trigger: true },
      orderBy: [{ databaseServiceId: 'asc' }, { id: 'asc' }],
    });
    return [
      ...new Set(
        rows
          .filter((row) => cdcTriggerOf(row.trigger) !== undefined)
          .map((row) => row.databaseServiceId),
      ),
    ];
  }

  public async listActiveCdcRelations(
    organizationId: string,
    databaseServiceId: string,
  ): Promise<readonly WatchSourceRelation[]> {
    const rows = await this.prisma.client.dataWorkflowWatchSource.findMany({
      where: { organizationId, databaseServiceId, enabled: true },
      select: { trigger: true },
      orderBy: { id: 'asc' },
    });
    const relations = new Map<string, WatchSourceRelation>();
    for (const row of rows) {
      const trigger = cdcTriggerOf(row.trigger);
      if (trigger === undefined) continue;
      for (const relation of trigger.relations) {
        const schema = relation.schema.trim();
        const table = relation.table.trim();
        if (schema === '' || table === '') continue;
        relations.set(`${schema}\u0000${table}`, { schema, table });
      }
    }
    return [...relations.values()].sort((left, right) =>
      `${left.schema}\u0000${left.table}`.localeCompare(`${right.schema}\u0000${right.table}`),
    );
  }

  public async health(
    organizationId: string,
    watchSourceId: string,
  ): Promise<WatchSourceHealthView | undefined> {
    const source = await this.prisma.client.dataWorkflowWatchSource.findFirst({
      where: { organizationId, id: watchSourceId },
      select: SOURCE_SELECTION,
    });
    if (source === null) return undefined;
    const checkpoints = await this.prisma.client.dataWorkflowWatchSourceCheckpoint.findMany({
      where: { organizationId, watchSourceId },
      orderBy: [{ schemaName: 'asc' }, { tableName: 'asc' }],
      select: CHECKPOINT_SELECTION,
    });
    const statusRows = await this.prisma.client.$queryRaw<
      readonly { status: string; count: bigint | number }[]
    >(Prisma.sql`
      SELECT a.status, COUNT(*)::bigint AS count
      FROM "celesnity_app"."data_workflow_watch_source_delivery_assignments" a
      JOIN "celesnity_app"."data_workflow_watch_source_notifications" n
        ON n.id = a.notification_id AND n.organization_id = a.organization_id
      WHERE a.organization_id=${organizationId}::uuid AND n.watch_source_id=${watchSourceId}::uuid
      GROUP BY a.status
    `);
    const latest = await this.prisma.client.dataWorkflowWatchSourceNotification.findFirst({
      where: { organizationId, watchSourceId },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true },
    });
    const delivery = { pending: 0, claimed: 0, dispatched: 0, delivered: 0, blocked: 0 };
    for (const row of statusRows) {
      const status = row.status.toLowerCase() as keyof typeof delivery;
      if (status in delivery) delivery[status] = Number(row.count);
    }
    return {
      source: toSource(source),
      checkpoints: checkpoints.map(toCheckpoint),
      delivery,
      lastCapturedAt: latest?.capturedAt,
    };
  }

  public async retryBlocked(
    organizationId: string,
    watchSourceId: string,
    now: Date,
  ): Promise<number> {
    return this.prisma.client.$executeRaw(Prisma.sql`
      UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments" a
      SET status='PENDING', workflow_run_id=NULL, lease_owner=NULL, lease_token=NULL,
          lease_expires_at=NULL, delivered_at=NULL, revision=revision+1, updated_at=${now}
      WHERE a.organization_id=${organizationId}::uuid AND a.status='BLOCKED'
        AND EXISTS (
          SELECT 1 FROM "celesnity_app"."data_workflow_watch_source_notifications" n
          WHERE n.id=a.notification_id AND n.organization_id=a.organization_id
            AND n.watch_source_id=${watchSourceId}::uuid
        )
    `);
  }

  public async createSource(
    input: CreateDataWorkflowWatchSource,
  ): Promise<DataWorkflowWatchSource> {
    return this.mutate(async () => {
      const row = await this.prisma.client.dataWorkflowWatchSource.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          databaseServiceId: input.databaseServiceId,
          adapterKey: input.adapterKey,
          adapterVersion: input.adapterVersion,
          trigger: input.trigger as never,
          enabled: input.enabled,
          revision: 1,
          nextCaptureAt: input.nextCaptureAt ?? input.now,
          createdAt: input.now,
          updatedAt: input.now,
        },
        select: SOURCE_SELECTION,
      });
      return toSource(row);
    });
  }

  public async createSubscription(
    input: CreateDataWorkflowWatchSourceSubscription,
  ): Promise<DataWorkflowWatchSourceSubscription> {
    return this.mutate(async () => {
      const row = await this.prisma.client.dataWorkflowWatchSourceSubscription.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          watchSourceId: input.watchSourceId,
          workflowId: input.workflowId,
          workflowVersionId: input.workflowVersionId,
          actor: input.actor,
          enabled: true,
          revision: 1,
          createdAt: input.now,
          updatedAt: input.now,
        },
        select: SUBSCRIPTION_SELECTION,
      });
      return toSubscription(row);
    });
  }

  public async findActiveSubscriptions(
    organizationId: string,
    watchSourceId: string,
  ): Promise<readonly DataWorkflowWatchSourceSubscription[]> {
    const rows = await this.prisma.client.dataWorkflowWatchSourceSubscription.findMany({
      where: { organizationId, watchSourceId, enabled: true },
      orderBy: { id: 'asc' },
      select: SUBSCRIPTION_SELECTION,
    });
    return rows.map(toSubscription);
  }

  public async findSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<DataWorkflowWatchSourceSubscription | undefined> {
    const row = await this.prisma.client.dataWorkflowWatchSourceSubscription.findFirst({
      where: { id: subscriptionId, organizationId },
      select: SUBSCRIPTION_SELECTION,
    });
    return row === null ? undefined : toSubscription(row);
  }

  public async findNotification(
    organizationId: string,
    notificationId: string,
  ): Promise<DataWorkflowWatchSourceNotification | undefined> {
    const row = await this.prisma.client.dataWorkflowWatchSourceNotification.findFirst({
      where: { id: notificationId, organizationId },
      select: NOTIFICATION_SELECTION,
    });
    return row === null ? undefined : toNotification(row);
  }

  public async listEnabledSources(): Promise<readonly DataWorkflowWatchSource[]> {
    const rows = await this.prisma.client.dataWorkflowWatchSource.findMany({
      where: { enabled: true },
      orderBy: { id: 'asc' },
      select: SOURCE_SELECTION,
    });
    return rows.map(toSource);
  }

  public async findCheckpoint(
    organizationId: string,
    watchSourceId: string,
    relation: { readonly schema: string; readonly table: string },
  ): Promise<DataWorkflowWatchSourceCheckpoint | undefined> {
    const row = await this.prisma.client.dataWorkflowWatchSourceCheckpoint.findUnique({
      where: {
        watchSourceId_schemaName_tableName_organizationId: {
          watchSourceId,
          schemaName: relation.schema,
          tableName: relation.table,
          organizationId,
        },
      },
      select: CHECKPOINT_SELECTION,
    });
    return row === null ? undefined : toCheckpoint(row);
  }

  public async claimDueSources(
    input: ClaimWatchSourceSources,
  ): Promise<readonly DataWorkflowWatchSource[]> {
    if (input.limit < 1 || input.leaseMs < 1 || input.owner.trim() === '') return [];
    return this.mutate(async () => {
      const rows = await this.prisma.client.$queryRaw<readonly ClaimedSourceRow[]>(Prisma.sql`
        SELECT id, organization_id, database_service_id, adapter_key, adapter_version, trigger,
               enabled, revision, next_capture_at, last_capture_at, lease_owner, lease_token,
               lease_expires_at, created_at, updated_at
        FROM "celesnity_app"."data_workflow_watch_sources"
        WHERE enabled = TRUE
          AND trigger->>'type' = 'WATCH_SOURCE'
          AND trigger->>'mode' = 'POLLING'
          AND next_capture_at <= ${input.now}
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${input.now})
        ORDER BY next_capture_at, id
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `);
      const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
      const claimed: DataWorkflowWatchSource[] = [];
      for (const candidate of rows) {
        const token = randomUUID();
        const updated = await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_watch_sources"
          SET lease_owner=${input.owner.trim()}, lease_token=${token}::uuid,
              lease_expires_at=${leaseExpiresAt}, revision=revision+1, updated_at=${input.now}
          WHERE id=${candidate.id}::uuid AND organization_id=${candidate.organization_id}::uuid
            AND revision=${candidate.revision} AND enabled=TRUE
            AND (lease_expires_at IS NULL OR lease_expires_at <= ${input.now})
        `);
        if (updated !== 1) continue;
        claimed.push(
          toSource({
            id: candidate.id,
            organizationId: candidate.organization_id,
            databaseServiceId: candidate.database_service_id,
            adapterKey: candidate.adapter_key,
            adapterVersion: candidate.adapter_version,
            trigger: candidate.trigger,
            enabled: candidate.enabled,
            revision: candidate.revision + 1,
            nextCaptureAt: candidate.next_capture_at,
            lastCaptureAt: candidate.last_capture_at ?? undefined,
            leaseOwner: input.owner.trim(),
            leaseToken: token,
            leaseExpiresAt,
            createdAt: candidate.created_at,
            updatedAt: input.now,
          } as SourceRow),
        );
      }
      return claimed;
    });
  }

  public async completeSourceCapture(input: CompleteWatchSourceCapture): Promise<boolean> {
    if (
      input.id.trim() === '' ||
      input.owner.trim() === '' ||
      input.token.trim() === '' ||
      input.nextCaptureAt.getTime() <= input.completedAt.getTime()
    ) {
      return false;
    }
    return (
      (await this.prisma.client.$executeRaw(Prisma.sql`
        UPDATE "celesnity_app"."data_workflow_watch_sources"
        SET next_capture_at=${input.nextCaptureAt}, last_capture_at=${input.completedAt},
            lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL,
            revision=revision+1, updated_at=${input.completedAt}
        WHERE id=${input.id}::uuid AND lease_owner=${input.owner}
          AND lease_token=${input.token}::uuid AND enabled=TRUE
      `)) === 1
    );
  }

  public async ingestCdcEvent(event: CdcMetadataEvent, now: Date): Promise<IngestCdcEventResult> {
    return this.mutate(async () => {
      const sources = await this.prisma.client.dataWorkflowWatchSource.findMany({
        where: {
          organizationId: event.organizationId,
          databaseServiceId: event.databaseServiceId,
          enabled: true,
        },
        select: { id: true, organizationId: true, trigger: true },
      });
      const matches = sources.filter((source) => cdcSourceMatches(source.trigger, event));
      if (matches.length === 0) {
        return { duplicate: false, matchedSources: 0, windowIds: [] };
      }

      const windowIds = new Set<string>();
      let inserted = 0;
      for (const source of matches) {
        const trigger = cdcTriggerOf(source.trigger);
        if (trigger === undefined) continue;
        const existingEvent = await this.prisma.client.dataWorkflowWatchSourceCdcEvent.findFirst({
          where: {
            organizationId: source.organizationId,
            watchSourceId: source.id,
            connectorId: event.connectorId,
            topic: event.topic,
            partition: event.partition,
            positionFingerprint: event.positionFingerprint,
          },
          select: { id: true },
        });
        if (existingEvent !== null) continue;
        const existingWindow = await this.prisma.client.dataWorkflowWatchSourceCdcWindow.findFirst({
          where: {
            organizationId: source.organizationId,
            watchSourceId: source.id,
            status: 'OPEN',
          },
          orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        const insertedWindow =
          existingWindow === null
            ? await this.prisma.client.$queryRaw<readonly { readonly id: string }[]>(Prisma.sql`
              INSERT INTO "celesnity_app"."data_workflow_watch_source_cdc_windows"
                (id, organization_id, watch_source_id, opened_at, closes_at, status, event_count, created_at, updated_at)
              VALUES (
                ${randomUUID()}::uuid,
                ${source.organizationId}::uuid,
                ${source.id}::uuid,
                ${now},
                ${new Date(now.getTime() + trigger.aggregationWindowSeconds * 1000)},
                'OPEN',
                0,
                ${now},
                ${now}
              )
              ON CONFLICT (watch_source_id, organization_id) WHERE status = 'OPEN' DO NOTHING
              RETURNING id
            `)
            : [];
        const window =
          existingWindow ??
          insertedWindow[0] ??
          (await this.prisma.client.dataWorkflowWatchSourceCdcWindow.findFirst({
            where: {
              organizationId: source.organizationId,
              watchSourceId: source.id,
              status: 'OPEN',
            },
            orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          }));
        if (window === null) throw new Error('CDC aggregation window could not be opened.');
        windowIds.add(window.id);

        const insertedEvent = await this.prisma.client.$queryRaw<
          readonly { readonly id: string }[]
        >(Prisma.sql`
          INSERT INTO "celesnity_app"."data_workflow_watch_source_cdc_events"
            (id, organization_id, window_id, watch_source_id, connector_id, topic, partition,
             position_fingerprint, schema_name, table_name, operation, committed_at, created_at)
          VALUES (
            ${randomUUID()}::uuid,
            ${source.organizationId}::uuid,
            ${window.id}::uuid,
            ${source.id}::uuid,
            ${event.connectorId},
            ${event.topic},
            ${event.partition},
            ${event.positionFingerprint},
            ${event.relation.schema},
            ${event.relation.table},
            ${event.operation},
            ${event.committedAt},
            ${now}
          )
          ON CONFLICT (watch_source_id, connector_id, topic, partition, position_fingerprint, organization_id)
            DO NOTHING
          RETURNING id
        `);
        if (insertedEvent.length === 0) continue;

        await this.prisma.client.$queryRaw<readonly { readonly id: string }[]>(Prisma.sql`
          INSERT INTO "celesnity_app"."data_workflow_watch_source_cdc_relations" AS cdc_relation
            (id, organization_id, window_id, schema_name, table_name, change_types,
             event_count, first_event_at, last_event_at)
          VALUES (
            ${randomUUID()}::uuid,
            ${source.organizationId}::uuid,
            ${window.id}::uuid,
            ${event.relation.schema},
            ${event.relation.table},
            ARRAY[${event.operation}]::text[],
            1,
            ${event.committedAt},
            ${event.committedAt}
          )
          ON CONFLICT (window_id, schema_name, table_name, organization_id)
          DO UPDATE SET
            change_types = ARRAY(
              SELECT DISTINCT value
              FROM unnest(cdc_relation.change_types || EXCLUDED.change_types) AS value
            ),
            event_count = cdc_relation.event_count + 1,
            last_event_at = GREATEST(cdc_relation.last_event_at, EXCLUDED.last_event_at)
          RETURNING id
        `);
        await this.prisma.client.dataWorkflowWatchSourceCdcWindow.update({
          where: { id: window.id },
          data: { eventCount: { increment: 1 }, updatedAt: now },
        });
        await this.prisma.client.dataWorkflowWatchSourceCdcCheckpoint.upsert({
          where: {
            connectorId_topic_partition_organizationId: {
              connectorId: event.connectorId,
              topic: event.topic,
              partition: event.partition,
              organizationId: source.organizationId,
            },
          },
          create: {
            id: randomUUID(),
            organizationId: source.organizationId,
            connectorId: event.connectorId,
            topic: event.topic,
            partition: event.partition,
            positionFingerprint: event.positionFingerprint,
            updatedAt: now,
          },
          update: { positionFingerprint: event.positionFingerprint, updatedAt: now },
        });
        inserted += 1;
      }
      return {
        duplicate: inserted === 0,
        matchedSources: matches.length,
        windowIds: [...windowIds],
      };
    });
  }

  public async sealDueCdcWindows(now: Date, limit: number): Promise<SealCdcWindowsResult> {
    if (limit < 1) return { windows: [], notificationCount: 0, assignmentCount: 0 };
    return this.mutate(async () => {
      const candidates = await this.prisma.client.dataWorkflowWatchSourceCdcWindow.findMany({
        where: { status: 'OPEN', closesAt: { lte: now } },
        orderBy: [{ closesAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: CDC_WINDOW_SELECTION,
      });
      const sealed: CdcWindow[] = [];
      let notificationCount = 0;
      let assignmentCount = 0;
      for (const candidate of candidates) {
        const claimed = await this.prisma.client.dataWorkflowWatchSourceCdcWindow.updateMany({
          where: { id: candidate.id, organizationId: candidate.organizationId, status: 'OPEN' },
          data: { status: 'READY', updatedAt: now },
        });
        if (claimed.count !== 1) continue;
        const subscriptions = await this.prisma.client.dataWorkflowWatchSourceSubscription.findMany(
          {
            where: {
              organizationId: candidate.organizationId,
              watchSourceId: candidate.watchSourceId,
              enabled: true,
            },
            select: { id: true, workflowId: true, workflowVersionId: true },
          },
        );
        const batch = await this.prisma.client.dataWorkflowWatchSourceNotificationBatch.upsert({
          where: {
            watchSourceId_captureKey_organizationId: {
              watchSourceId: candidate.watchSourceId,
              captureKey: `cdc-window:${candidate.id}`,
              organizationId: candidate.organizationId,
            },
          },
          create: {
            id: randomUUID(),
            organizationId: candidate.organizationId,
            watchSourceId: candidate.watchSourceId,
            captureKey: `cdc-window:${candidate.id}`,
            capturedAt: now,
          },
          update: {},
          select: { id: true },
        });
        for (const relation of candidate.relations) {
          const idempotencyKey = `cdc-window:${candidate.id}:${relation.schemaName}:${relation.tableName}`;
          const notification = await this.prisma.client.dataWorkflowWatchSourceNotification.upsert({
            where: {
              watchSourceId_idempotencyKey_organizationId: {
                watchSourceId: candidate.watchSourceId,
                idempotencyKey,
                organizationId: candidate.organizationId,
              },
            },
            create: {
              id: randomUUID(),
              organizationId: candidate.organizationId,
              watchSourceId: candidate.watchSourceId,
              batchId: batch.id,
              schemaName: relation.schemaName,
              tableName: relation.tableName,
              changeTypes: relation.changeTypes,
              checkpointFingerprint: cdcWindowFingerprint(candidate.id),
              idempotencyKey,
              adapterKey: 'DEBEZIUM_CDC',
              adapterVersion: '1',
              capturedAt: now,
            },
            update: {},
            select: { id: true },
          });
          notificationCount += 1;
          if (subscriptions.length > 0) {
            const result =
              await this.prisma.client.dataWorkflowWatchSourceDeliveryAssignment.createMany({
                data: subscriptions.map((subscription) => ({
                  id: randomUUID(),
                  organizationId: candidate.organizationId,
                  subscriptionId: subscription.id,
                  notificationId: notification.id,
                  workflowId: subscription.workflowId,
                  workflowVersionId: subscription.workflowVersionId,
                  status: 'PENDING',
                  revision: 1,
                  createdAt: now,
                  updatedAt: now,
                })),
                skipDuplicates: true,
              });
            assignmentCount += result.count;
          }
        }
        await this.prisma.client.dataWorkflowWatchSourceCdcWindow.update({
          where: { id: candidate.id },
          data: { status: 'DISPATCHED', updatedAt: now },
        });
        sealed.push({ ...toCdcWindow(candidate), status: 'DISPATCHED' });
      }
      return { windows: sealed, notificationCount, assignmentCount };
    });
  }

  public async releaseSourceClaim(id: string, owner: string, token: string): Promise<boolean> {
    if (id.trim() === '' || owner.trim() === '' || token.trim() === '') return false;
    return (
      (await this.prisma.client.$executeRaw(Prisma.sql`
        UPDATE "celesnity_app"."data_workflow_watch_sources"
        SET lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
        WHERE id=${id}::uuid AND lease_owner=${owner} AND lease_token=${token}::uuid
      `)) === 1
    );
  }

  public establishBaseline(
    input: EstablishWatchSourceBaseline,
  ): Promise<DataWorkflowWatchSourceCheckpoint> {
    return this.mutate(async () => {
      const existing = await this.prisma.client.dataWorkflowWatchSourceCheckpoint.findUnique({
        where: {
          watchSourceId_schemaName_tableName_organizationId: {
            watchSourceId: input.watchSourceId,
            schemaName: input.relation.schema,
            tableName: input.relation.table,
            organizationId: input.organizationId,
          },
        },
        select: CHECKPOINT_SELECTION,
      });
      if (existing !== null) return toCheckpoint(existing);
      const row = await this.prisma.client.dataWorkflowWatchSourceCheckpoint.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          watchSourceId: input.watchSourceId,
          schemaName: input.relation.schema,
          tableName: input.relation.table,
          opaqueCheckpoint: input.checkpoint,
          revision: 1,
          establishedAt: input.establishedAt,
          advancedAt: input.establishedAt,
        },
        select: CHECKPOINT_SELECTION,
      });
      return toCheckpoint(row);
    });
  }

  public async recordCapture(
    input: CaptureWatchSourceNotification,
  ): Promise<RecordWatchSourceCaptureResult> {
    try {
      return await this.mutate(async () => {
        const duplicate = await this.prisma.client.dataWorkflowWatchSourceNotification.findUnique({
          where: {
            watchSourceId_idempotencyKey_organizationId: {
              watchSourceId: input.watchSourceId,
              idempotencyKey: input.notification.idempotencyKey,
              organizationId: input.organizationId,
            },
          },
          select: { id: true },
        });
        if (duplicate !== null) {
          return {
            duplicate: true,
            assignments: await this.assignmentsForNotification(input.organizationId, duplicate.id),
          };
        }

        const batch = await this.prisma.client.dataWorkflowWatchSourceNotificationBatch.upsert({
          where: {
            watchSourceId_captureKey_organizationId: {
              watchSourceId: input.watchSourceId,
              captureKey: input.batch.captureKey,
              organizationId: input.organizationId,
            },
          },
          create: {
            id: input.batch.id,
            organizationId: input.organizationId,
            watchSourceId: input.watchSourceId,
            captureKey: input.batch.captureKey,
            capturedAt: input.batch.capturedAt,
          },
          update: {},
          select: { id: true },
        });

        await this.prisma.client.dataWorkflowWatchSourceNotification.create({
          data: {
            id: input.notification.id,
            organizationId: input.organizationId,
            watchSourceId: input.watchSourceId,
            batchId: batch.id,
            schemaName: input.notification.relation.schema,
            tableName: input.notification.relation.table,
            changeTypes: [...input.notification.changeTypes],
            checkpointFingerprint: input.notification.checkpointFingerprint,
            idempotencyKey: input.notification.idempotencyKey,
            adapterKey: input.notification.adapterKey,
            adapterVersion: input.notification.adapterVersion,
            capturedAt: input.notification.capturedAt,
          },
        });

        // Notification insert precedes cursor advancement in this transaction.
        // A stale checkpoint rolls the whole transaction back, including the notification.
        const checkpoint = await this.prisma.client.dataWorkflowWatchSourceCheckpoint.updateMany({
          where: {
            organizationId: input.organizationId,
            watchSourceId: input.watchSourceId,
            schemaName: input.notification.relation.schema,
            tableName: input.notification.relation.table,
            opaqueCheckpoint: input.checkpoint.from,
            revision: input.checkpoint.expectedRevision,
          },
          data: {
            opaqueCheckpoint: input.checkpoint.through,
            revision: { increment: 1 },
            advancedAt: input.checkpoint.advancedAt,
          },
        });
        if (checkpoint.count !== 1)
          throw new Error('Watch Source checkpoint was changed concurrently.');

        if (input.assignments.length > 0) {
          await this.prisma.client.dataWorkflowWatchSourceDeliveryAssignment.createMany({
            data: input.assignments.map((assignment) => ({
              id: assignment.id,
              organizationId: input.organizationId,
              subscriptionId: assignment.subscriptionId,
              notificationId: input.notification.id,
              workflowId: assignment.workflowId,
              workflowVersionId: assignment.workflowVersionId,
              status: 'PENDING',
              revision: 1,
              createdAt: assignment.now,
              updatedAt: assignment.now,
            })),
            skipDuplicates: true,
          });
        }
        return {
          duplicate: false,
          assignments: await this.assignmentsForNotification(
            input.organizationId,
            input.notification.id,
          ),
        };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const notification = await this.prisma.client.dataWorkflowWatchSourceNotification.findUnique({
        where: {
          watchSourceId_idempotencyKey_organizationId: {
            watchSourceId: input.watchSourceId,
            idempotencyKey: input.notification.idempotencyKey,
            organizationId: input.organizationId,
          },
        },
        select: { id: true },
      });
      if (notification === null) throw error;
      return {
        duplicate: true,
        assignments: await this.assignmentsForNotification(input.organizationId, notification.id),
      };
    }
  }

  public async claimDueAssignments(
    input: ClaimWatchSourceDeliveryAssignments,
  ): Promise<readonly DataWorkflowWatchSourceDeliveryAssignment[]> {
    if (input.limit < 1 || input.leaseMs < 1 || input.owner.trim() === '') return [];
    return this.mutate(async () => {
      const ids = await this.prisma.client.$queryRaw<readonly ClaimedAssignmentRow[]>(Prisma.sql`
        SELECT id, organization_id, subscription_id, notification_id, workflow_id, workflow_version_id,
               workflow_run_id, status, revision, lease_owner, lease_token, lease_expires_at,
               delivered_at, created_at, updated_at
        FROM "celesnity_app"."data_workflow_watch_source_delivery_assignments"
        WHERE status = 'PENDING'
           OR (status = 'CLAIMED' AND lease_expires_at <= ${input.now})
        ORDER BY created_at, id
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `);
      const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
      const claimed: DataWorkflowWatchSourceDeliveryAssignment[] = [];
      for (const candidate of ids) {
        const token = randomUUID();
        const updated = await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
          SET status='CLAIMED', revision=revision+1, lease_owner=${input.owner.trim()},
              lease_token=${token}::uuid, lease_expires_at=${leaseExpiresAt}, updated_at=${input.now}
          WHERE id=${candidate.id}::uuid AND organization_id=${candidate.organization_id}::uuid
            AND revision=${candidate.revision}
            AND (status='PENDING' OR (status='CLAIMED' AND lease_expires_at <= ${input.now}))
        `);
        if (updated !== 1) continue;
        claimed.push(
          toAssignment({
            id: candidate.id,
            organizationId: candidate.organization_id,
            subscriptionId: candidate.subscription_id,
            notificationId: candidate.notification_id,
            workflowId: candidate.workflow_id,
            workflowVersionId: candidate.workflow_version_id,
            workflowRunId: candidate.workflow_run_id,
            status: 'CLAIMED',
            revision: candidate.revision + 1,
            leaseOwner: input.owner.trim(),
            leaseToken: token,
            leaseExpiresAt,
            deliveredAt: candidate.delivered_at,
            createdAt: candidate.created_at,
            updatedAt: input.now,
          }),
        );
      }
      return claimed;
    });
  }

  public async releaseClaim(id: string, owner: string, token: string): Promise<boolean> {
    if (id.trim() === '' || owner.trim() === '' || token.trim() === '') return false;
    return (
      (await this.prisma.client.$executeRaw(Prisma.sql`
        UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
        SET status='PENDING', revision=revision+1, lease_owner=NULL,
            lease_token=NULL, lease_expires_at=NULL
        WHERE id=${id}::uuid AND status='CLAIMED' AND lease_owner=${owner}
          AND lease_token=${token}::uuid
      `)) === 1
    );
  }

  public async attachAssignmentsToRun(input: AttachWatchSourceAssignmentsToRun): Promise<boolean> {
    if (input.assignments.length === 0) return true;
    return this.mutate(async () => {
      for (const assignment of input.assignments) {
        const changed = await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
          SET status='DISPATCHED', workflow_run_id=${input.workflowRunId}::uuid,
              revision=revision+1, lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL,
              updated_at=${input.now}
          WHERE id=${assignment.id}::uuid AND status='CLAIMED'
            AND lease_owner=${input.owner} AND lease_token=${assignment.token}::uuid
        `);
        if (changed !== 1) return false;
      }
      return true;
    });
  }

  public async listDispatchedAssignments(
    limit: number,
  ): Promise<readonly DataWorkflowWatchSourceDeliveryAssignment[]> {
    if (limit < 1) return [];
    const rows = await this.prisma.client.$queryRaw<readonly ClaimedAssignmentRow[]>(Prisma.sql`
      SELECT id, organization_id, subscription_id, notification_id, workflow_id, workflow_version_id,
             workflow_run_id, status, revision, lease_owner, lease_token, lease_expires_at,
             delivered_at, created_at, updated_at
      FROM "celesnity_app"."data_workflow_watch_source_delivery_assignments"
      WHERE status='DISPATCHED' AND workflow_run_id IS NOT NULL
      ORDER BY created_at, id
      LIMIT ${limit}
    `);
    return rows.map((row) =>
      toAssignment({
        id: row.id,
        organizationId: row.organization_id,
        subscriptionId: row.subscription_id,
        notificationId: row.notification_id,
        workflowId: row.workflow_id,
        workflowVersionId: row.workflow_version_id,
        workflowRunId: row.workflow_run_id,
        status: row.status,
        revision: row.revision,
        leaseOwner: row.lease_owner,
        leaseToken: row.lease_token,
        leaseExpiresAt: row.lease_expires_at,
        deliveredAt: row.delivered_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  }

  public async completeDeliveryForRun(
    id: string,
    workflowRunId: string,
    deliveredAt: Date,
  ): Promise<boolean> {
    return (
      (await this.prisma.client.$executeRaw(Prisma.sql`
        UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
        SET status='DELIVERED', revision=revision+1, delivered_at=${deliveredAt}, updated_at=${deliveredAt}
        WHERE id=${id}::uuid AND workflow_run_id=${workflowRunId}::uuid AND status='DISPATCHED'
      `)) === 1
    );
  }

  public async blockDeliveryForRun(
    id: string,
    workflowRunId: string,
    blockedAt: Date,
  ): Promise<boolean> {
    return (
      (await this.prisma.client.$executeRaw(Prisma.sql`
        UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
        SET status='BLOCKED', revision=revision+1, updated_at=${blockedAt}
        WHERE id=${id}::uuid AND workflow_run_id=${workflowRunId}::uuid AND status='DISPATCHED'
      `)) === 1
    );
  }

  public async completeDelivery(
    id: string,
    succeeded: boolean,
    deliveredAt: Date,
    lease?: { readonly owner: string; readonly token: string },
  ): Promise<boolean> {
    if (!succeeded) return false;
    const result = lease
      ? await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
          SET status='DELIVERED', revision=revision+1, lease_owner=NULL, lease_token=NULL,
              lease_expires_at=NULL, delivered_at=${deliveredAt}, updated_at=${deliveredAt}
          WHERE id=${id}::uuid AND status='CLAIMED' AND lease_owner=${lease.owner}
            AND lease_token=${lease.token}::uuid
        `)
      : await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_watch_source_delivery_assignments"
          SET status='DELIVERED', revision=revision+1, lease_owner=NULL, lease_token=NULL,
              lease_expires_at=NULL, delivered_at=${deliveredAt}, updated_at=${deliveredAt}
          WHERE id=${id}::uuid AND status='PENDING'
        `);
    return result === 1;
  }

  private assignmentsForNotification(
    organizationId: string,
    notificationId: string,
  ): Promise<readonly DataWorkflowWatchSourceDeliveryAssignment[]> {
    return this.prisma.client.dataWorkflowWatchSourceDeliveryAssignment
      .findMany({
        where: { organizationId, notificationId },
        orderBy: { id: 'asc' },
        select: ASSIGNMENT_SELECTION,
      })
      .then((rows) => rows.map(toAssignment));
  }

  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.commit(() => work());
  }
}

function toSource(row: SourceRow): DataWorkflowWatchSource {
  return {
    ...row,
    trigger: row.trigger as unknown as DataWorkflowWatchSource['trigger'],
    lastCaptureAt: row.lastCaptureAt ?? undefined,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
  };
}

function cdcTriggerOf(
  value: unknown,
): Extract<WorkflowWatchSourceTrigger, { mode: 'CDC' }> | undefined {
  if (!isRecord(value) || value.type !== 'WATCH_SOURCE' || value.mode !== 'CDC') return undefined;
  if (typeof value.databaseServiceId !== 'string' || !Array.isArray(value.relations))
    return undefined;
  if (typeof value.aggregationWindowSeconds !== 'number') return undefined;
  return value as unknown as Extract<WorkflowWatchSourceTrigger, { mode: 'CDC' }>;
}

function cdcSourceMatches(value: unknown, event: CdcMetadataEvent): boolean {
  const trigger = cdcTriggerOf(value);
  if (trigger === undefined || trigger.databaseServiceId !== event.databaseServiceId) return false;
  if (!trigger.changeTypes.includes(event.operation)) return false;
  return trigger.relations.some(
    (relation) =>
      relation.schema === event.relation.schema && relation.table === event.relation.table,
  );
}

function toCdcWindow(row: CdcWindowRow): CdcWindow {
  const status = row.status;
  if (status !== 'OPEN' && status !== 'READY' && status !== 'DISPATCHED') {
    throw new Error('Persisted CDC window has an invalid status.');
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    watchSourceId: row.watchSourceId,
    openedAt: row.openedAt,
    closesAt: row.closesAt,
    status,
    eventCount: row.eventCount,
    relations: [...row.relations]
      .sort((left, right) =>
        `${left.schemaName}.${left.tableName}`.localeCompare(
          `${right.schemaName}.${right.tableName}`,
        ),
      )
      .map((relation): CdcWindowRelationSummary => ({
        relation: { schema: relation.schemaName, table: relation.tableName },
        changeTypes: relation.changeTypes as WatchSourceChangeType[],
        eventCount: relation.eventCount,
        firstEventAt: relation.firstEventAt,
        lastEventAt: relation.lastEventAt,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function cdcWindowFingerprint(windowId: string): string {
  return `sha256:${createHash('sha256').update(windowId).digest('hex')}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSubscription(row: SubscriptionRow): DataWorkflowWatchSourceSubscription {
  return {
    id: row.id,
    organizationId: row.organizationId,
    watchSourceId: row.watchSourceId,
    workflowId: row.workflowId,
    workflowVersionId: row.workflowVersionId,
    actor: row.actor,
    enabled: row.enabled,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toNotification(row: NotificationRow): DataWorkflowWatchSourceNotification {
  return {
    id: row.id,
    organizationId: row.organizationId,
    watchSourceId: row.watchSourceId,
    batchId: row.batchId,
    relation: { schema: row.schemaName, table: row.tableName },
    changeTypes: row.changeTypes as DataWorkflowWatchSourceNotification['changeTypes'],
    checkpointFingerprint: row.checkpointFingerprint,
    idempotencyKey: row.idempotencyKey,
    adapterKey: row.adapterKey,
    adapterVersion: row.adapterVersion,
    capturedAt: row.capturedAt,
  };
}

function toCheckpoint(row: CheckpointRow): DataWorkflowWatchSourceCheckpoint {
  return {
    id: row.id,
    organizationId: row.organizationId,
    watchSourceId: row.watchSourceId,
    relation: { schema: row.schemaName, table: row.tableName },
    opaqueCheckpoint: row.opaqueCheckpoint,
    revision: row.revision,
    establishedAt: row.establishedAt,
    advancedAt: row.advancedAt,
  };
}

function toAssignment(row: AssignmentRow): DataWorkflowWatchSourceDeliveryAssignment {
  const status = row.status;
  if (
    status !== 'PENDING' &&
    status !== 'CLAIMED' &&
    status !== 'DISPATCHED' &&
    status !== 'DELIVERED' &&
    status !== 'BLOCKED'
  ) {
    throw new Error('Persisted Watch Source delivery assignment has an invalid status.');
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    notificationId: row.notificationId,
    workflowId: row.workflowId,
    workflowVersionId: row.workflowVersionId,
    workflowRunId: row.workflowRunId ?? undefined,
    status,
    revision: row.revision,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

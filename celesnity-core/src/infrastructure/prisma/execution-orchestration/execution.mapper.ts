import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Prisma } from '@generated/prisma/client';
import type { ExecutionModel, ExecutionSelect } from '@generated/prisma/models/Execution';
import {
  toDomainExecutionStatus,
  toPrismaExecutionStatus,
} from '@infrastructure/prisma/execution-orchestration/execution-status.boundary';

/**
 * The columns an execution query reads.
 *
 * Stated explicitly, like every other selection in this layer, rather than left
 * implicit. An implicit select is a promise to fetch whatever the schema happens
 * to contain, so adding a wide column later silently widens every existing read.
 * Naming the columns means that change has to be made on purpose.
 */
export const EXECUTION_SELECTION = {
  id: true,
  organizationId: true,
  workloadKind: true,
  workloadVersionNumber: true,
  scriptId: true,
  scriptVersionId: true,
  pipelineId: true,
  pipelineVersionId: true,
  databaseServiceId: true,
  authorizationIdentityId: true,
  status: true,
  sparkApplicationId: true,
  resourceProfile: true,
  exitCode: true,
  errorSummary: true,
  outputConditionPlan: true,
  outputFacts: true,
  outputFactsError: true,
  logObjectKey: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  cancelledAt: true,
  updatedAt: true,
} as const satisfies ExecutionSelect;
import type {
  ExecutionResourceProfileView,
  ExecutionView,
} from '@application/execution-orchestration/read-models/execution.view';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import {
  validateExecutionOutputConditionPlan,
  validateExecutionOutputFacts,
  type ExecutionOutputConditionPlan,
  type ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';
import {
  ExecutionFailure,
  ExecutionId,
  LogLocation,
  ResourceProfile,
  SparkApplicationId,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

/**
 * The column values an {@link Execution} writes.
 *
 * Derived from the generated model so the column set follows `schema.prisma`.
 * The identity columns are dropped because they are only ever supplied on
 * insert, and `resourceProfile` is retyped because Prisma models a JSON column
 * as `JsonValue` when read but requires `InputJsonValue` when written.
 */
export type ExecutionPersistenceValues = Omit<
  ExecutionModel,
  | 'id'
  | 'organizationId'
  | 'workloadKind'
  | 'workloadVersionNumber'
  | 'scriptId'
  | 'scriptVersionId'
  | 'pipelineId'
  | 'pipelineVersionId'
  | 'databaseServiceId'
  | 'authorizationIdentityId'
  | 'queuedAt'
  | 'resourceProfile'
  | 'outputConditionPlan'
  | 'outputFacts'
> & {
  readonly resourceProfile: Prisma.InputJsonValue;
  readonly outputConditionPlan: Prisma.InputJsonValue | typeof Prisma.DbNull;
  readonly outputFacts: Prisma.InputJsonValue | typeof Prisma.DbNull;
};

/** The untyped JSON shape the `resourceProfile` column stores. */
interface ResourceProfileRecord {
  readonly driverMemory: unknown;
  readonly executorMemory: unknown;
  readonly executorCores: unknown;
  readonly maxCores: unknown;
}

/**
 * Translates between the {@link Execution} aggregate and its execution row.
 *
 * The repository is left with query orchestration alone: transaction scope,
 * the optimistic-concurrency guard on update, and Prisma calls. Every decision
 * about how a domain concept becomes columns and back lives here.
 *
 * Two asymmetries are deliberate. The bucket half of {@link LogLocation} is
 * configuration rather than data, so it is supplied here instead of being
 * persisted per row. And `resourceProfile` is a JSON column, so it is decoded
 * defensively: Postgres will hand back whatever was written, including from an
 * older deployment.
 */
@Injectable()
export class ExecutionMapper {
  private readonly artifactsBucket: string;

  public constructor(config: ConfigService) {
    this.artifactsBucket = config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET');
  }

  /** Rebuilds the aggregate from a persisted row. */
  public toDomain(record: ExecutionModel): Execution {
    const id = ExecutionId.from(record.id);
    // Rows written before the key was stored explicitly fall back to the
    // deterministic key the domain derives from the execution id.
    const objectKey = record.logObjectKey ?? LogLocation.keyFor(id);
    return Execution.rehydrate({
      id,
      workload: this.toWorkload(record),
      connectionId: record.databaseServiceId ?? undefined,
      authorizationIdentityId: record.authorizationIdentityId ?? undefined,
      status: toDomainExecutionStatus(record.status),
      resourceProfile: this.toResourceProfile(record.resourceProfile),
      logLocation: LogLocation.create(this.artifactsBucket, objectKey),
      sparkApplicationId:
        record.sparkApplicationId === null
          ? undefined
          : SparkApplicationId.create(record.sparkApplicationId),
      exitCode: record.exitCode ?? undefined,
      failure:
        record.errorSummary === null
          ? undefined
          : ExecutionFailure.create(record.errorSummary, record.exitCode ?? undefined),
      outputConditionPlan:
        record.outputConditionPlan === null
          ? undefined
          : decodeOutputConditionPlan(record.outputConditionPlan),
      outputFacts:
        record.outputFacts === null
          ? undefined
          : decodeOutputFacts(record.outputFacts, record.outputConditionPlan, record.id),
      outputFactsError: record.outputFactsError ?? undefined,
      queuedAt: record.queuedAt,
      startedAt: record.startedAt ?? undefined,
      finishedAt: record.finishedAt ?? undefined,
      cancelledAt: record.cancelledAt ?? undefined,
      updatedAt: record.updatedAt,
    });
  }

  /** Projects the aggregate onto the mutable columns of its row. */
  public toPersistence(execution: Execution): ExecutionPersistenceValues {
    return {
      status: toPrismaExecutionStatus(execution.status),
      sparkApplicationId: execution.sparkApplicationId?.value ?? null,
      resourceProfile: execution.resourceProfile.toRecord() as unknown as Prisma.InputJsonValue,
      exitCode: execution.exitCode ?? null,
      errorSummary: execution.failure?.summary ?? null,
      outputConditionPlan:
        execution.outputConditionPlan === undefined
          ? Prisma.DbNull
          : (execution.outputConditionPlan as unknown as Prisma.InputJsonValue),
      outputFacts:
        execution.outputFacts === undefined
          ? Prisma.DbNull
          : (execution.outputFacts as unknown as Prisma.InputJsonValue),
      outputFactsError: execution.outputFactsError ?? null,
      logObjectKey: execution.logLocation.objectKey,
      startedAt: execution.startedAt ?? null,
      finishedAt: execution.finishedAt ?? null,
      cancelledAt: execution.cancelledAt ?? null,
      updatedAt: execution.updatedAt,
    };
  }

  /** Projects a row onto the read model. */
  public toView(record: ExecutionModel): ExecutionView {
    return {
      id: record.id,
      executionPrincipal: record.authorizationIdentityId == null ? 'BACKGROUND' : 'REQUESTER',
      workloadKind: record.workloadKind === 'PIPELINE' ? 'PIPELINE' : 'SCRIPT',
      versionNumber: record.workloadVersionNumber,
      scriptId: record.scriptId ?? undefined,
      scriptVersionId: record.scriptVersionId ?? undefined,
      pipelineId: record.pipelineId ?? undefined,
      pipelineVersionId: record.pipelineVersionId ?? undefined,
      connectionId: record.databaseServiceId ?? undefined,
      status: toDomainExecutionStatus(record.status),
      sparkApplicationId: record.sparkApplicationId ?? undefined,
      resourceProfile: this.toResourceProfileView(record.resourceProfile),
      exitCode: record.exitCode ?? undefined,
      errorSummary: record.errorSummary ?? undefined,
      outputConditionPlan:
        record.outputConditionPlan === null
          ? undefined
          : decodeOutputConditionPlan(record.outputConditionPlan),
      outputFacts:
        record.outputFacts === null
          ? undefined
          : decodeOutputFacts(record.outputFacts, record.outputConditionPlan, record.id),
      outputFactsError: record.outputFactsError ?? undefined,
      logBucket: this.artifactsBucket,
      logObjectKey: record.logObjectKey ?? undefined,
      queuedAt: record.queuedAt.toISOString(),
      startedAt: record.startedAt?.toISOString(),
      finishedAt: record.finishedAt?.toISOString(),
      cancelledAt: record.cancelledAt?.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toWorkload(record: ExecutionModel): Execution['workload'] {
    if (
      record.workloadKind === 'PIPELINE' &&
      record.pipelineId !== null &&
      record.pipelineVersionId !== null
    ) {
      return {
        kind: 'PIPELINE',
        pipelineId: record.pipelineId,
        pipelineVersionId: record.pipelineVersionId,
        versionNumber: record.workloadVersionNumber,
      };
    }
    if (record.scriptId !== null && record.scriptVersionId !== null) {
      return {
        kind: 'SCRIPT',
        scriptId: record.scriptId,
        scriptVersionId: record.scriptVersionId,
        versionNumber: record.workloadVersionNumber,
      };
    }
    throw new Error('Persisted execution has an invalid workload shape.');
  }

  /**
   * The read-model counterpart of {@link ExecutionMapper.toResourceProfile}.
   * The view tolerates a missing profile, so this returns `undefined` where the
   * aggregate path would raise: a listing must not fail over one bad row.
   */
  private toResourceProfileView(value: unknown): ExecutionResourceProfileView | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    const record = value as ResourceProfileRecord;
    return {
      driverMemory: asText(record.driverMemory),
      executorMemory: asText(record.executorMemory),
      executorCores: asInteger(record.executorCores),
      maxCores: asInteger(record.maxCores),
    };
  }

  private toResourceProfile(value: unknown): ResourceProfile {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Persisted execution is missing its resource profile.');
    }
    const record = value as ResourceProfileRecord;
    return ResourceProfile.create({
      driverMemory: typeof record.driverMemory === 'string' ? record.driverMemory : '',
      executorMemory: typeof record.executorMemory === 'string' ? record.executorMemory : '',
      executorCores: typeof record.executorCores === 'number' ? record.executorCores : 0,
      maxCores: typeof record.maxCores === 'number' ? record.maxCores : 0,
    });
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function decodeOutputConditionPlan(value: unknown): ExecutionOutputConditionPlan {
  return validateExecutionOutputConditionPlan(value);
}

function decodeOutputFacts(
  value: unknown,
  planValue: unknown,
  executionId: string,
): ExecutionOutputFacts {
  if (planValue === null) {
    throw new Error('Persisted execution output facts have no matching condition plan.');
  }
  return validateExecutionOutputFacts(decodeOutputConditionPlan(planValue), executionId, value);
}

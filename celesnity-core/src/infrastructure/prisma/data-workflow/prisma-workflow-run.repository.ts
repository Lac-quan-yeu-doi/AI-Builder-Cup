import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';

import type {
  CreateWorkflowRun,
  IWorkflowRunRepository,
  SaveWorkflowRunTransition,
  WorkflowRunLeaseFence,
  WorkflowRunSnapshot,
} from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import type { DataWorkflowRun } from '@domain/data-workflow/models/workflow-persistence';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  DATA_WORKFLOW_RUN_SELECTION,
  DATA_WORKFLOW_EDGE_STATE_SELECTION,
  DATA_WORKFLOW_NODE_ATTEMPT_SELECTION,
  DATA_WORKFLOW_VERSION_SELECTION,
  WorkflowMapper,
} from '@infrastructure/prisma/data-workflow/workflow.mapper';

interface ClaimedRunId {
  readonly id: string;
}

@Injectable()
export class PrismaWorkflowRunRepository implements IWorkflowRunRepository {
  private readonly mapper = new WorkflowMapper();

  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async createRun(input: CreateWorkflowRun): Promise<DataWorkflowRun | false> {
    try {
      return await this.createRunInUnitOfWork(input);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private createRunInUnitOfWork(input: CreateWorkflowRun): Promise<DataWorkflowRun> {
    return this.mutate(async () => {
      const row = await this.prisma.client.dataWorkflowRun.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          versionId: input.versionId,
          actor: input.actor,
          delegation:
            input.delegation === undefined ? undefined : this.mapper.json(input.delegation),
          parameters: this.mapper.json(input.parameters),
          triggerContext: this.mapper.json(input.triggerContext),
          status: 'QUEUED',
          revision: 1,
          nextReconciliationAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        },
        select: DATA_WORKFLOW_RUN_SELECTION,
      });
      return this.mapper.toRun(row);
    });
  }

  public async find(id: string): Promise<DataWorkflowRun | undefined> {
    const row = await this.prisma.client.dataWorkflowRun.findUnique({
      where: { id },
      select: DATA_WORKFLOW_RUN_SELECTION,
    });
    return row === null ? undefined : this.mapper.toRun(row);
  }

  public async listByWorkflow(
    workflowId: string,
    limit: number,
  ): Promise<readonly DataWorkflowRun[]> {
    const rows = await this.prisma.client.dataWorkflowRun.findMany({
      where: { workflowId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: DATA_WORKFLOW_RUN_SELECTION,
    });
    return rows.map((row) => this.mapper.toRun(row));
  }

  public async findActive(workflowId: string): Promise<DataWorkflowRun | undefined> {
    const row = await this.prisma.client.dataWorkflowRun.findFirst({
      where: { workflowId, status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: DATA_WORKFLOW_RUN_SELECTION,
    });
    return row === null ? undefined : this.mapper.toRun(row);
  }

  public findSnapshot(id: string): Promise<WorkflowRunSnapshot | undefined> {
    return this.loadSnapshot(id);
  }

  public lockRun(id: string): Promise<DataWorkflowRun | undefined> {
    return this.mutate(async () => {
      const scoped = await this.prisma.client.dataWorkflowRun.findFirst({
        where: { id },
        select: { id: true },
      });
      if (scoped === null) return undefined;
      await this.prisma.client.$queryRaw(Prisma.sql`
        SELECT id
        FROM "celesnity_app"."data_workflow_runs"
        WHERE id = ${scoped.id}::uuid
        FOR UPDATE
      `);
      const row = await this.prisma.client.dataWorkflowRun.findUnique({
        where: { id },
        select: DATA_WORKFLOW_RUN_SELECTION,
      });
      return row === null ? undefined : this.mapper.toRun(row);
    });
  }

  public lockSnapshot(id: string): Promise<WorkflowRunSnapshot | undefined> {
    return this.mutate(async () => {
      const scoped = await this.prisma.client.dataWorkflowRun.findFirst({
        where: { id },
        select: { id: true },
      });
      if (scoped === null) return undefined;
      await this.prisma.client.$queryRaw(Prisma.sql`
        SELECT id
        FROM "celesnity_app"."data_workflow_runs"
        WHERE id = ${scoped.id}::uuid
        FOR UPDATE
      `);
      const snapshot = await this.loadSnapshot(id);
      return snapshot;
    });
  }

  public saveTransition(
    run: DataWorkflowRun,
    expectedRevision: number,
    transition: SaveWorkflowRunTransition,
    leaseFence?: WorkflowRunLeaseFence,
  ): Promise<boolean> {
    assertTransitionChildrenBelongToRun(run, transition);
    return this.mutate(async () => {
      if (leaseFence !== undefined) {
        const fence = await this.prisma.client.$queryRaw<readonly ClaimedRunId[]>(Prisma.sql`
          SELECT id
          FROM "celesnity_app"."data_workflow_runs"
          WHERE id = ${run.id}::uuid
            AND organization_id = ${run.organizationId}::uuid
            AND revision = ${expectedRevision}
            AND status = 'RUNNING'
            AND lease_owner = ${leaseFence.owner}
            AND lease_token = ${leaseFence.token}::uuid
            AND lease_expires_at > clock_timestamp()
          FOR UPDATE
        `);
        if (fence.length !== 1) return false;
      }
      const updated = await this.prisma.client.dataWorkflowRun.updateMany({
        where: {
          id: run.id,
          organizationId: run.organizationId,
          revision: expectedRevision,
          ...(leaseFence === undefined
            ? {}
            : {
                status: 'RUNNING',
                leaseOwner: leaseFence.owner,
                leaseToken: leaseFence.token,
              }),
        },
        data: {
          status: transition.status,
          revision: expectedRevision + 1,
          leaseOwner: transition.leaseOwner ?? null,
          leaseToken: transition.leaseToken ?? null,
          leaseExpiresAt: transition.leaseExpiresAt ?? null,
          updatedAt: transition.updatedAt,
          ...(transition.nextReconciliationAt === undefined
            ? transition.status === 'QUEUED'
              ? { nextReconciliationAt: transition.updatedAt }
              : {}
            : { nextReconciliationAt: transition.nextReconciliationAt }),
        },
      });
      if (updated.count !== 1) return false;

      for (const attempt of transition.nodeAttempts) {
        await this.prisma.client.dataWorkflowNodeAttempt.upsert({
          where: {
            runId_nodeId_attemptNumber: {
              runId: attempt.runId,
              nodeId: attempt.nodeId,
              attemptNumber: attempt.attemptNumber,
            },
          },
          create: this.mapper.nodeAttemptInsert(attempt) as never,
          update: {
            state: attempt.state,
            executionId: attempt.executionId ?? null,
            error: attempt.error ?? null,
            failureKind: attempt.failureKind ?? null,
            updatedAt: attempt.updatedAt,
          },
        });
      }
      for (const edge of transition.edgeStates) {
        await this.prisma.client.dataWorkflowEdgeState.upsert({
          where: { runId_edgeId: { runId: edge.runId, edgeId: edge.edgeId } },
          create: this.mapper.edgeStateInsert(edge) as never,
          update: { state: edge.state, updatedAt: edge.updatedAt },
        });
      }
      for (const acknowledgement of transition.retryAcknowledgements ?? []) {
        await this.prisma.client.dataWorkflowRetryAcknowledgement.create({
          data: this.mapper.retryAcknowledgementInsert(acknowledgement) as never,
        });
      }
      return true;
    });
  }

  public claimDue(
    limit: number,
    owner: string,
    now: Date,
    leaseMs: number,
  ): Promise<readonly DataWorkflowRun[]> {
    if (limit < 1 || leaseMs < 1 || owner.trim().length === 0) return Promise.resolve([]);
    return this.mutate(async () => {
      const organizationId = this.prisma.organizationId;
      if (organizationId === undefined) {
        throw new Error('Data workflow claims require an authenticated organization.');
      }
      const ids = await this.prisma.client.$queryRaw<ClaimedRunId[]>(Prisma.sql`
        SELECT id
        FROM "celesnity_app"."data_workflow_runs"
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'QUEUED'
        ORDER BY created_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (ids.length === 0) return [];

      const rows = await this.prisma.client.dataWorkflowRun.findMany({
        where: { id: { in: ids.map((row) => row.id) }, status: 'QUEUED' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: DATA_WORKFLOW_RUN_SELECTION,
      });
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const claimed: DataWorkflowRun[] = [];
      for (const row of rows) {
        const leaseToken = randomUUID();
        const updated = await this.prisma.client.dataWorkflowRun.updateMany({
          where: { id: row.id, status: 'QUEUED', revision: row.revision },
          data: {
            status: 'RUNNING',
            revision: row.revision + 1,
            leaseOwner: owner.trim(),
            leaseToken,
            leaseExpiresAt,
            updatedAt: now,
          },
        });
        if (updated.count === 1) {
          claimed.push(
            this.mapper.toRun({
              ...row,
              status: 'RUNNING',
              revision: row.revision + 1,
              leaseOwner: owner.trim(),
              leaseToken,
              leaseExpiresAt,
              updatedAt: now,
            }),
          );
        }
      }
      return claimed;
    });
  }

  public releaseClaim(id: string, owner: string, token: string): Promise<boolean> {
    return this.mutate(async () => {
      const result = await this.prisma.client.dataWorkflowRun.updateMany({
        where: { id, status: 'RUNNING', leaseOwner: owner, leaseToken: token },
        data: {
          status: 'QUEUED',
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      return result.count === 1;
    });
  }

  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.commit(() => work());
  }

  private async loadSnapshot(id: string): Promise<WorkflowRunSnapshot | undefined> {
    const row = await this.prisma.client.dataWorkflowRun.findUnique({
      where: { id },
      select: DATA_WORKFLOW_RUN_SELECTION,
    });
    if (row === null) return undefined;
    const [attemptRows, edgeRows, versionRow] = await Promise.all([
      this.prisma.client.dataWorkflowNodeAttempt.findMany({
        where: { runId: id },
        orderBy: [{ nodeId: 'asc' }, { attemptNumber: 'asc' }],
        select: DATA_WORKFLOW_NODE_ATTEMPT_SELECTION,
      }),
      this.prisma.client.dataWorkflowEdgeState.findMany({
        where: { runId: id },
        orderBy: { edgeId: 'asc' },
        select: DATA_WORKFLOW_EDGE_STATE_SELECTION,
      }),
      this.prisma.client.dataWorkflowVersion.findFirst({
        where: {
          id: row.versionId,
          organizationId: row.organizationId,
          workflowId: row.workflowId,
        },
        select: DATA_WORKFLOW_VERSION_SELECTION,
      }),
    ]);
    return {
      run: this.mapper.toRun(row),
      ...(versionRow === null ? {} : { version: this.mapper.toVersion(versionRow) }),
      nodeAttempts: attemptRows.map((attempt) => this.mapper.toNodeAttempt(attempt)),
      edgeStates: edgeRows.map((edge) => this.mapper.toEdgeState(edge)),
    };
  }
}

function assertTransitionChildrenBelongToRun(
  run: DataWorkflowRun,
  transition: SaveWorkflowRunTransition,
): void {
  const children = [
    ...transition.nodeAttempts,
    ...transition.edgeStates,
    ...(transition.retryAcknowledgements ?? []),
  ];
  if (
    children.some((child) => child.runId !== run.id || child.organizationId !== run.organizationId)
  ) {
    throw new Error('Data workflow transition children must belong to the transitioned run.');
  }
  for (const acknowledgement of transition.retryAcknowledgements ?? []) {
    const retryAttempt = transition.nodeAttempts.find(
      (attempt) => attempt.id === acknowledgement.nodeAttemptId,
    );
    if (
      retryAttempt === undefined ||
      retryAttempt.nodeId !== acknowledgement.nodeId ||
      retryAttempt.attemptNumber !== acknowledgement.attemptNumber
    ) {
      throw new Error('Data workflow retry acknowledgement must reference its transition attempt.');
    }
  }
}

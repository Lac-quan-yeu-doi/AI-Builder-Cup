import { Inject, Injectable } from '@nestjs/common';

import type {
  IWorkflowScheduleRepository,
  SaveWorkflowScheduleState,
  SynchronizeWorkflowSchedulePublication,
} from '@application/data-workflow/interfaces/i-workflow-schedule-repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import type { DataWorkflowSchedule } from '@domain/data-workflow/models/workflow-schedule';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  DATA_WORKFLOW_SCHEDULE_SELECTION,
  WorkflowMapper,
} from '@infrastructure/prisma/data-workflow/workflow.mapper';

@Injectable()
export class PrismaWorkflowScheduleRepository implements IWorkflowScheduleRepository {
  private readonly mapper = new WorkflowMapper();

  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async findCurrent(workflowId: string): Promise<DataWorkflowSchedule | undefined> {
    const row = await this.prisma.client.dataWorkflowSchedule.findFirst({
      where: { workflowId, enabled: true, supersededAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: DATA_WORKFLOW_SCHEDULE_SELECTION,
    });
    return row === null ? undefined : this.mapper.toSchedule(row);
  }

  public synchronizePublication(input: SynchronizeWorkflowSchedulePublication): Promise<void> {
    return this.mutate(async () => {
      await this.prisma.client.dataWorkflowSchedule.updateMany({
        where: { workflowId: input.workflowId, enabled: true, supersededAt: null },
        data: {
          enabled: false,
          supersededAt: input.now,
          revision: { increment: 1 },
          updatedAt: input.now,
        },
      });
      if (input.triggerKind === undefined || input.nextDueAt === undefined) return;
      await this.prisma.client.dataWorkflowSchedule.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          workflowId: input.workflowId,
          versionId: input.versionId,
          actor: input.actor,
          triggerKind: input.triggerKind,
          nextDueAt: input.nextDueAt,
          intervalAnchorAt: input.intervalAnchorAt ?? null,
          coalescedCount: 0,
          revision: 1,
          enabled: true,
          createdAt: input.now,
          updatedAt: input.now,
        },
      });
    });
  }

  public saveState(
    id: string,
    expectedRevision: number,
    state: SaveWorkflowScheduleState,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const data: {
        readonly enabled: boolean;
        readonly revision: number;
        readonly updatedAt: Date;
        readonly nextDueAt?: Date;
        readonly coalescedFromAt?: Date | null;
        readonly coalescedThroughAt?: Date | null;
        readonly coalescedCount?: number;
      } = {
        enabled: state.enabled,
        revision: expectedRevision + 1,
        updatedAt: state.now,
        ...(state.nextDueAt === undefined ? {} : { nextDueAt: state.nextDueAt }),
        ...(state.coalescedFromAt === undefined ? {} : { coalescedFromAt: state.coalescedFromAt }),
        ...(state.coalescedThroughAt === undefined
          ? {}
          : { coalescedThroughAt: state.coalescedThroughAt }),
        ...(state.coalescedCount === undefined ? {} : { coalescedCount: state.coalescedCount }),
      };
      const result = await this.prisma.client.dataWorkflowSchedule.updateMany({
        where: { id, revision: expectedRevision, supersededAt: null },
        data,
      });
      return result.count === 1;
    });
  }

  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.commit(() => work());
  }
}

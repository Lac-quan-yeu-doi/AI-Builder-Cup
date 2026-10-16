import { Inject, Injectable } from '@nestjs/common';

import type {
  CreateWorkflowDraft,
  IWorkflowRepository,
  PublishWorkflowSnapshot,
  SaveWorkflowDraft,
} from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import type {
  DataWorkflow,
  DataWorkflowVersion,
} from '@domain/data-workflow/models/workflow-persistence';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  DATA_WORKFLOW_SELECTION,
  DATA_WORKFLOW_VERSION_SELECTION,
  WorkflowMapper,
} from '@infrastructure/prisma/data-workflow/workflow.mapper';

@Injectable()
export class PrismaWorkflowRepository implements IWorkflowRepository {
  private readonly mapper = new WorkflowMapper();

  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async find(id: string): Promise<DataWorkflow | undefined> {
    const row = await this.prisma.client.dataWorkflow.findUnique({
      where: { id },
      select: DATA_WORKFLOW_SELECTION,
    });
    return row === null ? undefined : this.mapper.toWorkflow(row);
  }

  public async listByOrganization(
    organizationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ readonly items: readonly DataWorkflow[]; readonly totalItems: number }> {
    const where = { organizationId };
    const [rows, totalItems] = await Promise.all([
      this.prisma.client.dataWorkflow.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: DATA_WORKFLOW_SELECTION,
      }),
      this.prisma.client.dataWorkflow.count({ where }),
    ]);
    return { items: rows.map((row) => this.mapper.toWorkflow(row)), totalItems };
  }

  public async findVersion(
    workflowId: string,
    versionNumber: number,
  ): Promise<DataWorkflowVersion | undefined> {
    const row = await this.prisma.client.dataWorkflowVersion.findUnique({
      where: { workflowId_versionNumber: { workflowId, versionNumber } },
      select: DATA_WORKFLOW_VERSION_SELECTION,
    });
    return row === null ? undefined : this.mapper.toVersion(row);
  }

  public async findVersionById(id: string): Promise<DataWorkflowVersion | undefined> {
    const row = await this.prisma.client.dataWorkflowVersion.findUnique({
      where: { id },
      select: DATA_WORKFLOW_VERSION_SELECTION,
    });
    return row === null ? undefined : this.mapper.toVersion(row);
  }

  public async listVersions(
    workflowId: string,
    limit: number,
  ): Promise<readonly DataWorkflowVersion[]> {
    const rows = await this.prisma.client.dataWorkflowVersion.findMany({
      where: { workflowId },
      orderBy: [{ versionNumber: 'desc' }],
      take: limit,
      select: DATA_WORKFLOW_VERSION_SELECTION,
    });
    return rows.map((row) => this.mapper.toVersion(row));
  }

  public create(draft: CreateWorkflowDraft): Promise<DataWorkflow> {
    return this.mutate(async () => {
      const row = await this.prisma.client.dataWorkflow.create({
        data: {
          id: draft.id,
          organizationId: draft.organizationId,
          name: draft.name,
          draft: this.mapper.json(draft.draft),
          revision: 1,
          paused: draft.paused,
          createdAt: draft.now,
          updatedAt: draft.now,
        },
        select: DATA_WORKFLOW_SELECTION,
      });
      return this.mapper.toWorkflow(row);
    });
  }

  public saveDraft(
    id: string,
    expectedRevision: number,
    draft: SaveWorkflowDraft,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const result = await this.prisma.client.dataWorkflow.updateMany({
        where: { id, revision: expectedRevision },
        data: {
          name: draft.name,
          draft: this.mapper.json(draft.draft),
          paused: draft.paused,
          revision: expectedRevision + 1,
          updatedAt: draft.now,
        },
      });
      return result.count === 1;
    });
  }

  public savePaused(
    id: string,
    expectedRevision: number,
    paused: boolean,
    now: Date,
  ): Promise<boolean> {
    return this.mutate(async () => {
      const result = await this.prisma.client.dataWorkflow.updateMany({
        where: { id, revision: expectedRevision },
        data: { paused, revision: expectedRevision + 1, updatedAt: now },
      });
      return result.count === 1;
    });
  }

  public publish(
    id: string,
    expectedRevision: number,
    versionSnapshot: PublishWorkflowSnapshot,
  ): Promise<DataWorkflowVersion | false> {
    return this.mutate(async () => {
      // The update guard below is the allocation lock.  Two publishers can both
      // observe this row, but only one can move the expected revision and append
      // the matching version inside this UoW transaction.
      const current = await this.prisma.client.dataWorkflow.findFirst({
        where: { id, revision: expectedRevision },
        select: DATA_WORKFLOW_SELECTION,
      });
      if (current === null) return false;

      const versionNumber = (current.publishedVersion ?? 0) + 1;
      const updated = await this.prisma.client.dataWorkflow.updateMany({
        where: { id, revision: expectedRevision },
        data: {
          revision: expectedRevision + 1,
          publishedVersion: versionNumber,
          updatedAt: versionSnapshot.publishedAt,
        },
      });
      if (updated.count !== 1) return false;

      const version = await this.prisma.client.dataWorkflowVersion.create({
        data: {
          id: versionSnapshot.id,
          organizationId: current.organizationId,
          workflowId: current.id,
          versionNumber,
          graphSnapshot: this.mapper.json(versionSnapshot.graph),
          triggerSnapshot: this.mapper.json(versionSnapshot.trigger),
          pipelineDisplayNames: this.mapper.json(versionSnapshot.pipelineDisplayNames ?? {}),
          publishedAt: versionSnapshot.publishedAt,
        },
      });
      return this.mapper.toVersion(version);
    });
  }

  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.unitOfWork.commit(() => work());
  }
}

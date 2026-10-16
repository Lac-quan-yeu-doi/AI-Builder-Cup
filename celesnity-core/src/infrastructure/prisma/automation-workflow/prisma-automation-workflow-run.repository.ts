import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  AutomationWorkflowRun,
  AutomationWorkflowRunStatus,
  AutomationWorkflowRunTrigger,
} from '@domain/automation-workflow/models/automation-workflow-run';
import {
  AutomationWorkflowStepRun,
  AutomationWorkflowStepRunPatch,
  AutomationWorkflowStepRunStatus,
} from '@domain/automation-workflow/models/automation-workflow-step-run';
import { IAutomationWorkflowRunRepository } from '@application/automation-workflow/interfaces/i-automation-workflow-run.repository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { Document } from '@domain/document/models/document';
import type { Prisma } from '@generated/prisma/client';

interface RunRow {
  id: string;
  workflowId: string;
  triggeredBy: string;
  status: string;
  triggerPayload: unknown;
  startedAt: Date;
  finishedAt: Date | null;
}
interface StepRunRow {
  id: string;
  runId: string;
  stepId: string;
  agentRunId: string | null;
  status: string;
  output: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  pages: unknown;
  pageCount: number;
  extractionStatus: string;
  chartPreviews: Prisma.JsonValue;
  sourceRunId: string | null;
  createdAt: Date;
}

function runToDomain(row: RunRow): AutomationWorkflowRun {
  return AutomationWorkflowRun.create({
    id: row.id,
    workflowId: row.workflowId,
    triggeredBy: row.triggeredBy as AutomationWorkflowRunTrigger,
    status: row.status as AutomationWorkflowRunStatus,
    triggerPayload: row.triggerPayload,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
  });
}
function stepRunToDomain(row: StepRunRow): AutomationWorkflowStepRun {
  return AutomationWorkflowStepRun.create({
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    agentRunId: row.agentRunId ?? undefined,
    status: row.status as AutomationWorkflowStepRunStatus,
    output: row.output ?? undefined,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  });
}

function documentToDomain(row: DocumentRow): Document {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    storageKey: row.storageKey,
    pages: Array.isArray(row.pages) ? (row.pages as string[]) : [],
    pageCount: row.pageCount,
    extractionStatus: row.extractionStatus as Document['extractionStatus'],
    chartPreviews: Array.isArray(row.chartPreviews)
      ? (row.chartPreviews as Readonly<Record<string, unknown>[]>)
      : [],
    ...(row.sourceRunId === null ? {} : { sourceRunId: row.sourceRunId }),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PrismaAutomationWorkflowRunRepository implements IAutomationWorkflowRunRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async createRun(
    workflowId: string,
    triggeredBy: AutomationWorkflowRunTrigger,
    triggerPayload: unknown,
    startedAt: Date,
  ): Promise<AutomationWorkflowRun> {
    const row = await this.prisma.client.automationWorkflowRun.create({
      data: {
        id: randomUUID(),
        workflowId,
        triggeredBy,
        status: 'running',
        triggerPayload: triggerPayload as never,
        startedAt,
      },
    });
    return runToDomain(row);
  }

  public async findRunById(runId: string): Promise<AutomationWorkflowRun | undefined> {
    const row = await this.prisma.client.automationWorkflowRun.findUnique({ where: { id: runId } });
    return row === null ? undefined : runToDomain(row);
  }

  public async listRunsForWorkflow(
    workflowId: string,
    limit = 20,
  ): Promise<readonly AutomationWorkflowRun[]> {
    const rows = await this.prisma.client.automationWorkflowRun.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => runToDomain(row));
  }

  public async updateRunStatus(
    runId: string,
    status: AutomationWorkflowRunStatus,
    finishedAt?: Date,
  ): Promise<AutomationWorkflowRun> {
    const row = await this.prisma.client.automationWorkflowRun.update({
      where: { id: runId },
      data: { status, finishedAt: status === 'running' ? null : finishedAt },
    });
    return runToDomain(row);
  }

  public async createStepRun(runId: string, stepId: string): Promise<AutomationWorkflowStepRun> {
    const row = await this.prisma.client.automationWorkflowStepRun.create({
      data: { id: randomUUID(), runId, stepId, status: 'queued' },
    });
    return stepRunToDomain(row);
  }

  public async updateStepRun(
    stepRunId: string,
    status: AutomationWorkflowStepRunStatus,
    patch: AutomationWorkflowStepRunPatch = {},
  ): Promise<AutomationWorkflowStepRun> {
    const row = await this.prisma.client.automationWorkflowStepRun.update({
      where: { id: stepRunId },
      data: {
        status,
        agentRunId: patch.agentRunId,
        output: patch.output,
        startedAt: patch.startedAt,
        finishedAt: patch.finishedAt,
      },
    });
    return stepRunToDomain(row);
  }

  public async listStepRunsForRun(runId: string): Promise<readonly AutomationWorkflowStepRun[]> {
    const rows = await this.prisma.client.automationWorkflowStepRun.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
    return rows.map((row) => stepRunToDomain(row));
  }

  public async listDocumentsForRun(runId: string): Promise<readonly Document[]> {
    const stepRuns = await this.prisma.client.automationWorkflowStepRun.findMany({
      where: { runId },
      select: { agentRunId: true },
      orderBy: { startedAt: 'asc' },
    });
    const sourceRunIds = stepRuns.flatMap((stepRun) =>
      stepRun.agentRunId === null ? [] : [stepRun.agentRunId],
    );
    if (sourceRunIds.length === 0) return [];
    const rows = await this.prisma.client.document.findMany({
      where: { sourceRunId: { in: sourceRunIds } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => documentToDomain(row));
  }
}

import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  AutomationWorkflow,
  AutomationWorkflowStatus,
  AutomationWorkflowTriggerType,
  AutomationWorkflowTriggerField,
} from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import {
  CreateAutomationWorkflowInput,
  IAutomationWorkflowRepository,
} from '@application/automation-workflow/interfaces/i-automation-workflow.repository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

interface AutomationWorkflowRow {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  triggerType: string;
  eventTopic: string | null;
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  nextRunAt: Date | null;
  triggerFields?: unknown;
  createdBy: string;
  createdAt: Date;
}
interface AutomationWorkflowStepRow {
  id: string;
  workflowId: string;
  order: number;
  agentId: string;
  inputTemplate: Record<string, string>;
  systemPrompt?: string | null;
}

function toDomain(row: AutomationWorkflowRow): AutomationWorkflow {
  return AutomationWorkflow.create({
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as AutomationWorkflowStatus,
    triggerType: row.triggerType as AutomationWorkflowTriggerType,
    eventTopic: row.eventTopic ?? undefined,
    scheduleCron: row.scheduleCron ?? undefined,
    scheduleTimezone: row.scheduleTimezone ?? undefined,
    nextRunAt: row.nextRunAt ?? undefined,
    triggerFields: (row.triggerFields ?? []) as AutomationWorkflowTriggerField[],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  });
}
function stepToDomain(row: AutomationWorkflowStepRow): AutomationWorkflowStep {
  return AutomationWorkflowStep.create({
    id: row.id,
    workflowId: row.workflowId,
    order: row.order,
    agentId: row.agentId,
    inputTemplate: row.inputTemplate,
    systemPrompt: row.systemPrompt ?? undefined,
  });
}

@Injectable()
export class PrismaAutomationWorkflowRepository implements IAutomationWorkflowRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflow> {
    const data: Record<string, unknown> = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      status: 'draft',
      triggerType: input.triggerType,
      eventTopic: input.eventTopic ?? null,
      scheduleCron: input.scheduleCron ?? null,
      scheduleTimezone: input.scheduleTimezone ?? null,
      nextRunAt: input.nextRunAt ?? null,
      triggerFields: input.triggerFields ?? [],
      createdBy: input.createdBy,
      createdAt: new Date(),
    };
    const row = await this.prisma.client.automationWorkflow.create({
      data: data as Parameters<PrismaService['client']['automationWorkflow']['create']>[0]['data'],
    });
    return toDomain(row);
  }

  public async listForOrganization(organizationId: string): Promise<readonly AutomationWorkflow[]> {
    const rows = await this.prisma.client.automationWorkflow.findMany({
      where: { organizationId },
    });
    return rows.map((row) => toDomain(row));
  }

  public async findById(id: string): Promise<AutomationWorkflow | undefined> {
    const row = await this.prisma.client.automationWorkflow.findUnique({ where: { id } });
    return row === null ? undefined : toDomain(row);
  }

  public async setStatus(
    id: string,
    status: AutomationWorkflowStatus,
  ): Promise<AutomationWorkflow> {
    const row = await this.prisma.client.automationWorkflow.update({
      where: { id },
      data: { status },
    });
    return toDomain(row);
  }

  public async rename(id: string, name: string): Promise<AutomationWorkflow> {
    const row = await this.prisma.client.automationWorkflow.update({
      where: { id },
      data: { name },
    });
    return toDomain(row);
  }

  public async updateTrigger(
    id: string,
    patch: {
      triggerType?: AutomationWorkflowTriggerType;
      eventTopic?: string;
      scheduleCron?: string;
      scheduleTimezone?: string;
      triggerFields?: readonly AutomationWorkflowTriggerField[];
    },
  ): Promise<AutomationWorkflow> {
    const data: Record<string, unknown> = {};
    if (patch.triggerType !== undefined) data.triggerType = patch.triggerType;
    if (patch.eventTopic !== undefined) data.eventTopic = patch.eventTopic;
    if (patch.scheduleCron !== undefined) data.scheduleCron = patch.scheduleCron;
    if (patch.scheduleTimezone !== undefined) data.scheduleTimezone = patch.scheduleTimezone;
    if (patch.triggerFields !== undefined) data.triggerFields = patch.triggerFields;
    const row = await this.prisma.client.automationWorkflow.update({ where: { id }, data });
    return toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.client.automationWorkflow.delete({ where: { id } });
  }

  public async findEnabledByTopic(
    organizationId: string,
    eventTopic: string,
  ): Promise<readonly AutomationWorkflow[]> {
    const rows = await this.prisma.client.automationWorkflow.findMany({
      where: { organizationId, eventTopic, status: 'enabled' },
    });
    return rows.map((row) => toDomain(row));
  }

  public async scheduleDue(limit: number, now: Date): Promise<readonly AutomationWorkflow[]> {
    const rows = await this.prisma.client.automationWorkflow.findMany({
      where: { triggerType: 'SCHEDULE', status: 'enabled', nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => toDomain(row));
  }

  public async advanceNextRun(id: string, nextRunAt: Date | null): Promise<void> {
    await this.prisma.client.automationWorkflow.update({ where: { id }, data: { nextRunAt } });
  }

  public async listStepsForWorkflow(
    workflowId: string,
  ): Promise<readonly AutomationWorkflowStep[]> {
    const rows = await this.prisma.client.automationWorkflowStep.findMany({
      where: { workflowId },
      orderBy: { order: 'asc' },
    });
    return rows.map((row) => stepToDomain(row as AutomationWorkflowStepRow));
  }

  public async addStep(
    workflowId: string,
    agentId: string,
    inputTemplate: Readonly<Record<string, string>>,
    systemPrompt?: string,
  ): Promise<AutomationWorkflowStep> {
    return this.prisma.transaction(async () => {
      const last = await this.prisma.client.automationWorkflowStep.findFirst({
        where: { workflowId },
        orderBy: { order: 'desc' },
      });
      const row = await this.prisma.client.automationWorkflowStep.create({
        data: {
          id: randomUUID(),
          workflowId,
          order: (last?.order ?? -1) + 1,
          agentId,
          inputTemplate,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
        },
      });
      return stepToDomain(row as AutomationWorkflowStepRow);
    });
  }

  public async removeStep(stepId: string): Promise<void> {
    await this.prisma.client.automationWorkflowStep.delete({ where: { id: stepId } });
  }

  public async updateStep(
    stepId: string,
    patch: {
      agentId?: string;
      inputTemplate?: Readonly<Record<string, string>>;
      systemPrompt?: string;
    },
  ): Promise<AutomationWorkflowStep> {
    const data: Record<string, unknown> = {};
    if (patch.agentId !== undefined) data.agentId = patch.agentId;
    if (patch.inputTemplate !== undefined) data.inputTemplate = patch.inputTemplate;
    if (patch.systemPrompt !== undefined) data.systemPrompt = patch.systemPrompt;
    const row = await this.prisma.client.automationWorkflowStep.update({
      where: { id: stepId },
      data,
    });
    return stepToDomain(row as AutomationWorkflowStepRow);
  }
}

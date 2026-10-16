import { PrismaAutomationWorkflowRepository } from '@infrastructure/prisma/automation-workflow/prisma-automation-workflow.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('PrismaAutomationWorkflowRepository', () => {
  it('creates a workflow in draft status with the given trigger', async () => {
    const created: Record<string, unknown>[] = [];
    const prismaClientFake = {
      automationWorkflow: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { ...data };
        }),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const workflow = await repository.create({
      organizationId: 'org-1',
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
      createdBy: 'user-1',
    });

    expect(workflow.status).toBe('draft');
    expect(workflow.eventTopic).toBe('celesnity.ingest.file.created.v1');
    expect(workflow.triggerFields).toEqual([
      { name: 'run_date', type: 'date', label: 'Run date', required: true },
    ]);
    expect(prismaClientFake.automationWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          status: 'draft',
          triggerType: 'EVENT',
          triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
        }),
      }),
    );
  });

  it('create defaults triggerFields to [] when omitted', async () => {
    const prismaClientFake = {
      automationWorkflow: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const workflow = await repository.create({
      organizationId: 'org-1',
      name: 'No fields',
      triggerType: 'EVENT',
      createdBy: 'user-1',
    });

    expect(workflow.triggerFields).toEqual([]);
    expect(prismaClientFake.automationWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ triggerFields: [] }) }),
    );
  });

  it('findById returns undefined when Prisma finds no row', async () => {
    const prismaClientFake = {
      automationWorkflow: { findUnique: jest.fn(async () => null) },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    expect(await repository.findById('missing-id')).toBeUndefined();
  });

  it('setStatus and rename update via Prisma.update and map the returned row', async () => {
    const row = {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Chain',
      status: 'draft',
      triggerType: 'EVENT',
      eventTopic: 't',
      scheduleCron: null,
      scheduleTimezone: null,
      nextRunAt: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const prismaClientFake = {
      automationWorkflow: {
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...row,
          ...data,
        })),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const enabled = await repository.setStatus('wf-1', 'enabled');
    expect(enabled.status).toBe('enabled');

    const renamed = await repository.rename('wf-1', 'New name');
    expect(renamed.name).toBe('New name');
  });

  it('updateTrigger calls Prisma.update with only the patched fields', async () => {
    const updatedRow = {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Chain',
      status: 'draft',
      triggerType: 'SCHEDULE',
      eventTopic: null,
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
      nextRunAt: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const prismaClientFake = { automationWorkflow: { update: jest.fn(async () => updatedRow) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const result = await repository.updateTrigger('wf-1', {
      triggerType: 'SCHEDULE',
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
    });

    expect(prismaClientFake.automationWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'wf-1' },
      data: {
        triggerType: 'SCHEDULE',
        scheduleCron: '0 8 * * *',
        scheduleTimezone: 'America/Los_Angeles',
      },
    });
    expect(result.scheduleCron).toBe('0 8 * * *');
  });

  it('updateTrigger persists triggerFields when provided and maps them back', async () => {
    const fields = [{ name: 'run_date', type: 'date' as const, label: 'Run date', required: true }];
    const updatedRow = {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Chain',
      status: 'draft',
      triggerType: 'EVENT',
      eventTopic: 't',
      scheduleCron: null,
      scheduleTimezone: null,
      nextRunAt: null,
      triggerFields: fields,
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const prismaClientFake = { automationWorkflow: { update: jest.fn(async () => updatedRow) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const result = await repository.updateTrigger('wf-1', { triggerFields: fields });

    expect(prismaClientFake.automationWorkflow.update).toHaveBeenCalledWith({
      where: { id: 'wf-1' },
      data: { triggerFields: fields },
    });
    expect(result.triggerFields).toEqual(fields);
  });

  it('toDomain maps a null/undefined triggerFields column to []', async () => {
    const row = {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Chain',
      status: 'draft',
      triggerType: 'EVENT',
      eventTopic: 't',
      scheduleCron: null,
      scheduleTimezone: null,
      nextRunAt: null,
      triggerFields: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const prismaClientFake = { automationWorkflow: { findUnique: jest.fn(async () => row) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const workflow = await repository.findById('wf-1');
    expect(workflow?.triggerFields).toEqual([]);
  });

  it('delete calls Prisma.delete with the id', async () => {
    const prismaClientFake = { automationWorkflow: { delete: jest.fn(async () => undefined) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    await repository.delete('wf-1');
    expect(prismaClientFake.automationWorkflow.delete).toHaveBeenCalledWith({
      where: { id: 'wf-1' },
    });
  });

  it('findEnabledByTopic filters by organization, topic, and enabled status', async () => {
    const prismaClientFake = { automationWorkflow: { findMany: jest.fn(async () => []) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    await repository.findEnabledByTopic('org-1', 'celesnity.ingest.file.created.v1');
    expect(prismaClientFake.automationWorkflow.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        eventTopic: 'celesnity.ingest.file.created.v1',
        status: 'enabled',
      },
    });
  });

  it('addStep computes the next order inside a transaction and appends the step', async () => {
    const existingSteps = [
      {
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        agentId: 'schema-extractor',
        inputTemplate: {},
      },
    ];
    const prismaClientFake = {
      automationWorkflowStep: {
        findFirst: jest.fn(async () => existingSteps[existingSteps.length - 1] ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      },
    };
    const transactionMock = jest.fn((work: (client: unknown) => Promise<unknown>) =>
      work(prismaClientFake),
    );
    const prismaServiceFake = {
      client: prismaClientFake,
      transaction: transactionMock,
    } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.addStep('wf-1', 'summarizer', { message: '$.step1.output' });

    expect(step.order).toBe(1);
    expect(step.agentId).toBe('summarizer');
    expect(transactionMock).toHaveBeenCalled();
  });

  it('addStep starts at order 0 for a workflow with no existing steps', async () => {
    const prismaClientFake = {
      automationWorkflowStep: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      },
    };
    const transactionMock = jest.fn((work: (client: unknown) => Promise<unknown>) =>
      work(prismaClientFake),
    );
    const prismaServiceFake = {
      client: prismaClientFake,
      transaction: transactionMock,
    } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.addStep('wf-1', 'schema-extractor', {
      message: '$.trigger.bucket',
    });
    expect(step.order).toBe(0);
  });

  it('addStep persists systemPrompt when provided and maps it back', async () => {
    const prismaClientFake = {
      automationWorkflowStep: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      },
    };
    const transactionMock = jest.fn((work: (client: unknown) => Promise<unknown>) =>
      work(prismaClientFake),
    );
    const prismaServiceFake = {
      client: prismaClientFake,
      transaction: transactionMock,
    } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.addStep(
      'wf-1',
      'schema-extractor',
      { message: '$.trigger.bucket' },
      'You are a terse schema critic.',
    );

    expect(step.systemPrompt).toBe('You are a terse schema critic.');
    expect(prismaClientFake.automationWorkflowStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ systemPrompt: 'You are a terse schema critic.' }),
      }),
    );
  });

  it('addStep omits systemPrompt from the create data when not provided', async () => {
    const prismaClientFake = {
      automationWorkflowStep: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      },
    };
    const transactionMock = jest.fn((work: (client: unknown) => Promise<unknown>) =>
      work(prismaClientFake),
    );
    const prismaServiceFake = {
      client: prismaClientFake,
      transaction: transactionMock,
    } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.addStep('wf-1', 'schema-extractor', {
      message: '$.trigger.bucket',
    });

    expect(step.systemPrompt).toBeUndefined();
    const createData = (
      prismaClientFake.automationWorkflowStep.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(createData).not.toHaveProperty('systemPrompt');
  });

  it('stepToDomain maps a null systemPrompt column to undefined', async () => {
    const rows = [
      {
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        agentId: 'schema-extractor',
        inputTemplate: {},
        systemPrompt: null,
      },
    ];
    const prismaClientFake = { automationWorkflowStep: { findMany: jest.fn(async () => rows) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const steps = await repository.listStepsForWorkflow('wf-1');
    expect(steps[0]?.systemPrompt).toBeUndefined();
  });

  it('listStepsForWorkflow returns steps ordered by their order field', async () => {
    const rows = [
      { id: 'step-2', workflowId: 'wf-1', order: 1, agentId: 'summarizer', inputTemplate: {} },
      {
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        agentId: 'schema-extractor',
        inputTemplate: {},
      },
    ];
    const prismaClientFake = { automationWorkflowStep: { findMany: jest.fn(async () => rows) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    await repository.listStepsForWorkflow('wf-1');
    expect(prismaClientFake.automationWorkflowStep.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'wf-1' },
      orderBy: { order: 'asc' },
    });
  });

  it('removeStep calls Prisma.delete with the step id', async () => {
    const prismaClientFake = { automationWorkflowStep: { delete: jest.fn(async () => undefined) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    await repository.removeStep('step-1');
    expect(prismaClientFake.automationWorkflowStep.delete).toHaveBeenCalledWith({
      where: { id: 'step-1' },
    });
  });

  it('updateStep calls Prisma.update with only the patched fields', async () => {
    const updatedRow = {
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    };
    const prismaClientFake = {
      automationWorkflowStep: { update: jest.fn(async () => updatedRow) },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.updateStep('step-1', {
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });

    expect(prismaClientFake.automationWorkflowStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { agentId: 'summarizer', inputTemplate: { message: '$.step1.output' } },
    });
    expect(step.agentId).toBe('summarizer');
  });

  it('updateStep with a partial patch only sends the provided field', async () => {
    const updatedRow = {
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'validator',
      inputTemplate: { message: '$.trigger.bucket' },
    };
    const prismaClientFake = {
      automationWorkflowStep: { update: jest.fn(async () => updatedRow) },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    await repository.updateStep('step-1', { agentId: 'validator' });

    expect(prismaClientFake.automationWorkflowStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { agentId: 'validator' },
    });
  });

  it('updateStep persists systemPrompt when provided in the patch', async () => {
    const updatedRow = {
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
      systemPrompt: 'You are a blunt editor.',
    };
    const prismaClientFake = {
      automationWorkflowStep: { update: jest.fn(async () => updatedRow) },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const step = await repository.updateStep('step-1', { systemPrompt: 'You are a blunt editor.' });

    expect(prismaClientFake.automationWorkflowStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: { systemPrompt: 'You are a blunt editor.' },
    });
    expect(step.systemPrompt).toBe('You are a blunt editor.');
  });

  it('scheduleDue claims enabled SCHEDULE workflows whose nextRunAt is due, oldest first', async () => {
    const now = new Date('2026-09-07T08:00:00.000Z');
    const dueRow = {
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Daily digest',
      status: 'enabled',
      triggerType: 'SCHEDULE',
      eventTopic: null,
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'UTC',
      nextRunAt: new Date('2026-09-07T07:59:00.000Z'),
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const prismaClientFake = { automationWorkflow: { findMany: jest.fn(async () => [dueRow]) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRepository(prismaServiceFake);

    const due = await repository.scheduleDue(10, now);

    expect(prismaClientFake.automationWorkflow.findMany).toHaveBeenCalledWith({
      where: { triggerType: 'SCHEDULE', status: 'enabled', nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: 10,
    });
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe('wf-1');
  });
});

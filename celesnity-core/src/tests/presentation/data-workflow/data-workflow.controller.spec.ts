import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';

import { CreateWorkflowUseCase } from '@application/data-workflow/create-workflow.use-case';
import {
  GetWorkflowRunUseCase,
  ListWorkflowRunsUseCase,
} from '@application/data-workflow/read-workflow-run.use-cases';
import {
  GetWorkflowUseCase,
  ListWorkflowVersionsUseCase,
  ListWorkflowsUseCase,
} from '@application/data-workflow/read-workflow.use-cases';
import { PublishWorkflowUseCase } from '@application/data-workflow/publish-workflow.use-case';
import { PreviewWorkflowCalendarUseCase } from '@application/data-workflow/preview-workflow-calendar.use-case';
import { GetWorkflowScheduleUseCase } from '@application/data-workflow/read-workflow-schedule.use-case';
import { RetryWorkflowNodeUseCase } from '@application/data-workflow/retry-workflow-node.use-case';
import { SetWorkflowPausedUseCase } from '@application/data-workflow/set-workflow-paused.use-case';
import { StartWorkflowRunUseCase } from '@application/data-workflow/start-workflow-run.use-case';
import { UpdateWorkflowUseCase } from '@application/data-workflow/update-workflow.use-case';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';
import { DataWorkflowController } from '@presentation/data-workflow/data-workflow.controller';
import { DataWorkflowRunController } from '@presentation/data-workflow/data-workflow-run.controller';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { REQUIRED_WORKSPACE_FEATURES } from '@presentation/http/required-workspace-feature.decorator';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';

const workflow = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000010',
  name: 'Daily import',
  draft: { nodes: [{ id: 'trigger', type: 'TRIGGER' }], edges: [] },
  revision: 2,
  publishedVersion: 1,
  paused: false,
  createdAt: new Date('2026-09-17T10:00:00.000Z'),
  updatedAt: new Date('2026-09-17T10:00:00.000Z'),
};

const runSnapshot = {
  run: {
    id: '00000000-0000-4000-8000-000000000003',
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    versionId: '00000000-0000-4000-8000-000000000002',
    actor: '00000000-0000-4000-8000-000000000011',
    delegation: { confidential: 'delegation' },
    parameters: { confidential: 'parameters' },
    triggerContext: { confidential: 'trigger' },
    status: 'RUNNING' as const,
    revision: 3,
    nextReconciliationAt: workflow.createdAt,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  },
  nodeAttempts: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      organizationId: workflow.organizationId,
      runId: '00000000-0000-4000-8000-000000000003',
      nodeId: 'load-orders',
      attemptNumber: 2,
      state: 'RUNNING' as const,
      executionId: '00000000-0000-4000-8000-000000000005',
      error: 'confidential failure detail',
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    },
  ],
  edgeStates: [],
};

const schedule = {
  id: '00000000-0000-4000-8000-000000000020',
  organizationId: workflow.organizationId,
  workflowId: workflow.id,
  versionId: '00000000-0000-4000-8000-000000000002',
  actor: 'confidential-schedule-actor',
  triggerKind: 'CALENDAR' as const,
  nextDueAt: new Date('2026-09-19T07:00:00.000Z'),
  coalescedCount: 2,
  revision: 1,
  enabled: true,
  createdAt: workflow.createdAt,
  updatedAt: workflow.updatedAt,
};

describe('Data Workflow HTTP controllers', () => {
  let app: INestApplication;
  const reads = {
    list: jest.fn(async () => ({ items: [workflow], page: 1, pageSize: 20, totalItems: 1 })),
    get: jest.fn(async () => workflow),
    versions: jest.fn(async () => [
      {
        id: '00000000-0000-4000-8000-000000000002',
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        versionNumber: 1,
        graph: workflow.draft,
        trigger: { triggerNodeId: 'trigger' },
        publishedAt: workflow.createdAt,
      },
    ]),
  };
  const runs = {
    list: jest.fn(async () => ({
      items: [runSnapshot],
      limit: 20,
    })),
    get: jest.fn(async (): Promise<typeof runSnapshot> => {
      throw WorkflowRunError.notFound();
    }),
  };
  const scheduleReader = { get: jest.fn(async () => ({ workflow, schedule })) };
  const calendarPreview = {
    execute: jest.fn(async () => ({
      source: 'DRAFT' as const,
      trigger: {
        type: 'CALENDAR' as const,
        timeOfDay: '07:00',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'UTC',
      },
      occurrences: [new Date('2026-09-19T07:00:00.000Z')],
    })),
  };
  const pauseWorkflow = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [DataWorkflowController, DataWorkflowRunController],
      providers: [
        { provide: CreateWorkflowUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateWorkflowUseCase, useValue: { execute: jest.fn() } },
        { provide: PublishWorkflowUseCase, useValue: { execute: jest.fn() } },
        { provide: SetWorkflowPausedUseCase, useValue: pauseWorkflow },
        { provide: GetWorkflowScheduleUseCase, useValue: { execute: scheduleReader.get } },
        { provide: PreviewWorkflowCalendarUseCase, useValue: calendarPreview },
        { provide: ListWorkflowsUseCase, useValue: { execute: reads.list } },
        { provide: GetWorkflowUseCase, useValue: { execute: reads.get } },
        { provide: ListWorkflowVersionsUseCase, useValue: { execute: reads.versions } },
        { provide: StartWorkflowRunUseCase, useValue: { execute: jest.fn() } },
        { provide: RetryWorkflowNodeUseCase, useValue: { execute: jest.fn() } },
        { provide: ListWorkflowRunsUseCase, useValue: { execute: runs.list } },
        { provide: GetWorkflowRunUseCase, useValue: { execute: runs.get } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      setAuthenticatedPrincipal(req, {
        organizationId: workflow.organizationId,
        identityId: '00000000-0000-4000-8000-000000000011',
        subject: 'test-subject',
        identityTenantId: 'test-tenant',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: '00000000-0000-4000-8000-000000000012',
        role: 'ORG_ADMIN',
        authenticationTime: 0,
        mfaVerified: true,
        visibleFeatures: null,
      });
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
  });

  afterEach(async () => app.close());

  it('rejects an invalid create payload at the HTTP boundary', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/data-workflows')
      .send({ name: '', draft: { nodes: [], edges: [] }, unexpected: true });

    expect(response.status).toBe(400);
  });

  it('rejects create requests that omit the required draft before controller dereference', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/data-workflows')
      .send({});

    expect(response.status).toBe(400);
  });

  it('rejects update requests that omit the required draft before controller dereference', async () => {
    const response = await request(app.getHttpServer() as Server)
      .patch(`/data-workflows/${workflow.id}`)
      .send({ expectedRevision: 2 });

    expect(response.status).toBe(400);
  });

  it('returns pipeline execution links as scrubbed attempt history', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}/runs`,
    );

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000003',
      status: 'RUNNING',
      attempts: [
        {
          nodeId: 'load-orders',
          attemptNumber: 2,
          state: 'RUNNING',
          executionId: '00000000-0000-4000-8000-000000000005',
        },
      ],
    });
    expect(Object.keys(response.body[0].attempts[0]).sort()).toEqual(
      ['attemptNumber', 'executionId', 'nodeId', 'state'].sort(),
    );
    expect(response.body[0]).not.toHaveProperty('parameters');
    expect(response.body[0]).not.toHaveProperty('delegation');
    expect(response.body[0]).not.toHaveProperty('triggerContext');
    expect(response.body[0].attempts[0]).not.toHaveProperty('error');
  });

  it('returns scrubbed attempt history for a single workflow run', async () => {
    runs.get.mockResolvedValueOnce(runSnapshot);

    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}/runs/${runSnapshot.run.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.attempts).toEqual([
      {
        nodeId: 'load-orders',
        attemptNumber: 2,
        state: 'RUNNING',
        executionId: '00000000-0000-4000-8000-000000000005',
      },
    ]);
    expect(response.body).not.toHaveProperty('parameters');
    expect(response.body.attempts[0]).not.toHaveProperty('error');
  });

  it('keeps a run route scoped to its workflow and maps a mismatch to 404', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}/runs/00000000-0000-4000-8000-000000000099`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'WORKFLOW_RUN_NOT_FOUND' } });
  });

  it('uses the PIPELINES feature gate and does not expose AUTOMATIONS', () => {
    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride(REQUIRED_WORKSPACE_FEATURES, [DataWorkflowController]),
    ).toEqual(['PIPELINES']);
  });

  it('returns published history as a response copy, not the stored version object', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}/versions`,
    );

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ versionNumber: 1 });
    const firstNode = (response.body[0].graph.nodes as Array<{ type: string }>)[0];
    expect(firstNode).toBeDefined();
    if (firstNode !== undefined) firstNode.type = 'PIPELINE';
    expect(reads.versions.mock.results[0]?.value as Promise<readonly unknown[]>).toBeDefined();
    expect(workflow.draft.nodes[0]?.type).toBe('TRIGGER');
  });

  it('returns safe schedule state without its actor identity or lease details', async () => {
    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}/schedule`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      kind: 'CALENDAR',
      lifecycle: 'ENABLED',
      enabled: true,
      paused: false,
      nextDueAt: '2026-09-19T07:00:00.000Z',
      occurrenceCoverage: { coalescedCount: 2 },
    });
    expect(response.body).not.toHaveProperty('actor');
    expect(response.body).not.toHaveProperty('leaseToken');
  });

  it('rejects an out-of-bounds calendar preview before controller invocation', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post(`/data-workflows/${workflow.id}/schedule/preview`)
      .send({ source: 'DRAFT', count: 21 });

    expect(response.status).toBe(400);
    expect(calendarPreview.execute).not.toHaveBeenCalled();
  });

  it('returns a calendar preview and omits schedule execution identities', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post(`/data-workflows/${workflow.id}/schedule/preview`)
      .send({ source: 'DRAFT', count: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      source: 'DRAFT',
      kind: 'CALENDAR',
      timeOfDay: '07:00',
      timezone: 'UTC',
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      occurrences: ['2026-09-19T07:00:00.000Z'],
    });
  });

  it('includes the effective paused schedule state after pausing automatic work', async () => {
    const paused = { ...workflow, paused: true, revision: workflow.revision + 1 };
    pauseWorkflow.execute.mockResolvedValueOnce(paused);
    scheduleReader.get.mockResolvedValueOnce({ workflow: paused, schedule });

    const response = await request(app.getHttpServer() as Server)
      .patch(`/data-workflows/${workflow.id}/state`)
      .send({ expectedRevision: workflow.revision, paused: true });

    expect(response.status).toBe(200);
    expect(response.body.schedule).toMatchObject({
      kind: 'CALENDAR',
      lifecycle: 'PAUSED',
      enabled: false,
      paused: true,
    });
  });

  it.each([
    ['revision', WorkflowAuthoringError.revisionConflict(), 'WORKFLOW_REVISION_CONFLICT'],
    ['active run', WorkflowRunError.activeRunConflict(), 'WORKFLOW_ACTIVE_RUN_CONFLICT'],
  ])('maps %s conflicts to 409', async (_label, error, code) => {
    reads.get.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer() as Server).get(
      `/data-workflows/${workflow.id}`,
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code } });
  });
});

import { describe, expect, it } from 'vitest';

import { ConflictError, RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiTutorialProgressRepository } from '@/src/infrastructure/repositories/core-api-tutorial-progress.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const progressDto = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'PAUSED',
  currentStepId: 'step-2',
  completedStepIds: ['step-1'],
  contextSelections: [
    {
      requirementId: 'database-context',
      resourceType: 'DATABASE',
      resourceId: 'database-1',
      accessToken: 'nested-sensitive-value',
    },
  ],
  updatedAt: '2026-09-21T10:00:00.000Z',
  password: 'must-not-enter-the-entity',
};

const progressRecord: ProgressRecord = {
  tutorialId: 'tutorial/with space',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-2',
  completedStepIds: ['step-1'],
  contextSelections: [
    {
      requirementId: 'database-context',
      resourceType: 'DATABASE',
      resourceId: 'database-1',
    },
  ],
  updatedAt: '2026-09-21T11:00:00.000Z',
};

const bodyOf = (request: RecordedRequest | undefined): unknown =>
  JSON.parse(String(request?.init?.body));

describe('CoreApiTutorialProgressRepository', () => {
  it('lists progress for the authenticated member and maps only entity fields', async () => {
    const transport = new FakeGeneratedApiTransport([progressDto]);
    const repository = new CoreApiTutorialProgressRepository(transport);

    const result = await repository.listForMember();

    expect(transport.requests).toEqual([{ path: '/tutorial-progress', init: { method: 'GET' } }]);
    expect(result).toEqual([
      {
        tutorialId: 'tutorial-1',
        memberId: 'member-1',
        organizationId: 'organization-1',
        status: 'PAUSED',
        currentStepId: 'step-2',
        completedStepIds: ['step-1'],
        contextSelections: [
          {
            requirementId: 'database-context',
            resourceType: 'DATABASE',
            resourceId: 'database-1',
          },
        ],
        updatedAt: '2026-09-21T10:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-enter-the-entity');
    expect(JSON.stringify(result)).not.toContain('nested-sensitive-value');
  });

  it('upserts progress by encoded tutorial id without sending member or organization identity', async () => {
    const transport = new FakeGeneratedApiTransport({
      ...progressDto,
      tutorialId: progressRecord.tutorialId,
      status: 'IN_PROGRESS',
      updatedAt: progressRecord.updatedAt,
    });
    const repository = new CoreApiTutorialProgressRepository(transport);

    const result = await repository.save(progressRecord);

    expect(transport.requests[0]?.path).toBe('/tutorial-progress/tutorial%2Fwith%20space');
    expect(transport.requests[0]?.init?.method).toBe('PUT');
    expect(bodyOf(transport.requests[0])).toEqual({
      status: 'IN_PROGRESS',
      currentStepId: 'step-2',
      completedStepIds: ['step-1'],
      contextSelections: [
        {
          requirementId: 'database-context',
          resourceType: 'DATABASE',
          resourceId: 'database-1',
        },
      ],
      updatedAt: '2026-09-21T11:00:00.000Z',
    });
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('returns null when the authenticated member has no onboarding decision', async () => {
    const transport = new FakeGeneratedApiTransport(null);
    const repository = new CoreApiTutorialProgressRepository(transport);

    await expect(repository.getOnboardingDecision()).resolves.toBeNull();
    expect(transport.requests).toEqual([
      { path: '/tutorial-onboarding-decision', init: { method: 'GET' } },
    ]);
  });

  it('gets and saves onboarding decisions with explicit DTO enum translation', async () => {
    const transport = new FakeGeneratedApiTransport(
      { decision: 'ACCEPTED' },
      { decision: 'DISMISSED' },
    );
    const repository = new CoreApiTutorialProgressRepository(transport);

    await expect(repository.getOnboardingDecision()).resolves.toBe('accepted');
    await expect(repository.saveOnboardingDecision('dismissed')).resolves.toBe('dismissed');
    expect(transport.requests[1]).toEqual({
      path: '/tutorial-onboarding-decision',
      init: {
        method: 'PUT',
        body: JSON.stringify({ decision: 'DISMISSED' }),
      },
    });
  });

  it('uses an encoded run-keyed PUT so repeated completion saves are idempotent', async () => {
    const completion = {
      runId: 'run/with space',
      completedAt: '2026-09-21T12:00:00.000Z',
    };
    const transport = new FakeGeneratedApiTransport(completion, completion);
    const repository = new CoreApiTutorialProgressRepository(transport);

    const first = await repository.saveCompletion('run/with space');
    const second = await repository.saveCompletion('run/with space');

    expect(first).toEqual(completion);
    expect(second).toEqual(completion);
    expect(transport.requests).toEqual([
      {
        path: '/tutorial-runs/run%2Fwith%20space/completion',
        init: { method: 'PUT' },
      },
      {
        path: '/tutorial-runs/run%2Fwith%20space/completion',
        init: { method: 'PUT' },
      },
    ]);
  });

  it('translates persistence failures without mutating the supplied progress record', async () => {
    const transport = new FakeGeneratedApiTransport(
      new CoreApiError(503, 'Tutorial persistence unavailable'),
    );
    const repository = new CoreApiTutorialProgressRepository(transport);
    const snapshot = structuredClone(progressRecord);

    await expect(repository.save(progressRecord)).rejects.toMatchObject({
      name: RemoteServiceError.name,
      message: 'Tutorial persistence unavailable',
      exposeMessage: true,
    });
    expect(progressRecord).toEqual(snapshot);
  });

  it('translates a completion conflict at the infrastructure boundary', async () => {
    const transport = new FakeGeneratedApiTransport(
      new CoreApiError(409, 'Completion outcome conflicts'),
    );
    const repository = new CoreApiTutorialProgressRepository(transport);

    await expect(repository.saveCompletion('run-1')).rejects.toBeInstanceOf(ConflictError);
  });
});

import { describe, expect, it } from 'vitest';

import {
  RemoteServiceError,
  TutorialAccessError,
  TutorialPublicationError,
} from '@/src/entities/errors/application-errors';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiTutorialRepository } from '@/src/infrastructure/repositories/core-api-tutorial.repository';

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

const metadataDto = {
  title: 'Query your first table',
  summary: 'Learn how to run a query.',
  category: 'Query',
  learningOutcomes: ['Choose a database', 'Run SQL'],
  estimatedMinutes: 8,
  stepCount: 1,
};

const definitionDto = {
  id: 'query-basics',
  experience: { mode: 'WORKSPACE' },
  metadata: metadataDto,
  steps: [
    {
      id: 'open-query',
      order: 1,
      title: 'Open Query',
      instructionalContent: 'Open the query workspace.',
      destinationFeature: 'QUERY',
      destinationHref: '/query',
      requiredAction: {
        id: 'run-query',
        accessibleName: 'Run query',
      },
      targetControl: {
        id: 'run-button',
        accessibleName: 'Run query',
        selector: '[data-tutorial-target="run-query"]',
      },
    },
  ],
  requiredFeatures: ['QUERY'],
  prerequisites: [{ id: 'has-database', description: 'An accessible database exists.' }],
  contextRequirements: [{ id: 'database', resourceType: 'DATABASE', selectionCount: 1 }],
};

const definition: TutorialDefinition = {
  id: 'query-basics',
  experience: { mode: 'WORKSPACE' },
  metadata: metadataDto,
  steps: [
    {
      id: 'open-query',
      order: 1,
      title: 'Open Query',
      instructionalContent: 'Open the query workspace.',
      destinationFeature: 'QUERY',
      destinationHref: '/query',
      requiredAction: {
        id: 'run-query',
        accessibleName: 'Run query',
      },
      targetControl: {
        id: 'run-button',
        accessibleName: 'Run query',
        selector: '[data-tutorial-target="run-query"]',
      },
    },
  ],
  requiredFeatures: ['QUERY'],
  prerequisites: [{ id: 'has-database', description: 'An accessible database exists.' }],
  contextRequirements: [{ id: 'database', resourceType: 'DATABASE', selectionCount: 1 }],
};

const bodyOf = (request: RecordedRequest | undefined): unknown =>
  JSON.parse(String(request?.init?.body));

describe('CoreApiTutorialRepository', () => {
  it('requests the server-authorized catalog and maps complete published metadata', async () => {
    const dto = {
      id: 'query-basics',
      metadata: {
        ...metadataDto,
        learningOutcomes: [...metadataDto.learningOutcomes],
      },
      requiredFeatures: ['QUERY'],
      internalStatus: 'PUBLISHED',
      password: 'catalog-sensitive-value',
      inaccessibleTutorialDetails: {
        id: 'restricted-tutorial',
        name: 'Restricted tutorial',
      },
    };
    const transport = new FakeGeneratedApiTransport([dto]);
    const repository = new CoreApiTutorialRepository(transport);

    const result = await repository.listAccessibleCatalog();
    dto.metadata.learningOutcomes.push('DTO-only mutation');

    expect(transport.requests).toEqual([{ path: '/tutorials', init: { method: 'GET' } }]);
    expect(result).toEqual([
      {
        id: 'query-basics',
        title: 'Query your first table',
        summary: 'Learn how to run a query.',
        category: 'Query',
        learningOutcomes: ['Choose a database', 'Run SQL'],
        estimatedMinutes: 8,
        stepCount: 1,
      },
    ]);
    expect(result[0]).not.toHaveProperty('requiredFeatures');
    expect(result[0]).not.toHaveProperty('internalStatus');
    expect(JSON.stringify(result)).not.toContain('catalog-sensitive-value');
    expect(JSON.stringify(result)).not.toContain('restricted-tutorial');
  });

  it('encodes the tutorial identifier and maps a complete definition without retaining DTO arrays', async () => {
    const dto = structuredClone(definitionDto);
    const transport = new FakeGeneratedApiTransport(dto);
    const repository = new CoreApiTutorialRepository(transport);

    const result = await repository.getDefinition('query/basics');
    const requiredAction = dto.steps[0]?.requiredAction;
    if (requiredAction !== undefined) {
      requiredAction.accessibleName = 'Changed';
    }
    dto.requiredFeatures.push('GUIDE');

    expect(transport.requests).toEqual([
      { path: '/tutorials/query%2Fbasics', init: { method: 'GET' } },
    ]);
    expect(result).toEqual(definition);
  });

  it('publishes the exact copied definition payload and maps successful publication', async () => {
    const transport = new FakeGeneratedApiTransport({ ok: true });
    const repository = new CoreApiTutorialRepository(transport);

    const result = await repository.publish(definition);

    expect(transport.requests[0]?.path).toBe('/tutorials');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(bodyOf(transport.requests[0])).toEqual(definitionDto);
    expect(result).toEqual({ ok: true });
  });

  it('maps publication-rule violations returned by the Core API', async () => {
    const transport = new FakeGeneratedApiTransport({
      ok: false,
      violations: ['EMPTY_STEPS', 'METADATA_STEP_COUNT_MISMATCH'],
    });
    const repository = new CoreApiTutorialRepository(transport);

    await expect(repository.publish(definition)).resolves.toEqual({
      ok: false,
      violations: ['EMPTY_STEPS', 'METADATA_STEP_COUNT_MISMATCH'],
    });
  });

  it.each([
    new CoreApiError(403, 'Forbidden tutorial query-basics.', 'FEATURE_ACCESS_DENIED'),
    new CoreApiError(404, 'Tutorial query-basics was not found.'),
  ])('conceals inaccessible definition details', async (cause) => {
    const repository = new CoreApiTutorialRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.getDefinition('query-basics')).rejects.toEqual(
      new TutorialAccessError(),
    );
  });

  it('conceals a catalog authorization failure', async () => {
    const repository = new CoreApiTutorialRepository(
      new FakeGeneratedApiTransport(
        new CoreApiError(403, 'Forbidden catalog.', 'FEATURE_ACCESS_DENIED'),
      ),
    );

    await expect(repository.listAccessibleCatalog()).rejects.toEqual(new TutorialAccessError());
  });

  it('translates a publication-rule transport error to TutorialPublicationError', async () => {
    const repository = new CoreApiTutorialRepository(
      new FakeGeneratedApiTransport(new CoreApiError(422, 'Tutorial has no steps.', 'EMPTY_STEPS')),
    );

    await expect(repository.publish(definition)).rejects.toMatchObject({
      constructor: TutorialPublicationError,
      violations: ['EMPTY_STEPS'],
    });
  });

  it.each([new CoreApiError(503, 'Core API unavailable.'), new TypeError('fetch failed')])(
    'translates other transport failures at the repository boundary',
    async (cause) => {
      const repository = new CoreApiTutorialRepository(new FakeGeneratedApiTransport(cause));

      await expect(repository.listAccessibleCatalog()).rejects.toMatchObject({
        constructor: RemoteServiceError,
        cause,
      });
    },
  );
});

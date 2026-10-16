import { describe, expect, it } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { AgentApiSkillRepository } from '@/src/infrastructure/repositories/agent-api-skill.repository';

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
    if (response instanceof Error) throw response;
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const summaryDto = {
  name: 'skill-one',
  description: 'Builds a report',
  namespace: 'reports',
  source: 'project',
};

const detailDto = {
  ...summaryDto,
  body: '# Report\n',
};

const bodyOf = (request: RecordedRequest | undefined): unknown =>
  JSON.parse(String(request?.init?.body));

describe('AgentApiSkillRepository', () => {
  it('lists skills and maps the direct DTO fields without renaming them', async () => {
    const transport = new FakeGeneratedApiTransport([summaryDto]);
    const repository = new AgentApiSkillRepository(transport);

    await expect(repository.list()).resolves.toEqual([summaryDto]);

    expect(transport.requests[0]).toEqual({
      path: '/skills',
      init: { method: 'GET' },
    });
  });

  it('gets a skill with an encoded name and maps its body', async () => {
    const transport = new FakeGeneratedApiTransport(detailDto);
    const repository = new AgentApiSkillRepository(transport);

    await expect(repository.get('a/b')).resolves.toEqual(detailDto);

    expect(transport.requests[0]).toEqual({
      path: '/skills/a%2Fb',
      init: { method: 'GET' },
    });
  });

  it('creates a skill with the exact JSON request body', async () => {
    const transport = new FakeGeneratedApiTransport(detailDto);
    const repository = new AgentApiSkillRepository(transport);
    const input = {
      name: 'skill-one',
      description: 'Builds a report',
      namespace: 'reports',
      body: '# Report\n',
    };

    await expect(repository.create(input)).resolves.toEqual(detailDto);

    expect(transport.requests[0]).toEqual({
      path: '/skills',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    });
  });

  it('updates a skill with an encoded name and excludes the immutable name from the body', async () => {
    const transport = new FakeGeneratedApiTransport(detailDto);
    const repository = new AgentApiSkillRepository(transport);
    const input = {
      name: 'a/b',
      description: 'Updated report',
      namespace: 'reports',
      body: '# Updated report\n',
    };

    await expect(repository.update(input)).resolves.toEqual(detailDto);

    expect(transport.requests[0]).toEqual({
      path: '/skills/a%2Fb',
      init: {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: input.description,
          namespace: input.namespace,
          body: input.body,
        }),
      },
    });
    expect(bodyOf(transport.requests[0])).not.toHaveProperty('name');
  });

  it('deletes a skill with an encoded name and returns undefined for a 204 response', async () => {
    const transport = new FakeGeneratedApiTransport(undefined);
    const repository = new AgentApiSkillRepository(transport);

    await expect(repository.delete('a/b')).resolves.toBeUndefined();

    expect(transport.requests[0]).toEqual({
      path: '/skills/a%2Fb',
      init: { method: 'DELETE' },
    });
  });

  it('translates transport failures before they cross the repository boundary', async () => {
    const cause = new CoreApiError(503, 'Skills API unavailable.');
    const repository = new AgentApiSkillRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.list()).rejects.toMatchObject({
      constructor: RemoteServiceError,
      cause,
    });
  });
});

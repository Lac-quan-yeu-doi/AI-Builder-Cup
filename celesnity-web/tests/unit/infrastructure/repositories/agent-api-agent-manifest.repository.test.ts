import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { AgentApiAgentManifestRepository } from '@/src/infrastructure/repositories/agent-api-agent-manifest.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly calls: Array<{ path: string; method: string; body?: string }> = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.calls.push({
      path,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return this.responses.shift() as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used');
  }
}

const manifest = {
  content_hash: 'abc123',
  description: 'Writes reports.',
  name: 'writer',
  skills: ['reports'],
  source_path: 'agents/writer.yaml',
  yaml: 'name: writer\ndescription: Writes reports.\n',
};

describe('AgentApiAgentManifestRepository', () => {
  it('uses the authenticated agent manifest CRUD API and maps stored YAML', async () => {
    const transport = new FakeTransport([
      [manifest],
      manifest,
      { valid: true, ...manifest },
      manifest,
      undefined,
    ]);
    const repository = new AgentApiAgentManifestRepository(transport);

    await expect(repository.list()).resolves.toEqual([
      {
        contentHash: 'abc123',
        description: 'Writes reports.',
        name: 'writer',
        skills: ['reports'],
        sourcePath: 'agents/writer.yaml',
        yaml: manifest.yaml,
      },
    ]);
    await expect(repository.get('writer')).resolves.toMatchObject({
      name: 'writer',
      yaml: manifest.yaml,
    });
    await expect(repository.validate(manifest.yaml)).resolves.toMatchObject({ name: 'writer' });
    await expect(repository.save({ name: 'writer', yaml: manifest.yaml })).resolves.toMatchObject({
      name: 'writer',
      yaml: manifest.yaml,
    });
    await expect(repository.delete('writer')).resolves.toBeUndefined();

    expect(transport.calls).toEqual([
      { path: '/agent-manifests', method: 'GET' },
      { path: '/agent-manifests/writer', method: 'GET' },
      {
        path: '/agent-manifests/validate',
        method: 'POST',
        body: JSON.stringify({ yaml: manifest.yaml }),
      },
      {
        path: '/agent-manifests/writer',
        method: 'PUT',
        body: JSON.stringify({ yaml: manifest.yaml }),
      },
      { path: '/agent-manifests/writer', method: 'DELETE' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { ScriptMetadata } from '@/src/entities/models/script';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { CoreApiScriptRepository } from '@/src/infrastructure/repositories/core-api-script.repository';

type ScriptResponseDto = components['schemas']['ScriptResponseDto'];
type ScriptSourceResponseDto = components['schemas']['ScriptSourceResponseDto'];
type ScriptVersionResponseDto = components['schemas']['ScriptVersionResponseDto'];

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

const versionDto: ScriptVersionResponseDto = {
  id: 'version-2',
  scriptId: 'script-1',
  versionNumber: 2,
  artifactBucket: 'scripts',
  objectKey: 'script-1/2.py',
  contentSha256: 'sha-2',
  contentSize: 42,
  publishedAt: '2026-08-10T08:00:00.000Z',
};

const scriptDto: ScriptResponseDto = {
  id: 'script-1',
  name: 'Daily export',
  description: 'Exports active customers',
  connectionId: 'connection-1',
  status: 'ACTIVE',
  currentVersion: versionDto,
  createdAt: '2026-08-09T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
};

const mappedVersion = {
  id: 'version-2',
  scriptId: 'script-1',
  versionNumber: 2,
  artifactBucket: 'scripts',
  objectKey: 'script-1/2.py',
  contentSha256: 'sha-2',
  contentSize: 42,
  publishedAt: '2026-08-10T08:00:00.000Z',
} as const;

const mappedScript = {
  id: 'script-1',
  name: 'Daily export',
  description: 'Exports active customers',
  connectionId: 'connection-1',
  status: 'active',
  currentVersion: mappedVersion,
  createdAt: '2026-08-09T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
} as const;

describe('CoreApiScriptRepository metadata operations', () => {
  it('lists scripts and maps every required and optional field to copied entities', async () => {
    const response = [scriptDto];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.listScripts();

    expect(transport.requests).toEqual([{ path: '/scripts', init: { method: 'GET' } }]);
    expect(result).toEqual([mappedScript]);
    expect(result).not.toBe(response);
    expect(result[0]).not.toBe(scriptDto);
    expect(result[0]?.currentVersion).not.toBe(versionDto);
  });

  it('gets one encoded script and omits absent optional fields', async () => {
    const response: ScriptResponseDto = {
      ...scriptDto,
      description: undefined,
      currentVersion: undefined,
    };
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.getScript('script/one');

    expect(transport.requests).toEqual([
      { path: '/scripts/script%2Fone', init: { method: 'GET' } },
    ]);
    expect(result).toEqual({
      id: 'script-1',
      name: 'Daily export',
      connectionId: 'connection-1',
      status: 'active',
      createdAt: '2026-08-09T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:00.000Z',
    });
  });

  it('creates a script with the exact metadata payload and excludes an absent description', async () => {
    const transport = new FakeGeneratedApiTransport(scriptDto, scriptDto);
    const repository = new CoreApiScriptRepository(transport);

    await repository.createScript({
      name: 'Daily export',
      description: 'Exports active customers',
      connectionId: 'connection-1',
    });
    await repository.createScript({ name: 'Daily export', connectionId: 'connection-1' });

    expect(transport.requests).toEqual([
      {
        path: '/scripts',
        init: {
          method: 'POST',
          body: JSON.stringify({
            name: 'Daily export',
            connectionId: 'connection-1',
            description: 'Exports active customers',
          }),
        },
      },
      {
        path: '/scripts',
        init: {
          method: 'POST',
          body: JSON.stringify({ name: 'Daily export', connectionId: 'connection-1' }),
        },
      },
    ]);
  });

  it.each([
    [
      { name: 'Daily export', description: 'Updated', connectionId: 'connection-2' },
      { name: 'Daily export', connectionId: 'connection-2', description: 'Updated' },
    ],
    [
      { name: 'Daily export', connectionId: 'connection-2' },
      { name: 'Daily export', connectionId: 'connection-2', description: null },
    ],
  ] satisfies readonly (readonly [ScriptMetadata, object])[])(
    'patches encoded script metadata and uses null to clear an absent description %#',
    async (metadata, expectedBody) => {
      const transport = new FakeGeneratedApiTransport(scriptDto);
      const repository = new CoreApiScriptRepository(transport);

      await repository.updateScriptMetadata('script/one', metadata);

      expect(transport.requests).toEqual([
        {
          path: '/scripts/script%2Fone',
          init: { method: 'PATCH', body: JSON.stringify(expectedBody) },
        },
      ]);
    },
  );
});

describe('CoreApiScriptRepository version operations', () => {
  it('publishes source with the exact body and maps the returned version', async () => {
    const transport = new FakeGeneratedApiTransport(versionDto);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.publishVersion('script/one', 'print("v2")');

    expect(transport.requests).toEqual([
      {
        path: '/scripts/script%2Fone/versions',
        init: { method: 'POST', body: JSON.stringify({ source: 'print("v2")' }) },
      },
    ]);
    expect(result).toEqual(mappedVersion);
    expect(result).not.toBe(versionDto);
  });

  it('lists versions in transport order and returns copied versions', async () => {
    const response: ScriptVersionResponseDto[] = [
      { ...versionDto, id: 'version-1', versionNumber: 1 },
      versionDto,
    ];
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.listVersions('script/one');

    expect(transport.requests).toEqual([
      { path: '/scripts/script%2Fone/versions', init: { method: 'GET' } },
    ]);
    expect(result.map((item) => item.versionNumber)).toEqual([1, 2]);
    expect(result).not.toBe(response);
    expect(result[0]).not.toBe(response[0]);
    expect(result[1]).not.toBe(response[1]);
  });

  it('loads an exact encoded version source and copies both source and version fields', async () => {
    const response: ScriptSourceResponseDto = { ...versionDto, source: 'print("v2")' };
    const transport = new FakeGeneratedApiTransport(response);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.loadVersionSource('script/one', 2.5);

    expect(transport.requests).toEqual([
      {
        path: '/scripts/script%2Fone/versions/2.5/source',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual({ version: mappedVersion, source: 'print("v2")' });
    expect(result.version).not.toBe(response);
  });
});

describe('CoreApiScriptRepository connections and execution', () => {
  it('lists every verified DBMS as an active-connection option', async () => {
    const response = {
      items: [
        {
          id: 'connection-1',
          name: 'Warehouse',
          connectorType: 'POSTGRESQL',
          configSchemaVersion: 1,
          config: {},
          verificationStatus: 'SUCCEEDED',
          createdAt: '2026-08-09T08:00:00.000Z',
          updatedAt: '2026-08-10T08:00:00.000Z',
        },
        {
          id: 'connection-2',
          name: 'Orders MySQL',
          connectorType: 'MYSQL',
          configSchemaVersion: 1,
          config: {},
          verificationStatus: 'SUCCEEDED',
          createdAt: '2026-08-09T09:00:00.000Z',
          updatedAt: '2026-08-10T09:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 500,
      total: 2,
    };
    const descriptors = [
      { connectorType: 'POSTGRESQL', label: 'PostgreSQL' },
      { connectorType: 'MYSQL', label: 'MySQL' },
    ];
    const transport = new FakeGeneratedApiTransport(response, descriptors);
    const repository = new CoreApiScriptRepository(transport);

    const result = await repository.listActiveConnections();

    expect(transport.requests).toEqual([
      {
        path: '/database-services?verificationStatus=SUCCEEDED&page=1&pageSize=500&sortBy=name&sortDirection=asc',
        init: { method: 'GET' },
      },
      {
        path: '/database-service-connectors',
        init: { method: 'GET' },
      },
    ]);
    expect(result).toEqual([
      {
        id: 'connection-1',
        name: 'Warehouse',
        connectorType: 'POSTGRESQL',
        connectorLabel: 'PostgreSQL',
      },
      {
        id: 'connection-2',
        name: 'Orders MySQL',
        connectorType: 'MYSQL',
        connectorLabel: 'MySQL',
      },
    ]);
    expect(result[0]).not.toBe(response.items[0]);
    expect(result[1]).not.toBe(response.items[1]);
  });

  it.each([
    [
      { executionId: 'execution-1', status: 'QUEUED' },
      { executionId: 'execution-1', status: 'QUEUED' },
    ],
    [
      { id: 'legacy-execution', status: 'RUNNING' },
      { executionId: 'legacy-execution', status: 'RUNNING' },
    ],
    [{}, {}],
  ])(
    'runs an exact version and maps guarded optional execution fields %#',
    async (response, optional) => {
      const transport = new FakeGeneratedApiTransport(response);
      const repository = new CoreApiScriptRepository(transport);

      const result = await repository.runVersion('script/one', 7);

      expect(transport.requests).toEqual([
        {
          path: '/scripts/script%2Fone/versions/7/executions',
          init: { method: 'POST' },
        },
      ]);
      expect(result).toEqual({
        scriptId: 'script/one',
        versionNumber: 7,
        outcome: 'accepted',
        ...optional,
      });
    },
  );

  it.each([null, [], { executionId: 42 }, { status: 42 }])(
    'rejects invalid execution response shapes without leaking transport types %#',
    async (response) => {
      const repository = new CoreApiScriptRepository(new FakeGeneratedApiTransport(response));

      await expect(repository.runVersion('script-1', 2)).rejects.toThrow(/invalid execution/);
    },
  );

  it('maps a missing execution endpoint to the legacy non-fatal unavailable outcome', async () => {
    const cause = new CoreApiError(404, 'Execution endpoint not found.');
    const repository = new CoreApiScriptRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.runVersion('script-1', 2)).resolves.toEqual({
      scriptId: 'script-1',
      versionNumber: 2,
      outcome: 'execution-service-unavailable',
    });
  });

  it.each([new CoreApiError(503, 'Core API unavailable.'), new TypeError('fetch failed')])(
    'translates transport failures at the script repository boundary',
    async (cause) => {
      const repository = new CoreApiScriptRepository(new FakeGeneratedApiTransport(cause));

      await expect(repository.listScripts()).rejects.toMatchObject({
        constructor: RemoteServiceError,
        cause,
      });
    },
  );

  it('translates a Core API 503 from execution while preserving the unavailable 404 special case', async () => {
    const cause = new CoreApiError(503, 'Execution service unavailable.');
    const repository = new CoreApiScriptRepository(new FakeGeneratedApiTransport(cause));

    await expect(repository.runVersion('script-1', 2)).rejects.toMatchObject({
      constructor: RemoteServiceError,
      cause,
    });
  });
});

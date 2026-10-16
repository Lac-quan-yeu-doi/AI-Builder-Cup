import { describe, expect, it } from 'vitest';

import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import { createGetScriptUseCase } from '@/src/application/use-cases/scripts/get-script.use-case';
import { createListActiveConnectionsUseCase } from '@/src/application/use-cases/scripts/list-active-connections.use-case';
import { createListScriptsUseCase } from '@/src/application/use-cases/scripts/list-scripts.use-case';
import { createListScriptVersionsUseCase } from '@/src/application/use-cases/scripts/list-script-versions.use-case';
import { createLoadScriptVersionSourceUseCase } from '@/src/application/use-cases/scripts/load-script-version-source.use-case';
import { createSaveAndRunScriptUseCase } from '@/src/application/use-cases/scripts/save-and-run-script.use-case';
import { createSaveScriptUseCase } from '@/src/application/use-cases/scripts/save-script.use-case';
import { ScriptPublishError, ScriptRunError } from '@/src/entities/errors/application-errors';
import type {
  ActiveConnectionOption,
  EditableScriptDraft,
  PublishedScriptSource,
  RunScriptResult,
  Script,
  ScriptMetadata,
  ScriptVersion,
} from '@/src/entities/models/script';

const publishedAt = '2026-08-10T08:00:00.000Z';

function version(versionNumber: number): ScriptVersion {
  return {
    id: `version-${versionNumber}`,
    scriptId: 'script-1',
    versionNumber,
    artifactBucket: 'scripts',
    objectKey: `script-1/${versionNumber}.py`,
    contentSha256: `sha-${versionNumber}`,
    contentSize: versionNumber * 10,
    publishedAt,
  };
}

function script(overrides: Partial<Script> = {}): Script {
  return {
    id: 'script-1',
    name: 'Daily export',
    description: 'Exports active customers',
    connectionId: 'connection-1',
    status: 'active',
    createdAt: '2026-08-09T08:00:00.000Z',
    updatedAt: '2026-08-09T09:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<EditableScriptDraft> = {}): EditableScriptDraft {
  return {
    name: ' Daily export ',
    description: ' Exports active customers ',
    connectionId: ' connection-1 ',
    source: 'print("customers")',
    ...overrides,
  };
}

class RecordingScriptRepository implements ScriptRepository {
  public scripts: readonly Script[] = [script()];
  public script = script();
  public versions: readonly ScriptVersion[] = [version(1)];
  public source: PublishedScriptSource = { version: version(1), source: 'print("v1")' };
  public connections: readonly ActiveConnectionOption[] = [
    {
      id: 'connection-1',
      name: 'Warehouse',
      connectorType: 'POSTGRESQL',
      connectorLabel: 'PostgreSQL',
    },
  ];
  public createdScript = script({ id: 'created-script' });
  public updatedScript = script({ updatedAt: '2026-08-10T07:00:00.000Z' });
  public publishedVersion = version(4);
  public runResult: RunScriptResult = {
    scriptId: 'script-1',
    versionNumber: 4,
    outcome: 'accepted',
    executionId: 'execution-1',
    status: 'QUEUED',
  };
  public publishFailure?: unknown;
  public runFailure?: unknown;

  public readonly calls: string[] = [];
  public readonly getIds: string[] = [];
  public readonly createdMetadata: ScriptMetadata[] = [];
  public readonly updatedMetadata: { id: string; metadata: ScriptMetadata }[] = [];
  public readonly publishedSources: { scriptId: string; source: string }[] = [];
  public readonly listedVersionIds: string[] = [];
  public readonly loadedSources: { scriptId: string; versionNumber: number }[] = [];
  public readonly runVersions: { scriptId: string; versionNumber: number }[] = [];

  public async listScripts(): Promise<readonly Script[]> {
    this.calls.push('listScripts');
    return this.scripts;
  }

  public async getScript(id: string): Promise<Script> {
    this.calls.push('getScript');
    this.getIds.push(id);
    return this.script;
  }

  public async createScript(metadata: ScriptMetadata): Promise<Script> {
    this.calls.push('createScript');
    this.createdMetadata.push(metadata);
    return this.createdScript;
  }

  public async updateScriptMetadata(id: string, metadata: ScriptMetadata): Promise<Script> {
    this.calls.push('updateScriptMetadata');
    this.updatedMetadata.push({ id, metadata });
    return this.updatedScript;
  }

  public async publishVersion(scriptId: string, source: string): Promise<ScriptVersion> {
    this.calls.push('publishVersion');
    this.publishedSources.push({ scriptId, source });
    if (this.publishFailure !== undefined) {
      throw this.publishFailure;
    }
    return this.publishedVersion;
  }

  public async listVersions(scriptId: string): Promise<readonly ScriptVersion[]> {
    this.calls.push('listVersions');
    this.listedVersionIds.push(scriptId);
    return this.versions;
  }

  public async loadVersionSource(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScriptSource> {
    this.calls.push('loadVersionSource');
    this.loadedSources.push({ scriptId, versionNumber });
    return this.source;
  }

  public async listActiveConnections(): Promise<readonly ActiveConnectionOption[]> {
    this.calls.push('listActiveConnections');
    return this.connections;
  }

  public async runVersion(scriptId: string, versionNumber: number): Promise<RunScriptResult> {
    this.calls.push('runVersion');
    this.runVersions.push({ scriptId, versionNumber });
    if (this.runFailure !== undefined) {
      throw this.runFailure;
    }
    return { ...this.runResult, scriptId, versionNumber };
  }
}

describe('script read use cases', () => {
  it('delegates list, get, source, and active-connection reads unchanged', async () => {
    const repository = new RecordingScriptRepository();

    const scripts = await createListScriptsUseCase(repository)();
    const loaded = await createGetScriptUseCase(repository)('script/one');
    const source = await createLoadScriptVersionSourceUseCase(repository)('script/one', 7);
    const connections = await createListActiveConnectionsUseCase(repository)();

    expect(scripts).toBe(repository.scripts);
    expect(loaded).toBe(repository.script);
    expect(source).toBe(repository.source);
    expect(connections).toBe(repository.connections);
    expect(repository.getIds).toEqual(['script/one']);
    expect(repository.loadedSources).toEqual([{ scriptId: 'script/one', versionNumber: 7 }]);
    expect(repository.calls).toEqual([
      'listScripts',
      'getScript',
      'loadVersionSource',
      'listActiveConnections',
    ]);
  });

  it('sorts versions descending without mutating or replacing the repository source', async () => {
    const repository = new RecordingScriptRepository();
    const source = [version(1), version(3), version(2)] as const;
    repository.versions = source;

    const result = await createListScriptVersionsUseCase(repository)('script-1');

    expect(result.map((item) => item.versionNumber)).toEqual([3, 2, 1]);
    expect(repository.versions).toBe(source);
    expect(source.map((item) => item.versionNumber)).toEqual([1, 3, 2]);
    expect(repository.listedVersionIds).toEqual(['script-1']);
  });
});

describe('save script use case', () => {
  it('normalizes and creates new metadata before publishing the draft source', async () => {
    const repository = new RecordingScriptRepository();
    repository.publishedVersion = {
      ...version(1),
      scriptId: repository.createdScript.id,
      publishedAt: '2026-08-10T10:00:00.000Z',
    };

    const result = await createSaveScriptUseCase(repository)(draft());

    expect(repository.calls).toEqual(['createScript', 'publishVersion']);
    expect(repository.createdMetadata).toEqual([
      {
        name: 'Daily export',
        description: 'Exports active customers',
        connectionId: 'connection-1',
      },
    ]);
    expect(repository.publishedSources).toEqual([
      { scriptId: 'created-script', source: 'print("customers")' },
    ]);
    expect(result).toEqual({
      script: {
        ...repository.createdScript,
        currentVersion: repository.publishedVersion,
        updatedAt: repository.publishedVersion.publishedAt,
      },
      version: repository.publishedVersion,
    });
  });

  it('skips unchanged metadata and still publishes using the existing script object', async () => {
    const repository = new RecordingScriptRepository();
    const persisted = script();

    const result = await createSaveScriptUseCase(repository)(
      draft({ scriptId: persisted.id }),
      persisted,
    );

    expect(repository.calls).toEqual(['publishVersion']);
    expect(repository.createdMetadata).toEqual([]);
    expect(repository.updatedMetadata).toEqual([]);
    expect(repository.publishedSources).toEqual([
      { scriptId: persisted.id, source: 'print("customers")' },
    ]);
    expect(result.script).toEqual({
      ...persisted,
      currentVersion: repository.publishedVersion,
      updatedAt: repository.publishedVersion.publishedAt,
    });
  });

  it('updates changed normalized metadata before publishing', async () => {
    const repository = new RecordingScriptRepository();
    const persisted = script();
    const changed = draft({
      scriptId: persisted.id,
      name: ' Renamed export ',
      description: '   ',
      connectionId: ' connection-2 ',
    });

    await createSaveScriptUseCase(repository)(changed, persisted);

    expect(repository.calls).toEqual(['updateScriptMetadata', 'publishVersion']);
    expect(repository.updatedMetadata).toEqual([
      {
        id: persisted.id,
        metadata: { name: 'Renamed export', connectionId: 'connection-2' },
      },
    ]);
    expect(repository.publishedSources).toEqual([
      { scriptId: repository.updatedScript.id, source: changed.source },
    ]);
  });

  it.each([
    [
      draft({ scriptId: 'different-script' }),
      script(),
      'The editable draft no longer matches the loaded script.',
    ],
    [draft(), script(), 'A new draft cannot overwrite an existing script.'],
  ])(
    'rejects a mismatched draft identity before persisting %#',
    async (editable, persisted, message) => {
      const repository = new RecordingScriptRepository();

      await expect(createSaveScriptUseCase(repository)(editable, persisted)).rejects.toThrow(
        message,
      );

      expect(repository.calls).toEqual([]);
    },
  );

  it('throws ScriptPublishError with the persisted script after publish failure', async () => {
    const repository = new RecordingScriptRepository();
    const reason = new Error('artifact store unavailable');
    repository.publishFailure = reason;

    const promise = createSaveScriptUseCase(repository)(draft());

    await expect(promise).rejects.toMatchObject({
      constructor: ScriptPublishError,
      persistedScript: repository.createdScript,
      reason,
      cause: reason,
    });
    expect(repository.calls).toEqual(['createScript', 'publishVersion']);
  });
});

describe('save and run script use case', () => {
  it('runs the exact newly published version after saving', async () => {
    const repository = new RecordingScriptRepository();
    repository.publishedVersion = {
      ...version(42),
      scriptId: repository.createdScript.id,
    };

    const result = await createSaveAndRunScriptUseCase(repository)(draft());

    expect(repository.calls).toEqual(['createScript', 'publishVersion', 'runVersion']);
    expect(repository.runVersions).toEqual([
      { scriptId: repository.createdScript.id, versionNumber: 42 },
    ]);
    expect(result.saved.version).toBe(repository.publishedVersion);
    expect(result.run).toEqual({
      ...repository.runResult,
      scriptId: repository.createdScript.id,
      versionNumber: 42,
    });
  });

  it('throws ScriptRunError with the complete saved result after run failure', async () => {
    const repository = new RecordingScriptRepository();
    const reason = new Error('execution queue unavailable');
    repository.runFailure = reason;

    const promise = createSaveAndRunScriptUseCase(repository)(draft());

    await expect(promise).rejects.toMatchObject({
      constructor: ScriptRunError,
      saved: {
        script: {
          ...repository.createdScript,
          currentVersion: repository.publishedVersion,
          updatedAt: repository.publishedVersion.publishedAt,
        },
        version: repository.publishedVersion,
      },
      reason,
      cause: reason,
    });
    expect(repository.calls).toEqual(['createScript', 'publishVersion', 'runVersion']);
  });
});

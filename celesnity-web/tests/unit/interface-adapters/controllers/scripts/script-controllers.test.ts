import { describe, expect, it } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  ActiveConnectionOption,
  EditableScriptDraft,
  PublishedScriptSource,
  SaveAndRunScriptResult,
  SaveScriptResult,
  Script,
  ScriptVersion,
} from '@/src/entities/models/script';
import { createGetScriptController } from '@/src/interface-adapters/controllers/scripts/get-script.controller';
import { createListActiveConnectionsController } from '@/src/interface-adapters/controllers/scripts/list-active-connections.controller';
import { createListScriptsController } from '@/src/interface-adapters/controllers/scripts/list-scripts.controller';
import { createListScriptVersionsController } from '@/src/interface-adapters/controllers/scripts/list-script-versions.controller';
import { createLoadScriptVersionSourceController } from '@/src/interface-adapters/controllers/scripts/load-script-version-source.controller';
import { createSaveAndRunScriptController } from '@/src/interface-adapters/controllers/scripts/save-and-run-script.controller';
import { createSaveScriptController } from '@/src/interface-adapters/controllers/scripts/save-script.controller';

const version: ScriptVersion = {
  id: 'version-2',
  scriptId: 'script-1',
  versionNumber: 2,
  artifactBucket: 'scripts',
  objectKey: 'script-1/2.py',
  contentSha256: 'sha-2',
  contentSize: 42,
  publishedAt: '2026-08-10T08:00:00.000Z',
};

const script: Script = {
  id: 'script-1',
  name: 'Daily export',
  description: 'Exports active customers',
  connectionId: 'connection-1',
  status: 'active',
  currentVersion: version,
  createdAt: '2026-08-09T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
};

const source: PublishedScriptSource = { version, source: 'print("v2")' };
const connections: readonly ActiveConnectionOption[] = [
  {
    id: 'connection-1',
    name: 'Warehouse',
    connectorType: 'POSTGRESQL',
    connectorLabel: 'PostgreSQL',
  },
];
const saved: SaveScriptResult = { script, version };
const savedAndRun: SaveAndRunScriptResult = {
  saved,
  run: {
    scriptId: 'script-1',
    versionNumber: 2,
    outcome: 'accepted',
    executionId: 'execution-1',
    status: 'QUEUED',
  },
};

describe('script read controllers', () => {
  it('lists scripts once and presents copied scripts with copied current versions', async () => {
    let calls = 0;
    const scripts = [script] as const;
    const controller = createListScriptsController(async () => {
      calls += 1;
      return scripts;
    });

    const result = await controller();

    expect(calls).toBe(1);
    expect(result).toEqual(scripts);
    expect(result).not.toBe(scripts);
    expect(result[0]).not.toBe(script);
    expect(result[0]?.currentVersion).not.toBe(version);
  });

  it('gets a script without introducing a minimum identifier length', async () => {
    const received: string[] = [];
    const controller = createGetScriptController(async (id) => {
      received.push(id);
      return script;
    });

    const result = await controller('');

    expect(received).toEqual(['']);
    expect(result).toEqual(script);
    expect(result).not.toBe(script);
    expect(result.currentVersion).not.toBe(version);
  });

  it('rejects a non-string script identifier before invoking get', async () => {
    let calls = 0;
    const controller = createGetScriptController(async () => {
      calls += 1;
      return script;
    });

    await expect(controller(42 as unknown as string)).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('lists versions with an unchanged empty identifier and presents copied items', async () => {
    const received: string[] = [];
    const versions = [version] as const;
    const controller = createListScriptVersionsController(async (scriptId) => {
      received.push(scriptId);
      return versions;
    });

    const result = await controller('');

    expect(received).toEqual(['']);
    expect(result).toEqual(versions);
    expect(result).not.toBe(versions);
    expect(result[0]).not.toBe(version);
  });

  it('loads a fractional version number without adding integer or positivity rules', async () => {
    const received: { scriptId: string; versionNumber: number }[] = [];
    const controller = createLoadScriptVersionSourceController(async (scriptId, versionNumber) => {
      received.push({ scriptId, versionNumber });
      return source;
    });

    const result = await controller(' ', -2.5);

    expect(received).toEqual([{ scriptId: ' ', versionNumber: -2.5 }]);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.version).not.toBe(version);
  });

  it('rejects invalid version-source identifiers before invoking the use case', async () => {
    let calls = 0;
    const controller = createLoadScriptVersionSourceController(async () => {
      calls += 1;
      return source;
    });

    await expect(controller('script-1', '2' as unknown as number)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(calls).toBe(0);
  });

  it('lists active connections once and presents copied options', async () => {
    let calls = 0;
    const controller = createListActiveConnectionsController(async () => {
      calls += 1;
      return connections;
    });

    const result = await controller();

    expect(calls).toBe(1);
    expect(result).toEqual(connections);
    expect(result).not.toBe(connections);
    expect(result[0]).not.toBe(connections[0]);
  });
});

describe('script write controllers', () => {
  it('forwards a valid draft without trimming or tightening strings and copies the save result', async () => {
    const editable: EditableScriptDraft = {
      scriptId: '',
      name: ' ',
      description: '',
      connectionId: '',
      source: '',
      viewedVersionNumber: -1.5,
    };
    const received: { draft: EditableScriptDraft; persisted?: Script }[] = [];
    const controller = createSaveScriptController(async (draft, persisted) => {
      received.push({ draft, ...(persisted ? { persisted } : {}) });
      return saved;
    });

    const result = await controller(editable, script);

    expect(received).toEqual([{ draft: editable, persisted: script }]);
    expect(result).toEqual(saved);
    expect(result).not.toBe(saved);
    expect(result.script).not.toBe(script);
    expect(result.script.currentVersion).not.toBe(version);
    expect(result.version).not.toBe(version);
  });

  it('rejects an invalid editable draft before invoking save', async () => {
    let calls = 0;
    const controller = createSaveScriptController(async () => {
      calls += 1;
      return saved;
    });

    await expect(
      controller({ ...({} as EditableScriptDraft), name: 42 } as unknown as EditableScriptDraft),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });

  it('forwards save-and-run once and presents copied save and run results', async () => {
    const editable: EditableScriptDraft = {
      name: 'Daily export',
      connectionId: 'connection-1',
      source: 'print("customers")',
    };
    const received: { draft: EditableScriptDraft; persisted?: Script }[] = [];
    const controller = createSaveAndRunScriptController(async (draft, persisted) => {
      received.push({ draft, ...(persisted ? { persisted } : {}) });
      return savedAndRun;
    });

    const result = await controller(editable);

    expect(received).toEqual([{ draft: editable }]);
    expect(result).toEqual(savedAndRun);
    expect(result).not.toBe(savedAndRun);
    expect(result.saved).not.toBe(savedAndRun.saved);
    expect(result.saved.script).not.toBe(script);
    expect(result.saved.version).not.toBe(version);
    expect(result.run).not.toBe(savedAndRun.run);
  });

  it('rejects an invalid optional draft identifier before invoking save-and-run', async () => {
    let calls = 0;
    const controller = createSaveAndRunScriptController(async () => {
      calls += 1;
      return savedAndRun;
    });
    const invalid = {
      name: 'Daily export',
      connectionId: 'connection-1',
      source: 'print("customers")',
      scriptId: 42,
    } as unknown as EditableScriptDraft;

    await expect(controller(invalid)).rejects.toBeInstanceOf(InputParseError);
    expect(calls).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import { releaseMonitor } from '@/app/_components/shared/monitor-lifecycle';
import { describeScriptSaveFailure } from '@/app/(workspace)/scripts/_components/script-save-failure';
import {
  RemoteServiceError,
  ScriptPublishError,
  ScriptRunError,
} from '@/src/entities/errors/application-errors';
import type { SaveScriptResult, Script, ScriptVersion } from '@/src/entities/models/script';

const version: ScriptVersion = {
  id: 'version-2',
  scriptId: 'script-1',
  versionNumber: 2,
  artifactBucket: 'scripts',
  objectKey: 'script-1/2.py',
  contentSha256: 'abc123',
  contentSize: 42,
  publishedAt: '2026-08-10T12:00:00.000Z',
};

const script: Script = {
  id: 'script-1',
  name: 'Orders',
  connectionId: 'connection-1',
  status: 'active',
  currentVersion: version,
  createdAt: '2026-08-10T11:00:00.000Z',
  updatedAt: '2026-08-10T12:00:00.000Z',
};

const saved: SaveScriptResult = { script, version };

describe('UI lifecycle and race adapters', () => {
  it('closes and clears a live monitor during replacement or cleanup', () => {
    const close = vi.fn();

    expect(releaseMonitor({ close })).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(releaseMonitor(null)).toBeNull();
  });

  it('rejects stale async responses while accepting the active request token', () => {
    expect(isCurrentRequestToken(3, 2)).toBe(false);
    expect(isCurrentRequestToken(3, 3)).toBe(true);
  });
});

describe('script partial-success feedback', () => {
  it('retains a saved version when execution startup fails', () => {
    const failure = describeScriptSaveFailure(
      new ScriptRunError(saved, new RemoteServiceError('Execution service offline')),
    );

    expect(failure).toEqual({
      kind: 'run',
      saved,
      message: 'Version 2 was saved, but its execution could not start. Execution service offline',
    });
  });

  it('retains persisted metadata when source publication fails', () => {
    const failure = describeScriptSaveFailure(
      new ScriptPublishError(script, new RemoteServiceError('Artifact store offline')),
    );

    expect(failure).toEqual({
      kind: 'publish',
      persistedScript: script,
      message:
        'Metadata was saved, but the source version could not be published. Artifact store offline',
    });
  });

  it('preserves the generic save fallback without inventing partial success', () => {
    expect(describeScriptSaveFailure({ reason: 'unknown' })).toEqual({
      kind: 'other',
      message: 'The script could not be saved. Check the Core API and try again.',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  InputParseError,
  NotFoundError,
  RemoteServiceError,
  ScriptPublishError,
  ScriptRunError,
  TutorialAccessError,
  TutorialPublicationError,
} from '@/src/entities/errors/application-errors';
import type { PublicationViolation } from '@/src/entities/errors/application-errors';
import type { SaveScriptResult, Script } from '@/src/entities/models/script';

const persistedScript: Script = {
  id: 'script-1',
  name: 'Orders report',
  connectionId: 'connection-1',
  status: 'active',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

const savedScript: SaveScriptResult = {
  script: persistedScript,
  version: {
    id: 'version-1',
    scriptId: persistedScript.id,
    versionNumber: 1,
    artifactBucket: 'scripts',
    objectKey: 'script-1/1.sql',
    contentSha256: 'sha256',
    contentSize: 8,
    publishedAt: '2026-08-10T00:00:00.000Z',
  },
};

describe('application errors', () => {
  it.each([
    [new InputParseError('invalid'), 'InputParseError'],
    [new NotFoundError('missing'), 'NotFoundError'],
    [new ConflictError('conflict'), 'ConflictError'],
    [new RemoteServiceError('offline'), 'RemoteServiceError'],
  ])('exposes a stable domain-safe name', (error, name) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
  });

  it('carries every tutorial publication violation in an immutable snapshot', () => {
    const violations: PublicationViolation[] = [
      'MISSING_ID',
      'EMPTY_STEPS',
      'METADATA_STEP_COUNT_MISMATCH',
    ];
    const error = new TutorialPublicationError(violations);

    violations.push('AMBIGUOUS_TARGET');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TutorialPublicationError');
    expect(error.message).toBe(
      'Tutorial publication was rejected because its definition is invalid.',
    );
    expect(error.violations).toEqual(['MISSING_ID', 'EMPTY_STEPS', 'METADATA_STEP_COUNT_MISMATCH']);
    expect(Object.isFrozen(error.violations)).toBe(true);
  });

  it('reports tutorial access loss without carrying inaccessible details', () => {
    const error = new TutorialAccessError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TutorialAccessError');
    expect(error.message).toBe('Tutorial access is unavailable.');
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('tutorialId');
    expect(error).not.toHaveProperty('tutorialName');
    expect(error).not.toHaveProperty('metadata');
  });

  it('preserves script metadata when publishing its source fails', () => {
    const reason = new Error('object storage offline');
    const error = new ScriptPublishError(persistedScript, reason);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ScriptPublishError');
    expect(error.message).toBe(
      'The script metadata was saved, but its source version could not be published.',
    );
    expect(error.persistedScript).toBe(persistedScript);
    expect(error.reason).toBe(reason);
    expect(error.cause).toBe(reason);
  });

  it('preserves the saved script version when starting its execution fails', () => {
    const reason = new Error('execution service offline');
    const error = new ScriptRunError(savedScript, reason);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ScriptRunError');
    expect(error.message).toBe(
      'The script version was saved, but its execution could not be started.',
    );
    expect(error.saved).toBe(savedScript);
    expect(error.reason).toBe(reason);
    expect(error.cause).toBe(reason);
  });
});

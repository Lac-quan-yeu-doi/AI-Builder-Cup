import { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import { ScriptEventName } from '@domain/script-authoring/events/script.events';
import {
  ArtifactLocation,
  ArtifactVersionId,
  ScriptDescription,
  ScriptId,
  ScriptName,
  ScriptVersionId,
  SourceHash,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import { SequentialIdGenerator } from '@tests/support/deterministic-ports';

/**
 * The Script aggregate, whose central invariant is that versions form an unbroken,
 * strictly increasing sequence and that each one lives at a deterministic object
 * key derived from the script id and version number.
 *
 * That determinism is what lets the integrity checks elsewhere recompute an
 * expected location rather than trusting a stored one, so the tests that pin it
 * down are protecting a security property, not just a naming convention.
 */

const SCRIPT_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_CONNECTION_ID = '88888888-8888-4888-8888-888888888888';
const ARTIFACTS_BUCKET = 'celesnity-artifacts';
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');
const LATER = new Date('2026-08-04T10:00:00.000Z');

const scriptId = ScriptId.from(SCRIPT_ID);

function ids(): SequentialIdGenerator {
  return new SequentialIdGenerator();
}

function version(
  versionNumber: number,
  overrides: { readonly scriptId?: ScriptId; readonly publishedAt?: Date } = {},
): ScriptVersion {
  const owner = overrides.scriptId ?? scriptId;
  const number = VersionNumber.create(versionNumber);
  return ScriptVersion.publish({
    id: ScriptVersionId.from(
      `66666666-6666-4666-8666-${versionNumber.toString().padStart(12, '0')}`,
    ),
    scriptId: owner,
    versionNumber: number,
    artifactLocation: ArtifactLocation.forVersion(ARTIFACTS_BUCKET, owner, number),
    artifactVersionId: ArtifactVersionId.create(`object-version-${versionNumber}`),
    sourceHash: SourceHash.fromSha256('a'.repeat(64)),
    contentSize: 42,
    publishedAt: overrides.publishedAt ?? LATER,
  });
}

interface StoredOverrides {
  readonly currentVersion?: ScriptVersion;
  readonly revision?: number;
  readonly archivedAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * `updatedAt` defaults to the current version's publication time, because the
 * aggregate refuses to rehydrate a script whose current version postdates its last
 * update. Defaulting it keeps that invariant out of the way of tests that are about
 * something else, while still letting a test set it explicitly to assert it.
 */
function stored(overrides: StoredOverrides = {}): Script {
  const currentVersion = overrides.currentVersion;
  return Script.rehydrate({
    id: scriptId,
    name: ScriptName.create('nightly rollup'),
    description: ScriptDescription.create('rolls up yesterday'),
    connectionId: CONNECTION_ID,
    artifactBucket: ARTIFACTS_BUCKET,
    artifactPrefix: ArtifactLocation.prefixFor(scriptId),
    revision: overrides.revision ?? 0,
    currentVersion,
    archivedAt: overrides.archivedAt,
    createdAt: CREATED_AT,
    updatedAt: overrides.updatedAt ?? currentVersion?.publishedAt ?? CREATED_AT,
  });
}

describe('Script.create', () => {
  function create(revision: number, currentVersion?: ScriptVersion): Script {
    return Script.create(
      {
        id: scriptId,
        name: ScriptName.create('nightly rollup'),
        description: ScriptDescription.create(undefined),
        connectionId: CONNECTION_ID,
        artifactBucket: ARTIFACTS_BUCKET,
        artifactPrefix: ArtifactLocation.prefixFor(scriptId),
        revision,
        currentVersion,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      ids().next(),
    );
  }

  it('starts as a draft at revision zero and raises Created', () => {
    const script = create(0);

    expect(script.revision).toBe(0);
    expect(script.currentVersion).toBeUndefined();
    expect(script.pullDomainEvents()[0]?.eventName).toBe(ScriptEventName.Created);
  });

  it('refuses a new script that already claims a revision', () => {
    expect(() => create(1)).toThrow(ScriptError);
  });

  it('refuses a new script that already claims a published version', () => {
    expect(() => create(0, version(1))).toThrow(ScriptError);
  });

  it('refuses an artifact prefix that does not derive from the script id', () => {
    // The prefix is recomputed everywhere it is used, so accepting an arbitrary
    // one would let a script's artifacts live under another script's path.
    expect(() =>
      Script.create(
        {
          id: scriptId,
          name: ScriptName.create('nightly rollup'),
          description: ScriptDescription.create(undefined),
          connectionId: CONNECTION_ID,
          artifactBucket: ARTIFACTS_BUCKET,
          artifactPrefix: 'scripts/somewhere-else',
          revision: 0,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
        ids().next(),
      ),
    ).toThrow(ScriptError);
  });
});

describe('Script.changeMetadata', () => {
  function change(
    script: Script,
    overrides: Partial<Parameters<Script['changeMetadata']>[0]> = {},
  ): boolean {
    return script.changeMetadata({
      name: script.name,
      description: script.description,
      connectionId: script.connectionId,
      changedAt: LATER,
      eventId: ids().next(),
      ...overrides,
    });
  }

  it('reports false and stays silent when nothing changed', () => {
    const script = stored();

    expect(change(script)).toBe(false);
    expect(script.pullDomainEvents()).toHaveLength(0);
    expect(script.revision).toBe(0);
  });

  it('bumps the revision when the name changes, so the guard sees a new value', () => {
    const script = stored();

    expect(change(script, { name: ScriptName.create('renamed') })).toBe(true);
    expect(script.revision).toBe(1);
    expect(script.pullDomainEvents()[0]?.eventName).toBe(ScriptEventName.MetadataChanged);
  });

  it('detects a description change', () => {
    const script = stored();

    expect(change(script, { description: ScriptDescription.create('something else') })).toBe(true);
  });

  it('detects clearing the description', () => {
    const script = stored();

    expect(change(script, { description: ScriptDescription.create(undefined) })).toBe(true);
  });

  it('detects a connection change', () => {
    const script = stored();

    expect(change(script, { connectionId: OTHER_CONNECTION_ID })).toBe(true);
    expect(script.connectionId).toBe(OTHER_CONNECTION_ID);
  });

  it('rejects a malformed connection id', () => {
    const script = stored();

    expect(() => change(script, { connectionId: 'not-a-uuid' })).toThrow(ScriptError);
  });

  it('refuses a change timestamped before the last update', () => {
    // Timestamps only move forward, so an out-of-order write is a bug rather
    // than something to silently absorb.
    const script = stored({ updatedAt: LATER });

    expect(() =>
      change(script, { name: ScriptName.create('renamed'), changedAt: CREATED_AT }),
    ).toThrow(ScriptError);
  });

  it('refuses to change an archived script', () => {
    const script = stored({ archivedAt: LATER });

    expect(() => change(script, { name: ScriptName.create('renamed') })).toThrow(ScriptError);
  });
});

describe('Script.publishVersion', () => {
  it('numbers the first version 1', () => {
    expect(stored().nextVersionNumber().value).toBe(1);
  });

  it('numbers each later version one above the current one', () => {
    const script = stored({ currentVersion: version(3), revision: 3 });

    expect(script.nextVersionNumber().value).toBe(4);
  });

  it('publishes the first version and raises VersionPublished', () => {
    const script = stored();

    script.publishVersion(version(1), ids().next());

    expect(script.currentVersion?.versionNumber.value).toBe(1);
    expect(script.revision).toBe(1);
    expect(script.pullDomainEvents()[0]?.eventName).toBe(ScriptEventName.VersionPublished);
  });

  it('refuses a version that skips a number', () => {
    // A gap would break the "unbroken sequence" invariant the version history
    // relies on.
    const script = stored();

    expect(() => {
      script.publishVersion(version(2), ids().next());
    }).toThrow(ScriptError);
  });

  it('refuses to republish the current version number', () => {
    const script = stored({ currentVersion: version(1), revision: 1 });

    expect(() => {
      script.publishVersion(version(1), ids().next());
    }).toThrow(ScriptError);
  });

  it('refuses a version belonging to another script', () => {
    const script = stored();
    const foreign = version(1, {
      scriptId: ScriptId.from('99999999-9999-4999-8999-999999999999'),
    });

    expect(() => {
      script.publishVersion(foreign, ids().next());
    }).toThrow(ScriptError);
  });

  it('refuses a version whose artifact location is not the derived one', () => {
    const script = stored();
    const number = VersionNumber.create(1);
    const misplaced = ScriptVersion.publish({
      id: ScriptVersionId.from('66666666-6666-4666-8666-000000000001'),
      scriptId,
      versionNumber: number,
      // A different bucket means a different derived location, so the aggregate
      // rejects it rather than recording a pointer it cannot recompute.
      artifactLocation: ArtifactLocation.forVersion('other-bucket', scriptId, number),
      artifactVersionId: ArtifactVersionId.create('object-version-1'),
      sourceHash: SourceHash.fromSha256('a'.repeat(64)),
      contentSize: 42,
      publishedAt: LATER,
    });

    expect(() => {
      script.publishVersion(misplaced, ids().next());
    }).toThrow(ScriptError);
  });

  it('refuses to publish to an archived script', () => {
    const script = stored({ archivedAt: LATER });

    expect(() => {
      script.publishVersion(version(1), ids().next());
    }).toThrow(ScriptError);
  });

  it('advances the revision once per publication', () => {
    const generator = ids();
    const script = stored();

    script.publishVersion(version(1), generator.next());
    script.publishVersion(version(2), generator.next());

    expect(script.revision).toBe(2);
    expect(script.currentVersion?.versionNumber.value).toBe(2);
  });
});

describe('Script.archive', () => {
  it('archives and raises Archived', () => {
    const script = stored();

    script.archive(LATER, ids().next());

    expect(script.isArchived).toBe(true);
    expect(script.pullDomainEvents()[0]?.eventName).toBe(ScriptEventName.Archived);
  });

  it('refuses to archive twice', () => {
    const generator = ids();
    const script = stored();
    script.archive(LATER, generator.next());

    expect(() => {
      script.archive(LATER, generator.next());
    }).toThrow(ScriptError);
  });
});

describe('Script.rehydrate invariants', () => {
  it('rejects an update time before creation', () => {
    expect(() =>
      Script.rehydrate({
        id: scriptId,
        name: ScriptName.create('nightly rollup'),
        description: ScriptDescription.create(undefined),
        connectionId: CONNECTION_ID,
        artifactBucket: ARTIFACTS_BUCKET,
        artifactPrefix: ArtifactLocation.prefixFor(scriptId),
        revision: 0,
        createdAt: LATER,
        updatedAt: CREATED_AT,
      }),
    ).toThrow(ScriptError);
  });

  it('rejects a current version numbered above the revision', () => {
    expect(() => stored({ currentVersion: version(5), revision: 1 })).toThrow(ScriptError);
  });

  it('rejects a current version published after the script was last updated', () => {
    expect(() =>
      stored({
        currentVersion: version(1, { publishedAt: LATER }),
        revision: 1,
        updatedAt: CREATED_AT,
      }),
    ).toThrow(ScriptError);
  });
});

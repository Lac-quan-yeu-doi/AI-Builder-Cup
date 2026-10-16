import { toDatabaseServiceView } from '@application/database-service/read-models/database-service.projection';
import { toExecutionView } from '@application/execution-orchestration/read-models/execution.projection';
import {
  toScriptVersionView,
  toScriptView,
} from '@application/script-authoring/read-models/script.projection';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import {
  ExecutionId,
  ExecutionStatusValue,
  LogLocation,
  ResourceProfile,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptVersion } from '@domain/script-authoring/entities/script-version';
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
 * The aggregate-to-view projections that replaced the write-then-read round trip.
 *
 * Two things are being protected. First, that a command's response reflects what it
 * just committed — the previous shape re-read the row through the read model, which
 * against a lagging replica could return a state other than the one just written.
 * Second, that projecting from an aggregate does not leak anything the read side
 * would have withheld: the connection view must not carry the credential.
 */

const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');
const CONNECTION_ID = '77777777-7777-4777-8777-777777777777';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const SCRIPT_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACTS_BUCKET = 'celesnity-artifacts';

describe('toDatabaseServiceView', () => {
  function connection(verification: VerificationState): DatabaseService {
    return DatabaseService.rehydrate({
      id: ConnectionId.from(CONNECTION_ID),
      name: ConnectionName.create('analytics'),
      connectorType: ConnectorType.create('POSTGRESQL'),
      config: NormalizedConnectionConfig.create(1, {
        databaseName: 'analytics',
        host: 'db.internal',
        options: { applicationName: 'celesnity' },
        port: 6432,
        sslMode: 'require',
        username: 'alice',
      }),
      credential: CredentialReference.create({
        ciphertext: 'SUPER-SECRET-CIPHERTEXT',
        initializationVector: 'SECRET-IV',
        authenticationTag: 'SECRET-TAG',
        keyVersion: 'v1',
      }),
      verification,
      credentialSchemaVersion: 1,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  }

  it('projects the non-secret fields', () => {
    expect(toDatabaseServiceView(connection(VerificationState.untested()))).toEqual({
      id: CONNECTION_ID,
      name: 'analytics',
      databaseNames: [],
      connectorType: 'POSTGRESQL',
      configSchemaVersion: 1,
      config: {
        databaseName: 'analytics',
        host: 'db.internal',
        options: { applicationName: 'celesnity' },
        port: 6432,
        sslMode: 'require',
        username: 'alice',
      },
      summary: [
        { key: 'databaseName', label: 'Database Name', value: 'analytics' },
        { key: 'host', label: 'Host', value: 'db.internal' },
        { key: 'options', label: 'Options', value: '{"applicationName":"celesnity"}' },
        { key: 'port', label: 'Port', value: '6432' },
        { key: 'sslMode', label: 'Ssl Mode', value: 'require' },
        { key: 'username', label: 'Username', value: 'alice' },
      ],
      verificationStatus: VerificationStatusValue.UNTESTED,
      lastTestedAt: undefined,
      lastTestError: undefined,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('never carries any part of the credential', () => {
    const serialized = JSON.stringify(
      toDatabaseServiceView(connection(VerificationState.untested())),
    );

    expect(serialized).not.toContain('SUPER-SECRET-CIPHERTEXT');
    expect(serialized).not.toContain('SECRET-IV');
    expect(serialized).not.toContain('SECRET-TAG');
  });

  it('includes the test timestamp once a verification has run', () => {
    const view = toDatabaseServiceView(connection(VerificationState.succeeded(CREATED_AT)));

    expect(view.verificationStatus).toBe(VerificationStatusValue.SUCCEEDED);
    expect(view.lastTestedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('includes the failure reason for a failed verification', () => {
    const view = toDatabaseServiceView(
      connection(VerificationState.failed(CREATED_AT, 'connection refused')),
    );

    expect(view.lastTestError).toBe('connection refused');
  });
});

describe('toExecutionView', () => {
  function execution(): Execution {
    return Execution.rehydrate({
      id: ExecutionId.from(EXECUTION_ID),
      scriptId: SCRIPT_ID,
      scriptVersionId: '44444444-4444-4444-8444-444444444444',
      connectionId: '55555555-5555-4555-8555-555555555555',
      status: ExecutionStatusValue.CANCELLING,
      resourceProfile: ResourceProfile.create({
        driverMemory: '2g',
        executorMemory: '1g',
        executorCores: 2,
        maxCores: 4,
      }),
      logLocation: LogLocation.forExecution(ARTIFACTS_BUCKET, ExecutionId.from(EXECUTION_ID)),
      queuedAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  }

  it('projects the aggregate state, including the resource profile', () => {
    const view = toExecutionView(execution(), ARTIFACTS_BUCKET);

    expect(view.id).toBe(EXECUTION_ID);
    expect(view.status).toBe(ExecutionStatusValue.CANCELLING);
    expect(view.resourceProfile).toEqual({
      driverMemory: '2g',
      executorMemory: '1g',
      executorCores: 2,
      maxCores: 4,
    });
  });

  it('formats every timestamp as ISO 8601 and omits the absent ones', () => {
    const view = toExecutionView(execution(), ARTIFACTS_BUCKET);

    expect(view.queuedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(view.startedAt).toBeUndefined();
    expect(view.finishedAt).toBeUndefined();
    expect(view.cancelledAt).toBeUndefined();
  });

  it('reports the log location the aggregate holds', () => {
    const view = toExecutionView(execution(), ARTIFACTS_BUCKET);

    expect(view.logBucket).toBe(ARTIFACTS_BUCKET);
    expect(view.logObjectKey).toBe(`executions/${EXECUTION_ID}/logs/execution.log`);
  });

  it('reflects a transition applied in memory, without re-reading', () => {
    // This is the behaviour the change is for: the response describes the state the
    // command produced, not whatever the read model currently holds.
    const target = execution();
    target.markCancelled(CREATED_AT, new SequentialIdGenerator().next());

    const view = toExecutionView(target, ARTIFACTS_BUCKET);

    expect(view.status).toBe(ExecutionStatusValue.CANCELLED);
    expect(view.cancelledAt).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('toScriptView', () => {
  const scriptId = ScriptId.from(SCRIPT_ID);

  function script(currentVersion?: ScriptVersion): Script {
    return Script.rehydrate({
      id: scriptId,
      name: ScriptName.create('nightly rollup'),
      description: ScriptDescription.create('rolls up yesterday'),
      connectionId: CONNECTION_ID,
      artifactBucket: ARTIFACTS_BUCKET,
      artifactPrefix: ArtifactLocation.prefixFor(scriptId),
      revision: currentVersion === undefined ? 0 : 1,
      currentVersion,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
  }

  function version(versionNumber = 1): ScriptVersion {
    return ScriptVersion.publish({
      id: ScriptVersionId.from('66666666-6666-4666-8666-666666666666'),
      scriptId,
      versionNumber: VersionNumber.create(versionNumber),
      artifactLocation: ArtifactLocation.forVersion(
        ARTIFACTS_BUCKET,
        scriptId,
        VersionNumber.create(versionNumber),
      ),
      artifactVersionId: ArtifactVersionId.create('object-version-1'),
      sourceHash: SourceHash.fromSha256('a'.repeat(64)),
      contentSize: 42,
      publishedAt: CREATED_AT,
    });
  }

  it('projects a draft script with no current version', () => {
    expect(toScriptView(script())).toEqual({
      id: SCRIPT_ID,
      name: 'nightly rollup',
      description: 'rolls up yesterday',
      connectionId: CONNECTION_ID,
      status: 'ACTIVE',
      currentVersion: undefined,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('nests the current version once one is published', () => {
    const view = toScriptView(script(version()));

    expect(view.currentVersion).toEqual({
      id: '66666666-6666-4666-8666-666666666666',
      scriptId: SCRIPT_ID,
      versionNumber: 1,
      artifactBucket: ARTIFACTS_BUCKET,
      objectKey: `scripts/${SCRIPT_ID}/versions/1/main.py`,
      contentSha256: 'a'.repeat(64),
      contentSize: 42,
      publishedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('omits an absent description rather than emitting null', () => {
    const drafted = Script.rehydrate({
      id: scriptId,
      name: ScriptName.create('nightly rollup'),
      description: ScriptDescription.create(undefined),
      connectionId: CONNECTION_ID,
      artifactBucket: ARTIFACTS_BUCKET,
      artifactPrefix: ArtifactLocation.prefixFor(scriptId),
      revision: 0,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });

    expect(toScriptView(drafted).description).toBeUndefined();
  });

  it('never exposes the object version id, which is an internal storage detail', () => {
    const view = toScriptVersionView(version(), ARTIFACTS_BUCKET);

    expect(JSON.stringify(view)).not.toContain('object-version-1');
  });
});

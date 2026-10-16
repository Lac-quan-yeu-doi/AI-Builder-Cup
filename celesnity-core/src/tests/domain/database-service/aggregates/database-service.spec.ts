import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { DatabaseServiceEventName } from '@domain/database-service/events/database-service.events';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import type {
  JsonObject,
  NormalizedConnectionConfig,
} from '@domain/database-service/value-objects/normalized-connection-config';
import { NormalizedConnectionConfig as NormalizedConnectionConfigValue } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { SequentialIdGenerator } from '@tests/support/deterministic-ports';

const CONNECTION_ID = '77777777-7777-4777-8777-777777777777';
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');
const CHANGED_AT = new Date('2026-08-04T10:00:00.000Z');
const POSTGRESQL_TYPE = ConnectorType.create('POSTGRESQL');

function credential(suffix = 'a'): CredentialReference {
  return CredentialReference.create({
    ciphertext: `cipher-${suffix}`,
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function config(overrides: JsonObject = {}): NormalizedConnectionConfig {
  return NormalizedConnectionConfigValue.create(1, {
    databaseName: 'analytics',
    host: 'db.internal',
    options: {},
    port: 6432,
    sslMode: 'require',
    username: 'alice',
    ...overrides,
  });
}

function ids(): SequentialIdGenerator {
  return new SequentialIdGenerator();
}

interface Overrides {
  readonly archivedAt?: Date;
  readonly config?: NormalizedConnectionConfig;
  readonly credential?: CredentialReference;
  readonly credentialSchemaVersion?: number;
  readonly verification?: VerificationState;
}

function stored(overrides: Overrides = {}): DatabaseService {
  return DatabaseService.rehydrate({
    id: ConnectionId.from(CONNECTION_ID),
    name: ConnectionName.create('analytics'),
    connectorType: POSTGRESQL_TYPE,
    config: overrides.config ?? config(),
    credential: overrides.credential ?? credential(),
    credentialSchemaVersion: overrides.credentialSchemaVersion ?? 1,
    verification: overrides.verification ?? VerificationState.succeeded(CREATED_AT),
    archivedAt: overrides.archivedAt,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

function sameDetails(
  connection: DatabaseService,
  eventId: string,
): Parameters<DatabaseService['change']>[0] {
  return {
    name: connection.name,
    config: connection.config,
    credential: connection.credential,
    credentialSchemaVersion: connection.credentialSchemaVersion,
    changedAt: CHANGED_AT,
    eventId,
  };
}

describe('DatabaseService.register', () => {
  it('raises a Registered event carrying the supplied event id', () => {
    const eventId = ids().next();
    const connection = DatabaseService.register(
      {
        id: ConnectionId.from(CONNECTION_ID),
        name: ConnectionName.create('analytics'),
        connectorType: POSTGRESQL_TYPE,
        config: config(),
        credential: credential(),
        credentialSchemaVersion: 1,
        verification: VerificationState.untested(),
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      eventId,
    );

    const events = connection.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventName).toBe(DatabaseServiceEventName.Registered);
    expect(events[0]?.eventId).toBe(eventId);
  });

  it('refuses to register an already-archived connection', () => {
    expect(() =>
      DatabaseService.register(
        {
          id: ConnectionId.from(CONNECTION_ID),
          name: ConnectionName.create('analytics'),
          connectorType: POSTGRESQL_TYPE,
          config: config(),
          credential: credential(),
          credentialSchemaVersion: 1,
          verification: VerificationState.untested(),
          archivedAt: CREATED_AT,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
        ids().next(),
      ),
    ).toThrow(ConnectionError);
  });
});

describe('DatabaseService.change', () => {
  it('reports false and stays silent when nothing changed', () => {
    const connection = stored();

    expect(connection.change(sameDetails(connection, ids().next()))).toBe(false);
    expect(connection.pullDomainEvents()).toHaveLength(0);
    expect(connection.updatedAt).toEqual(CREATED_AT);
  });

  it('reports true and raises Changed when the name differs', () => {
    const connection = stored();

    expect(
      connection.change({
        ...sameDetails(connection, ids().next()),
        name: ConnectionName.create('warehouse'),
      }),
    ).toBe(true);
    expect(connection.name.value).toBe('warehouse');
    expect(connection.pullDomainEvents()[0]?.eventName).toBe(DatabaseServiceEventName.Changed);
  });

  it('keeps a successful verification when only the name changed', () => {
    const connection = stored();

    connection.change({
      ...sameDetails(connection, ids().next()),
      name: ConnectionName.create('warehouse'),
    });

    expect(connection.verification.status).toBe(VerificationStatusValue.SUCCEEDED);
  });

  it.each([
    [
      'config',
      (): Partial<Parameters<DatabaseService['change']>[0]> => ({
        config: config({ port: 7000 }),
      }),
    ],
    [
      'credential',
      (): Partial<Parameters<DatabaseService['change']>[0]> => ({ credential: credential('b') }),
    ],
    [
      'credential schema version',
      (): Partial<Parameters<DatabaseService['change']>[0]> => ({ credentialSchemaVersion: 2 }),
    ],
  ])(
    'resets verification to UNTESTED when the %s changes',
    (
      _label: string,
      mutate: (connection: DatabaseService) => Partial<Parameters<DatabaseService['change']>[0]>,
    ) => {
      const connection = stored();

      connection.change({ ...sameDetails(connection, ids().next()), ...mutate(connection) });

      expect(connection.verification.status).toBe(VerificationStatusValue.UNTESTED);
    },
  );

  it('does not reset verification for key-order-only config differences', () => {
    const connection = stored({
      config: config({ options: { applicationName: 'celesnity' } }),
    });
    const equivalentConfig = NormalizedConnectionConfigValue.create(1, {
      username: 'alice',
      sslMode: 'require',
      port: 6432,
      options: { applicationName: 'celesnity' },
      host: 'db.internal',
      databaseName: 'analytics',
    });

    expect(
      connection.change({ ...sameDetails(connection, ids().next()), config: equivalentConfig }),
    ).toBe(false);
    expect(connection.verification.status).toBe(VerificationStatusValue.SUCCEEDED);
  });

  it('keeps the DBMS type immutable because changes have no connectorType field', () => {
    const connection = stored();

    expect('connectorType' in sameDetails(connection, ids().next())).toBe(false);
    expect(connection.connectorType.value).toBe('POSTGRESQL');
  });

  it('advances updatedAt so the optimistic guard sees a new value', () => {
    const connection = stored();

    connection.change({
      ...sameDetails(connection, ids().next()),
      name: ConnectionName.create('warehouse'),
    });

    expect(connection.updatedAt).toEqual(CHANGED_AT);
  });
});

describe('DatabaseService verification recording', () => {
  it('records success and raises VerificationSucceeded', () => {
    const connection = stored({ verification: VerificationState.untested() });

    connection.recordVerificationSuccess(CHANGED_AT, ids().next());

    expect(connection.verification.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(connection.verification.lastTestedAt).toEqual(CHANGED_AT);
    expect(connection.pullDomainEvents()[0]?.eventName).toBe(
      DatabaseServiceEventName.VerificationSucceeded,
    );
  });

  it('records failure with its reason and raises VerificationFailed', () => {
    const connection = stored({ verification: VerificationState.untested() });

    connection.recordVerificationFailure(CHANGED_AT, 'connection refused', ids().next());

    expect(connection.verification.status).toBe(VerificationStatusValue.FAILED);
    expect(connection.verification.failureReason).toBe('connection refused');
    expect(connection.pullDomainEvents()[0]?.eventName).toBe(
      DatabaseServiceEventName.VerificationFailed,
    );
  });

  it('clears the previous failure reason when a later test succeeds', () => {
    const connection = stored({ verification: VerificationState.untested() });

    connection.recordVerificationFailure(CHANGED_AT, 'connection refused', ids().next());
    connection.recordVerificationSuccess(CHANGED_AT, ids().next());

    expect(connection.verification.failureReason).toBeUndefined();
  });
});

describe('DatabaseService.archive', () => {
  it('archives and raises Archived', () => {
    const connection = stored();

    connection.archive(CHANGED_AT, ids().next());

    expect(connection.isArchived).toBe(true);
    expect(connection.archivedAt).toEqual(CHANGED_AT);
    expect(connection.pullDomainEvents()[0]?.eventName).toBe(DatabaseServiceEventName.Archived);
  });

  it('refuses every mutation once archived', () => {
    const connection = stored({ archivedAt: CREATED_AT });
    const generator = ids();

    expect(() => connection.change(sameDetails(connection, generator.next()))).toThrow(
      ConnectionError,
    );
    expect(() => connection.recordVerificationSuccess(CHANGED_AT, generator.next())).toThrow(
      ConnectionError,
    );
    expect(() => connection.recordVerificationFailure(CHANGED_AT, 'x', generator.next())).toThrow(
      ConnectionError,
    );
    expect(() => connection.archive(CHANGED_AT, generator.next())).toThrow(ConnectionError);
  });
});

describe('DatabaseService event draining', () => {
  it('yields nothing on a second pull and preserves event order', () => {
    const connection = stored({ verification: VerificationState.untested() });
    const generator = ids();

    connection.change({
      ...sameDetails(connection, generator.next()),
      name: ConnectionName.create('warehouse'),
    });
    connection.recordVerificationSuccess(CHANGED_AT, generator.next());
    connection.archive(CHANGED_AT, generator.next());

    expect(connection.pullDomainEvents().map((event) => event.eventName)).toEqual([
      DatabaseServiceEventName.Changed,
      DatabaseServiceEventName.VerificationSucceeded,
      DatabaseServiceEventName.Archived,
    ]);
    expect(connection.pullDomainEvents()).toHaveLength(0);
  });
});

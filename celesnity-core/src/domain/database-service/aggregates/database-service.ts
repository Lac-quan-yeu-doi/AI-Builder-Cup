import type { DomainEvent } from '@domain/shared/domain-event';
import {
  DatabaseServiceEvent,
  DatabaseServiceEventName,
} from '@domain/database-service/events/database-service.events';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import type { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import type {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';
import { VerificationState as VerificationStateValue } from '@domain/database-service/value-objects/connection-value-objects';

export type DatabaseServiceState = {
  readonly id: ConnectionId;
  readonly name: ConnectionName;
  readonly connectorType: ConnectorType;
  readonly config: NormalizedConnectionConfig;
  readonly credential: CredentialReference;
  readonly credentialSchemaVersion: number;
  readonly verification: VerificationState;
  readonly archivedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ChangeDatabaseService = {
  readonly name: ConnectionName;
  readonly config: NormalizedConnectionConfig;
  readonly credential: CredentialReference;
  readonly credentialSchemaVersion: number;
  readonly changedAt: Date;
  readonly eventId: string;
};

/**
 * A registered DBMS connection: where it points, who it authenticates as,
 * and whether it has been proven to work.
 *
 * Each field is held once. The constructor used to keep the whole
 * {@link DatabaseServiceState} it was built from *and* a mutable shadow copy of
 * every field, while reading only `id` and `createdAt` back off the original. Two
 * representations of the same data invite the question of which one is current,
 * and the answer differed per field. The immutable fields are now simply
 * `readonly`, which says the same thing the retained state object was trying to.
 */
export class DatabaseService {
  private readonly domainEvents: DomainEvent[] = [];
  private readonly idValue: ConnectionId;
  private readonly createdAtValue: Date;
  private nameValue: ConnectionName;
  private readonly connectorTypeValue: ConnectorType;
  private configValue: NormalizedConnectionConfig;
  private credentialValue: CredentialReference;
  private credentialSchemaVersionValue: number;
  private verificationValue: VerificationState;
  private archivedAtValue: Date | undefined;
  private updatedAtValue: Date;

  private constructor(state: DatabaseServiceState) {
    this.idValue = state.id;
    this.createdAtValue = state.createdAt;
    this.nameValue = state.name;
    this.connectorTypeValue = state.connectorType;
    this.configValue = state.config;
    this.credentialValue = state.credential;
    this.credentialSchemaVersionValue = state.credentialSchemaVersion;
    this.verificationValue = state.verification;
    this.archivedAtValue = state.archivedAt;
    this.updatedAtValue = state.updatedAt;
  }

  public static register(state: DatabaseServiceState, eventId: string): DatabaseService {
    if (state.archivedAt !== undefined) {
      throw ConnectionError.archived();
    }
    const connection = new DatabaseService(state);
    connection.raise(DatabaseServiceEventName.Registered, eventId, state.createdAt);
    return connection;
  }

  public static rehydrate(state: DatabaseServiceState): DatabaseService {
    return new DatabaseService(state);
  }

  public get id(): ConnectionId {
    return this.idValue;
  }

  public get name(): ConnectionName {
    return this.nameValue;
  }

  public get connectorType(): ConnectorType {
    return this.connectorTypeValue;
  }

  public get config(): NormalizedConnectionConfig {
    return this.configValue;
  }

  public get credential(): CredentialReference {
    return this.credentialValue;
  }

  public get credentialSchemaVersion(): number {
    return this.credentialSchemaVersionValue;
  }

  public get verification(): VerificationState {
    return this.verificationValue;
  }

  public get archivedAt(): Date | undefined {
    return this.archivedAtValue;
  }

  public get createdAt(): Date {
    return this.createdAtValue;
  }

  public get updatedAt(): Date {
    return this.updatedAtValue;
  }

  public get isArchived(): boolean {
    return this.archivedAtValue !== undefined;
  }

  /**
   * Applies a change and reports whether anything actually moved.
   *
   * Changing the generic config or credential invalidates any previous
   * verification result, because the thing that was proven reachable is no
   * longer the thing being described. The DBMS type is immutable after register.
   */
  public change(change: ChangeDatabaseService): boolean {
    this.ensureActive();
    const profileChanged =
      !this.configValue.equals(change.config) ||
      this.credentialSchemaVersionValue !== change.credentialSchemaVersion ||
      !this.credentialValue.equals(change.credential);
    const nameChanged = !this.nameValue.equals(change.name);

    if (!profileChanged && !nameChanged) {
      return false;
    }

    this.nameValue = change.name;
    this.configValue = change.config;
    this.credentialValue = change.credential;
    this.credentialSchemaVersionValue = change.credentialSchemaVersion;
    if (profileChanged) {
      this.verificationValue = VerificationStateValue.untested();
    }
    this.updatedAtValue = change.changedAt;
    this.raise(DatabaseServiceEventName.Changed, change.eventId, change.changedAt);
    return true;
  }

  public recordVerificationSuccess(testedAt: Date, eventId: string): void {
    this.ensureActive();
    this.verificationValue = VerificationStateValue.succeeded(testedAt);
    this.updatedAtValue = testedAt;
    this.raise(DatabaseServiceEventName.VerificationSucceeded, eventId, testedAt);
  }

  public recordVerificationFailure(testedAt: Date, failureReason: string, eventId: string): void {
    this.ensureActive();
    this.verificationValue = VerificationStateValue.failed(testedAt, failureReason);
    this.updatedAtValue = testedAt;
    this.raise(DatabaseServiceEventName.VerificationFailed, eventId, testedAt);
  }

  public archive(archivedAt: Date, eventId: string): void {
    this.ensureActive();
    this.archivedAtValue = archivedAt;
    this.updatedAtValue = archivedAt;
    this.raise(DatabaseServiceEventName.Archived, eventId, archivedAt);
  }

  public pullDomainEvents(): readonly DomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private raise(name: DatabaseServiceEventName, eventId: string, occurredAt: Date): void {
    this.domainEvents.push(new DatabaseServiceEvent(eventId, name, this.idValue.value, occurredAt));
  }

  private ensureActive(): void {
    if (this.isArchived) {
      throw ConnectionError.archived();
    }
  }
}

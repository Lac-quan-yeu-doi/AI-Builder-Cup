import { UniqueId } from '@domain/shared/unique-id';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { MAX_FAILURE_REASON_LENGTH } from '@domain/database-service/value-objects/failure-reason';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

/**
 * The verification vocabulary, owned here and nowhere else.
 *
 * Every layer derives from this enum: the read model, the ports, the HTTP
 * response metadata, and the Prisma mapper's compatibility assertion. Adding a
 * member here is the only place a new status is introduced, and the exhaustive
 * `Record` in the Prisma repository will fail to compile until the database
 * vocabulary agrees.
 */
export enum VerificationStatusValue {
  UNTESTED = 'UNTESTED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/**
 * The outcome of an actual connection test. A test always concludes, so it can
 * never report `UNTESTED`; deriving the pair instead of re-listing it keeps the
 * two vocabularies from drifting apart.
 */
export type VerificationOutcomeValue = Exclude<
  VerificationStatusValue,
  VerificationStatusValue.UNTESTED
>;

/**
 * The runtime counterpart of {@link VerificationOutcomeValue}, filtered out of
 * the enum rather than listed again, so OpenAPI metadata and the type can never
 * disagree.
 */
export const VERIFICATION_OUTCOMES: readonly VerificationOutcomeValue[] = Object.values(
  VerificationStatusValue,
).filter((status) => status !== VerificationStatusValue.UNTESTED);

/**
 * Answers "did the test pass?" so callers ask the vocabulary a question instead
 * of comparing against a bare literal. Mirrors the `isTerminalStatus` and
 * `isCancellableStatus` predicates in the Execution Orchestration context.
 */
export function isSuccessfulVerification(status: VerificationOutcomeValue): boolean {
  return status === VerificationStatusValue.SUCCEEDED;
}

/** Narrows persisted text to a member of the verification vocabulary. */
export function isVerificationStatusValue(value: string): value is VerificationStatusValue {
  return Object.values<string>(VerificationStatusValue).includes(value);
}

const text = TextGuard.reporting((message) => ConnectionError.validation(message));

export class ConnectionId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): ConnectionId {
    try {
      return new ConnectionId(value);
    } catch {
      throw ConnectionError.validation(ConnectionMessage.invalidConnectionId);
    }
  }
}

export class ConnectionName {
  private constructor(public readonly value: string) {}

  public static create(value: string): ConnectionName {
    return new ConnectionName(text.required('Connection name', value, 120));
  }

  public equals(other: ConnectionName): boolean {
    return this.value === other.value;
  }
}

export class ConnectionEndpoint {
  private constructor(
    public readonly host: string,
    public readonly port: number,
  ) {}

  public static create(host: string, port: number): ConnectionEndpoint {
    let normalizedHost = text.required('Host', host, 255).toLowerCase();
    if (normalizedHost.startsWith('[') && normalizedHost.endsWith(']')) {
      normalizedHost = normalizedHost.slice(1, -1);
    }
    if (/[/@?#\s]/u.test(normalizedHost)) {
      throw ConnectionError.validation(ConnectionMessage.hostContainsUrlSyntax);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw ConnectionError.validation(ConnectionMessage.portOutOfRange);
    }
    return new ConnectionEndpoint(normalizedHost, port);
  }

  public equals(other: ConnectionEndpoint): boolean {
    return this.host === other.host && this.port === other.port;
  }
}

export class VerificationState {
  private constructor(
    public readonly status: VerificationStatusValue,
    public readonly lastTestedAt: Date | undefined,
    public readonly failureReason: string | undefined,
  ) {}

  public static untested(): VerificationState {
    return new VerificationState(VerificationStatusValue.UNTESTED, undefined, undefined);
  }

  public static succeeded(testedAt: Date): VerificationState {
    return new VerificationState(VerificationStatusValue.SUCCEEDED, testedAt, undefined);
  }

  public static failed(testedAt: Date, failureReason: string): VerificationState {
    const normalized = text.required(
      'Verification failure reason',
      failureReason,
      MAX_FAILURE_REASON_LENGTH,
    );
    return new VerificationState(VerificationStatusValue.FAILED, testedAt, normalized);
  }

  public static rehydrate(
    status: VerificationStatusValue,
    lastTestedAt?: Date,
    failureReason?: string,
  ): VerificationState {
    if (status === VerificationStatusValue.UNTESTED) {
      return VerificationState.untested();
    }
    if (lastTestedAt === undefined) {
      throw ConnectionError.validation(ConnectionMessage.testedWithoutTimestamp);
    }
    return status === VerificationStatusValue.SUCCEEDED
      ? VerificationState.succeeded(lastTestedAt)
      : VerificationState.failed(lastTestedAt, failureReason ?? 'Connection verification failed.');
  }
}

export interface CredentialReferenceValue {
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly authenticationTag: string;
  readonly keyVersion: string;
}

export class CredentialReference {
  private constructor(
    public readonly ciphertext: string,
    public readonly initializationVector: string,
    public readonly authenticationTag: string,
    public readonly keyVersion: string,
  ) {}

  public static create(value: CredentialReferenceValue): CredentialReference {
    return new CredentialReference(
      text.required('Encrypted credential', value.ciphertext, 100_000),
      text.required('Credential initialization vector', value.initializationVector, 255),
      text.required('Credential authentication tag', value.authenticationTag, 255),
      text.required('Credential key version', value.keyVersion, 50),
    );
  }

  public equals(other: CredentialReference): boolean {
    return (
      this.ciphertext === other.ciphertext &&
      this.initializationVector === other.initializationVector &&
      this.authenticationTag === other.authenticationTag &&
      this.keyVersion === other.keyVersion
    );
  }
}

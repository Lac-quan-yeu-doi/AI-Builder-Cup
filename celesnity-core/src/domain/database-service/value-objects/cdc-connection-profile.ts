import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { UniqueId } from '@domain/shared/unique-id';

const text = TextGuard.reporting((message) => ConnectionError.validation(message));
const POSTGRES_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/u;

export enum CdcConnectionSetupMode {
  EXISTING = 'EXISTING',
  MANAGED = 'MANAGED',
}

export enum CdcConnectionVerificationStatus {
  UNTESTED = 'UNTESTED',
  READY = 'READY',
  SETUP_REQUIRED = 'SETUP_REQUIRED',
  FAILED = 'FAILED',
}

export const CDC_CONNECTION_ISSUE_CODES = [
  'CDC_CONNECTION_REQUIRED',
  'CDC_DIRECT_CONNECTION_REQUIRED',
  'CDC_ENDPOINT_UNREACHABLE',
  'CDC_AUTHENTICATION_FAILED',
  'CDC_LOGICAL_REPLICATION_DISABLED',
  'CDC_REPLICATION_PERMISSION_REQUIRED',
  'CDC_PUBLICATION_REQUIRED',
  'CDC_SLOT_REQUIRED',
  'CDC_EXISTING_SETUP_INCOMPATIBLE',
  'SETUP_PERMISSION_UNPROVEN',
] as const;

export type CdcConnectionIssueCode = (typeof CDC_CONNECTION_ISSUE_CODES)[number];

export class CdcConnectionProfileId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): CdcConnectionProfileId {
    try {
      return new CdcConnectionProfileId(value);
    } catch {
      throw ConnectionError.validation('CDC connection profile id must be a valid UUID.');
    }
  }
}

export class CdcConnectionVerification {
  private constructor(
    public readonly status: CdcConnectionVerificationStatus,
    public readonly lastTestedAt: Date | undefined,
    public readonly issueCode: CdcConnectionIssueCode | undefined,
    public readonly message: string | undefined,
  ) {}

  public static untested(): CdcConnectionVerification {
    return new CdcConnectionVerification(
      CdcConnectionVerificationStatus.UNTESTED,
      undefined,
      undefined,
      undefined,
    );
  }

  public static ready(testedAt: Date): CdcConnectionVerification {
    return new CdcConnectionVerification(
      CdcConnectionVerificationStatus.READY,
      testedAt,
      undefined,
      undefined,
    );
  }

  public static issue(
    status: Exclude<
      CdcConnectionVerificationStatus,
      CdcConnectionVerificationStatus.UNTESTED | CdcConnectionVerificationStatus.READY
    >,
    testedAt: Date,
    issueCode: CdcConnectionIssueCode,
    message: string,
  ): CdcConnectionVerification {
    return new CdcConnectionVerification(
      status,
      testedAt,
      issueCode,
      text.required('CDC verification message', message, 1_000),
    );
  }

  public static rehydrate(
    status: CdcConnectionVerificationStatus,
    lastTestedAt?: Date,
    issueCode?: string,
    message?: string,
  ): CdcConnectionVerification {
    if (status === CdcConnectionVerificationStatus.UNTESTED) {
      return CdcConnectionVerification.untested();
    }
    if (lastTestedAt === undefined) {
      throw ConnectionError.validation('A tested CDC connection requires a test timestamp.');
    }
    if (status === CdcConnectionVerificationStatus.READY) {
      return CdcConnectionVerification.ready(lastTestedAt);
    }
    if (!isCdcConnectionIssueCode(issueCode)) {
      throw ConnectionError.validation('A failed CDC connection requires a safe issue code.');
    }
    return CdcConnectionVerification.issue(
      status,
      lastTestedAt,
      issueCode,
      message ?? 'CDC connection validation failed.',
    );
  }
}

export function isCdcConnectionIssueCode(value: unknown): value is CdcConnectionIssueCode {
  return (
    typeof value === 'string' && (CDC_CONNECTION_ISSUE_CODES as readonly string[]).includes(value)
  );
}

export function normalizePostgresCdcIdentifier(
  label: 'Publication name' | 'Replication slot name',
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = text.required(label, value, 63);
  if (!POSTGRES_IDENTIFIER.test(normalized)) {
    throw ConnectionError.validation(`${label} must be a valid unquoted PostgreSQL identifier.`);
  }
  return normalized;
}

export const SSL_MODES = ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'] as const;

export type SslMode = (typeof SSL_MODES)[number];
export type ConnectionVerificationStatus = 'untested' | 'succeeded' | 'failed';

export interface ConnectionVerificationState {
  readonly status: ConnectionVerificationStatus;
  readonly testedAt?: string;
  readonly message?: string;
}

export interface ConnectionVerificationResult {
  readonly status: Exclude<ConnectionVerificationStatus, 'untested'>;
  readonly testedAt: string;
  readonly message?: string;
}

export interface DataConnection {
  readonly id: string;
  readonly name: string;
  readonly type: 'postgresql';
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly username: string;
  readonly sslMode: SslMode;
  readonly applicationName?: string;
  readonly verification: ConnectionVerificationState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StructuredConnectionInput {
  readonly kind: 'structured';
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly username: string;
  readonly password?: string;
  readonly sslMode: SslMode;
  readonly applicationName?: string;
}

export interface ConnectionUrlInput {
  readonly kind: 'url';
  readonly connectionUrl: string;
}

export type ConnectionDetailsInput = StructuredConnectionInput | ConnectionUrlInput;

export interface DataConnectionInput {
  readonly name: string;
  readonly details: ConnectionDetailsInput;
}

const POSTGRESQL_URL = /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi;
const URI_CREDENTIALS = /([a-z][a-z\d+.-]*:\/\/)[^/@\s]+@/gi;
const SECRET_ASSIGNMENT = /\b(password|passwd|pwd)\s*[:=]\s*[^\s,;]+/gi;

export function sanitizeVerificationMessage(message?: string): string | undefined {
  if (!message) {
    return undefined;
  }

  const sanitized = message
    .replace(POSTGRESQL_URL, 'PostgreSQL endpoint [redacted]')
    .replace(URI_CREDENTIALS, '$1[credentials redacted]@')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return undefined;
  }

  return sanitized.length > 320 ? `${sanitized.slice(0, 317)}...` : sanitized;
}

import type {
  ConnectionVerificationResult,
  ConnectionVerificationState,
  DataConnection,
  SslMode,
} from '@/src/entities/models/connection';

export interface ConnectionVerificationStateViewModel {
  readonly status: ConnectionVerificationState['status'];
  readonly testedAt?: string;
  readonly message?: string;
}

export interface ConnectionVerificationViewModel {
  readonly status: ConnectionVerificationResult['status'];
  readonly testedAt: string;
  readonly message?: string;
}

export interface ConnectionViewModel {
  readonly id: string;
  readonly name: string;
  readonly type: 'postgresql';
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly username: string;
  readonly sslMode: SslMode;
  readonly applicationName?: string;
  readonly verification: ConnectionVerificationStateViewModel;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function presentConnection(connection: DataConnection): ConnectionViewModel {
  return {
    id: connection.id,
    name: connection.name,
    type: connection.type,
    host: connection.host,
    port: connection.port,
    databaseName: connection.databaseName,
    username: connection.username,
    sslMode: connection.sslMode,
    ...(connection.applicationName !== undefined
      ? { applicationName: connection.applicationName }
      : {}),
    verification: {
      status: connection.verification.status,
      ...(connection.verification.testedAt !== undefined
        ? { testedAt: connection.verification.testedAt }
        : {}),
      ...(connection.verification.message !== undefined
        ? { message: connection.verification.message }
        : {}),
    },
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function presentConnections(
  connections: readonly DataConnection[],
): readonly ConnectionViewModel[] {
  return connections.map(presentConnection);
}

export function presentConnectionVerification(
  verification: ConnectionVerificationResult,
): ConnectionVerificationViewModel {
  return {
    status: verification.status,
    testedAt: verification.testedAt,
    ...(verification.message !== undefined ? { message: verification.message } : {}),
  };
}

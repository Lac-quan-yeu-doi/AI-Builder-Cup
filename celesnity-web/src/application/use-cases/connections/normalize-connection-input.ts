import type {
  ConnectionDetailsInput,
  DataConnectionInput,
  StructuredConnectionInput,
} from '@/src/entities/models/connection';

export function normalizeConnectionInput(input: DataConnectionInput): DataConnectionInput {
  return {
    name: input.name.trim(),
    details: normalizeConnectionDetails(input.details),
  };
}

export function normalizeConnectionDetails(
  details: ConnectionDetailsInput,
): ConnectionDetailsInput {
  if (details.kind === 'url') {
    return { kind: 'url', connectionUrl: details.connectionUrl.trim() };
  }

  const normalized: StructuredConnectionInput = {
    kind: 'structured',
    host: details.host.trim(),
    port: details.port,
    databaseName: details.databaseName.trim(),
    username: details.username.trim(),
    sslMode: details.sslMode,
    ...(details.applicationName !== undefined
      ? { applicationName: details.applicationName.trim() }
      : {}),
    ...(details.password ? { password: details.password } : {}),
  };

  return normalized;
}

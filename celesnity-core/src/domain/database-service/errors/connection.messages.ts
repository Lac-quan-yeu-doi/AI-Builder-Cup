/**
 * Every validation message the Connection Registry context can raise.
 *
 * Kept beside {@link ConnectionError} rather than inline at each `throw`, so the
 * wording a caller sees is auditable in one place. Several of these are asserted
 * verbatim by the characterization suite, because they are part of the API's
 * observable behaviour.
 */
export const ConnectionMessage = {
  // Identity
  invalidConnectionId: 'Connection ID must be a valid UUID.',
  connectorTypeRequired: 'Database type is required.',
  connectorTypeInvalid: 'Database type is invalid.',
  connectorTypeUnsupported: (connectorType: string): string =>
    `Database type ${connectorType} is not supported.`,

  // Generic configuration
  configSchemaVersionInvalid: 'Connection configuration schema version must be a positive integer.',
  configValueInvalid: 'Connection configuration must contain only JSON values.',
  configValueCyclic: 'Connection configuration must not contain cycles.',
  storedConfigInvalid: 'Stored connection configuration is invalid.',
  credentialPayloadInvalid: 'Connection credential payload is invalid.',

  // Endpoint
  hostContainsUrlSyntax: 'Host must not contain URL syntax or whitespace.',
  portOutOfRange: 'Port must be an integer between 1 and 65535.',

  // Credentials
  credentialRequired: 'Connection credentials are required.',
  catalogDatabaseRequired: 'Catalog database name is required.',

  // Verification
  testedWithoutTimestamp: 'A tested connection requires a verification timestamp.',
} as const;

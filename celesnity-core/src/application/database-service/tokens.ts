/**
 * Dependency-injection tokens for the Connection Registry ports.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else. Infrastructure binds
 * implementations to these symbols; the application layer never imports a
 * concrete class.
 */
export const CONNECTION_EXECUTION_PROFILE_PROVIDER = Symbol('IConnectionExecutionProfileProvider');
export const CONNECTION_REFERENCE_PROVIDER = Symbol('IConnectionReferenceProvider');
export const CREDENTIAL_VAULT = Symbol('ICredentialVault');
export const DATABASE_SERVICE_READER = Symbol('IDatabaseServiceReader');
export const DATABASE_SERVICE_REPOSITORY = Symbol('IDatabaseServiceRepository');
export const DATABASE_SERVICE_MEMBERSHIP_REPOSITORY = Symbol('IDatabaseServiceMembershipRepository');
export const DATABASE_CATALOG_READER = Symbol('IDatabaseCatalogReader');
export const DATABASE_SOURCE_USAGE_READER = Symbol('IDatabaseSourceUsageReader');
export const DESTINATION_POLICY = Symbol('IDestinationPolicy');
export const DATABASE_SERVICE_CONNECTOR_REGISTRY = Symbol('IDatabaseServiceConnectorRegistry');
export const DATABASE_SERVICE_RUNTIME_PROVIDER = Symbol('IDatabaseServiceRuntimeProvider');
export const CDC_CONNECTION_PROFILE_REPOSITORY = Symbol('ICdcConnectionProfileRepository');
export const CDC_CONNECTION_PREFLIGHT = Symbol('ICdcConnectionPreflight');
export const CDC_CONNECTION_USAGE_READER = Symbol('ICdcConnectionUsageReader');
export const CDC_CONNECTION_RUNTIME_PROVIDER = Symbol('ICdcConnectionRuntimeProvider');

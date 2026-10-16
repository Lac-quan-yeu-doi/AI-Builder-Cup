export type DatabaseServiceVerificationStatus = 'untested' | 'succeeded' | 'failed';
export const SSL_MODES = ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'] as const;
export type SslMode = (typeof SSL_MODES)[number];

export interface DatabaseServiceVerificationState {
  readonly status: DatabaseServiceVerificationStatus;
  readonly testedAt?: string;
  readonly message?: string;
}

export interface DatabaseServiceVerificationResult {
  readonly status: Exclude<DatabaseServiceVerificationStatus, 'untested'>;
  readonly testedAt: string;
  readonly message?: string;
}

export interface DatabaseServiceSummaryItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** Safe API-owned view. Connector fields remain inside generic config/summary. */
export interface DatabaseService {
  readonly id: string;
  readonly name: string;
  /** Celesnity catalog databases linked to this physical datasource. */
  readonly databaseNames: readonly string[];
  /** @deprecated Use databaseNames. Kept as the first membership for older screens. */
  readonly databaseName?: string;
  readonly connectorType: string;
  readonly configSchemaVersion: number;
  readonly config: Record<string, unknown>;
  readonly summary: readonly DatabaseServiceSummaryItem[];
  readonly verification: DatabaseServiceVerificationState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The Web does not decide DBMS rules; Core validates this opaque details object. */
export interface DatabaseServiceInput {
  readonly name: string;
  /** Catalog database to link immediately after the datasource is created. */
  readonly initialDatabaseName?: string;
  /** @deprecated Use initialDatabaseName. */
  readonly databaseName?: string;
  readonly connectorType: string;
  readonly details: Record<string, unknown>;
}

export type DatabaseServiceDetailsInput = Record<string, unknown>;

export interface DatabaseServiceUpdateInput {
  readonly name?: string;
  readonly details?: Record<string, unknown>;
}

export interface DatabaseServiceListQuery {
  /** Restricts the page to the sources filed under one Iceberg database. */
  readonly databaseName?: string;
  readonly search?: string;
  readonly connectorType?: string;
  readonly verificationStatus?: 'UNTESTED' | 'SUCCEEDED' | 'FAILED';
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'name' | 'createdAt' | 'updatedAt';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface DatabaseServiceListPage {
  readonly items: readonly DatabaseService[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export type CdcConnectionSetupMode = 'existing' | 'managed';
export type CdcConnectionVerificationStatus = 'untested' | 'ready' | 'setup-required' | 'failed';

export interface CdcConnectionProfile {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly connectorType: string;
  readonly endpointSummary: string;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
  readonly verificationStatus: CdcConnectionVerificationStatus;
  readonly verificationIssueCode?: string;
  readonly verificationMessage?: string;
  readonly lastTestedAt?: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Credentials inside details are write-only and never appear in CdcConnectionProfile. */
export interface CdcConnectionProfileInput {
  readonly details: Record<string, unknown>;
  readonly setupMode: CdcConnectionSetupMode;
  readonly publicationName?: string;
  readonly slotName?: string;
}

export type DatabaseServiceFormFieldType = 'text' | 'number' | 'url' | 'password' | 'select';

export interface DatabaseServiceFormFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface DatabaseServiceFormFieldDescriptor {
  readonly key: string;
  readonly label: string;
  readonly type: DatabaseServiceFormFieldType;
  readonly required?: boolean;
  readonly secret?: boolean;
  readonly mode?: 'structured' | 'url';
  readonly placeholder?: string;
  readonly options?: readonly DatabaseServiceFormFieldOption[];
}

export interface DatabaseServiceConnectorDescriptor {
  readonly connectorType: string;
  readonly label: string;
  readonly configSchemaVersion: number;
  readonly formSchema: {
    readonly fields: readonly DatabaseServiceFormFieldDescriptor[];
  };
}

const URI_CREDENTIALS = /([a-z][a-z\d+.-]*:\/\/)[^/@\s]+@/gi;
const SECRET_ASSIGNMENT = /\b(password|passwd|pwd|secret|token)\s*[:=]\s*[^\s,;]+/gi;

export function sanitizeVerificationMessage(message?: string): string | undefined {
  if (!message) {
    return undefined;
  }

  const sanitized = message
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

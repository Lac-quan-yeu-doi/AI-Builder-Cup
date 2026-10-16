import type { JsonObject } from '@domain/database-service/value-objects/normalized-connection-config';
import type { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';

export type DatabaseServiceSortBy = 'name' | 'createdAt' | 'updatedAt';
export type DatabaseServiceSortDirection = 'asc' | 'desc';

export interface DatabaseServiceListQuery {
  readonly search?: string;
  /** Restricts the page to the sources filed under one Iceberg database. */
  readonly databaseName?: string;
  /** Excludes only sources already filed under one Iceberg database. */
  readonly excludeDatabaseName?: string;
  readonly connectorType?: string;
  readonly verificationStatus?: VerificationStatusValue;
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: DatabaseServiceSortBy;
  readonly sortDirection: DatabaseServiceSortDirection;
}

export const DEFAULT_DATABASE_SERVICE_LIST_QUERY: DatabaseServiceListQuery = {
  page: 1,
  pageSize: 50,
  sortBy: 'name',
  sortDirection: 'asc',
};

export interface DatabaseServiceSummaryItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface DatabaseServiceView {
  readonly id: string;
  readonly name: string;
  /** Celesnity catalog databases linked to this physical datasource. */
  readonly databaseNames: readonly string[];
  readonly connectorType: string;
  readonly configSchemaVersion: number;
  readonly config: JsonObject;
  readonly summary: readonly DatabaseServiceSummaryItem[];
  readonly verificationStatus: VerificationStatusValue;
  readonly lastTestedAt?: string;
  readonly lastTestError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DatabaseServiceListPage {
  readonly items: readonly DatabaseServiceView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export function toDatabaseServiceSummary(
  config: JsonObject,
): readonly DatabaseServiceSummaryItem[] {
  return Object.entries(config).map(([key, value]) => ({
    key,
    label: key
      .replace(/([a-z])([A-Z])/gu, '$1 $2')
      .replace(/^[a-z]/u, (first) => first.toUpperCase()),
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

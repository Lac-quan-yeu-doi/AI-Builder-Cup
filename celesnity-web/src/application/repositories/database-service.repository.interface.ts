import type {
  DatabaseService,
  DatabaseServiceConnectorDescriptor,
  DatabaseServiceDetailsInput,
  DatabaseServiceInput,
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
  DatabaseServiceUpdateInput,
  DatabaseServiceVerificationResult,
  CdcConnectionProfile,
  CdcConnectionProfileInput,
} from '@/src/entities/models/database-service';

export interface DatabaseServiceRepository {
  list(query?: DatabaseServiceListQuery): Promise<DatabaseServiceListPage>;
  listAvailable(
    query: DatabaseServiceListQuery & { readonly databaseName: string },
  ): Promise<DatabaseServiceListPage>;
  get(id: string): Promise<DatabaseService>;
  listConnectorDescriptors(): Promise<readonly DatabaseServiceConnectorDescriptor[]>;
  testUnsaved(
    connectorType: string,
    details: DatabaseServiceDetailsInput,
  ): Promise<DatabaseServiceVerificationResult>;
  testSaved(id: string): Promise<DatabaseServiceVerificationResult>;
  create(input: DatabaseServiceInput): Promise<DatabaseService>;
  update(id: string, input: DatabaseServiceUpdateInput): Promise<DatabaseService>;
  archive(id: string): Promise<void>;
  attach(id: string, databaseName: string): Promise<void>;
  detach(id: string, databaseName: string): Promise<void>;
  getCdcConnection(id: string): Promise<CdcConnectionProfile>;
  saveCdcConnection(id: string, input: CdcConnectionProfileInput): Promise<CdcConnectionProfile>;
  validateCdcConnection(id: string): Promise<CdcConnectionProfile>;
  removeCdcConnection(id: string): Promise<void>;
}

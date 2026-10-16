import type {
  ConnectionDetailsInput,
  ConnectionVerificationResult,
  DataConnection,
  DataConnectionInput,
} from '@/src/entities/models/connection';

export interface ConnectionRepository {
  list(): Promise<readonly DataConnection[]>;
  get(id: string): Promise<DataConnection>;
  testUnsaved(details: ConnectionDetailsInput): Promise<ConnectionVerificationResult>;
  testSaved(id: string): Promise<ConnectionVerificationResult>;
  create(input: DataConnectionInput): Promise<DataConnection>;
  update(id: string, input: DataConnectionInput): Promise<DataConnection>;
  archive(id: string): Promise<void>;
}

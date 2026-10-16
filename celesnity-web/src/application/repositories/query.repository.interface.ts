import type {
  QueryEditorSession,
  SqlCatalog,
  SqlExecutionAccepted,
  SqlExecutionResult,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';

export interface QueryRepository {
  listCatalogs(): Promise<readonly SqlCatalog[]>;
  listNamespaces(catalog: string): Promise<readonly SqlNamespace[]>;
  listHistory(): Promise<readonly SqlExecutionSummary[]>;
  submit(session: QueryEditorSession): Promise<SqlExecutionAccepted>;
  get(id: string): Promise<SqlExecutionResult>;
  cancel(id: string): Promise<SqlExecutionResult>;
}

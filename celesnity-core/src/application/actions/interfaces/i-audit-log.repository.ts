import type { AuditLogEntry } from '../audit-log-entry.model';

export interface AuditLogListFilter {
  readonly actionName?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface IAuditLogRepository {
  create(entry: AuditLogEntry): Promise<AuditLogEntry>;
  list(filter?: AuditLogListFilter): Promise<readonly AuditLogEntry[]>;
}

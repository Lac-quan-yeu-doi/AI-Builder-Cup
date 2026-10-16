import type { ActionCatalogEntry, ActionPermission } from '@/src/entities/models/action-catalog';

export interface ActionCatalogEntryViewModel {
  readonly toolName: string;
  readonly actionName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permission: ActionPermission;
  readonly auditRequired: boolean;
  readonly approvalRequired: boolean;
}

export function presentActionCatalogEntry(entry: ActionCatalogEntry): ActionCatalogEntryViewModel {
  return Object.freeze({
    toolName: entry.toolName,
    actionName: entry.actionName,
    description: entry.description,
    inputSchema: JSON.parse(JSON.stringify(entry.inputSchema)) as Record<string, unknown>,
    permission: entry.permission,
    auditRequired: entry.auditRequired,
    approvalRequired: entry.approvalRequired,
  });
}

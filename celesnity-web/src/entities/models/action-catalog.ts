export const ACTION_CATALOG_DOMAINS = ['chart', 'document'] as const;
export type ActionCatalogDomain = (typeof ACTION_CATALOG_DOMAINS)[number];

export type ActionPermission = 'read' | 'write';

export interface ActionCatalogEntry {
  readonly toolName: string;
  readonly actionName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permission: ActionPermission;
  readonly auditRequired: boolean;
  readonly approvalRequired: boolean;
}

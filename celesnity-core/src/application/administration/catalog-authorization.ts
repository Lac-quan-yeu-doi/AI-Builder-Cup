export type CatalogResourceType = 'CATALOG' | 'DATABASE' | 'SCHEMA' | 'TABLE' | 'COLUMN';
export type CatalogPermission =
  | 'DISCOVER'
  | 'DESCRIBE'
  | 'PREVIEW'
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'EXECUTE'
  | 'ALTER'
  | 'GRANT'
  | 'OWN';
export type PolicyEffect = 'ALLOW' | 'DENY';

export interface CatalogResourceRef {
  readonly type: CatalogResourceType;
  readonly id: string;
}

export interface CreateCatalogGrantInput {
  readonly groupId?: string;
  readonly identityId?: string;
  readonly agentName?: string;
  readonly resourceType: CatalogResourceType;
  readonly resourceId: string;
  readonly permissions: readonly CatalogPermission[];
  readonly effect: PolicyEffect;
  readonly includeDescendants: boolean;
  readonly grantOption: boolean;
  readonly validFrom?: Date;
  readonly expiresAt?: Date;
}

export interface CatalogAuthorizationDecision {
  readonly allowed: boolean;
  readonly matchedGrantIds: readonly string[];
  readonly reason: 'EXPLICIT_ALLOW' | 'EXPLICIT_DENY' | 'DEFAULT_DENY' | 'RUN_SCOPE_DENIED';
}

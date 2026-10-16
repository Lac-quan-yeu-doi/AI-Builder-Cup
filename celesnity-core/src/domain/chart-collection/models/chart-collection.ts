import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';

export type CollectionAccess = 'NO_ACCESS' | 'VIEW' | 'CURATE';
export type ChartCollectionType = 'ROOT' | 'PERSONAL' | 'COLLECTION';

export interface ChartCollection {
  readonly id: string;
  readonly organizationId: string;
  readonly parentId: string | null;
  readonly ownerIdentityId: string | null;
  readonly type: ChartCollectionType;
  readonly name: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CollectionPrincipal {
  readonly organizationId: string;
  readonly identityId: string;
  readonly isOrganizationAdmin: boolean;
}

const ACCESS_RANK: Readonly<Record<CollectionAccess, number>> = {
  NO_ACCESS: 0,
  VIEW: 1,
  CURATE: 2,
};

export function effectiveCollectionAccess(grants: readonly CollectionAccess[]): CollectionAccess {
  return grants.reduce<CollectionAccess>(
    (effective, access) => (ACCESS_RANK[access] > ACCESS_RANK[effective] ? access : effective),
    'NO_ACCESS',
  );
}

export function validateCollectionMove(collection: ChartCollection, parentId: string | null): void {
  if (collection.type === 'ROOT' || collection.type === 'PERSONAL') {
    throw ChartCollectionError.moveInvalid(`${collection.type} collections cannot be moved.`);
  }
  if (parentId === collection.id) {
    throw ChartCollectionError.moveInvalid('A collection cannot be its own parent.');
  }
}

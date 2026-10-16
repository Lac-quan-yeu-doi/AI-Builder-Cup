import type {
  ChartCollection,
  CollectionAccess,
  CollectionPrincipal,
} from '@domain/chart-collection/models/chart-collection';

export interface CreateCollectionRecord {
  readonly organizationId: string;
  readonly parentId: string | null;
  readonly ownerIdentityId: string | null;
  readonly type: ChartCollection['type'];
  readonly name: string;
}

export interface MoveCollectionRecord {
  readonly collectionId: string;
  readonly organizationId: string;
  readonly parentId: string | null;
}

export interface RenameCollectionRecord {
  readonly collectionId: string;
  readonly organizationId: string;
  readonly name: string;
}

export interface ArchiveCollectionRecord {
  readonly collectionId: string;
  readonly organizationId: string;
  readonly archivedAt: string;
}

export interface SetCollectionGrantRecord {
  readonly collectionId: string;
  readonly organizationId: string;
  readonly authorizationGroupId: string;
  readonly access: Exclude<CollectionAccess, 'NO_ACCESS'>;
}

export interface IChartCollectionRepository {
  findById(organizationId: string, collectionId: string): Promise<ChartCollection | null>;
  ensurePersonalCollection(principal: CollectionPrincipal): Promise<ChartCollection>;
  effectiveAccess(collectionId: string, principal: CollectionPrincipal): Promise<CollectionAccess>;
  create(input: CreateCollectionRecord): Promise<ChartCollection>;
  move(input: MoveCollectionRecord): Promise<ChartCollection>;
  rename(input: RenameCollectionRecord): Promise<ChartCollection>;
  archive(input: ArchiveCollectionRecord): Promise<void>;
  setGrant(input: SetCollectionGrantRecord): Promise<void>;
}

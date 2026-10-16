export type CollectionKind = 'ROOT' | 'PERSONAL' | 'COLLECTION';
export type CollectionAccess = 'NO_ACCESS' | 'VIEW' | 'CURATE';

export interface ChartCollection {
  readonly id: string;
  readonly organizationId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly kind: CollectionKind;
  readonly access: CollectionAccess;
  readonly chartCount: number;
  readonly archivedAt: string | null;
  readonly updatedAt?: string;
  readonly children: readonly ChartCollection[];
}

export interface CreateChartCollectionInput {
  readonly name: string;
  readonly description?: string | null;
  readonly parentId?: string | null;
}

export interface UpdateChartCollectionInput {
  readonly name?: string;
  readonly description?: string | null;
}

export interface ChartCollectionRepository {
  list(): Promise<readonly ChartCollection[]>;
  create(input: CreateChartCollectionInput): Promise<ChartCollection>;
  update(id: string, input: UpdateChartCollectionInput): Promise<ChartCollection>;
  move(id: string, parentId: string | null): Promise<ChartCollection>;
  archive(id: string): Promise<void>;
}

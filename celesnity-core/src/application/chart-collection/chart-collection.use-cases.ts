import type {
  IChartCollectionRepository,
  CreateCollectionRecord,
  MoveCollectionRecord,
  RenameCollectionRecord,
  ArchiveCollectionRecord,
  SetCollectionGrantRecord,
} from '@application/chart-collection/interfaces/i-chart-collection.repository';
import type {
  ChartCollection,
  CollectionPrincipal,
  CollectionAccess,
} from '@domain/chart-collection/models/chart-collection';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';
import type { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';

export class ChartCollectionUseCases {
  public constructor(
    private readonly repository: IChartCollectionRepository,
    private readonly authorization: CollectionAuthorizationService,
  ) {}

  public async listCollections(
    principal: CollectionPrincipal,
  ): Promise<readonly ChartCollection[]> {
    await this.authorization.requireActor(principal, 'LIST');
    // The repository's minimal port is intentionally organization-scoped. A
    // small optional extension keeps old adapters source-compatible.
    const reader = this.repository as IChartCollectionRepository & {
      list?(organizationId: string): Promise<readonly ChartCollection[]>;
    };
    await this.repository.ensurePersonalCollection(principal);
    const collections = reader.list ? await reader.list(principal.organizationId) : [];
    const visible: ChartCollection[] = [];
    for (const collection of collections) {
      try {
        await this.authorization.requireAccess(collection.id, principal, 'VIEW');
        visible.push(collection);
      } catch (error) {
        // Only an authorization denial is a hidden item. A broken audit trail
        // or missing request context must fail the whole request closed.
        if (
          !(error instanceof ChartCollectionError) ||
          !['COLLECTION_ACCESS_DENIED', 'COLLECTION_NOT_FOUND'].includes(error.code)
        )
          throw error;
      }
    }
    return visible;
  }

  public async ensurePersonalCollection(principal: CollectionPrincipal): Promise<ChartCollection> {
    await this.authorization.requireActor(principal, 'ENSURE_PERSONAL');
    return this.repository.ensurePersonalCollection(principal);
  }

  public accessFor(
    collectionId: string,
    principal: CollectionPrincipal,
  ): Promise<CollectionAccess> {
    return this.authorization.requireAccess(collectionId, principal, 'VIEW');
  }

  public async createCollection(
    input: CreateCollectionRecord,
    principal: CollectionPrincipal,
  ): Promise<ChartCollection> {
    await this.authorization.requireActor(principal, 'CREATE', input.parentId ?? undefined);
    if (!input.name.trim()) throw ChartCollectionError.validation('Collection name is required.');
    if (principal.organizationId !== input.organizationId) {
      throw ChartCollectionError.accessDenied();
    }
    if (input.parentId) {
      await this.authorization.requireAccess(input.parentId, principal, 'CURATE');
    } else {
      await this.authorization.requireTopLevelCreate(principal);
    }
    return this.repository.create({ ...input, name: input.name.trim() });
  }

  public async moveCollection(
    input: MoveCollectionRecord,
    principal: CollectionPrincipal,
  ): Promise<ChartCollection> {
    await this.authorization.requireActor(principal, 'MOVE', input.collectionId);
    if (principal.organizationId !== input.organizationId) {
      throw ChartCollectionError.accessDenied();
    }
    const collection = await this.repository.findById(input.organizationId, input.collectionId);
    if (collection === null) throw ChartCollectionError.notFound();
    await this.authorization.requireAccess(collection.id, principal, 'CURATE');
    if (input.parentId) await this.authorization.requireAccess(input.parentId, principal, 'CURATE');
    return this.repository.move(input);
  }

  public async renameCollection(
    input: RenameCollectionRecord,
    principal: CollectionPrincipal,
  ): Promise<ChartCollection> {
    await this.authorization.requireActor(principal, 'RENAME', input.collectionId);
    const name = input.name.trim();
    if (!name) throw ChartCollectionError.validation('Collection name is required.');
    if (principal.organizationId !== input.organizationId) {
      throw ChartCollectionError.accessDenied();
    }
    const collection = await this.repository.findById(input.organizationId, input.collectionId);
    if (collection === null) throw ChartCollectionError.notFound();
    if (collection.type === 'ROOT' || collection.type === 'PERSONAL') {
      throw ChartCollectionError.validation(`${collection.type} collections cannot be renamed.`);
    }
    await this.authorization.requireAccess(collection.id, principal, 'CURATE');
    return this.repository.rename({ ...input, name });
  }

  public async archiveCollection(
    input: Omit<ArchiveCollectionRecord, 'archivedAt'>,
    principal: CollectionPrincipal,
  ): Promise<void> {
    await this.authorization.requireActor(principal, 'ARCHIVE', input.collectionId);
    if (principal.organizationId !== input.organizationId) {
      throw ChartCollectionError.accessDenied();
    }
    const collection = await this.repository.findById(input.organizationId, input.collectionId);
    if (collection === null) throw ChartCollectionError.notFound();
    if (collection.type === 'ROOT' || collection.type === 'PERSONAL') {
      throw ChartCollectionError.validation(`${collection.type} collections cannot be archived.`);
    }
    await this.authorization.requireAccess(collection.id, principal, 'CURATE');
    await this.repository.archive({
      ...input,
      archivedAt: new Date().toISOString(),
    });
  }

  public async requireCurate(collectionId: string, principal: CollectionPrincipal): Promise<void> {
    await this.authorization.requireAccess(collectionId, principal, 'CURATE');
  }

  public async setCollectionGrant(
    input: SetCollectionGrantRecord,
    principal: CollectionPrincipal,
  ): Promise<void> {
    await this.authorization.requireActor(principal, 'SET_GRANT', input.collectionId);
    if (!input.organizationId || !input.authorizationGroupId) {
      throw ChartCollectionError.validation('Organization and group are required.');
    }
    if (principal.organizationId !== input.organizationId) {
      throw ChartCollectionError.accessDenied();
    }
    await this.authorization.requireAccess(input.collectionId, principal, 'CURATE');
    await this.repository.setGrant(input);
  }
}

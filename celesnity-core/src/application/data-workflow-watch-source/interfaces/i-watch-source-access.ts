import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  WatchSourceCatalogPage,
  WatchSourceCatalogQuery,
  WatchSourceCatalogRelationView,
  WatchSourceCatalogServiceView,
} from '@application/data-workflow-watch-source/read-models/watch-source-catalog.view';

export interface WatchSourceMetadataRelation {
  readonly schema: string;
  readonly table: string;
  readonly columns: readonly string[];
}

/**
 * A tenant-authorized, verified source projection. It deliberately excludes
 * connection configuration, resolved destinations, and credentials.
 */
export interface WatchSourceMetadata {
  readonly connectorType: string;
  readonly relations: readonly WatchSourceMetadataRelation[];
}

/** Tenant ownership, PIPELINES permission, and verified metadata boundary for customer sources. */
export interface IWatchSourceAccess {
  readVerifiedMetadata(
    actor: WorkflowActor,
    databaseServiceId: string,
  ): Promise<WatchSourceMetadata>;
  listCatalogServices(
    actor: WorkflowActor,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogServiceView>>;
  listCatalogRelations(
    actor: WorkflowActor,
    databaseServiceId: string,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogRelationView>>;
}

import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWatchSourceAccess } from '@application/data-workflow-watch-source/interfaces/i-watch-source-access';
import type {
  WatchSourceCatalogPage,
  WatchSourceCatalogQuery,
  WatchSourceCatalogRelationView,
  WatchSourceCatalogServiceView,
} from '@application/data-workflow-watch-source/read-models/watch-source-catalog.view';

export class ListWatchSourceCatalogUseCase {
  public constructor(private readonly access: IWatchSourceAccess) {}

  public services(
    actor: WorkflowActor,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogServiceView>> {
    return this.access.listCatalogServices(actor, normalizeQuery(query));
  }

  public relations(
    actor: WorkflowActor,
    databaseServiceId: string,
    query: WatchSourceCatalogQuery,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogRelationView>> {
    return this.access.listCatalogRelations(actor, databaseServiceId, normalizeQuery(query));
  }
}

function normalizeQuery(query: WatchSourceCatalogQuery): WatchSourceCatalogQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search === undefined || query.search.trim() === ''
      ? {}
      : { search: query.search.trim().slice(0, 120) }),
  };
}

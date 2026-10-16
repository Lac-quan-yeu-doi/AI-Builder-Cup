import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  SourceColumnQueryInput,
  SourceNamespaceQueryInput,
  SourceRelationQueryInput,
} from './source-metadata.schemas';
import {
  sourceColumnQuerySchema,
  sourceMetadataIdSchema,
  sourceNamespaceQuerySchema,
  sourceRelationQuerySchema,
} from './source-metadata.schemas';
import type { SourceMetadataUseCases } from '@/src/application/use-cases/metadata-crawler/source-metadata.use-cases';
import {
  presentSourceColumnPage,
  presentSourceConstraints,
  presentSourceNamespacePage,
  presentSourceRelation,
  presentSourceRelationPage,
} from '@/src/interface-adapters/presenters/source-metadata.presenter';
import type {
  SourceColumnSort,
  SourceNamespaceSort,
  SourceRelationSort,
} from '@/src/entities/models/source-metadata';

export interface SourceMetadataController {
  getSummary(crawlerId: string): ReturnType<SourceMetadataUseCases['getSummary']>;
  listNamespaces(
    crawlerId: string,
    query?: SourceNamespaceQueryInput,
  ): ReturnType<SourceMetadataUseCases['listNamespaces']>;
  listRelations(
    crawlerId: string,
    namespaceId: string,
    query?: SourceRelationQueryInput,
  ): ReturnType<SourceMetadataUseCases['listRelations']>;
  getRelation(
    crawlerId: string,
    relationId: string,
  ): ReturnType<SourceMetadataUseCases['getRelation']>;
  listColumns(
    crawlerId: string,
    relationId: string,
    query?: SourceColumnQueryInput,
  ): ReturnType<SourceMetadataUseCases['listColumns']>;
  listConstraints(
    crawlerId: string,
    relationId: string,
  ): ReturnType<SourceMetadataUseCases['listConstraints']>;
}

export const createSourceMetadataController = (
  useCases: SourceMetadataUseCases,
): SourceMetadataController => ({
  async getSummary(crawlerId) {
    return useCases.getSummary(parseId(crawlerId));
  },
  async listNamespaces(crawlerId, query) {
    return presentSourceNamespacePage(
      await useCases.listNamespaces(parseId(crawlerId), parseNamespaceQuery(query)),
    );
  },
  async listRelations(crawlerId, namespaceId, query) {
    return presentSourceRelationPage(
      await useCases.listRelations(
        parseId(crawlerId),
        parseId(namespaceId),
        parseRelationQuery(query),
      ),
    );
  },
  async getRelation(crawlerId, relationId) {
    return presentSourceRelation(
      await useCases.getRelation(parseId(crawlerId), parseId(relationId)),
    );
  },
  async listColumns(crawlerId, relationId, query) {
    return presentSourceColumnPage(
      await useCases.listColumns(parseId(crawlerId), parseId(relationId), parseColumnQuery(query)),
    );
  },
  async listConstraints(crawlerId, relationId) {
    return presentSourceConstraints(
      await useCases.listConstraints(parseId(crawlerId), parseId(relationId)),
    );
  },
});

function parseId(value: string): string {
  const parsed = sourceMetadataIdSchema.safeParse(value);
  if (!parsed.success)
    throw new InputParseError('Invalid source metadata id', { cause: parsed.error });
  return parsed.data;
}

function parseNamespaceQuery(query: SourceNamespaceQueryInput | undefined) {
  return parseQuery(sourceNamespaceQuerySchema, query, 'Invalid source namespace query') as {
    readonly page: number;
    readonly pageSize: number;
    readonly search?: string;
    readonly sortBy: SourceNamespaceSort;
    readonly sortDirection: 'asc' | 'desc';
  };
}

function parseRelationQuery(query: SourceRelationQueryInput | undefined) {
  return parseQuery(sourceRelationQuerySchema, query, 'Invalid source relation query') as {
    readonly page: number;
    readonly pageSize: number;
    readonly search?: string;
    readonly sortBy: SourceRelationSort;
    readonly sortDirection: 'asc' | 'desc';
  };
}

function parseColumnQuery(query: SourceColumnQueryInput | undefined) {
  return parseQuery(sourceColumnQuerySchema, query, 'Invalid source column query') as {
    readonly page: number;
    readonly pageSize: number;
    readonly search?: string;
    readonly sortBy: SourceColumnSort;
    readonly sortDirection: 'asc' | 'desc';
  };
}

function parseQuery<
  TSchema extends {
    safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown };
  },
>(schema: TSchema, query: unknown, message: string): unknown {
  const parsed = schema.safeParse(query ?? {});
  if (!parsed.success) throw new InputParseError(message, { cause: parsed.error });
  return parsed.data;
}

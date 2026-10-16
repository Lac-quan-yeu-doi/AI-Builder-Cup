import { z } from 'zod';

export const sourceMetadataIdSchema = z.string().uuid();

const pageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional(),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
});

export const sourceNamespaceQuerySchema = pageSchema.extend({
  sortBy: z.enum(['name', 'relationCount', 'lastCrawledAt']).default('name'),
});

export const sourceRelationQuerySchema = pageSchema.extend({
  sortBy: z.enum(['name', 'relationType', 'columnCount', 'lastCrawledAt']).default('name'),
});

export const sourceColumnQuerySchema = pageSchema.extend({
  sortBy: z.enum(['ordinalPosition', 'name', 'nativeType', 'nullable']).default('ordinalPosition'),
});

export type SourceNamespaceQueryInput = z.input<typeof sourceNamespaceQuerySchema>;
export type SourceRelationQueryInput = z.input<typeof sourceRelationQuerySchema>;
export type SourceColumnQueryInput = z.input<typeof sourceColumnQuerySchema>;

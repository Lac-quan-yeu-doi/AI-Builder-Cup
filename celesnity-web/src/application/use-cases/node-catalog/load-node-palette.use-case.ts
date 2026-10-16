import type { NodeCatalogRepository } from '@/src/application/repositories/node-catalog.repository.interface';
import type { NodePalette } from '@/src/entities/models/node-definition';

export type LoadNodePaletteUseCase = ReturnType<typeof createLoadNodePaletteUseCase>;

/** The Core API caps a page at 100 definitions. */
const PALETTE_PAGE_SIZE = 100;

/**
 * Loads one page of definitions per category so the palette can group them the
 * way the Core API orders its categories. Empty groups are kept: a workspace
 * with no verified connection has no SOURCE nodes, and the canvas says so.
 */
export const createLoadNodePaletteUseCase =
  (repository: NodeCatalogRepository) =>
  async (keyword?: string): Promise<NodePalette> => {
    const categories = await repository.listCategories();
    const groups = await Promise.all(
      [...categories]
        .sort((left, right) => left.order - right.order)
        .map(async (category) => ({
          category,
          definitions: await repository.listDefinitions({
            category: category.type,
            pageSize: PALETTE_PAGE_SIZE,
            ...(keyword ? { keyword } : {}),
          }),
        })),
    );

    return groups;
  };

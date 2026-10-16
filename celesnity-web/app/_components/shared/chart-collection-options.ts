import type { ChartCollection } from '@/src/entities/models/chart-collection';

export interface CollectionOption {
  readonly collection: ChartCollection;
  /** The full path, for telling two collections with the same leaf name apart. */
  readonly path: string;
}

/**
 * Every collection a chart can actually be put in, flattened.
 *
 * Only `CURATE` access is a valid destination, and an archived collection is
 * not one at all. Descendants of a collection you cannot curate still count:
 * access is granted per collection, not inherited down the tree.
 */
export function flattenCollectionOptions(
  collections: readonly ChartCollection[],
  ancestors: readonly string[] = [],
): readonly CollectionOption[] {
  return collections.flatMap((collection) => {
    if (collection.archivedAt !== null) return [];
    const pathParts = [...ancestors, collection.name];
    const descendants = flattenCollectionOptions(collection.children, pathParts);
    const current =
      collection.access === 'CURATE'
        ? [{ collection, path: pathParts.join(' / ') } satisfies CollectionOption]
        : [];
    return [...current, ...descendants];
  });
}

/**
 * Where a chart goes when nobody was asked.
 *
 * Keeping an answer used to open a dialog demanding a destination before the
 * person had decided the thing was worth keeping at all, in a workspace whose
 * only valid destination was their own collection. So the destination is
 * derived instead: the personal collection, which every account has and only
 * its owner curates.
 *
 * Falling back to the first curatable collection covers the account whose
 * personal collection is missing or read-only; `null` means there is nowhere to
 * put a chart, and the caller should not offer to.
 */
export function defaultKeepDestination(
  collections: readonly ChartCollection[],
): CollectionOption | null {
  const options = flattenCollectionOptions(collections);
  return options.find((option) => option.collection.kind === 'PERSONAL') ?? options[0] ?? null;
}

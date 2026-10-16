import { describe, expect, it } from 'vitest';

import {
  defaultKeepDestination,
  flattenCollectionOptions,
} from '@/app/_components/shared/chart-collection-options';
import type { ChartCollection, CollectionKind } from '@/src/entities/models/chart-collection';

function collection(
  name: string,
  overrides: Partial<ChartCollection> & { readonly kind?: CollectionKind } = {},
): ChartCollection {
  return {
    id: name.toLowerCase().replaceAll(' ', '-'),
    organizationId: 'org',
    parentId: null,
    name,
    description: null,
    kind: 'COLLECTION',
    access: 'CURATE',
    chartCount: 0,
    archivedAt: null,
    children: [],
    ...overrides,
  };
}

describe('flattenCollectionOptions', () => {
  it('names each destination by its full path', () => {
    const tree = [collection('Ops', { children: [collection('Line 3')] })];
    expect(flattenCollectionOptions(tree).map((option) => option.path)).toEqual([
      'Ops',
      'Ops / Line 3',
    ]);
  });

  it('offers only what the person can curate', () => {
    const tree = [collection('Shared', { access: 'VIEW' }), collection('Mine')];
    expect(flattenCollectionOptions(tree).map((option) => option.collection.name)).toEqual([
      'Mine',
    ]);
  });

  it('keeps a curatable child of a collection nobody can curate', () => {
    /* Access is granted per collection, not inherited down the tree. */
    const tree = [collection('Shared', { access: 'VIEW', children: [collection('Drafts')] })];
    expect(flattenCollectionOptions(tree).map((option) => option.path)).toEqual([
      'Shared / Drafts',
    ]);
  });

  it('drops an archived collection and everything under it', () => {
    const tree = [
      collection('Old', { archivedAt: '2026-01-01T00:00:00Z', children: [collection('Inner')] }),
    ];
    expect(flattenCollectionOptions(tree)).toEqual([]);
  });
});

describe('defaultKeepDestination', () => {
  it('picks the personal collection, wherever it sits in the tree', () => {
    const tree = [
      collection('Team'),
      collection('Ops', { children: [collection('Mine', { kind: 'PERSONAL' })] }),
    ];
    expect(defaultKeepDestination(tree)?.collection.name).toBe('Mine');
  });

  it('falls back to the first curatable collection when there is no personal one', () => {
    const tree = [collection('Shared', { access: 'VIEW' }), collection('Team')];
    expect(defaultKeepDestination(tree)?.collection.name).toBe('Team');
  });

  it('returns nothing when there is nowhere to put a chart', () => {
    /* The caller must not offer to keep, rather than offer and then fail. */
    expect(defaultKeepDestination([collection('Shared', { access: 'VIEW' })])).toBeNull();
    expect(defaultKeepDestination([])).toBeNull();
  });

  it('never picks an archived personal collection', () => {
    const tree = [
      collection('Mine', { kind: 'PERSONAL', archivedAt: '2026-01-01T00:00:00Z' }),
      collection('Team'),
    ];
    expect(defaultKeepDestination(tree)?.collection.name).toBe('Team');
  });
});

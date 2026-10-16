import {
  effectiveCollectionAccess,
  validateCollectionMove,
  type ChartCollection,
} from '@domain/chart-collection/models/chart-collection';

describe('ChartCollection', () => {
  it('uses the highest additive group grant', () => {
    expect(effectiveCollectionAccess(['VIEW', 'CURATE', 'NO_ACCESS'])).toBe('CURATE');
  });

  it('rejects moving a collection below itself', () => {
    const root: ChartCollection = {
      id: 'root-id',
      organizationId: 'organization-id',
      parentId: null,
      ownerIdentityId: null,
      type: 'ROOT',
      name: 'Root',
      archivedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };

    expect(() => validateCollectionMove(root, 'child-id')).toThrow('COLLECTION_MOVE_INVALID');
  });
});

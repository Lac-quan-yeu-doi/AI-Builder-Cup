import { describe, expect, it } from 'vitest';

import { createRelationAlias } from '@/app/(workspace)/charts/_components/relation-alias';

describe('createRelationAlias', () => {
  it('keeps ordinary physical names readable', () => {
    expect(createRelationAlias('Order Items', 'source')).toBe('order_items');
  });

  it('prefixes physical names that begin with a digit', () => {
    expect(createRelationAlias('321654', 'source')).toBe('source_321654');
    expect(createRelationAlias('321654', 'join')).toBe('join_321654');
  });

  it('deduplicates the resulting safe alias', () => {
    expect(createRelationAlias('321654', 'join', ['join_321654', 'join_321654_2'])).toBe(
      'join_321654_3',
    );
  });
});

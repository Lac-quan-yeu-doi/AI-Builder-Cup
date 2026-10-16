import { describe, expect, it } from 'vitest';

import {
  filterCatalog,
  normalizeSearchTerm,
  type CatalogTutorial,
} from '@/src/entities/models/tutorial-catalog';

type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';

interface TutorialFixture extends CatalogTutorial {
  readonly id: string;
  readonly status: Status;
}

const tutorials: readonly TutorialFixture[] = [
  {
    id: 'database-basics',
    title: 'Database Basics',
    summary: 'Create and inspect a database',
    category: 'Data management',
    status: 'NOT_STARTED',
  },
  {
    id: 'streaming-pipeline',
    title: 'Streaming Pipeline',
    summary: 'Process EVENTS continuously',
    category: 'Streaming',
    status: 'IN_PROGRESS',
  },
  {
    id: 'query-data',
    title: 'Query Data',
    summary: 'Explore tables with SQL',
    category: 'Analytics',
    status: 'COMPLETED',
  },
];

describe('normalizeSearchTerm', () => {
  it('trims leading and trailing whitespace without changing letter case', () => {
    expect(normalizeSearchTerm('  Streaming Pipeline\n')).toBe('Streaming Pipeline');
  });
});

describe('filterCatalog', () => {
  it.each([
    ['title', '  DATABASE basics  ', ['database-basics']],
    ['summary', 'events', ['streaming-pipeline']],
    ['category', 'ANALYTICS', ['query-data']],
  ])('matches %s case-insensitively after trimming', (_field, searchTerm, expectedIds) => {
    expect(filterCatalog(tutorials, searchTerm, []).map(({ id }) => id)).toEqual(expectedIds);
  });

  it('combines search and selected statuses as a conjunction', () => {
    expect(filterCatalog(tutorials, 'data', ['COMPLETED'])).toEqual([tutorials[2]]);
    expect(filterCatalog(tutorials, 'data', ['IN_PROGRESS'])).toEqual([]);
  });

  it('treats multiple selected statuses as alternatives within the status filter', () => {
    expect(filterCatalog(tutorials, '', ['NOT_STARTED', 'COMPLETED'])).toEqual([
      tutorials[0],
      tutorials[2],
    ]);
  });

  it('restores the full catalog in original order when search and filters are cleared', () => {
    const cleared = filterCatalog(tutorials, '   ', []);

    expect(cleared).toBe(tutorials);
    expect(cleared.map(({ id }) => id)).toEqual([
      'database-basics',
      'streaming-pipeline',
      'query-data',
    ]);
  });

  it('returns no tutorials when none satisfy both search and status filtering', () => {
    expect(filterCatalog(tutorials, 'missing tutorial', ['PAUSED'])).toEqual([]);
  });
});

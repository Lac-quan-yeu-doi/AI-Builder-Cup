import { describe, expect, it } from 'vitest';

import {
  presentTutorialCatalog,
  type TutorialCatalogPresentationItem,
} from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';

describe('presentTutorialCatalog', () => {
  it('presents complete catalog cards with status, optional progress, and the no-results state', () => {
    const tutorials: readonly TutorialCatalogPresentationItem[] = [
      {
        id: 'tutorial-1',
        title: 'Build a pipeline',
        summary: 'Create and run a pipeline.',
        category: 'Data engineering',
        learningOutcomes: ['Create a pipeline', 'Run a pipeline'],
        estimatedMinutes: 12,
        stepCount: 4,
        status: 'IN_PROGRESS',
        progressPercentage: 50,
      },
      {
        id: 'tutorial-2',
        title: 'Explore a database',
        summary: 'Inspect database metadata.',
        category: 'Catalog',
        learningOutcomes: ['Inspect metadata'],
        estimatedMinutes: 5,
        stepCount: 2,
        status: 'NOT_STARTED',
      },
    ];

    const view = presentTutorialCatalog(tutorials);

    expect(view).toEqual({
      tutorials: [
        { ...tutorials[0], learningOutcomes: ['Create a pipeline', 'Run a pipeline'] },
        { ...tutorials[1], learningOutcomes: ['Inspect metadata'] },
      ],
      noResults: false,
    });
    expect(view.tutorials[1]).toBeDefined();
    expect('progressPercentage' in (view.tutorials[1] ?? {})).toBe(false);
    expect(presentTutorialCatalog([])).toEqual({ tutorials: [], noResults: true });
  });

  it('returns fresh nested data and exposes only allowlisted catalog fields', () => {
    const learningOutcomes = ['Create a connection'];
    const source = [
      {
        id: 'tutorial-1',
        title: 'Create a connection',
        summary: 'Connect an authorized data source.',
        category: 'Connections',
        learningOutcomes,
        estimatedMinutes: 8,
        stepCount: 3,
        status: 'PAUSED' as const,
        progressPercentage: 33,
        authentication: { token: 'token-must-not-leak' },
        inaccessibleDetails: { title: 'Restricted tutorial' },
      },
    ];

    const view = presentTutorialCatalog(source);
    learningOutcomes[0] = 'Changed after presentation';
    const firstSource = source[0];
    if (firstSource === undefined) throw new Error('Expected the catalog source fixture.');
    source.push({ ...firstSource, id: 'tutorial-2' });

    expect(view.tutorials).toHaveLength(1);
    expect(view.tutorials[0]?.learningOutcomes).toEqual(['Create a connection']);
    expect(view.tutorials[0]?.learningOutcomes).not.toBe(learningOutcomes);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.tutorials)).toBe(true);
    expect(Object.isFrozen(view.tutorials[0])).toBe(true);
    expect(Object.isFrozen(view.tutorials[0]?.learningOutcomes)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('token-must-not-leak');
    expect(JSON.stringify(view)).not.toContain('Restricted tutorial');
  });
});

import { describe, expect, it } from 'vitest';

import { presentTutorialDetail } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';

describe('presentTutorialDetail', () => {
  it('presents metadata, prerequisite remediation, context choices, selected names, and start state', () => {
    const view = presentTutorialDetail({
      tutorialId: 'tutorial-1',
      experience: { mode: 'WORKSPACE' },
      metadata: {
        title: 'Build a pipeline',
        summary: 'Create and run a pipeline.',
        category: 'Data engineering',
        learningOutcomes: ['Create a pipeline', 'Run a pipeline'],
        estimatedMinutes: 12,
        stepCount: 4,
      },
      prerequisiteStates: [
        {
          id: 'connection-ready',
          description: 'A connection is available.',
          satisfied: false,
          remediation: { label: 'Create connection', href: '/workspace/connections' },
        },
        {
          id: 'workspace-ready',
          description: 'The workspace is ready.',
          satisfied: true,
          remediation: null,
        },
      ],
      contextSelectors: [
        {
          id: 'database:1',
          requirementId: 'database',
          resourceType: 'DATABASE',
          options: [
            { id: 'db-1', name: 'Orders', resourceType: 'DATABASE' },
            { id: 'db-2', name: 'Inventory', resourceType: 'DATABASE' },
          ],
          selectedResource: { id: 'db-1', name: 'Orders', resourceType: 'DATABASE' },
        },
      ],
      startEnabled: false,
    });

    expect(view).toEqual({
      tutorialId: 'tutorial-1',
      experience: { mode: 'WORKSPACE' },
      metadata: {
        title: 'Build a pipeline',
        summary: 'Create and run a pipeline.',
        category: 'Data engineering',
        learningOutcomes: ['Create a pipeline', 'Run a pipeline'],
        estimatedMinutes: 12,
        stepCount: 4,
      },
      prerequisiteStates: [
        {
          id: 'connection-ready',
          description: 'A connection is available.',
          satisfied: false,
          remediation: { label: 'Create connection', href: '/workspace/connections' },
        },
        {
          id: 'workspace-ready',
          description: 'The workspace is ready.',
          satisfied: true,
          remediation: null,
        },
      ],
      contextSelectors: [
        {
          id: 'database:1',
          requirementId: 'database',
          resourceType: 'DATABASE',
          options: [
            { id: 'db-1', name: 'Orders' },
            { id: 'db-2', name: 'Inventory' },
          ],
          selectedResourceId: 'db-1',
          selectedResourceName: 'Orders',
        },
      ],
      startEnabled: false,
    });
  });

  it('deep-copies nested data and omits unknown inaccessible or secret-bearing fields', () => {
    const learningOutcomes = ['Inspect authorized metadata'];
    const remediation = {
      label: 'Open catalog',
      href: '/workspace/catalog',
      token: 'remediation-token-must-not-leak',
    };
    const option = {
      id: 'db-1',
      name: 'Orders',
      resourceType: 'DATABASE',
      privateKey: 'private-key-must-not-leak',
    };
    const options = [option];
    const input = {
      tutorialId: 'tutorial-1',
      experience: { mode: 'WORKSPACE' as const },
      metadata: {
        title: 'Explore metadata',
        summary: 'Inspect an authorized database.',
        category: 'Catalog',
        learningOutcomes,
        estimatedMinutes: 5,
        stepCount: 2,
        credential: 'credential-must-not-leak',
      },
      prerequisiteStates: [
        {
          id: 'catalog-ready',
          description: 'Catalog access is available.',
          satisfied: false,
          remediation,
        },
      ],
      contextSelectors: [
        {
          id: 'database:1',
          requirementId: 'database',
          resourceType: 'DATABASE',
          options,
          selectedResource: option,
          inaccessibleResourceDetails: { name: 'Restricted warehouse' },
        },
      ],
      startEnabled: true,
      inaccessibleTutorialDetails: { title: 'Restricted tutorial' },
    };

    const view = presentTutorialDetail(input);
    learningOutcomes[0] = 'Changed after presentation';
    remediation.label = 'Changed remediation';
    option.name = 'Changed resource';
    options.push({ ...option, id: 'db-2' });

    expect(view.metadata.learningOutcomes).toEqual(['Inspect authorized metadata']);
    expect(view.metadata.learningOutcomes).not.toBe(learningOutcomes);
    expect(view.prerequisiteStates[0]?.remediation).toEqual({
      label: 'Open catalog',
      href: '/workspace/catalog',
    });
    expect(view.contextSelectors[0]).toMatchObject({
      options: [{ id: 'db-1', name: 'Orders' }],
      selectedResourceId: 'db-1',
      selectedResourceName: 'Orders',
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.metadata)).toBe(true);
    expect(Object.isFrozen(view.metadata.learningOutcomes)).toBe(true);
    expect(Object.isFrozen(view.prerequisiteStates)).toBe(true);
    expect(Object.isFrozen(view.prerequisiteStates[0])).toBe(true);
    expect(Object.isFrozen(view.prerequisiteStates[0]?.remediation)).toBe(true);
    expect(Object.isFrozen(view.contextSelectors)).toBe(true);
    expect(Object.isFrozen(view.contextSelectors[0])).toBe(true);
    expect(Object.isFrozen(view.contextSelectors[0]?.options)).toBe(true);
    expect(Object.isFrozen(view.contextSelectors[0]?.options[0])).toBe(true);

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('credential-must-not-leak');
    expect(serialized).not.toContain('remediation-token-must-not-leak');
    expect(serialized).not.toContain('private-key-must-not-leak');
    expect(serialized).not.toContain('Restricted warehouse');
    expect(serialized).not.toContain('Restricted tutorial');
  });

  it('uses null selected identifiers and names when a context selector is unfilled', () => {
    const view = presentTutorialDetail({
      tutorialId: 'tutorial-1',
      experience: { mode: 'WORKSPACE' },
      metadata: {
        title: 'Explore metadata',
        summary: 'Inspect a database.',
        category: 'Catalog',
        learningOutcomes: [],
        estimatedMinutes: 5,
        stepCount: 1,
      },
      prerequisiteStates: [],
      contextSelectors: [
        {
          id: 'database:1',
          requirementId: 'database',
          resourceType: 'DATABASE',
          options: [],
          selectedResource: null,
        },
      ],
      startEnabled: false,
    });

    expect(view.contextSelectors[0]).toMatchObject({
      selectedResourceId: null,
      selectedResourceName: null,
    });
  });
});

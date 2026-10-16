import { describe, expect, it, vi } from 'vitest';

import { createResolveOnboardingUseCase } from '@/src/application/use-cases/tutorials/resolve-onboarding.use-case';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

function catalogTutorial(id: string, title: string): PublishedCatalogTutorial {
  return {
    id,
    title,
    summary: `${title} summary`,
    category: 'Getting started',
    learningOutcomes: [`Learn ${title}`],
    estimatedMinutes: 5,
    stepCount: 1,
  };
}

function tutorialDefinition(
  tutorial: PublishedCatalogTutorial,
  requiredFeatures: readonly WorkspaceFeature[],
): TutorialDefinition {
  return {
    id: tutorial.id,
    metadata: {
      title: tutorial.title,
      summary: tutorial.summary,
      category: tutorial.category,
      learningOutcomes: tutorial.learningOutcomes,
      estimatedMinutes: tutorial.estimatedMinutes,
      stepCount: tutorial.stepCount,
    },
    steps: [
      {
        id: `${tutorial.id}-step`,
        order: 1,
        title: 'Start',
        instructionalContent: 'Start the tutorial.',
        destinationFeature: requiredFeatures[0] ?? 'HOME',
        destinationHref: '/workspace',
      },
    ],
    requiredFeatures,
    prerequisites: [],
    contextRequirements: [],
  };
}

function createFixture(options?: {
  readonly decision?: OnboardingDecision | null;
  readonly accessibleFeatures?: readonly WorkspaceFeature[];
}) {
  const catalog = [
    catalogTutorial('analytics-starter', 'Analytics starter'),
    catalogTutorial('query-starter', 'Query starter'),
  ] as const;
  const definitions = new Map<string, TutorialDefinition>([
    [catalog[0].id, tutorialDefinition(catalog[0], ['ANALYTICS'])],
    [catalog[1].id, tutorialDefinition(catalog[1], ['QUERY'])],
  ]);
  const getOnboardingDecision = vi
    .fn<() => Promise<OnboardingDecision | null>>()
    .mockResolvedValue(options?.decision ?? null);
  const listAccessibleCatalog = vi
    .fn<() => Promise<readonly PublishedCatalogTutorial[]>>()
    .mockResolvedValue(catalog);
  const getDefinition = vi.fn(async (id: string): Promise<TutorialDefinition> => {
    const definition = definitions.get(id);
    if (definition === undefined) {
      throw new RangeError(`Unknown tutorial: ${id}`);
    }
    return definition;
  });
  const accessibleFeatures = vi
    .fn<() => Promise<readonly WorkspaceFeature[]>>()
    .mockResolvedValue(options?.accessibleFeatures ?? ['QUERY']);
  const resolve = createResolveOnboardingUseCase({
    tutorialRepository: { listAccessibleCatalog, getDefinition },
    progressRepository: { getOnboardingDecision },
    featureAccessService: { accessibleFeatures },
  });

  return {
    accessibleFeatures,
    catalog,
    getDefinition,
    getOnboardingDecision,
    listAccessibleCatalog,
    resolve,
  };
}

describe('resolve onboarding use case', () => {
  it('suppresses automatic onboarding after a persisted decision', async () => {
    const fixture = createFixture({ decision: 'dismissed' });

    await expect(fixture.resolve()).resolves.toEqual({
      outcome: 'NOT_PRESENTED',
      invitationVisible: false,
    });
    expect(fixture.listAccessibleCatalog).not.toHaveBeenCalled();
    expect(fixture.accessibleFeatures).not.toHaveBeenCalled();
    expect(fixture.getDefinition).not.toHaveBeenCalled();
  });

  it('recommends the first catalog tutorial allowed by current feature access', async () => {
    const fixture = createFixture({ accessibleFeatures: ['QUERY'] });

    await expect(fixture.resolve()).resolves.toEqual({
      outcome: 'RECOMMENDATION_AVAILABLE',
      invitationVisible: true,
      recommendation: fixture.catalog[1],
    });
    expect(fixture.getDefinition).toHaveBeenCalledTimes(2);
  });

  it('keeps a dismissible invitation when no accessible starter exists', async () => {
    const fixture = createFixture({ accessibleFeatures: ['HOME'] });

    await expect(fixture.resolve()).resolves.toEqual({
      outcome: 'NO_STARTER_AVAILABLE',
      invitationVisible: true,
      dismissalAvailable: true,
    });
  });
});

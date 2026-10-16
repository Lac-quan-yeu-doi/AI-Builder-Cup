import { describe, expect, it } from 'vitest';

import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import { presentCompletionSummary } from '@/src/interface-adapters/presenters/completion.presenter';

const definition: TutorialDefinition = {
  id: 'connect-source',
  metadata: {
    title: 'Connect a data source',
    summary: 'Create a reusable workspace connection.',
    category: 'Connections',
    learningOutcomes: ['Create a connection', 'Validate connectivity'],
    estimatedMinutes: 5,
    stepCount: 1,
  },
  steps: [
    {
      id: 'create-connection',
      order: 1,
      title: 'Create the connection',
      instructionalContent: 'Enter the connection details and save.',
      destinationFeature: 'CONNECTIONS',
      destinationHref: '/workspace/connections/new',
    },
  ],
  requiredFeatures: ['CONNECTIONS'],
  prerequisites: [],
  contextRequirements: [],
};

const fallbackLocale = { code: 'en', name: 'English' } as const;

describe('presentCompletionSummary', () => {
  it('presents localized title, outcomes, timestamp, and a safe next recommendation', () => {
    const localizedOutcomes = ['Tạo kết nối', 'Xác thực kết nối'];
    const viewModel = presentCompletionSummary({
      definition,
      completion: {
        runId: 'run-1',
        completedAt: '2026-10-01T10:00:00.000Z',
      },
      nextRecommendation: {
        id: 'build-pipeline',
        title: 'Build a pipeline',
      },
      locale: 'vi',
      fallbackLocale,
      localizedContent: {
        vi: {
          title: 'Kết nối nguồn dữ liệu',
          outcomes: localizedOutcomes,
          nextRecommendationTitle: 'Xây dựng pipeline',
        },
      },
    });

    expect(viewModel).toEqual({
      title: 'Kết nối nguồn dữ liệu',
      outcomes: ['Tạo kết nối', 'Xác thực kết nối'],
      completedAt: '2026-10-01T10:00:00.000Z',
      nextRecommendation: {
        tutorialId: 'build-pipeline',
        title: 'Xây dựng pipeline',
      },
      selectedLocale: 'vi',
      fallbackLocale: null,
    });

    localizedOutcomes.push('Changed later');
    expect(viewModel.outcomes).toEqual(['Tạo kết nối', 'Xác thực kết nối']);
  });

  it('identifies the named fallback locale when localized completion content is missing', () => {
    const viewModel = presentCompletionSummary({
      definition,
      completion: {
        runId: 'run-1',
        completedAt: '2026-10-01T10:00:00.000Z',
      },
      nextRecommendation: null,
      locale: 'vi',
      fallbackLocale,
    });

    expect(viewModel.title).toBe('Connect a data source');
    expect(viewModel.outcomes).toEqual(['Create a connection', 'Validate connectivity']);
    expect(viewModel.nextRecommendation).toBeNull();
    expect(viewModel.fallbackLocale).toEqual({ code: 'en', name: 'English' });
  });
});

import { describe, expect, it } from 'vitest';

import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { presentWalkthroughStep } from '@/src/interface-adapters/presenters/walkthrough.presenter';

const definition: TutorialDefinition = {
  id: 'connect-source',
  metadata: {
    title: 'Connect a data source',
    summary: 'Create a reusable workspace connection.',
    category: 'Connections',
    learningOutcomes: ['Create a connection'],
    estimatedMinutes: 5,
    stepCount: 2,
  },
  steps: [
    {
      id: 'open-connections',
      order: 1,
      title: 'Open connections',
      instructionalContent: 'Open the connections destination.',
      destinationFeature: 'CONNECTIONS',
      destinationHref: '/workspace/connections',
      targetControl: {
        id: 'new-connection',
        accessibleName: 'New connection',
        selector: '[data-tutorial="new-connection"]',
      },
    },
    {
      id: 'create-connection',
      order: 2,
      title: 'Create the connection',
      instructionalContent: 'Enter the connection details and save.',
      destinationFeature: 'CONNECTIONS',
      destinationHref: '/workspace/connections/new',
      requiredAction: {
        id: 'save-connection',
        accessibleName: 'Save connection',
      },
    },
  ],
  requiredFeatures: ['CONNECTIONS'],
  prerequisites: [],
  contextRequirements: [],
};

const progress: ProgressRecord = {
  tutorialId: definition.id,
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'open-connections',
  completedStepIds: [],
  contextSelections: [],
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const fallbackLocale = { code: 'en', name: 'English' } as const;

describe('presentWalkthroughStep', () => {
  it('presents localized structured content, position, target, and navigation state', () => {
    const step = definition.steps[0];
    if (step === undefined) {
      throw new Error('Expected the tutorial to have a first step.');
    }

    const viewModel = presentWalkthroughStep({
      definition,
      step,
      progress,
      locale: 'vi',
      fallbackLocale,
      localizedContent: {
        vi: {
          tutorialTitle: 'Kết nối nguồn dữ liệu',
          stepTitle: 'Mở kết nối',
          content: [
            { kind: 'text', text: 'Mở trang ' },
            { kind: 'emphasis', text: 'Kết nối' },
            { kind: 'action-callout', text: 'Chọn Kết nối mới' },
          ],
          targetAccessibleName: 'Kết nối mới',
        },
      },
    });

    expect(viewModel).toEqual({
      tutorialTitle: 'Kết nối nguồn dữ liệu',
      stepTitle: 'Mở kết nối',
      stepNumber: 1,
      totalSteps: 2,
      content: [
        { kind: 'text', text: 'Mở trang ' },
        { kind: 'emphasis', text: 'Kết nối' },
        { kind: 'action-callout', text: 'Chọn Kết nối mới' },
      ],
      targetAccessibleName: 'Kết nối mới',
      previousEnabled: false,
      forwardLabel: 'Next',
      forwardEnabled: true,
      selectedLocale: 'vi',
      fallbackLocale: null,
    });
  });

  it('labels the final action Finish and reflects required-action completion', () => {
    const step = definition.steps[1];
    if (step === undefined) {
      throw new Error('Expected the tutorial to have a final step.');
    }

    const blocked = presentWalkthroughStep({
      definition,
      step,
      progress: { ...progress, currentStepId: step.id },
      locale: 'en',
      fallbackLocale,
    });
    const enabled = presentWalkthroughStep({
      definition,
      step,
      progress: {
        ...progress,
        currentStepId: step.id,
        completedStepIds: [step.id],
      },
      locale: 'en',
      fallbackLocale,
    });

    expect(blocked.forwardLabel).toBe('Finish');
    expect(blocked.previousEnabled).toBe(true);
    expect(blocked.forwardEnabled).toBe(false);
    expect(enabled.forwardEnabled).toBe(true);
  });

  it('identifies the named fallback locale before returning fallback content', () => {
    const step = definition.steps[0];
    if (step === undefined) {
      throw new Error('Expected the tutorial to have a first step.');
    }

    const viewModel = presentWalkthroughStep({
      definition,
      step,
      progress,
      locale: 'vi',
      fallbackLocale,
    });

    expect(viewModel.tutorialTitle).toBe('Connect a data source');
    expect(viewModel.stepTitle).toBe('Open connections');
    expect(viewModel.fallbackLocale).toEqual({ code: 'en', name: 'English' });
  });
});

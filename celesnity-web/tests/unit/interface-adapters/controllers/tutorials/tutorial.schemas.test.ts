import { describe, expect, test } from 'vitest';
import type { ZodType } from 'zod';
import {
  advanceTutorialStepInputSchema,
  completeTutorialRunInputSchema,
  listTutorialCatalogInputSchema,
  openTutorialDetailInputSchema,
  pauseTutorialRunInputSchema,
  recordOnboardingDecisionInputSchema,
  repeatTutorialInputSchema,
  resumeTutorialRunInputSchema,
  startTutorialRunInputSchema,
} from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';
const contextSelection = {
  requirementId: 'database-context',
  resourceType: 'DATABASE',
  resourceId: 'database-1',
};
const progress = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS' as const,
  currentStepId: 'step-1',
  completedStepIds: [],
  contextSelections: [contextSelection],
  updatedAt: '2026-04-01T10:00:00.000Z',
};
const step = {
  id: 'step-1',
  order: 1,
  title: 'Create a database',
  instructionalContent: 'Open the database form.',
  destinationFeature: 'CATALOG_DATABASES' as const,
  destinationHref: '/databases',
};
const validInputs: readonly (readonly [string, ZodType, unknown])[] = [
  [
    'catalog',
    listTutorialCatalogInputSchema,
    { searchTerm: 'database', statusFilters: ['IN_PROGRESS'] },
  ],
  [
    'detail',
    openTutorialDetailInputSchema,
    {
      tutorialId: 'tutorial-1',
      prerequisiteEvaluations: [
        {
          id: 'has-connection',
          satisfied: false,
          remediation: { label: 'Create a connection', href: '/connections' },
        },
      ],
      contextSelections: [contextSelection],
    },
  ],
  [
    'onboarding decision',
    recordOnboardingDecisionInputSchema,
    { decision: 'accepted', tutorialId: 'tutorial-1' },
  ],
  [
    'start',
    startTutorialRunInputSchema,
    {
      tutorialId: 'tutorial-1',
      memberId: 'member-1',
      organizationId: 'organization-1',
      contextSelections: [contextSelection],
    },
  ],
  [
    'advance',
    advanceTutorialStepInputSchema,
    {
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      action: 'NEXT',
      targetLocated: true,
      destinationReady: true,
    },
  ],
  [
    'pause',
    pauseTutorialRunInputSchema,
    {
      progress,
      steps: [step],
      pausedAt: '2026-04-01T10:01:00.000Z',
      trigger: 'USER_REQUEST',
    },
  ],
  [
    'resume',
    resumeTutorialRunInputSchema,
    {
      progress: { ...progress, status: 'PAUSED' },
      prerequisiteEvaluations: [{ id: 'has-connection', satisfied: true }],
      replacementContextSelections: [],
      destinationReady: true,
      resumedAt: '2026-04-01T10:02:00.000Z',
    },
  ],
  ['complete', completeTutorialRunInputSchema, { runId: 'run-1', progress }],
  ['repeat', repeatTutorialInputSchema, { progress: { ...progress, status: 'COMPLETED' } }],
];
describe('tutorial controller input schemas', () => {
  test.each(validInputs)('accepts a valid %s input', (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(true);
  });
  test.each(validInputs)('rejects unknown top-level keys in %s input', (_name, schema, input) => {
    expect(schema.safeParse({ ...(input as object), unexpected: true }).success).toBe(false);
  });
  test('rejects unknown keys in nested boundary objects', () => {
    expect(
      openTutorialDetailInputSchema.safeParse({
        tutorialId: 'tutorial-1',
        prerequisiteEvaluations: [
          {
            id: 'has-connection',
            satisfied: false,
            remediation: {
              label: 'Create a connection',
              href: '/connections',
              secret: 'must-not-pass',
            },
          },
        ],
        contextSelections: [],
      }).success,
    ).toBe(false);
    expect(
      completeTutorialRunInputSchema.safeParse({
        runId: 'run-1',
        progress: { ...progress, credential: 'must-not-pass' },
      }).success,
    ).toBe(false);
  });
  test('enforces discriminated controller input variants', () => {
    expect(
      recordOnboardingDecisionInputSchema.safeParse({
        decision: 'dismissed',
        tutorialId: 'tutorial-1',
      }).success,
    ).toBe(false);
    expect(
      advanceTutorialStepInputSchema.safeParse({
        runId: 'run-1',
        tutorialId: 'tutorial-1',
        action: 'PREVIOUS',
        destinationReady: true,
        targetLocated: true,
      }).success,
    ).toBe(false);
    expect(
      advanceTutorialStepInputSchema.safeParse({
        runId: 'run-1',
        tutorialId: 'tutorial-1',
        action: 'COMPLETE_ACTION',
      }).success,
    ).toBe(false);
  });
  test('rejects malformed identifiers, timestamps, and progress records', () => {
    expect(
      startTutorialRunInputSchema.safeParse({
        tutorialId: '   ',
        memberId: 'member-1',
        organizationId: 'organization-1',
        contextSelections: [],
      }).success,
    ).toBe(false);
    expect(
      pauseTutorialRunInputSchema.safeParse({
        progress,
        steps: [step],
        pausedAt: 'not-a-timestamp',
        trigger: 'USER_REQUEST',
      }).success,
    ).toBe(false);
    expect(
      completeTutorialRunInputSchema.safeParse({
        runId: 'run-1',
        progress: { ...progress, completedStepIds: ['step-1', 'step-1'] },
      }).success,
    ).toBe(false);
  });
});

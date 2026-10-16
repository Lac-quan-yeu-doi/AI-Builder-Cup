import { z } from 'zod';
import { workspaceFeatures } from '@/src/entities/models/workspace-feature';
const nonEmptyStringSchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime({ offset: true });
const tutorialStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED']);
const contextSelectionSchema = z
  .object({
    requirementId: nonEmptyStringSchema,
    resourceType: nonEmptyStringSchema,
    resourceId: nonEmptyStringSchema,
  })
  .strict();
const progressRecordSchema = z
  .object({
    tutorialId: nonEmptyStringSchema,
    memberId: nonEmptyStringSchema,
    organizationId: nonEmptyStringSchema,
    status: tutorialStatusSchema,
    currentStepId: nonEmptyStringSchema,
    completedStepIds: z
      .array(nonEmptyStringSchema)
      .refine((stepIds) => new Set(stepIds).size === stepIds.length, {
        message: 'Completed tutorial step identifiers must be distinct.',
      }),
    contextSelections: z.array(contextSelectionSchema),
    updatedAt: timestampSchema,
  })
  .strict();
export const openTutorialWalkthroughInputSchema = z
  .object({
    runId: nonEmptyStringSchema,
    progress: progressRecordSchema,
    locale: z.enum(['en', 'vi']),
  })
  .strict();
export type OpenTutorialWalkthroughInput = z.infer<typeof openTutorialWalkthroughInputSchema>;
const requiredActionSchema = z
  .object({
    id: nonEmptyStringSchema,
    accessibleName: nonEmptyStringSchema,
  })
  .strict();
const targetControlSchema = z
  .object({
    id: nonEmptyStringSchema,
    accessibleName: nonEmptyStringSchema,
    selector: nonEmptyStringSchema,
  })
  .strict();
const tutorialStepSchema = z
  .object({
    id: nonEmptyStringSchema,
    order: z.number().int().positive(),
    title: nonEmptyStringSchema,
    instructionalContent: nonEmptyStringSchema,
    destinationFeature: z.enum(workspaceFeatures),
    destinationHref: nonEmptyStringSchema,
    requiredAction: requiredActionSchema.optional(),
    targetControl: targetControlSchema.optional(),
  })
  .strict();
const remediationActionSchema = z
  .object({
    label: nonEmptyStringSchema,
    href: nonEmptyStringSchema,
  })
  .strict();
const prerequisiteEvaluationSchema = z.discriminatedUnion('satisfied', [
  z
    .object({
      id: nonEmptyStringSchema,
      satisfied: z.literal(true),
    })
    .strict(),
  z
    .object({
      id: nonEmptyStringSchema,
      satisfied: z.literal(false),
      remediation: remediationActionSchema,
    })
    .strict(),
]);
const resumePrerequisiteEvaluationSchema = z
  .object({
    id: nonEmptyStringSchema,
    satisfied: z.boolean(),
  })
  .strict();
export const listTutorialCatalogInputSchema = z
  .object({
    searchTerm: z.string(),
    statusFilters: z.array(tutorialStatusSchema),
  })
  .strict();
export type ListTutorialCatalogInput = z.infer<typeof listTutorialCatalogInputSchema>;
export const openTutorialDetailInputSchema = z
  .object({
    tutorialId: nonEmptyStringSchema,
    prerequisiteEvaluations: z.array(prerequisiteEvaluationSchema),
    contextSelections: z.array(contextSelectionSchema),
  })
  .strict();
export type OpenTutorialDetailInput = z.infer<typeof openTutorialDetailInputSchema>;
export const recordOnboardingDecisionInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('accepted'),
      tutorialId: nonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal('dismissed'),
    })
    .strict(),
]);
export type RecordOnboardingDecisionInput = z.infer<typeof recordOnboardingDecisionInputSchema>;
export const startTutorialRunInputSchema = z
  .object({
    tutorialId: nonEmptyStringSchema,
    memberId: nonEmptyStringSchema,
    organizationId: nonEmptyStringSchema,
    contextSelections: z.array(contextSelectionSchema),
    conflictResolution: z.enum(['PAUSE_ACTIVE', 'CANCEL_NEW_START']).optional(),
  })
  .strict();
export type StartTutorialRunInput = z.infer<typeof startTutorialRunInputSchema>;
const advanceTutorialStepBaseShape = {
  runId: nonEmptyStringSchema,
  tutorialId: nonEmptyStringSchema,
};
export const advanceTutorialStepInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...advanceTutorialStepBaseShape,
      action: z.literal('NEXT'),
      targetLocated: z.boolean(),
      destinationReady: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...advanceTutorialStepBaseShape,
      action: z.literal('PREVIOUS'),
      destinationReady: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...advanceTutorialStepBaseShape,
      action: z.literal('COMPLETE_ACTION'),
      requiredActionSucceeded: z.boolean(),
    })
    .strict(),
]);
export type AdvanceTutorialStepInput = z.infer<typeof advanceTutorialStepInputSchema>;
export const pauseTutorialRunInputSchema = z
  .object({
    progress: progressRecordSchema,
    steps: z.array(tutorialStepSchema).min(1),
    pausedAt: timestampSchema,
    trigger: z.enum(['USER_REQUEST', 'PANEL_CLOSE', 'SIGN_OUT', 'ACCESS_LOSS']),
  })
  .strict();
export type PauseTutorialRunInput = z.infer<typeof pauseTutorialRunInputSchema>;
export const resumeTutorialRunInputSchema = z
  .object({
    progress: progressRecordSchema,
    prerequisiteEvaluations: z.array(resumePrerequisiteEvaluationSchema),
    replacementContextSelections: z.array(contextSelectionSchema),
    destinationReady: z.boolean(),
    resumedAt: timestampSchema,
    conflictResolution: z.enum(['PAUSE_ACTIVE', 'CANCEL_NEW_START']).optional(),
  })
  .strict();
export type ResumeTutorialRunInput = z.infer<typeof resumeTutorialRunInputSchema>;
export const completeTutorialRunInputSchema = z
  .object({
    runId: nonEmptyStringSchema,
    progress: progressRecordSchema,
  })
  .strict();
export type CompleteTutorialRunInput = z.infer<typeof completeTutorialRunInputSchema>;
export const repeatTutorialInputSchema = z
  .object({
    progress: progressRecordSchema,
    confirmed: z.boolean().optional(),
  })
  .strict();
export type RepeatTutorialInput = z.infer<typeof repeatTutorialInputSchema>;

import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import type {
  TutorialContextReader,
  TutorialContextResource,
} from '@application/tutorial/tutorial-context.reader';
import type {
  TutorialProgressRepository,
  TutorialRepository,
} from '@application/tutorial/tutorial.repository';
import { TutorialError } from '@domain/tutorial/errors/tutorial.errors';
import {
  tutorialIsAccessible,
  validateTutorialDefinition,
  type TutorialDefinition,
  type TutorialOnboardingDecision,
  type TutorialProgress,
} from '@domain/tutorial/models/tutorial';

export class TutorialUseCases {
  public constructor(
    private readonly tutorials: TutorialRepository,
    private readonly progress: TutorialProgressRepository,
    private readonly contexts: TutorialContextReader,
  ) {}

  public async listAccessible(
    principal: AuthenticatedContext,
  ): Promise<readonly TutorialDefinition[]> {
    const definitions = await this.tutorials.list();
    return definitions.filter((definition) =>
      tutorialIsAccessible(definition, principal.visibleFeatures),
    );
  }

  public async getAccessible(
    principal: AuthenticatedContext,
    tutorialId: string,
  ): Promise<TutorialDefinition> {
    const definition = await this.tutorials.findById(tutorialId);
    if (definition === null || !tutorialIsAccessible(definition, principal.visibleFeatures)) {
      throw TutorialError.notFound();
    }
    return definition;
  }

  public async publish(
    candidate: TutorialDefinition,
  ): Promise<
    { readonly ok: true } | { readonly ok: false; readonly violations: readonly string[] }
  > {
    const violations = validateTutorialDefinition(candidate);
    if (violations.length > 0) return { ok: false, violations };
    await this.tutorials.publish(candidate);
    return { ok: true };
  }

  public listProgress(principal: AuthenticatedContext): Promise<readonly TutorialProgress[]> {
    return this.progress.list(principal.organizationId, principal.identityId);
  }

  public async saveProgress(
    principal: AuthenticatedContext,
    tutorialId: string,
    input: Omit<TutorialProgress, 'tutorialId' | 'memberId' | 'organizationId' | 'updatedAt'>,
  ): Promise<TutorialProgress> {
    const definition = await this.getAccessible(principal, tutorialId);
    if (!definition.steps.some((step) => step.id === input.currentStepId)) {
      throw TutorialError.invalid('The current tutorial step does not exist.');
    }
    const stepIds = new Set(definition.steps.map((step) => step.id));
    if (input.completedStepIds.some((stepId) => !stepIds.has(stepId))) {
      throw TutorialError.invalid('Completed tutorial steps must belong to the tutorial.');
    }
    validateProgressState(definition, input);
    await validateContextSelections(definition, input.contextSelections, this.contexts);
    const existing = (
      await this.progress.list(principal.organizationId, principal.identityId)
    ).find((record) => record.tutorialId === tutorialId);
    if (existing?.status === 'PAUSED' && input.status === 'PAUSED') {
      if (!samePausedCheckpoint(existing, input)) {
        throw TutorialError.invalid(
          'A paused tutorial checkpoint cannot be replaced by stale browser state.',
        );
      }
      return existing;
    }
    return this.progress.save({
      ...input,
      tutorialId,
      memberId: principal.identityId,
      organizationId: principal.organizationId,
      completedStepIds: [...new Set(input.completedStepIds)],
      contextSelections: input.contextSelections.map((selection) => ({ ...selection })),
      updatedAt: new Date().toISOString(),
    });
  }

  public getOnboardingDecision(
    principal: AuthenticatedContext,
  ): Promise<TutorialOnboardingDecision | null> {
    return this.progress.getOnboardingDecision(principal.organizationId, principal.identityId);
  }

  public saveOnboardingDecision(
    principal: AuthenticatedContext,
    decision: TutorialOnboardingDecision,
  ): Promise<TutorialOnboardingDecision> {
    return this.progress.saveOnboardingDecision(
      principal.organizationId,
      principal.identityId,
      decision,
    );
  }

  public saveCompletion(
    principal: AuthenticatedContext,
    runId: string,
  ): Promise<{ readonly runId: string; readonly completedAt: string }> {
    return this.progress.saveCompletion(principal.organizationId, principal.identityId, runId);
  }

  public listContextResources(resourceType: string): Promise<readonly TutorialContextResource[]> {
    return this.contexts.listAuthorized(resourceType);
  }
}

function samePausedCheckpoint(
  existing: TutorialProgress,
  input: Omit<TutorialProgress, 'tutorialId' | 'memberId' | 'organizationId' | 'updatedAt'>,
): boolean {
  return (
    existing.currentStepId === input.currentStepId &&
    existing.completedStepIds.length === input.completedStepIds.length &&
    existing.completedStepIds.every((stepId, index) => stepId === input.completedStepIds[index]) &&
    JSON.stringify(existing.contextSelections) === JSON.stringify(input.contextSelections)
  );
}

function validateProgressState(
  definition: TutorialDefinition,
  input: Omit<TutorialProgress, 'tutorialId' | 'memberId' | 'organizationId' | 'updatedAt'>,
): void {
  const orderedStepIds = definition.steps.map((step) => step.id);
  const completedIds = [...new Set(input.completedStepIds)];
  const expectedPrefix = orderedStepIds.slice(0, completedIds.length);
  if (completedIds.some((stepId, index) => stepId !== expectedPrefix[index])) {
    throw TutorialError.invalid('Completed tutorial steps must form an ordered prefix.');
  }

  const currentIndex = orderedStepIds.indexOf(input.currentStepId);
  if (currentIndex > completedIds.length) {
    throw TutorialError.invalid('Tutorial progress cannot skip incomplete steps.');
  }
  if (
    input.status === 'COMPLETED' &&
    (completedIds.length !== orderedStepIds.length || currentIndex !== orderedStepIds.length - 1)
  ) {
    throw TutorialError.invalid('A completed tutorial must include every published step.');
  }
  if (input.status === 'NOT_STARTED' && completedIds.length > 0) {
    throw TutorialError.invalid('A tutorial that has not started cannot contain completed steps.');
  }
}

async function validateContextSelections(
  definition: TutorialDefinition,
  selections: TutorialProgress['contextSelections'],
  contexts: TutorialContextReader,
): Promise<void> {
  const requirements = new Map(
    definition.contextRequirements.map((requirement) => [requirement.id, requirement]),
  );
  for (const selection of selections) {
    const requirement = requirements.get(selection.requirementId);
    if (requirement === undefined || requirement.resourceType !== selection.resourceType) {
      throw TutorialError.invalid('Tutorial context does not match the published definition.');
    }
  }

  await Promise.all(
    definition.contextRequirements.map(async (requirement) => {
      const selectedIds = selections
        .filter((selection) => selection.requirementId === requirement.id)
        .map((selection) => selection.resourceId);
      if (
        selectedIds.length !== requirement.selectionCount ||
        new Set(selectedIds).size !== requirement.selectionCount
      ) {
        throw TutorialError.invalid('Tutorial context selections are incomplete.');
      }

      const authorizedIds = new Set(
        (await contexts.listAuthorized(requirement.resourceType)).map((resource) => resource.id),
      );
      if (selectedIds.some((resourceId) => !authorizedIds.has(resourceId))) {
        throw TutorialError.invalid('Tutorial context includes an unavailable resource.');
      }
    }),
  );
}

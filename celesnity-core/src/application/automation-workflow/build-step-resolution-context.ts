import type { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';

/**
 * Shapes the payload `applyInputTemplate` resolves a step's `inputTemplate`
 * against — `$.trigger.<field>` for the original trigger payload,
 * `$.step<N>.output` (1-based) for a prior step's result. Kept as a plain
 * nested object (never an array) because `applyInputTemplate`'s resolver
 * only walks dot-paths — see the "no bracket indexing" note in the spec.
 */
export function buildStepResolutionContext(
  triggerPayload: unknown,
  priorStepRuns: readonly AutomationWorkflowStepRun[],
): Record<string, unknown> {
  const context: Record<string, unknown> = { trigger: triggerPayload };
  priorStepRuns.forEach((stepRun, index) => {
    if (stepRun.output === undefined) return;
    context[`step${index + 1}`] = { output: stepRun.output };
  });
  return context;
}

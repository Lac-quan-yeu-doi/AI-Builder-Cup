import { AutomationWorkflowActionResolver } from '@application/automation-workflow/automation-workflow-action-resolver';
import { buildAutomationWorkflowActions } from '@application/automation-workflow/automation-workflow.actions';
import type { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';

describe('AutomationWorkflowActionResolver', () => {
  it('resolves an automation workflow action by name', () => {
    const actions = buildAutomationWorkflowActions({} as AutomationWorkflowUseCases);
    const resolver = new AutomationWorkflowActionResolver(actions);

    expect(resolver.resolve('automation-workflow.removeStep')).toBe(actions.removeStep);
  });

  it('returns undefined for an unknown action name', () => {
    const actions = buildAutomationWorkflowActions({} as AutomationWorkflowUseCases);
    const resolver = new AutomationWorkflowActionResolver(actions);

    expect(resolver.resolve('automation-workflow.nonexistent')).toBeUndefined();
  });
});

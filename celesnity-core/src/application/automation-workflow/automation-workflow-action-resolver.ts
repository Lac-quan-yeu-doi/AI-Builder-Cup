import type { ActionDefinition } from '@application/actions/action.types';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';
import type { AutomationWorkflowActions } from './automation-workflow.actions';

/** Resolves automation-workflow action names for `PendingActionUseCases.approve` — mirrors `AutomationActionResolver`. */
export class AutomationWorkflowActionResolver implements IActionResolver {
  private readonly byName: ReadonlyMap<string, ActionDefinition<unknown, unknown>>;

  public constructor(actions: AutomationWorkflowActions) {
    const values = Object.values(actions) as ActionDefinition<unknown, unknown>[];
    this.byName = new Map(values.map((action) => [action.name, action]));
  }

  public resolve(actionName: string): ActionDefinition<unknown, unknown> | undefined {
    return this.byName.get(actionName);
  }
}

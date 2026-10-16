import type { ActionDefinition } from '@application/actions/action.types';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';
import type { ChartActions } from './chart.actions';

/** Resolves chart action names for `PendingActionUseCases.approve`. */
export class ChartActionResolver implements IActionResolver {
  private readonly byName: ReadonlyMap<string, ActionDefinition<unknown, unknown>>;

  public constructor(actions: ChartActions) {
    const values = Object.values(actions).filter(
      (action): action is ActionDefinition<unknown, unknown> => action !== undefined,
    );
    this.byName = new Map(values.map((action) => [action.name, action]));
  }

  public resolve(actionName: string): ActionDefinition<unknown, unknown> | undefined {
    return this.byName.get(actionName);
  }
}

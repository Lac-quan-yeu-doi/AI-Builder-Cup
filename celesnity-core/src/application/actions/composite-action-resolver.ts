import type { ActionDefinition } from './action.types';
import type { IActionResolver } from './interfaces/i-action-resolver';

/** Merges every domain's `IActionResolver` into one, so `PendingActionUseCases.approve` can resolve any registered action regardless of which domain declared it. */
export class CompositeActionResolver implements IActionResolver {
  public constructor(private readonly resolvers: readonly IActionResolver[]) {}

  public resolve(actionName: string): ActionDefinition<unknown, unknown> | undefined {
    for (const resolver of this.resolvers) {
      const found = resolver.resolve(actionName);
      if (found) return found;
    }
    return undefined;
  }
}

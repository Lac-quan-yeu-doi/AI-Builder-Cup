import type { ActionDefinition } from '../action.types';

/**
 * Looks up a previously-declared `ActionDefinition` by its `name` so a
 * pending action can be re-run at approval time. One resolver aggregates
 * every domain module's actions (today, just chart's).
 */
export interface IActionResolver {
  resolve(actionName: string): ActionDefinition<unknown, unknown> | undefined;
}

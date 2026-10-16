import type { ActionActor } from '../action.types';

/** Records that an action ran, for whoever's asking "who did this and when." */
export interface IActionAuditLog {
  record(actionName: string, actor: ActionActor, input: unknown): Promise<void>;
}

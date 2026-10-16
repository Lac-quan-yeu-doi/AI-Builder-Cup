import type { ActionActor } from './action.types';

/** A durable record that an audited action ran — see `IActionAuditLog`. */
export interface AuditLogEntry {
  readonly id: string;
  readonly actionName: string;
  readonly actor: ActionActor;
  readonly input: unknown;
  readonly createdAt: string;
}

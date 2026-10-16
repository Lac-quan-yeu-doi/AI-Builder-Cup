import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { ActionActor } from './action.types';
import { PendingActionError } from './pending-action.errors';
import type { IActionResolver } from './interfaces/i-action-resolver';
import type {
  IPendingActionRepository,
  PendingActionListFilter,
} from './interfaces/i-pending-action.repository';
import type { PendingAction } from './pending-action.model';

/**
 * AIP's "Checkpoint" pattern: propose an action, hold it for human review,
 * apply it only on approval. `approve`/`reject` are the human decision;
 * `propose` is what `runAction` calls when an `ActionDefinition` has
 * `approvalRequired: true`.
 */
export class PendingActionUseCases {
  public constructor(
    private readonly repository: IPendingActionRepository,
    private readonly resolver: IActionResolver,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly ttlMs: number,
  ) {}

  public async propose(
    actionName: string,
    input: unknown,
    actor: ActionActor,
    rationale: string | null = null,
  ): Promise<PendingAction> {
    const now = this.clock.now();
    const pending: PendingAction = {
      id: this.ids.next(),
      actionName,
      input,
      actor,
      status: 'pending',
      rationale,
      result: null,
      errorMessage: null,
      createdAt: now.toISOString(),
      decidedAt: null,
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    return this.repository.create(pending);
  }

  /** Runs the underlying action and records the outcome, whether it succeeds or throws. */
  public async approve(id: string): Promise<PendingAction> {
    const pending = await this.getOrThrow(id);
    if (pending.status !== 'pending') {
      throw PendingActionError.notPending(id, pending.status);
    }
    this.assertNotExpired(pending);
    const action = this.resolver.resolve(pending.actionName);
    if (!action) {
      throw PendingActionError.unknownAction(pending.actionName);
    }

    const decidedAt = this.clock.now().toISOString();
    try {
      const result = await action.run(pending.input, pending.actor);
      return this.repository.update({
        ...pending,
        status: 'approved',
        result: result ?? null,
        decidedAt,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await this.repository.update({ ...pending, status: 'failed', errorMessage, decidedAt });
      throw err;
    }
  }

  public async reject(id: string): Promise<PendingAction> {
    const pending = await this.getOrThrow(id);
    if (pending.status !== 'pending') {
      throw PendingActionError.notPending(id, pending.status);
    }
    this.assertNotExpired(pending);
    return this.repository.update({
      ...pending,
      status: 'rejected',
      decidedAt: this.clock.now().toISOString(),
    });
  }

  public findById(id: string): Promise<PendingAction> {
    return this.getOrThrow(id);
  }

  public list(filter?: PendingActionListFilter): Promise<readonly PendingAction[]> {
    return this.repository.list(filter);
  }

  private async getOrThrow(id: string): Promise<PendingAction> {
    const pending = await this.repository.findById(id);
    if (!pending) {
      throw PendingActionError.notFound(id);
    }
    return pending;
  }

  private assertNotExpired(pending: PendingAction): void {
    if (this.clock.now() >= new Date(pending.expiresAt)) {
      throw PendingActionError.expired(pending.id, pending.expiresAt);
    }
  }
}

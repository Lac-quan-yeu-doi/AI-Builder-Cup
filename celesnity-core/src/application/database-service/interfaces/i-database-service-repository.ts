import type { DatabaseService } from '@domain/database-service/aggregates/database-service';
import type {
  ConnectionId,
  ConnectionName,
} from '@domain/database-service/value-objects/connection-value-objects';

/**
 * Write port for the {@link DatabaseService} aggregate.
 *
 * Insert and update are separate operations rather than one `save`. The previous
 * `save` was an upsert, which read as convenient but had two costs: it could not
 * tell "this is new" from "this already existed", and it had no optimistic
 * concurrency, so a concurrent edit was silently overwritten instead of detected.
 * Splitting them lets the update carry the same kind of guard every other
 * aggregate in this codebase uses.
 */
export interface IDatabaseServiceRepository {
  findById(id: ConnectionId): Promise<DatabaseService | undefined>;

  existsByName(name: ConnectionName, excludingId?: ConnectionId): Promise<boolean>;

  /** Inserts a newly registered connection. Must run inside a unit of work. */
  create(connection: DatabaseService): Promise<void>;

  /**
   * Applies a change, guarded by the `updatedAt` the aggregate was loaded with.
   * Returns `false` when another writer moved the row on first.
   *
   * `updatedAt` is the guard because a data connection carries no revision
   * counter; it is written explicitly by the mapper from the aggregate, so it
   * advances once per accepted change and is safe to compare against.
   */
  update(connection: DatabaseService, expectedUpdatedAt: Date): Promise<boolean>;
}

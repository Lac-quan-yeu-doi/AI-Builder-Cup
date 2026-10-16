import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/**
 * Builds the raw `pg` pools used by the few adapters that cannot go through
 * Prisma, and owns their shutdown.
 *
 * Prisma covers every aggregate repository and read model. Two operations fall
 * outside what it can express and therefore need a driver-level connection:
 * skip-locked queue claiming (`FOR UPDATE SKIP LOCKED`) and session-scoped
 * advisory locking (`pg_advisory_xact_lock`).
 *
 * Callers receive a *separate* pool rather than a shared one. That is
 * deliberate: the publication lock holds its connection for the full duration
 * of a publish, while the dispatcher only holds one for a short transaction.
 * Sharing a single pool would let a burst of slow publishes exhaust it and
 * stall the execution worker, so each workload keeps its own bulkhead and its
 * own sizing. What is centralised here is the connection string, the connection
 * timeout, and the shutdown hook.
 */
@Injectable()
export class PostgresConnectionPoolFactory implements OnApplicationShutdown {
  private static readonly CONNECTION_TIMEOUT_MS = 5_000;

  private readonly pools: Pool[] = [];

  public constructor(private readonly config: ConfigService) {}

  public create(options: { readonly maxConnections: number }): Pool {
    const pool = new Pool({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: PostgresConnectionPoolFactory.CONNECTION_TIMEOUT_MS,
      max: options.maxConnections,
    });
    this.pools.push(pool);
    return pool;
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.pools.map((pool) => pool.end()));
  }
}

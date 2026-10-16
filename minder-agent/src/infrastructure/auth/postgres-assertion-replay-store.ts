import { Pool } from "pg";
import type { PoolConfig } from "pg";
import {
  AssertionAuthenticationError,
  type AssertionReplayCache,
} from "./replay-cache.js";

/** Shared single-use assertion state that survives replica routing and restarts. */
export class PostgresAssertionReplayStore implements AssertionReplayCache {
  private readonly table: string;
  private readonly ownsPool: boolean;

  constructor(
    private readonly pool: Pool,
    schema: string,
    options: { readonly ownsPool?: boolean } = {},
  ) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(schema))
      throw new Error("Invalid replay schema");
    this.table = `"${schema}"."assertion_replay"`;
    this.ownsPool = options.ownsPool ?? false;
  }

  static async connect(
    config: PoolConfig,
    schema: string,
  ): Promise<PostgresAssertionReplayStore> {
    const pool = new Pool(config);
    const store = new PostgresAssertionReplayStore(pool, schema, {
      ownsPool: true,
    });
    try {
      await store.initialize();
      return store;
    } catch (error) {
      await pool.end().catch(() => undefined);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.quotedSchema()}`);
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.table} (jti UUID PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS assertion_replay_expiry_idx ON ${this.table} (expires_at)`,
    );
  }

  async consume(
    jti: string,
    expiresAt: number,
    nowSeconds: number,
  ): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM ${this.table} WHERE expires_at <= to_timestamp($1)`,
        [nowSeconds],
      );
      const result = await this.pool.query(
        `INSERT INTO ${this.table} (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING RETURNING jti`,
        [jti, expiresAt],
      );
      if (result.rowCount !== 1)
        throw new AssertionAuthenticationError("assertion_replayed");
    } catch (error) {
      if (error instanceof AssertionAuthenticationError) throw error;
      throw new AssertionAuthenticationError("auth_capacity_unavailable");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  private quotedSchema(): string {
    return this.table.slice(0, this.table.indexOf("."));
  }
}

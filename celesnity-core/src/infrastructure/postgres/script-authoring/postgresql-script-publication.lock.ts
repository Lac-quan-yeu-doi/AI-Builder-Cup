import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { type IScriptPublicationLock } from '@application/script-authoring/interfaces/i-script-publication-lock';
import { PostgresConnectionPoolFactory } from '@infrastructure/postgres/postgres-connection-pool.factory';
import type { ScriptId } from '@domain/script-authoring/value-objects/script-value-objects';
import { ScriptPublicationError } from '@application/script-authoring/errors/script-publication.error';

const LOCK_WAIT_TIMEOUT = '30s';
const MAX_CONNECTIONS = 10;

@Injectable()
export class PostgreSqlScriptPublicationLock implements IScriptPublicationLock {
  private readonly pool: Pool;

  public constructor(pools: PostgresConnectionPoolFactory) {
    this.pool = pools.create({ maxConnections: MAX_CONNECTIONS });
  }

  public async run<T>(scriptId: ScriptId, operation: () => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let operationStarted = false;
    let released = false;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '${LOCK_WAIT_TIMEOUT}'`);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `script-publication:${scriptId.value}`,
      ]);
      await client.query('SET LOCAL statement_timeout = 0');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 0');

      operationStarted = true;
      const result = await operation();
      try {
        await client.query('COMMIT');
      } catch {
        client.release(true);
        released = true;
        throw ScriptPublicationError.lockUnavailable();
      }
      return result;
    } catch (error: unknown) {
      if (client !== undefined && !released) {
        try {
          await client.query('ROLLBACK');
        } catch {
          client.release(true);
          released = true;
        }
      }
      if (operationStarted) {
        throw error;
      }
      throw ScriptPublicationError.lockUnavailable();
    } finally {
      if (client !== undefined && !released) {
        client.release();
      }
    }
  }
}

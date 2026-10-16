import { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import {
  trinoIdentityHeaders,
  type TrinoCredentials,
} from '@infrastructure/trino/trino-credentials';

/** A column descriptor as returned by the Trino client protocol. */
export interface TrinoColumn {
  readonly name: string;
  readonly type: string;
}

/** A fully drained Trino statement result: columns plus positional rows. */
export interface TrinoResult {
  readonly columns: readonly TrinoColumn[];
  readonly rows: readonly (readonly unknown[])[];
}

/** Optional session context applied via `X-Trino-*` request headers. */
export interface TrinoStatementContext {
  readonly catalog?: string;
  readonly schema?: string;
}

interface TrinoStatementResponse {
  readonly nextUri?: string;
  readonly columns?: readonly { readonly name: string; readonly type: string }[];
  readonly data?: readonly (readonly unknown[])[];
  readonly error?: unknown;
}

// Per-request and whole-statement timeouts. The Catalog Exploration context is
// not permitted its own timeout configuration, so sane fixed bounds are used.
const REQUEST_TIMEOUT_MS = 10_000;
const OVERALL_DEADLINE_MS = 30_000;
const CANCEL_TIMEOUT_MS = 5_000;
// Trino applies backpressure with HTTP 503; the protocol expects the client to
// retry the same URI after a short delay.
const MAX_BUSY_RETRIES = 6;
const BUSY_RETRY_DELAY_MS = 100;

/**
 * A minimal client for the Trino HTTP statement protocol.
 *
 * It submits a statement via `POST /v1/statement`, follows `nextUri` pagination
 * until the statement finishes, and aggregates columns and rows. Every Trino or
 * transport failure is translated into a categorized domain error so that no
 * internal detail escapes this adapter.
 */
export class TrinoCatalogStatementClient {
  private readonly credentials: TrinoCredentials;

  public constructor(
    private readonly baseUrl: string,
    user: string,
    // Empty means send no Authorization header, which is what an unauthenticated
    // coordinator requires. Defaulted so existing callers and tests are unaffected.
    password = '',
  ) {
    this.credentials = { user, password };
  }

  public async execute(sql: string, context: TrinoStatementContext = {}): Promise<TrinoResult> {
    const deadline = Date.now() + OVERALL_DEADLINE_MS;
    const columns: TrinoColumn[] = [];
    const rows: (readonly unknown[])[] = [];
    let capturedColumns = false;

    let activeNextUri: string | undefined;

    try {
      let response = await this.submit(sql, context, deadline);
      for (;;) {
        if (response.error !== undefined && response.error !== null) {
          // Trino accepted the request but rejected the statement.
          throw CatalogError.query();
        }
        if (!capturedColumns && response.columns !== undefined) {
          for (const column of response.columns) {
            columns.push({ name: column.name, type: column.type });
          }
          capturedColumns = true;
        }
        if (response.data !== undefined) {
          for (const row of response.data) {
            rows.push(row);
          }
        }
        if (typeof response.nextUri !== 'string' || response.nextUri.length === 0) {
          activeNextUri = undefined;
          break;
        }
        activeNextUri = response.nextUri;
        response = await this.advance(activeNextUri, context, deadline);
      }

      return { columns, rows };
    } catch (error) {
      if (activeNextUri !== undefined) {
        await this.cancel(activeNextUri);
      }
      throw error;
    }
  }

  /** Best-effort cancellation so timed-out callers do not leave Trino work behind. */
  private async cancel(nextUri: string): Promise<void> {
    try {
      await fetch(nextUri, {
        method: 'DELETE',
        headers: this.headers({}),
        signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
      });
    } catch {
      // The original catalog error remains authoritative. Trino will eventually
      // reclaim the query if the cancellation request itself cannot be delivered.
    }
  }

  private submit(
    sql: string,
    context: TrinoStatementContext,
    deadline: number,
  ): Promise<TrinoStatementResponse> {
    const url = new URL('/v1/statement', this.baseUrl).toString();
    return this.requestWithRetry(
      () =>
        fetch(url, {
          method: 'POST',
          headers: this.headers(context, 'text/plain'),
          body: sql,
          signal: this.requestSignal(deadline),
        }),
      deadline,
    );
  }

  private advance(
    nextUri: string,
    context: TrinoStatementContext,
    deadline: number,
  ): Promise<TrinoStatementResponse> {
    return this.requestWithRetry(
      () =>
        fetch(nextUri, {
          method: 'GET',
          headers: this.headers(context),
          signal: this.requestSignal(deadline),
        }),
      deadline,
    );
  }

  private async requestWithRetry(
    send: () => Promise<Response>,
    deadline: number,
  ): Promise<TrinoStatementResponse> {
    for (let attempt = 0; ; attempt += 1) {
      if (Date.now() >= deadline) {
        throw CatalogError.unavailable();
      }

      let response: Response;
      try {
        response = await send();
      } catch {
        // Network failure, DNS error, or an aborted (timed-out) request.
        throw CatalogError.unavailable();
      }

      // Trino signals "server busy" with 502/503/504; retry the same request.
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < MAX_BUSY_RETRIES
      ) {
        await drainBody(response);
        await delay(BUSY_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        throw CatalogError.unavailable();
      }

      try {
        return (await response.json()) as TrinoStatementResponse;
      } catch {
        throw CatalogError.unavailable();
      }
    }
  }

  private headers(context: TrinoStatementContext, contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      ...trinoIdentityHeaders(this.credentials),
      Accept: 'application/json',
    };
    if (contentType !== undefined) {
      headers['Content-Type'] = contentType;
    }
    if (context.catalog !== undefined) {
      headers['X-Trino-Catalog'] = context.catalog;
    }
    if (context.schema !== undefined) {
      headers['X-Trino-Schema'] = context.schema;
    }
    return headers;
  }

  private requestSignal(deadline: number): AbortSignal {
    const remaining = Math.max(0, deadline - Date.now());
    return AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining));
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function drainBody(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // The response body is best-effort drained before a retry.
  }
}

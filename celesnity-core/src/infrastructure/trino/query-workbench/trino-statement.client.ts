import { QueryPortError } from '@application/query-workbench/errors/query-port.error';
import {
  trinoIdentityHeaders,
  type TrinoCredentials,
} from '@infrastructure/trino/trino-credentials';

/** Raw Trino statement error payload (subset used by this adapter). */
export interface TrinoErrorBody {
  readonly message?: string;
  readonly errorCode?: number;
  readonly errorName?: string;
  readonly errorType?: string;
  readonly errorLocation?: {
    readonly lineNumber?: number;
    readonly columnNumber?: number;
  };
  readonly failureInfo?: { readonly message?: string };
}

/** Raw Trino statement statistics payload (subset used by this adapter). */
export interface TrinoStatsBody {
  readonly state?: string;
  readonly queued?: boolean;
  readonly progressPercentage?: number;
  readonly elapsedTimeMillis?: number;
  readonly queuedTimeMillis?: number;
  readonly cpuTimeMillis?: number;
  readonly processedRows?: number;
  readonly processedBytes?: number;
  readonly peakMemoryBytes?: number;
  readonly totalSplits?: number;
  readonly completedSplits?: number;
}

/** A single decoded page of the Trino HTTP statement protocol. */
export interface TrinoStatementResponse {
  readonly id?: string;
  readonly nextUri?: string;
  readonly columns?: readonly { readonly name: string; readonly type: string }[];
  readonly data?: readonly (readonly unknown[])[];
  readonly stats?: TrinoStatsBody;
  readonly error?: TrinoErrorBody;
}

/** Optional session context applied through `X-Trino-*` headers. */
export interface TrinoContextHeaders {
  readonly catalog?: string;
  readonly schema?: string;
}

// A single HTTP round trip is bounded here; the overall query deadline is
// enforced separately by the runner's abort controller.
const REQUEST_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 5_000;
// Trino applies backpressure with 502/503/504; the protocol expects the client
// to retry the same URI after a short delay.
const MAX_BUSY_RETRIES = 6;
const BUSY_RETRY_DELAY_MS = 100;

/**
 * Minimal client for the Trino HTTP statement protocol. It performs a single
 * transport concern each call (submit a statement, fetch the next page, or
 * delete a query) and never interprets statement-level semantics.
 *
 * A caller-provided {@link AbortSignal} carries the runner's cancellation and
 * timeout. When that signal aborts, the abort error is propagated unchanged so
 * the runner can classify it; all other transport faults become a categorized
 * {@link QueryPortError}.
 */
export class TrinoStatementClient {
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

  public submit(
    sql: string,
    context: TrinoContextHeaders,
    signal: AbortSignal,
  ): Promise<TrinoStatementResponse> {
    const url = new URL('/v1/statement', this.baseUrl).toString();
    return this.request(
      () =>
        fetch(url, {
          method: 'POST',
          headers: this.headers(context, 'text/plain'),
          body: sql,
          signal: this.requestSignal(signal),
        }),
      signal,
    );
  }

  public fetchNext(nextUri: string, signal: AbortSignal): Promise<TrinoStatementResponse> {
    return this.request(
      () =>
        fetch(nextUri, {
          method: 'GET',
          headers: this.headers({}),
          signal: this.requestSignal(signal),
        }),
      signal,
    );
  }

  /**
   * Best-effort cancellation. Uses its own short timeout (never the runner
   * signal, which is already aborted when cancellation is requested).
   */
  public async delete(uri: string): Promise<void> {
    try {
      await fetch(uri, {
        method: 'DELETE',
        headers: this.headers({}),
        signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
      });
    } catch {
      // Cancellation is best-effort; Trino reclaims abandoned queries.
    }
  }

  public queryUri(queryId: string): string {
    return new URL(`/v1/query/${encodeURIComponent(queryId)}`, this.baseUrl).toString();
  }

  private async request(
    send: () => Promise<Response>,
    signal: AbortSignal,
  ): Promise<TrinoStatementResponse> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await send();
      } catch (error: unknown) {
        if (signal.aborted) {
          // Runner-initiated cancellation or timeout: let the runner classify.
          throw error;
        }
        throw QueryPortError.gatewayUnavailable();
      }

      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < MAX_BUSY_RETRIES
      ) {
        await drainBody(response);
        await delay(BUSY_RETRY_DELAY_MS * (attempt + 1), signal);
        continue;
      }

      if (!response.ok) {
        throw QueryPortError.gatewayUnavailable();
      }

      try {
        return (await response.json()) as TrinoStatementResponse;
      } catch {
        throw QueryPortError.gatewayUnavailable();
      }
    }
  }

  private headers(context: TrinoContextHeaders, contentType?: string): Record<string, string> {
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

  private requestSignal(signal: AbortSignal): AbortSignal {
    return AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function drainBody(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    // The response body is best-effort drained before a retry.
  }
}

import type { GeneratedApiTransport } from './generated-api';
import { publicEnvironment } from '../configuration/public-environment';
import { recordCoreApiEvent } from '../observability/client-telemetry';
import { WORKSPACE_ACCESS_DENIED_EVENT } from '@/src/entities/models/workspace-feature';

interface ProblemDetailsDto {
  readonly detail?: string;
  readonly title?: string;
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

export interface CoreApiClientOptions {
  readonly baseUrl?: string;
  readonly credentials?: RequestCredentials;
  readonly fetchImplementation?: typeof fetch;
}

export class CoreApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'CoreApiError';
  }
}

export class CoreApiClient implements GeneratedApiTransport {
  private readonly baseUrl: string;
  private readonly credentials: RequestCredentials;
  private readonly fetchImplementation: typeof fetch;

  public constructor(options: CoreApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? publicEnvironment.coreApiUrl).replace(/\/+$/u, '');
    this.credentials = options.credentials ?? 'include';
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  public get<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    return this.request<TResponse>(path, { ...init, method: 'GET' });
  }

  public post<TResponse>(path: string, body?: unknown, init?: RequestInit): Promise<TResponse> {
    return this.request<TResponse>(path, {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  public patch<TResponse>(path: string, body: unknown, init?: RequestInit): Promise<TResponse> {
    return this.request<TResponse>(path, {
      ...init,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  public delete<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    return this.request<TResponse>(path, { ...init, method: 'DELETE' });
  }

  public async request<TResponse>(route: string, init: RequestInit = {}): Promise<TResponse> {
    const method = init.method ?? 'GET';
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const headers = new Headers(init.headers);
    if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', requestId);
    if (!headers.has('X-Correlation-Id')) headers.set('X-Correlation-Id', requestId);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    // A `FormData` body (multipart uploads) must NOT get an explicit
    // Content-Type here — the browser generates one with the boundary
    // parameter set from the actual body, and any header we set instead
    // (this one included) overrides that and breaks the upload.
    if (
      init.body !== undefined &&
      !headers.has('Content-Type') &&
      !(init.body instanceof FormData)
    ) {
      headers.set('Content-Type', 'application/json');
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
      !headers.has('X-CSRF-Token')
    ) {
      const csrf = browserCookie('celesnity_csrf');
      if (csrf !== undefined) headers.set('X-CSRF-Token', csrf);
    }

    recordCoreApiEvent({ event: 'core_api_request_started', method, requestId, route });

    let response: Response;
    try {
      response = await this.fetchImplementation(this.absoluteUrl(route), {
        ...init,
        credentials: this.credentials,
        headers,
      });
    } catch (error: unknown) {
      recordCoreApiEvent({
        durationMs: elapsedMilliseconds(startedAt),
        error: safeErrorMessage(error),
        event: 'core_api_request_failed',
        method,
        requestId,
        route,
      });
      throw error;
    }

    const backendRequestId = response.headers.get('X-Request-Id') ?? undefined;

    if (!response.ok) {
      const problem = await this.readProblem(response);
      const message =
        problem?.error?.message ??
        problem?.detail ??
        problem?.title ??
        `Core API request failed with ${response.status}`;
      recordCoreApiEvent({
        backendRequestId,
        durationMs: elapsedMilliseconds(startedAt),
        error: message,
        event: 'core_api_request_failed',
        method,
        requestId,
        route,
        status: response.status,
      });
      const code = problem?.error?.code;
      if (response.status === 403 && code === 'FEATURE_ACCESS_DENIED') announceFeatureDenial();
      throw new CoreApiError(response.status, message, code);
    }

    recordCoreApiEvent({
      backendRequestId,
      durationMs: elapsedMilliseconds(startedAt),
      event: 'core_api_request_completed',
      method,
      requestId,
      route,
      status: response.status,
    });

    // A 204 always has no body, but a Nest controller returning `void` from
    // a POST also produces an empty body under a 2xx status other than 204
    // (e.g. 201) — `.json()` on an empty body throws "Unexpected end of JSON
    // input" rather than returning something falsy, so body presence (not
    // status code) is what actually determines whether parsing is safe.
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as TResponse;
    }

    const text = await response.text();
    if (text === '') {
      return undefined as TResponse;
    }
    return JSON.parse(text) as TResponse;
  }

  public async stream(route: string, init: RequestInit = {}): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'text/event-stream');
    }
    if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', requestId);
    if (!headers.has('X-Correlation-Id')) headers.set('X-Correlation-Id', requestId);
    recordCoreApiEvent({ event: 'core_api_request_started', method: 'GET', requestId, route });

    let response: Response;
    try {
      response = await this.fetchImplementation(this.absoluteUrl(route), {
        ...init,
        credentials: this.credentials,
        headers,
      });
    } catch (error: unknown) {
      recordCoreApiEvent({
        durationMs: elapsedMilliseconds(startedAt),
        error: safeErrorMessage(error),
        event: 'core_api_request_failed',
        method: 'GET',
        requestId,
        route,
      });
      throw error;
    }
    const backendRequestId = response.headers.get('X-Request-Id') ?? undefined;
    if (!response.ok) {
      const message = `Core API stream failed with ${response.status}`;
      recordCoreApiEvent({
        backendRequestId,
        durationMs: elapsedMilliseconds(startedAt),
        error: message,
        event: 'core_api_request_failed',
        method: 'GET',
        requestId,
        route,
        status: response.status,
      });
      throw new CoreApiError(response.status, message);
    }
    recordCoreApiEvent({
      backendRequestId,
      durationMs: elapsedMilliseconds(startedAt),
      event: 'core_api_request_completed',
      method: 'GET',
      requestId,
      route,
      status: response.status,
    });
    return response;
  }

  public absoluteUrl(route: string): string {
    return `${this.baseUrl}${route}`;
  }

  private async readProblem(response: Response): Promise<ProblemDetailsDto | undefined> {
    try {
      return (await response.json()) as ProblemDetailsDto;
    } catch {
      return undefined;
    }
  }
}

function browserCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const encoded = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=', 2)[1];
  return encoded === undefined ? undefined : decodeURIComponent(encoded);
}

/**
 * Every Core and Agent request passes through here, so this is the one place
 * that sees a feature being refused regardless of which screen asked for it.
 */
function announceFeatureDenial(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(WORKSPACE_ACCESS_DENIED_EVENT));
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 512) : 'Unknown client error';
}

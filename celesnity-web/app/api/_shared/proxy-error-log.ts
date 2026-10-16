type ProxyTarget = 'core' | 'agent';

interface ProxyTransportFailure {
  readonly target: ProxyTarget;
  readonly method: string;
  readonly path: readonly string[];
  readonly requestId: string;
  readonly durationMs?: number;
}

export function logProxyTransportFailure(failure: ProxyTransportFailure): void {
  console.error(
    JSON.stringify({
      event: `${failure.target}_proxy_request_failed`,
      service: 'celesnity-web',
      occurredAt: new Date().toISOString(),
      method: failure.method,
      path: `/${failure.path.join('/')}`,
      requestId: failure.requestId,
      error: `${failure.target}_transport_failed`,
      ...(failure.durationMs === undefined ? {} : { durationMs: failure.durationMs }),
    }),
  );
}

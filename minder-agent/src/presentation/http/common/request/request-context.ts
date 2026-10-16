export interface RequestContext {
  readonly requestId: string;
  readonly apiVersion: "1" | "2" | undefined;
}

const REQUEST_CONTEXT = Symbol("request-context");

export function setRequestContext(
  request: object,
  context: RequestContext,
): void {
  Object.defineProperty(request, REQUEST_CONTEXT, {
    value: Object.freeze(context),
  });
}

export function requestContext(request: object): RequestContext | undefined {
  return (request as { [REQUEST_CONTEXT]?: RequestContext })[REQUEST_CONTEXT];
}

export function requestId(request: object): string | undefined {
  return requestContext(request)?.requestId;
}

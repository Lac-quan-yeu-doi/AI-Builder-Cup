export function logWebClientError(request: Request, response: Response): Response {
  if (response.status < 400 || response.status >= 500) return response;
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();

  console.warn(
    JSON.stringify({
      event: 'web_http_client_error',
      service: 'celesnity-web',
      occurredAt: new Date().toISOString(),
      method: request.method,
      path: new URL(request.url).pathname,
      requestId,
      status: response.status,
    }),
  );
  return response;
}

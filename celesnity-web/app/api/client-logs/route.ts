import { logWebClientError } from '@/app/api/_shared/web-client-error-log';

const MAX_LOG_BYTES = 8_192;
const MAX_FIELD_LENGTH = 512;

export async function POST(request: Request): Promise<Response> {
  const body = await readBodyWithinLimit(request);
  if (body === undefined) {
    return logWebClientError(request, new Response(null, { status: 413 }));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return logWebClientError(request, Response.json({ error: 'Invalid JSON.' }, { status: 400 }));
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return logWebClientError(
      request,
      Response.json({ error: 'Log entry must be an object.' }, { status: 400 }),
    );
  }

  const entry = Object.fromEntries(
    Object.entries(raw)
      .slice(0, 20)
      .map(([key, value]) => [key.slice(0, 64), sanitizeValue(value)]),
  );
  const message = JSON.stringify({
    event: 'frontend_client_telemetry',
    receivedAt: new Date().toISOString(),
    telemetry: entry,
    userAgent: request.headers.get('user-agent')?.slice(0, MAX_FIELD_LENGTH),
  });

  if (entry.event === 'core_api_request_failed') {
    console.error(message);
  } else if (entry.event === 'message_block_stream_failed') {
    console.warn(message);
  } else {
    console.info(message);
  }

  return new Response(null, { status: 204 });
}

async function readBodyWithinLimit(request: Request): Promise<string | undefined> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOG_BYTES) {
    return undefined;
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_LOG_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function sanitizeValue(value: unknown): boolean | number | string | undefined {
  if (typeof value === 'string') {
    return value.slice(0, MAX_FIELD_LENGTH);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

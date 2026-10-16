const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EVENT_NAME = 'metadata-crawler.run.queued.v1';
const AGGREGATE_TYPE = 'MetadataCrawlerRun';

export interface MetadataCrawlerRunQueuedEvent {
  readonly eventId: string;
  readonly organizationId: string;
  readonly eventName: typeof EVENT_NAME;
  readonly aggregateType: typeof AGGREGATE_TYPE;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly payload: {
    readonly schemaVersion: 1;
    readonly runId: string;
  };
}

/** Parses only the versioned, secret-free queued-run contract. */
export function parseMetadataCrawlerRunQueuedEvent(
  value: Buffer | string | null | undefined,
): MetadataCrawlerRunQueuedEvent | undefined {
  if (value === null || value === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const eventId = stringValue(parsed.eventId);
  const organizationId = stringValue(parsed.organizationId);
  const eventName = stringValue(parsed.eventName);
  const aggregateType = stringValue(parsed.aggregateType);
  const aggregateId = stringValue(parsed.aggregateId);
  const occurredAt = stringValue(parsed.occurredAt);
  if (
    eventId === undefined ||
    organizationId === undefined ||
    eventName !== EVENT_NAME ||
    aggregateType !== AGGREGATE_TYPE ||
    aggregateId === undefined ||
    !UUID_PATTERN.test(eventId) ||
    !UUID_PATTERN.test(organizationId) ||
    !UUID_PATTERN.test(aggregateId) ||
    !Number.isFinite(Date.parse(occurredAt ?? ''))
  ) {
    return undefined;
  }

  if (!isRecord(parsed.payload)) return undefined;
  const schemaVersion = parsed.payload.schemaVersion;
  const runId = stringValue(parsed.payload.runId);
  if (schemaVersion !== 1 || runId === undefined || !UUID_PATTERN.test(runId)) {
    return undefined;
  }
  if (runId !== aggregateId) return undefined;

  return {
    eventId,
    organizationId,
    eventName: EVENT_NAME,
    aggregateType: AGGREGATE_TYPE,
    aggregateId,
    occurredAt: occurredAt as string,
    payload: { schemaVersion: 1, runId },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

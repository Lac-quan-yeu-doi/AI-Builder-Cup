const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface AutomationWorkflowEventEnvelope {
  readonly deliveryId: string;
  readonly organizationId: string;
  readonly payload: unknown;
}

/** Parses the shared integration-event envelope, generically across any topic. */
export function parseAutomationWorkflowEventEnvelope(
  value: Buffer | string | null | undefined,
): AutomationWorkflowEventEnvelope | undefined {
  if (value === null || value === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const deliveryId = stringValue(parsed.eventId);
  const organizationId = stringValue(parsed.organizationId);
  if (deliveryId === undefined || organizationId === undefined) return undefined;
  if (!UUID_PATTERN.test(deliveryId) || !UUID_PATTERN.test(organizationId)) return undefined;

  return { deliveryId, organizationId, payload: parsed.payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export const AUDIT_WRITER = Symbol('AUDIT_WRITER');
export interface AuditWriteInput {
  readonly organizationId: string;
  readonly actorIdentityId?: string;
  readonly sessionId?: string;
  readonly requestId?: string;
  readonly eventType: string;
  readonly action: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly outcome: 'SUCCEEDED' | 'FAILED';
  readonly ipAddressHash?: string;
  readonly userAgent?: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}
export interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

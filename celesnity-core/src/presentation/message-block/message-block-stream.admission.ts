import type { IOperationalMetrics } from '@application/observability/interfaces/i-operational-metrics';

export type StreamCloseReason =
  'rotation' | 'disconnect' | 'slow_consumer' | 'oversized' | 'error' | 'shutdown' | 'cursor_reset';
export type StreamRejection = 'pod' | 'organization' | 'identity';
const LIMITS = { pod: 32, organization: 16, identity: 8 } as const;

/** Process-local quotas, including database reads still settling after a disconnect. */
export class MessageBlockStreamAdmission {
  private total = 0;
  private reads = 0;
  private readonly organizations = new Map<string, number>();
  private readonly identities = new Map<string, number>();

  public constructor(private readonly metrics: IOperationalMetrics) {}

  public acquire(
    organization: string,
    identity: string,
  ): { release(reason: StreamCloseReason): void } | StreamRejection {
    const rejection =
      this.total >= LIMITS.pod || !this.hasReadCapacity
        ? 'pod'
        : (this.organizations.get(organization) ?? 0) >= LIMITS.organization
          ? 'organization'
          : (this.identities.get(identity) ?? 0) >= LIMITS.identity
            ? 'identity'
            : undefined;
    if (rejection) {
      this.metrics.messageBlockRejected?.(rejection);
      return rejection;
    }
    this.total += 1;
    this.organizations.set(organization, (this.organizations.get(organization) ?? 0) + 1);
    this.identities.set(identity, (this.identities.get(identity) ?? 0) + 1);
    this.metrics.messageBlockOpened?.();
    let released = false;
    return {
      release: (reason): void => {
        if (released) return;
        released = true;
        this.total -= 1;
        for (const [map, key] of [
          [this.organizations, organization],
          [this.identities, identity],
        ] as const) {
          const count = (map.get(key) ?? 1) - 1;
          if (count === 0) map.delete(key);
          else map.set(key, count);
        }
        this.metrics.messageBlockClosed?.(reason);
      },
    };
  }

  public acquireRead(): { release(): void } | undefined {
    if (!this.hasReadCapacity) return undefined;
    this.reads += 1;
    this.metrics.messageBlockReadCount?.(this.reads);
    let released = false;
    return {
      release: (): void => {
        if (released) return;
        released = true;
        this.reads -= 1;
        this.metrics.messageBlockReadCount?.(this.reads);
      },
    };
  }

  public get active(): number {
    return this.total;
  }

  private get hasReadCapacity(): boolean {
    return this.reads < LIMITS.pod;
  }
}

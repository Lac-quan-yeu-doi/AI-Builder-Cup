import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

/**
 * A clock that returns a fixed instant, and can be advanced explicitly.
 *
 * Injecting this is what makes a use case's timestamps assertable. Code that calls
 * `new Date()` directly can only be tested for "roughly now", which is why the
 * clock is a port.
 */
export class FixedClock implements IClock {
  private current: Date;

  public constructor(start: Date | string = '2026-08-04T10:00:00.000Z') {
    this.current = new Date(start);
  }

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  public set(instant: Date | string): void {
    this.current = new Date(instant);
  }
}

/**
 * Hands out valid, predictable UUID v4 identifiers in sequence.
 *
 * They have to be well-formed, because the aggregates validate every id they are
 * given — a counter or a label would be rejected. The final hex block is the
 * sequence number, so a failing assertion names which call produced the id.
 */
export class SequentialIdGenerator implements IIdGenerator {
  private issued = 0;

  public constructor(private readonly prefix = 'aaaaaaaa-aaaa-4aaa-8aaa') {}

  public next(): string {
    this.issued += 1;
    return `${this.prefix}-${this.issued.toString().padStart(12, '0')}`;
  }

  public get count(): number {
    return this.issued;
  }

  /** The id the nth call produced, for asserting a specific event's identity. */
  public nth(sequence: number): string {
    return `${this.prefix}-${sequence.toString().padStart(12, '0')}`;
  }
}

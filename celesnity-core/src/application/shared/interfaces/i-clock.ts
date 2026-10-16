/**
 * Outbound port for the current wall-clock time. Injected so use cases and
 * background runners remain deterministic and testable.
 */
export interface IClock {
  now(): Date;
}

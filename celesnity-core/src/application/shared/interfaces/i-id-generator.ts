/**
 * Outbound port for generating opaque unique identifiers (UUID v4) used for
 * aggregate ids and domain event ids.
 */
export interface IIdGenerator {
  next(): string;
}

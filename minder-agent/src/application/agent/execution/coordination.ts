export interface CoordinationPolicy {
  readonly canDelegateTo: readonly string[];
  readonly acceptsFrom: readonly string[];
}

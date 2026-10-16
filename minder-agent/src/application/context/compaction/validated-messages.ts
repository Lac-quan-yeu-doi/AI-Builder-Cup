export interface ValidatedMessageList<T> {
  readonly values: readonly T[];
  readonly valid: boolean;
  readonly reason?: string;
}

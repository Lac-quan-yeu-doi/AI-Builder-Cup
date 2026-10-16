export interface CompactionPlan {
  readonly summary: string;
  readonly archivedCount: number;
}
export interface ContextCompactor {
  compact(input: readonly unknown[]): Promise<CompactionPlan>;
}

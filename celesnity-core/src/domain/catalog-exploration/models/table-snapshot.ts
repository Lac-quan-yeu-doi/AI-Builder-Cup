/** One entry from an Iceberg table's `$snapshots` metadata table. */
export class TableSnapshot {
  private constructor(
    public readonly snapshotId: string,
    public readonly parentId: string | undefined,
    public readonly committedAt: string,
    public readonly operation: string | undefined,
    public readonly manifestList: string | undefined,
    public readonly summary: Readonly<Record<string, string>>,
  ) {
    Object.freeze(this);
  }

  public static create(input: {
    readonly snapshotId: string;
    readonly parentId?: string;
    readonly committedAt: string;
    readonly operation?: string;
    readonly manifestList?: string;
    readonly summary?: Readonly<Record<string, string>>;
  }): TableSnapshot {
    return new TableSnapshot(
      input.snapshotId,
      input.parentId,
      input.committedAt,
      input.operation,
      input.manifestList,
      Object.freeze({ ...(input.summary ?? {}) }),
    );
  }
}

/** Which family of summary statistics a column's profile carries. */
export type ColumnProfileKind = 'string' | 'numeric' | 'other';

/**
 * A per-column summary of a table's data — never raw rows — used to ground an
 * agent's SQL/chart generation cheaply: up to 100 distinct values for string
 * columns, min/max/avg for numeric columns. Columns of other kinds carry no
 * statistics beyond their name and type.
 */
export class ColumnProfile {
  private constructor(
    public readonly name: string,
    public readonly dataType: string,
    public readonly kind: ColumnProfileKind,
    public readonly topValues: readonly string[] | undefined,
    public readonly min: number | undefined,
    public readonly max: number | undefined,
    public readonly avg: number | undefined,
    public readonly computedAt: string,
  ) {
    Object.freeze(this);
  }

  public static create(input: {
    readonly name: string;
    readonly dataType: string;
    readonly kind: ColumnProfileKind;
    readonly topValues?: readonly string[];
    readonly min?: number;
    readonly max?: number;
    readonly avg?: number;
    readonly computedAt: string;
  }): ColumnProfile {
    return new ColumnProfile(
      input.name,
      input.dataType,
      input.kind,
      input.topValues,
      input.min,
      input.max,
      input.avg,
      input.computedAt,
    );
  }
}

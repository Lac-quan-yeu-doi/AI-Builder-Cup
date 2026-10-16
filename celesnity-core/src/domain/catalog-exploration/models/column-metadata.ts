/** A single column's Trino-visible metadata. */
export class ColumnMetadata {
  private constructor(
    public readonly name: string,
    public readonly dataType: string,
    public readonly nullable: boolean,
    public readonly ordinalPosition: number,
    public readonly comment: string | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(input: {
    readonly name: string;
    readonly dataType: string;
    readonly nullable: boolean;
    readonly ordinalPosition: number;
    readonly comment?: string;
  }): ColumnMetadata {
    return new ColumnMetadata(
      input.name,
      input.dataType,
      input.nullable,
      input.ordinalPosition,
      input.comment,
    );
  }
}

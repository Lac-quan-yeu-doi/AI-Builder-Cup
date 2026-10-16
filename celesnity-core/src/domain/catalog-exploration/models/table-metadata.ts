import type { ColumnMetadata } from '@domain/catalog-exploration/models/column-metadata';

/** Table-level metadata: identity plus its ordered columns. */
export class TableMetadata {
  private constructor(
    public readonly catalog: string,
    public readonly schema: string,
    public readonly name: string,
    public readonly columns: readonly ColumnMetadata[],
  ) {
    Object.freeze(this);
  }

  public static create(
    catalog: string,
    schema: string,
    name: string,
    columns: readonly ColumnMetadata[],
  ): TableMetadata {
    return new TableMetadata(catalog, schema, name, Object.freeze([...columns]));
  }
}

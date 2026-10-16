/** A lightweight listing entry for a table or view within a namespace. */
export class TableSummary {
  private constructor(
    public readonly catalog: string,
    public readonly schema: string,
    public readonly name: string,
    public readonly tableType: string,
  ) {
    Object.freeze(this);
  }

  public static create(
    catalog: string,
    schema: string,
    name: string,
    tableType: string,
  ): TableSummary {
    return new TableSummary(catalog, schema, name, tableType);
  }
}

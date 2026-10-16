/**
 * A browsable catalog. `name` is the Trino-facing catalog alias (for example
 * `iceberg`) while `jdbcCatalogIdentity` is the underlying Iceberg JDBC catalog
 * identity (`celesnity`) required by Requirement 4.1.
 */
export class Catalog {
  private constructor(
    public readonly name: string,
    public readonly jdbcCatalogIdentity: string,
  ) {
    Object.freeze(this);
  }

  public static create(name: string, jdbcCatalogIdentity: string): Catalog {
    return new Catalog(name, jdbcCatalogIdentity);
  }
}

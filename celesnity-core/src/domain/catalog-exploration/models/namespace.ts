/** A namespace (schema) inside a catalog. */
export class Namespace {
  private constructor(
    public readonly catalog: string,
    public readonly name: string,
    public readonly description?: string,
  ) {
    Object.freeze(this);
  }

  public static create(catalog: string, name: string, description?: string): Namespace {
    return new Namespace(catalog, name, description);
  }
}

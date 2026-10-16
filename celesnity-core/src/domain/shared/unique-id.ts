const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export abstract class UniqueId {
  protected constructor(public readonly value: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid UUID: ${value}`);
    }
  }

  public equals(other: UniqueId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}

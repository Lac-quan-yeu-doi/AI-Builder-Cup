export interface CredentialRotationOptions {
  readonly cooldownMs: number;
  readonly now?: () => number;
}

/**
 * Round-robins across a pool of provider credentials, advancing to the next
 * credential after a failure so a single bad key does not stall the provider.
 * Credentials are runtime-only, never tenant data, and are never logged.
 *
 * Ported from the Rust provider key-rotation behavior.
 */
export class CredentialRotation {
  private index = 0;
  private readonly cooldownUntil: number[];
  private readonly now: () => number;

  constructor(
    private readonly credentials: readonly string[],
    private readonly options: CredentialRotationOptions,
  ) {
    if (credentials.length === 0)
      throw new Error("At least one credential is required.");
    this.cooldownUntil = credentials.map(() => 0);
    this.now = options.now ?? (() => Date.now());
  }

  async withCredential<T>(use: (credential: string) => Promise<T>): Promise<T> {
    // Skip credentials still in cooldown, preferring the current pointer.
    for (let offset = 0; offset < this.credentials.length; offset += 1) {
      const at = (this.index + offset) % this.credentials.length;
      if (this.cooldownUntil[at]! <= this.now()) {
        this.index = at;
        break;
      }
    }
    const at = this.index;
    const credential = this.credentials[at]!;
    try {
      const result = await use(credential);
      return result;
    } catch (error) {
      // Advance to the next credential so a subsequent attempt rotates away.
      this.cooldownUntil[at] = this.now() + this.options.cooldownMs;
      this.index = (at + 1) % this.credentials.length;
      throw error;
    }
  }
}

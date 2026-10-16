/** Serializes mutations for one canonical workspace path. */
export class FileMutationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(path) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(path, tail);
    try {
      await previous.catch(() => undefined);
      return await operation();
    } finally {
      release();
      if (this.tails.get(path) === tail) this.tails.delete(path);
    }
  }
}

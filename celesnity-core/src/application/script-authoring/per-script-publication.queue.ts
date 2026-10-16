export class PerScriptPublicationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(scriptId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(scriptId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(scriptId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(scriptId) === tail) {
        this.tails.delete(scriptId);
      }
    }
  }
}

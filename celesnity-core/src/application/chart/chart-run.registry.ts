import { randomUUID } from 'node:crypto';

interface ActiveRun {
  readonly controller: AbortController;
  claimed: boolean;
}

/**
 * Process-local lifecycle registry for active chart streams. It stores only an
 * AbortController and a single-consumer claim; rows are deliberately absent.
 * Once a run is completed or disconnected it cannot be replayed.
 */
export class ChartRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();

  public register(): { readonly runId: string; readonly signal: AbortSignal } {
    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, { controller, claimed: false });
    return { runId, signal: controller.signal };
  }

  public claim(runId: string): AbortSignal | null {
    const run = this.runs.get(runId);
    if (run === undefined || run.claimed) return null;
    run.claimed = true;
    return run.controller.signal;
  }

  public cancel(runId: string): boolean {
    const run = this.runs.get(runId);
    if (run === undefined) return false;
    run.controller.abort();
    this.runs.delete(runId);
    return true;
  }

  public complete(runId: string): void {
    this.runs.delete(runId);
  }

  public has(runId: string): boolean {
    return this.runs.has(runId);
  }
}

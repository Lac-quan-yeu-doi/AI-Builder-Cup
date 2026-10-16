export type AutomationChartPreview = Readonly<Record<string, unknown>>;

/** Bridges transient chart previews between MCP calls in one automation run. */
export class AutomationChartPreviewStore {
  private static readonly MAX_RUNS = 256;
  private readonly previews = new Map<string, readonly AutomationChartPreview[]>();

  public remember(runId: string | undefined, preview: AutomationChartPreview): void {
    if (runId === undefined) return;
    const current = this.previews.get(runId) ?? [];
    const title = preview['title'];
    const withoutSameTitle = current.filter((candidate) => candidate['title'] !== title);
    this.previews.delete(runId);
    this.previews.set(runId, [...withoutSameTitle, preview].slice(-8));
    if (this.previews.size > AutomationChartPreviewStore.MAX_RUNS) {
      const oldestRunId = this.previews.keys().next().value;
      if (oldestRunId !== undefined) this.previews.delete(oldestRunId);
    }
  }

  public forRun(runId: string | undefined): readonly AutomationChartPreview[] {
    return runId === undefined ? [] : (this.previews.get(runId) ?? []);
  }
}

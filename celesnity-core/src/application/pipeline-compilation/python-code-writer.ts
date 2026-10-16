import type { CompiledSourceRange } from '@domain/pipeline-compilation/models/compiled-pipeline';

export class PythonCodeWriter {
  private readonly lines: string[] = [];
  private readonly ranges = new Map<string, CompiledSourceRange>();

  public line(value = ''): void {
    this.lines.push(value);
  }

  public block(lines: readonly string[]): void {
    this.lines.push(...lines);
  }

  public nodeBlock(nodeId: string, lines: readonly string[]): void {
    const startLine = this.lines.length + 1;
    this.lines.push(...lines);
    this.ranges.set(nodeId, { startLine, endLine: this.lines.length });
  }

  public render(): {
    readonly source: string;
    readonly sourceMap: Readonly<Record<string, CompiledSourceRange>>;
  } {
    return {
      source: `${this.lines.join('\n')}\n`,
      sourceMap: Object.fromEntries(this.ranges),
    };
  }
}

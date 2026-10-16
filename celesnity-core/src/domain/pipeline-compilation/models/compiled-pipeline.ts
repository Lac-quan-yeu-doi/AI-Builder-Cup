export interface CompiledSourceRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface CompiledPipeline {
  readonly source: string;
  readonly sourceSha256: string;
  readonly semanticGraphSha256: string;
  readonly compilerVersion: string;
  readonly sourceMap: Readonly<Record<string, CompiledSourceRange>>;
}

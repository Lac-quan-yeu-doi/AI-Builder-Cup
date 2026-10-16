export interface InstructionSource {
  readonly path: string;
  readonly content: string;
  readonly scope: "project" | "subdirectory" | "included";
}
export interface ContextCollector {
  collect(input: {
    readonly workspace: string;
  }): Promise<readonly InstructionSource[]>;
}

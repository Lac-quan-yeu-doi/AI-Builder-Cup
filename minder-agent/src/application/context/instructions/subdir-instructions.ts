export interface SubdirectoryInstructionCache {
  get(path: string): Promise<readonly string[]>;
}

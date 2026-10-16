export interface IncludeResolver {
  resolve(path: string): Promise<readonly string[]>;
}

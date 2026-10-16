export interface WorkspaceSynchronizer {
  sync(path: string): Promise<void>;
}

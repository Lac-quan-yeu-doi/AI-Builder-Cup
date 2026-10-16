export type FileChangeKind = "created" | "updated" | "deleted" | "renamed";
export interface FileChange {
  readonly path: string;
  readonly kind: FileChangeKind;
  readonly previousPath?: string;
}

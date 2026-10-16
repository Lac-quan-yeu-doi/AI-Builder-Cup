/** Stores the original uploaded file bytes — the extracted text lives in the repository, not here. */
export interface IDocumentStorage {
  put(storageKey: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(storageKey: string): Promise<Uint8Array>;
}

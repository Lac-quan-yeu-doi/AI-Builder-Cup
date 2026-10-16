export interface AttachmentCollector {
  collect(): Promise<readonly string[]>;
}

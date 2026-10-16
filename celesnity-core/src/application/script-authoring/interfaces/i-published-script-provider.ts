export interface PublishedScript {
  readonly scriptId: string;
  readonly scriptVersionId: string;
  readonly versionNumber: number;
  readonly connectionId: string;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly source: Uint8Array;
}

export interface IPublishedScriptProvider {
  resolvePublishedVersion(scriptId: string, versionNumber: number): Promise<PublishedScript>;
}

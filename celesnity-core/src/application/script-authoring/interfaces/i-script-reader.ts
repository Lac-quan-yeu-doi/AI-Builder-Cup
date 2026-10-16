export interface ScriptVersionView {
  readonly id: string;
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly publishedAt: string;
}

export interface ScriptView {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly connectionId: string;
  readonly status: 'ACTIVE';
  readonly currentVersion?: ScriptVersionView;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublishedScriptRecord extends ScriptVersionView {
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
}

export interface IScriptReader {
  listActive(): Promise<readonly ScriptView[]>;
  findActiveById(id: string): Promise<ScriptView | undefined>;
  listPublishedVersions(scriptId: string): Promise<readonly ScriptVersionView[]>;
  findPublishedVersion(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScriptRecord | undefined>;
}

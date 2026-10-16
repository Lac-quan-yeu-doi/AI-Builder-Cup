export interface MetadataCrawlerLogContent {
  readonly text: string;
  readonly byteSize: number;
}

export interface MetadataCrawlerLogWriter {
  append(chunk: string): void;
  flush(): Promise<void>;
  finalize(): Promise<number>;
}

export interface IMetadataCrawlerLogStore {
  openWriter(crawlerId: string, runId: string): MetadataCrawlerLogWriter;
  read(crawlerId: string, runId: string): Promise<MetadataCrawlerLogContent | undefined>;
}

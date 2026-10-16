import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, type ClientOptions } from 'minio';

/**
 * Builds the MinIO clients used by the object stores.
 *
 * Endpoint parsing and credential lookup were previously copied verbatim into
 * every store. They live here instead, so the S3 endpoint contract is stated
 * once: the configured URL supplies host, scheme and port, with the port
 * defaulted from the scheme when the URL omits it, and path-style addressing is
 * always used because MinIO does not serve virtual-host-style buckets by
 * default.
 *
 * Each caller still gets its own {@link Client}, which is what the stores did
 * before and keeps their failure handling independent.
 */
@Injectable()
export class MinioClientFactory {
  private readonly options: ClientOptions;

  public constructor(config: ConfigService) {
    const endpoint = new URL(config.getOrThrow<string>('MINIO_ENDPOINT'));
    const useSSL = endpoint.protocol === 'https:';
    this.options = {
      endPoint: endpoint.hostname,
      port: endpoint.port === '' ? (useSSL ? 443 : 80) : Number(endpoint.port),
      useSSL,
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
      pathStyle: true,
    };
  }

  public create(): Client {
    return new Client(this.options);
  }
}

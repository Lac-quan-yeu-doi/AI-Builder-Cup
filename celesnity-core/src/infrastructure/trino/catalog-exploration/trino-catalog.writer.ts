import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import { Namespace } from '@domain/catalog-exploration/models/catalog-models';
import type {
  CatalogName,
  NamespaceName,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';
import { TrinoCatalogStatementClient } from '@infrastructure/trino/catalog-exploration/trino-catalog-statement.client';

@Injectable()
export class TrinoCatalogWriter implements ICatalogWriter {
  private readonly client: TrinoCatalogStatementClient;

  public constructor(config: ConfigService) {
    this.client = new TrinoCatalogStatementClient(
      config.getOrThrow<string>('TRINO_URL'),
      config.getOrThrow<string>('TRINO_USER'),
      config.getOrThrow<string>('TRINO_PASSWORD'),
    );
  }

  public async createNamespace(catalog: CatalogName, namespace: NamespaceName): Promise<Namespace> {
    await this.client.execute(`CREATE SCHEMA ${catalog.quoted}.${namespace.quoted}`, {
      catalog: catalog.value,
    });
    return Namespace.create(catalog.value, namespace.value);
  }
}

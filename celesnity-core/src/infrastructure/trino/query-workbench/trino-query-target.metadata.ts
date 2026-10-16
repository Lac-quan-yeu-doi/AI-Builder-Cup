import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IQueryTargetMetadata,
  QueryTableTarget,
} from '@application/query-workbench/interfaces/i-query-target-resolver';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';
import { TrinoStatementClient } from './trino-statement.client';

@Injectable()
export class TrinoQueryTargetMetadata implements IQueryTargetMetadata {
  private readonly client: TrinoStatementClient;
  public constructor(config: ConfigService) {
    this.client = new TrinoStatementClient(
      config.getOrThrow<string>('TRINO_URL'),
      config.getOrThrow<string>('TRINO_USER'),
      config.getOrThrow<string>('TRINO_PASSWORD'),
    );
  }

  public async columns(target: QueryTableTarget): Promise<readonly string[]> {
    const catalog = `"${target.catalog.replaceAll('"', '""')}"`;
    const schema = `'${target.schema.replaceAll("'", "''")}'`;
    const table = `'${target.table.replaceAll("'", "''")}'`;
    // Metadata only, after authorization of the named table. Views are denied
    // until their dependency/security-invoker semantics are enforced at Trino.
    const sql = `SELECT t.table_type, c.column_name FROM ${catalog}.information_schema.tables t LEFT JOIN ${catalog}.information_schema.columns c ON t.table_catalog = c.table_catalog AND t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE t.table_schema = ${schema} AND t.table_name = ${table}`;
    const signal = AbortSignal.timeout(10000);
    let queryId: string | undefined;
    try {
      let page = await this.client.submit(sql, {}, signal);
      queryId = page.id;
      const rows: (readonly unknown[])[] = [];
      for (let pages = 0; ; pages++) {
        if (page.error || pages > 100 || rows.length > 10000)
          throw new Error('Unresolved metadata');
        rows.push(...(page.data ?? []));
        if (!page.nextUri) break;
        page = await this.client.fetchNext(page.nextUri, signal);
      }
      if (!rows.length || rows.some((row) => row[0] !== 'BASE TABLE' || typeof row[1] !== 'string'))
        throw new Error('Not a base table');
      return rows.map((row) => row[1] as string);
    } catch {
      if (queryId) await this.client.delete(this.client.queryUri(queryId));
      // Do not leak existence, view definitions or backend errors to a caller.
      throw new CatalogAccessDeniedError('DEFAULT_DENY');
    }
  }
}

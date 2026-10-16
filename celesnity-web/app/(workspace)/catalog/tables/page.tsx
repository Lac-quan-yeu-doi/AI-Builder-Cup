import type { Metadata } from 'next';

import { CatalogExplorerFeature } from '@/app/(workspace)/catalog/_components/catalog-explorer-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Tables | Data Catalog' };

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

export default async function CatalogTablesPage({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<
      Record<
        'catalog' | 'schema' | 'table' | 'deviceId' | 'deviceName',
        string | readonly string[] | undefined
      >
    >
  >;
}) {
  const query = await searchParams;
  const catalog = first(query.catalog);
  const schema = first(query.schema);
  const table = first(query.table);
  const deviceId = first(query.deviceId);
  const deviceName = first(query.deviceName);
  const initialDeviceEvent =
    catalog && schema && table && deviceId && deviceName
      ? { table: { catalog, schema, table }, deviceId, deviceName }
      : undefined;
  return (
    <PageContainer>
      <CatalogExplorerFeature
        view="tables"
        {...(initialDeviceEvent === undefined ? {} : { initialDeviceEvent })}
      />
    </PageContainer>
  );
}

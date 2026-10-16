import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { PluginsList } from './_components/plugins-list';

export const metadata: Metadata = { title: 'Plugins' };

export default function PluginsPage() {
  return (
    <PageContainer>
      <PluginsList />
    </PageContainer>
  );
}

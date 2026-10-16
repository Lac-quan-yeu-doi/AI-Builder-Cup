import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { DeviceManagementFeature } from '@/app/_components/device/device-management-feature';

export const metadata: Metadata = { title: 'Device Management' };

export default function DevicesPage() {
  return (
    <PageContainer>
      <DeviceManagementFeature />
    </PageContainer>
  );
}

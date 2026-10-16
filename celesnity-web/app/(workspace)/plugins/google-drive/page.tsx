import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { GoogleDriveDetail } from './_components/google-drive-detail';

export const metadata: Metadata = { title: 'Google Drive — Plugins' };

export default function GoogleDrivePage() {
  return (
    <PageContainer>
      <GoogleDriveDetail />
    </PageContainer>
  );
}

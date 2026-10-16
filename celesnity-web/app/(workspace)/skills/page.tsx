import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';

import { SkillsFeature } from './_components/skills-feature';

export const metadata: Metadata = { title: 'Skills' };

export default function SkillsPage() {
  return (
    <PageContainer width="full">
      <SkillsFeature />
    </PageContainer>
  );
}

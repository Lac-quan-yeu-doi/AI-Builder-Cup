'use client';

import type { ReactNode } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';

/**
 * Shows one of two server-rendered bodies, following the workspace's own
 * language toggle. Both languages are in the HTML, so the pages stay static
 * and the switch is instant; the locale lives in the same store as the rest of
 * the app, so a reader who set Vietnamese once sees Vietnamese here too.
 */
export function LocaleSwitch({ vi, en }: { readonly vi: ReactNode; readonly en: ReactNode }) {
  const { locale } = useTranslation();
  return <div lang={locale}>{locale === 'vi' ? vi : en}</div>;
}

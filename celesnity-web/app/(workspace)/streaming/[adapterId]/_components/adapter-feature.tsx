'use client';

import { getInjection } from '@/di/container';

import { AdapterScreen } from './adapter-screen';

interface AdapterFeatureProps {
  readonly adapterId: string;
}

export function AdapterFeature({ adapterId }: AdapterFeatureProps) {
  return (
    <AdapterScreen
      adapterId={adapterId}
      controller={getInjection('ManageStreamAdaptersController')}
    />
  );
}

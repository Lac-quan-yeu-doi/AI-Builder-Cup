'use client';

import { getInjection } from '@/di/container';

import { StreamingScreen } from './streaming-screen';

export function StreamingFeature() {
  return <StreamingScreen controller={getInjection('ManageStreamAdaptersController')} />;
}

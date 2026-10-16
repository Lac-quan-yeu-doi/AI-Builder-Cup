'use client';

import { getInjection } from '@/di/container';
import { PlantWalkthroughScreen } from './plant-walkthrough-screen';

const controller = getInjection('PlantWalkthroughController');

export function PlantWalkthroughFeature() {
  return <PlantWalkthroughScreen controller={controller} />;
}

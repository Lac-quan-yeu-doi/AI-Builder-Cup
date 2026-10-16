'use client';

import { getInjection } from '@/di/container';
import { PlantSitesScreen } from './plant-sites-screen';

const controller = getInjection('PlantModelController');

export function PlantSitesFeature() {
  return <PlantSitesScreen controller={controller} />;
}

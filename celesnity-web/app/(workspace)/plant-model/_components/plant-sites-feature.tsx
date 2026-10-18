'use client';

import { getInjection } from '@/di/container';
import { PlantSitesScreen } from './plant-sites-screen';

const controller = getInjection('PlantModelController');
const repairs = getInjection('RepairGuideController');

export function PlantSitesFeature() {
  return <PlantSitesScreen controller={controller} repairs={repairs} />;
}

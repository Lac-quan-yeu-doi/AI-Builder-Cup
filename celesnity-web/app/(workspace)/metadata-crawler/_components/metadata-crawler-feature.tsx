'use client';

import { getInjection } from '@/di/container';
import { MetadataCrawlerScreen } from './metadata-crawler-screen';

const controller = getInjection('MetadataCrawlerController');
const listDatabaseServices = getInjection('ListDatabaseServicesController');

export function MetadataCrawlerFeature() {
  return (
    <MetadataCrawlerScreen controller={controller} listDatabaseServices={listDatabaseServices} />
  );
}

/**
 * Demo Data 1's view of the shared demo helpers.
 *
 * Same authenticated `coreFetch` / `agentFetch` as every demo pack, but ids go to
 * `demo1-home-appliance/demo-ids.json` so both demos can live in one workspace
 * without overwriting each other's chart, dashboard or pipeline ids.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { idsStore } from '../lib/http.mjs';

export {
  DATA_END_DATE,
  agentFetch,
  argument,
  coreFetch,
  coreUrl,
  sleep,
  sourceDatabase,
} from '../lib/http.mjs';

/** The names this demo is filed under, in Core and in the warehouse. */
export const DEMO = Object.freeze({
  siteCode: 'DEMO1_HOME_APPLIANCE',
  siteName: 'Demo Data 1 – Home Appliance Plant (Chest Freezers)',
  templateId: 'demo1-home-appliance',
  database: 'demo1_home_appliance',
  sourceSchema: 'demo1_home_appliance',
  collectionName: 'Demo Data 1 – Home Appliance',
  timezone: 'Asia/Ho_Chi_Minh',
});

export const { readIds, writeIds } = idsStore(
  join(dirname(fileURLToPath(import.meta.url)), 'demo-ids.json'),
);

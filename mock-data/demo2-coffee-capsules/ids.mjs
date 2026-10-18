/**
 * The Demo Data 2 pack's view of the shared demo HTTP helpers.
 *
 * Same authenticated `coreFetch` as the Demo Data 1 seeds, but ids go to
 * `demo2-coffee-capsules/demo-ids.json` so the two demos can live in one
 * workspace without overwriting each other's chart, dashboard or pipeline ids.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DATA_END_DATE,
  agentFetch,
  argument,
  coreFetch,
  coreUrl,
  idsStore,
  sleep,
  sourceDatabase,
} from '../lib/http.mjs';

export const { readIds, writeIds } = idsStore(
  join(dirname(fileURLToPath(import.meta.url)), 'demo-ids.json'),
);

export { DATA_END_DATE, agentFetch, argument, coreFetch, coreUrl, sleep, sourceDatabase };

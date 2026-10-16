import type { Config } from 'jest';

import baseConfig from './jest.config.ts';

const config: Config = {
  ...baseConfig,
  // This suite is intentionally opt-in: its runner creates and drops one
  // dedicated PostgreSQL database after validating the connection target.
  testRegex: 'tests/integration/data-workflow/.*\\.integration\\.spec\\.ts$',
};

export default config;

import type { Config } from 'jest';

import base from './jest.config.ts';

const config: Config = {
  ...base,
  testRegex: '.*metadata-crawler\\.integration\\.ts$',
  coverageThreshold: undefined,
};

export default config;

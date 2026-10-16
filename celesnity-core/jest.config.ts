import type { Config } from 'jest';

/**
 * Jest harness for celesnity-core.
 *
 * `moduleNameMapper` mirrors the `paths` block in tsconfig.json one-for-one, so
 * a specification resolves `@domain/...` exactly the way the compiler does. The
 * two lists must be kept in sync; a missing alias here surfaces as a
 * "Cannot find module" failure rather than a silent fallback.
 */
const config: Config = {
  preset: 'ts-jest',
  rootDir: 'src',
  testEnvironment: 'node',
  // Specifications live under src/tests, mirroring the layer they cover, so the
  // production directories hold production code only. Matching the whole tree
  // rather than just src/tests is deliberate: a spec written in the wrong place
  // still runs, and `npm run verify` reports it as misplaced.
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/domain/$1',
    '^@application/(.*)$': '<rootDir>/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/infrastructure/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@presentation/(.*)$': '<rootDir>/presentation/$1',
    '^@bootstrap/(.*)$': '<rootDir>/bootstrap/$1',
    '^@generated/(.*)$': '<rootDir>/generated/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/generated/**', '!**/tests/**', '!**/*.spec.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/generated/', '<rootDir>/tests/'],
  coverageDirectory: '../coverage',
  /**
   * Floors, not targets.
   *
   * The global numbers are deliberately close to what the suite currently achieves
   * rather than aspirational: their job is to fail a change that removes coverage,
   * and a threshold nobody can meet gets deleted instead of respected. Adapters that
   * only run against Docker, MinIO, Trino or a live database are the bulk of what
   * sits below these lines.
   *
   * The per-file entries are the point. Each one is code where a silent regression
   * would be expensive, so each is held at full coverage rather than at the global
   * floor:
   *
   *  - the read-only SQL policy is a security control standing between user input
   *    and a query engine;
   *  - the outbox relay and unit of work are what make integration events durable —
   *    a gap here means messages are lost with nothing to show it;
   *  - the aggregates own the state machines and invariants the whole design rests on.
   *
   * One Jest behaviour to know when reading these numbers: a file matched by a glob
   * entry is removed from the `global` bucket. So `global` here means "everything
   * not listed below", and its figures are lower than the headline coverage summary
   * precisely because the well-covered files have been accounted for separately.
   */
  coverageThreshold: {
    global: {
      statements: 44,
      branches: 23,
      functions: 38,
      lines: 44,
    },
    '**/domain/query-workbench/policies/read-only-statement.policy.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    '**/application/shared/outbox-relay.service.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    '**/infrastructure/prisma/prisma-unit-of-work.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    '**/infrastructure/prisma/messaging/prisma-outbox.writer.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    '**/domain/**/aggregates/*.ts': {
      statements: 85,
      branches: 78,
      functions: 82,
      lines: 85,
    },
  },
  clearMocks: true,
  restoreMocks: true,
};

export default config;

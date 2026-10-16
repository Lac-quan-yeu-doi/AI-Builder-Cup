import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: projectRoot });

async function lintFixture(source: string, relativeFilePath: string) {
  const [result] = await eslint.lintText(source, { filePath: relativeFilePath });

  if (!result) {
    throw new Error(`ESLint did not return a result for ${relativeFilePath}.`);
  }

  return result.messages;
}

function ruleIds(messages: Awaited<ReturnType<typeof lintFixture>>) {
  return messages.map((message) => message.ruleId);
}

describe('architecture boundary ESLint contract', () => {
  it('rejects a forbidden aliased import', async () => {
    const messages = await lintFixture(
      "import '@/src/infrastructure/api/core-api-client';\n",
      'src/entities/models/__architecture-boundary-fixture__.ts',
    );

    expect(ruleIds(messages)).toContain('boundaries/dependencies');
  }, 15_000);

  it('rejects a forbidden relative import', async () => {
    const messages = await lintFixture(
      [
        "import { CoreApiClient } from '../../infrastructure/api/core-api-client';",
        'export const Fixture = CoreApiClient;',
      ].join('\n'),
      'src/entities/models/__architecture-boundary-fixture__.ts',
    );

    expect(ruleIds(messages)).toContain('boundaries/dependencies');
  });

  it('rejects a forbidden type-only import', async () => {
    const messages = await lintFixture(
      [
        "import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';",
        'export type Fixture = GeneratedApiTransport;',
      ].join('\n'),
      'src/entities/models/__architecture-boundary-fixture__.ts',
    );

    expect(ruleIds(messages)).toContain('boundaries/dependencies');
  });

  it.each(['ts', 'tsx'])('rejects an unclassified .%s source file', async (extension) => {
    const messages = await lintFixture(
      'export const fixture = true;\n',
      `src/__architecture-boundary-fixture__.${extension}`,
    );

    expect(ruleIds(messages)).toContain('boundaries/no-unknown-files');
  });

  it.each(['js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'])(
    'rejects .%s files from the TypeScript-only source roots',
    async (extension) => {
      const messages = await lintFixture(
        'const fixture = true;\nvoid fixture;\n',
        `src/entities/models/__architecture-boundary-fixture__.${extension}`,
      );

      expect(ruleIds(messages)).toContain('no-restricted-syntax');
    },
  );

  it.each([
    {
      direction: 'app to controller',
      filePath: 'app/_components/__architecture-boundary-fixture__.ts',
      source: [
        "import type { ListConnectionsController } from '@/src/interface-adapters/controllers/connections/list-connections.controller';",
        'export type Fixture = ListConnectionsController;',
      ].join('\n'),
    },
    {
      direction: 'controller to use case',
      filePath:
        'src/interface-adapters/controllers/connections/__architecture-boundary-fixture__.ts',
      source: [
        "import type { ListConnectionsUseCase } from '@/src/application/use-cases/connections/list-connections.use-case';",
        'export type Fixture = ListConnectionsUseCase;',
      ].join('\n'),
    },
    {
      direction: 'use case to repository interface',
      filePath: 'src/application/use-cases/connections/__architecture-boundary-fixture__.ts',
      source: [
        "import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';",
        'export type Fixture = ConnectionRepository;',
      ].join('\n'),
    },
    {
      direction: 'infrastructure to entity',
      filePath: 'src/infrastructure/repositories/__architecture-boundary-fixture__.ts',
      source: [
        "import type { DataConnection } from '@/src/entities/models/connection';",
        'export type Fixture = DataConnection;',
      ].join('\n'),
    },
  ])('allows $direction', async ({ filePath, source }) => {
    expect(await lintFixture(source, filePath)).toEqual([]);
  });
});

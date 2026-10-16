import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';

import type { ConfigService } from '@nestjs/config';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { DockerSparkExecutionGateway } from '@infrastructure/spark/execution-orchestration/docker-spark-execution.gateway';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

function config(): ConfigService {
  const values: Record<string, string | number> = {
    SPARK_CONTAINER: 'spark-worker',
    SPARK_SUBMIT_BIN: 'spark-submit',
    SPARK_SUBMIT_MASTER_URL: 'local[*]',
    SPARK_MASTER_UI_PORT: 8080,
  };
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
}

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: jest.Mock;
    unref: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = jest.fn();
  child.unref = jest.fn();
  return child as unknown as ChildProcess;
}

describe('DockerSparkExecutionGateway generic connection descriptor', () => {
  const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild());
  });

  it('passes adapter public and secret options through environment only', () => {
    const gateway = new DockerSparkExecutionGateway(config());
    const descriptor = ExecutionConnectionDescriptor.create({
      driverClass: 'example.TestDriver',
      jdbcUrl: 'jdbc:test:unit-test/7',
      publicOptions: { TEST_ENDPOINT: 'unit-test' },
      secretOptions: { TEST_PASSWORD: 's3cr3t' },
    });

    gateway.submit({
      stagedSourceRef: '/tmp/script.py',
      resourceProfile: ResourceProfile.create({
        driverMemory: '1g',
        executorMemory: '1g',
        executorCores: 1,
        maxCores: 2,
      }),
      connection: descriptor,
      arguments: ['--execution-id=11111111-1111-4111-8111-111111111111'],
      runtimeConfigRef: '/tmp/celesnity-exec-11111111-runtime.json',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(command).toBe('docker');
    expect(args).toContain('CELESNITY_DB_DRIVER_CLASS');
    expect(args).toContain('CELESNITY_DB_JDBC_URL');
    expect(args).toContain('TEST_ENDPOINT');
    expect(args).toContain('TEST_PASSWORD');
    expect((args ?? []).join(' ')).not.toContain('s3cr3t');
    expect((options as { env: Record<string, string> }).env).toMatchObject({
      CELESNITY_DB_DRIVER_CLASS: 'example.TestDriver',
      CELESNITY_DB_JDBC_URL: 'jdbc:test:unit-test/7',
      TEST_ENDPOINT: 'unit-test',
      TEST_PASSWORD: 's3cr3t',
    });
    expect(args).toContain('/tmp/celesnity-submit-11111111-1111-4111-8111-111111111111.pid');
    expect(args).toContain('bash');
    expect(args).toContain('spark-submit');
    expect(args).toContain('--workflow-facts-plan-ref=/tmp/celesnity-exec-11111111-runtime.json');
    expect((args ?? []).join(' ')).not.toContain('predicate-value');
  });

  it('terminates the in-container Spark process by its execution-scoped pid file', () => {
    const gateway = new DockerSparkExecutionGateway(config());
    const descriptor = ExecutionConnectionDescriptor.create({
      driverClass: 'example.TestDriver',
      jdbcUrl: 'jdbc:test:unit-test/7',
      publicOptions: {},
      secretOptions: {},
    });

    const submission = gateway.submit({
      stagedSourceRef: '/tmp/script.py',
      resourceProfile: ResourceProfile.create({
        driverMemory: '1g',
        executorMemory: '1g',
        executorCores: 1,
        maxCores: 2,
      }),
      connection: descriptor,
      arguments: ['--execution-id=11111111-1111-4111-8111-111111111111'],
    });

    submission.terminate();

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const [command, args, options] = spawnMock.mock.calls[1] ?? [];
    expect(command).toBe('docker');
    expect(args).toEqual(
      expect.arrayContaining([
        'exec',
        'spark-worker',
        '/tmp/celesnity-submit-11111111-1111-4111-8111-111111111111.pid',
        'TERM',
      ]),
    );
    expect(options).toEqual({ stdio: 'ignore' });
  });

  it('passes dedicated platform catalog credentials without replacing source credentials', () => {
    const previous = {
      POSTGRES_URL: process.env.POSTGRES_URL,
      POSTGRES_USER: process.env.POSTGRES_USER,
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    };
    process.env.POSTGRES_URL = 'jdbc:postgresql://catalog.example/catalog';
    process.env.POSTGRES_USER = 'catalog-user';
    process.env.POSTGRES_PASSWORD = 'catalog-password';

    try {
      const gateway = new DockerSparkExecutionGateway(config());
      const descriptor = ExecutionConnectionDescriptor.create({
        driverClass: 'org.postgresql.Driver',
        jdbcUrl: 'jdbc:postgresql://source.example/source',
        publicOptions: {
          POSTGRES_URL: 'jdbc:postgresql://source.example/source',
          POSTGRES_USER: 'source-user',
        },
        secretOptions: { POSTGRES_PASSWORD: 'source-password' },
      });

      gateway.submit({
        stagedSourceRef: '/tmp/pipeline.py',
        resourceProfile: ResourceProfile.create({
          driverMemory: '1g',
          executorMemory: '1g',
          executorCores: 1,
          maxCores: 2,
        }),
        connection: descriptor,
        arguments: ['--execution-id=22222222-2222-4222-8222-222222222222'],
      });

      const options = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
      expect(options.env).toMatchObject({
        POSTGRES_URL: 'jdbc:postgresql://source.example/source',
        POSTGRES_USER: 'source-user',
        POSTGRES_PASSWORD: 'source-password',
        CELESNITY_CATALOG_JDBC_URL: 'jdbc:postgresql://catalog.example/catalog',
        CELESNITY_CATALOG_JDBC_USER: 'catalog-user',
        CELESNITY_CATALOG_JDBC_PASSWORD: 'catalog-password',
        CELESNITY_DB_JDBC_URL: 'jdbc:postgresql://source.example/source',
      });
    } finally {
      restoreEnvironment('POSTGRES_URL', previous.POSTGRES_URL);
      restoreEnvironment('POSTGRES_USER', previous.POSTGRES_USER);
      restoreEnvironment('POSTGRES_PASSWORD', previous.POSTGRES_PASSWORD);
    }
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

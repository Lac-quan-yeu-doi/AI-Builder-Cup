import { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import {
  buildExecutionJob,
  sparkDriverPodMemory,
  type KubernetesGatewayConfig,
} from '@infrastructure/spark/execution-orchestration/kubernetes-spark-execution.gateway';

const runtime: KubernetesGatewayConfig = {
  namespace: 'celesnity',
  image: 'registry.example/spark:test',
  serviceAccount: 'celesnity',
  masterUrl: 'spark://spark-master:7077',
  submitBin: '/opt/spark/bin/spark-submit',
  pollIntervalMs: 1_000,
  jobTtlSeconds: 3_600,
};

describe('KubernetesSparkExecutionGateway Job', () => {
  it('builds a bounded driver Job without embedding source credentials', () => {
    const job = buildExecutionJob(runtime, {
      stagedSourceRef: 'celesnity-exec-11111111-1111-4111-8111-111111111111',
      resourceProfile: ResourceProfile.create({
        driverMemory: '1g',
        executorMemory: '2g',
        executorCores: 2,
        maxCores: 4,
      }),
      connection: ExecutionConnectionDescriptor.create({
        driverClass: 'org.postgresql.Driver',
        jdbcUrl: 'jdbc:postgresql://source.example:5432/source?sslmode=require',
        publicOptions: { SOURCE_POSTGRES_USER: 'source-user' },
        secretOptions: { SOURCE_POSTGRES_PASSWORD: 'do-not-serialize' },
      }),
      arguments: ['--execution-id=11111111-1111-4111-8111-111111111111'],
      runtimeConfigRef: 'celesnity-exec-11111111-1111-4111-8111-111111111111-runtime',
    });

    const serialized = JSON.stringify(job);
    expect(serialized).not.toContain('do-not-serialize');
    expect(serialized).not.toContain('source-user');
    expect(serialized).toContain('celesnity-exec-11111111-1111-4111-8111-111111111111-credentials');
    expect(serialized).toContain('python3 -m py_compile /execution/script.py');
    expect(serialized).toContain('spark://spark-master:7077');
    expect(serialized).toContain('spark.driver.host=\\"$POD_IP\\"');
    expect(serialized).toContain('spark.executor.memory=2g');
    expect(serialized).toContain('1408Mi');
    expect(serialized).toContain('WAREHOUSE_PATH');
    expect(serialized).toContain('WAREHOUSE_S3_PATH');
    expect(serialized).toContain('CELESNITY_CATALOG_JDBC_URL');
    expect(serialized).toContain('CELESNITY_CATALOG_JDBC_USER');
    expect(serialized).toContain('CELESNITY_CATALOG_JDBC_PASSWORD');
    expect(serialized).toContain('secretKeyRef');
    expect(serialized).toContain('/execution/runtime/condition-plan.json');
    expect(serialized).toContain('"defaultMode":288');
    expect(serialized).not.toContain('"secret-predicate-marker"');
  });

  it('does not override generic source variables with platform catalog credentials', () => {
    const job = buildExecutionJob(runtime, {
      stagedSourceRef: 'celesnity-exec-22222222-2222-4222-8222-222222222222',
      resourceProfile: ResourceProfile.create({
        driverMemory: '1g',
        executorMemory: '1g',
        executorCores: 1,
        maxCores: 2,
      }),
      arguments: ['--execution-id=22222222-2222-4222-8222-222222222222'],
    });

    const serialized = JSON.stringify(job);
    expect(serialized).toContain('CELESNITY_CATALOG_JDBC_URL');
    expect(serialized).not.toContain('"name":"POSTGRES_URL","valueFrom"');
    expect(serialized).not.toContain('"name":"POSTGRES_USER","valueFrom"');
    expect(serialized).not.toContain('"name":"POSTGRES_PASSWORD","valueFrom"');
  });

  it.each([
    ['512m', '896Mi'],
    ['1g', '1408Mi'],
    ['2gb', '2432Mi'],
    ['1024k', '385Mi'],
  ])('adds driver process overhead to %s', (sparkMemory, expected) => {
    expect(sparkDriverPodMemory(sparkMemory)).toBe(expected);
  });
});

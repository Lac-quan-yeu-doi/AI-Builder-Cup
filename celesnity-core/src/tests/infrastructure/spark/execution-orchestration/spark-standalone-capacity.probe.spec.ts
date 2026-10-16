import { ExecutionPortErrorCode } from '@application/execution-orchestration/errors/execution-port.error';
import { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { SparkStandaloneCapacityProbe } from '@infrastructure/spark/execution-orchestration/spark-standalone-capacity.probe';

const profile = ResourceProfile.create({
  driverMemory: '1g',
  executorMemory: '1g',
  executorCores: 1,
  maxCores: 2,
});

describe('SparkStandaloneCapacityProbe', () => {
  it('accepts submission when one alive worker can fit an executor', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      response({
        status: 'ALIVE',
        workers: [
          { state: 'ALIVE', coresfree: 1, memoryfree: 0 },
          { state: 'ALIVE', coresfree: 2, memoryfree: 1024 },
        ],
      }),
    );

    await expect(
      new SparkStandaloneCapacityProbe(
        'spark://spark-master:7077',
        { uiPort: 8080 },
        fetcher,
      ).assertAvailable(profile),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      'http://spark-master:8080/json/',
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });

  it('fails immediately when no worker has both the required cores and memory', async () => {
    const probe = new SparkStandaloneCapacityProbe(
      'spark://spark-master:7077',
      { uiPort: 8080 },
      jest.fn().mockResolvedValue(
        response({
          status: 'ALIVE',
          workers: [{ state: 'ALIVE', coresfree: 1, memoryfree: 0 }],
        }),
      ),
    );

    await expect(probe.assertAvailable(profile)).rejects.toMatchObject({
      code: ExecutionPortErrorCode.SPARK_UNAVAILABLE,
      message: expect.stringContaining('no executor slot') as string,
    });
  });

  it('fails fast when the master status endpoint is unavailable', async () => {
    const probe = new SparkStandaloneCapacityProbe(
      'spark://spark-master:7077',
      { uiPort: 8080 },
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(probe.assertAvailable(profile)).rejects.toMatchObject({
      code: ExecutionPortErrorCode.SPARK_UNAVAILABLE,
      message: expect.stringContaining('unreachable') as string,
    });
  });

  it('reports an invalid master response as unavailable capacity', async () => {
    const probe = new SparkStandaloneCapacityProbe(
      'spark://spark-master:7077',
      { uiPort: 8080 },
      jest.fn().mockResolvedValue(new Response('not-json')),
    );

    await expect(probe.assertAvailable(profile)).rejects.toMatchObject({
      code: ExecutionPortErrorCode.SPARK_UNAVAILABLE,
      message: expect.stringContaining('invalid capacity response') as string,
    });
  });

  it('skips standalone admission for local Spark masters', async () => {
    const fetcher = jest.fn();

    await expect(
      new SparkStandaloneCapacityProbe('local[*]', { uiPort: 8080 }, fetcher).assertAvailable(
        profile,
      ),
    ).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SparkStandaloneCapacityProbe UI port', () => {
  it('asks the master UI on the configured port rather than the Spark default', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({ status: 'ALIVE', workers: [] }));

    // A Compose file that already gave 8080 to Trino publishes the Spark UI
    // elsewhere; probing the default there fails every execution while Spark
    // itself is reachable and idle.
    await expect(
      new SparkStandaloneCapacityProbe(
        'spark://localhost:7077',
        { uiPort: 8081 },
        fetcher,
      ).assertAvailable(profile),
    ).rejects.toThrow();

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8081/json/',
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });
});

describe('SparkStandaloneCapacityProbe explicit status URL', () => {
  it('uses the configured status URL instead of deriving one from the submit URL', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({ status: 'ALIVE', workers: [] }));

    // `spark-master` resolves inside the Compose network the job runs in, not
    // from the process submitting it, so deriving the probe URL from the submit
    // URL is unreachable however the port is set.
    await expect(
      new SparkStandaloneCapacityProbe(
        'spark://spark-master:7077',
        { statusUrl: 'http://127.0.0.1:8081/json/', uiPort: 8080 },
        fetcher,
      ).assertAvailable(profile),
    ).rejects.toThrow();

    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/json/',
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });
});

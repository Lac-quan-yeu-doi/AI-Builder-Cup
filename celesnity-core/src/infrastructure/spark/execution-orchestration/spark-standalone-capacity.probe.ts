import { ExecutionPortError } from '@application/execution-orchestration/errors/execution-port.error';
import type { ResourceProfile } from '@domain/execution-orchestration/value-objects/execution-value-objects';

const DEFAULT_SPARK_MASTER_UI_PORT = 8080;
const PROBE_TIMEOUT_MS = 3_000;

interface SparkWorkerStatus {
  readonly state: string;
  readonly coresfree: number;
  /** Spark's standalone master reports worker memory in MiB. */
  readonly memoryfree: number;
}

interface SparkMasterStatus {
  readonly status: string;
  readonly workers: readonly SparkWorkerStatus[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Prevents Spark standalone from accepting an application that cannot launch
 * even one executor. Without this admission check Spark queues the application
 * indefinitely and the execution worker can only discover starvation through
 * its much longer wall-clock timeout.
 */
export class SparkStandaloneCapacityProbe {
  private readonly statusUrl: string | undefined;

  /**
   * The status endpoint is configured rather than derived because the submit
   * URL is not reachable from here. `spark://spark-master:7077` names a
   * Compose service, which resolves inside the network the job runs in but not
   * from the process that submits it, and the status contract is served by the
   * web UI on its own port — which a Compose file may remap when 8080 already
   * belongs to Trino. Deriving one from the other made this probe fail every
   * execution while Spark was reachable and idle.
   *
   * `statusUrl` overrides entirely; without it the port is applied to the
   * submit URL's host, which is right whenever the two agree.
   */
  public constructor(
    masterUrl: string,
    options: { readonly statusUrl?: string; readonly uiPort?: number } = {},
    private readonly fetcher: FetchLike = fetch,
  ) {
    const configured = options.statusUrl?.trim();
    this.statusUrl =
      configured !== undefined && configured.length > 0
        ? configured
        : masterStatusUrl(masterUrl, options.uiPort ?? DEFAULT_SPARK_MASTER_UI_PORT);
  }

  public async assertAvailable(profile: ResourceProfile): Promise<void> {
    // Local Spark masters do not expose the standalone master status contract.
    if (this.statusUrl === undefined) return;

    let response: Response;
    try {
      response = await this.fetcher(this.statusUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
    } catch {
      throw ExecutionPortError.sparkUnavailable(
        'Spark capacity could not be checked because the standalone master is unreachable.',
      );
    }
    if (!response.ok) {
      throw ExecutionPortError.sparkUnavailable(
        `Spark capacity check failed with status ${String(response.status)}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw ExecutionPortError.sparkUnavailable(
        'The Spark standalone master returned an invalid capacity response.',
      );
    }
    const status = decodeStatus(payload);
    const requiredMemoryMiB = sparkMemoryMiB(profile.executorMemory);
    const fittingWorker = status.workers.find(
      (worker) =>
        worker.state === 'ALIVE' &&
        worker.coresfree >= profile.executorCores &&
        worker.memoryfree >= requiredMemoryMiB,
    );
    if (status.status === 'ALIVE' && fittingWorker !== undefined) return;

    const alive = status.workers.filter((worker) => worker.state === 'ALIVE');
    const mostFreeCores = Math.max(0, ...alive.map((worker) => worker.coresfree));
    const mostFreeMemory = Math.max(0, ...alive.map((worker) => worker.memoryfree));
    throw ExecutionPortError.sparkUnavailable(
      `Spark has no executor slot for ${String(profile.executorCores)} core(s) and ${String(requiredMemoryMiB)} MiB. Across alive workers, the per-resource maxima are ${String(mostFreeCores)} free core(s) and ${String(mostFreeMemory)} MiB free; both requirements must fit on the same worker.`,
    );
  }
}

function masterStatusUrl(masterUrl: string, uiPort: number): string | undefined {
  if (!masterUrl.startsWith('spark://')) return undefined;
  try {
    const parsed = new URL(masterUrl);
    const hostname = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
    return `http://${hostname}:${String(uiPort)}/json/`;
  } catch {
    throw ExecutionPortError.sparkUnavailable('The Spark standalone master URL is invalid.');
  }
}

function decodeStatus(value: unknown): SparkMasterStatus {
  if (!isRecord(value) || typeof value.status !== 'string' || !Array.isArray(value.workers)) {
    throw ExecutionPortError.sparkUnavailable(
      'The Spark standalone master returned an invalid capacity response.',
    );
  }
  const workers = value.workers.map((worker) => {
    if (
      !isRecord(worker) ||
      typeof worker.state !== 'string' ||
      typeof worker.coresfree !== 'number' ||
      typeof worker.memoryfree !== 'number'
    ) {
      throw ExecutionPortError.sparkUnavailable(
        'The Spark standalone master returned an invalid worker capacity response.',
      );
    }
    return {
      state: worker.state,
      coresfree: worker.coresfree,
      memoryfree: worker.memoryfree,
    };
  });
  return { status: value.status, workers };
}

function sparkMemoryMiB(value: string): number {
  const match = /^(\d+)([kmgt])?i?b?$/iu.exec(value.trim());
  if (match === null) {
    throw ExecutionPortError.sparkUnavailable('Executor memory has an unsupported Spark quantity.');
  }
  const amount = Number(match[1]);
  switch (match[2]?.toLowerCase()) {
    case 'k':
      return Math.ceil(amount / 1024);
    case 'g':
      return amount * 1024;
    case 't':
      return amount * 1024 * 1024;
    case 'm':
    case undefined:
      return amount;
    default:
      throw ExecutionPortError.sparkUnavailable(
        'Executor memory has an unsupported Spark quantity.',
      );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import {
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { RunManager } from "@application/runtime";
import type { OwnerResolverOptions } from "../guards/authentication.js";
import { AUTH_OPTIONS, RUN_MANAGER } from "@modules/tokens.js";

const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const OPERATIONAL_ROUTES = new Set([
  "/healthz",
  "/livez",
  "/readyz",
  "/metrics",
  "/stats",
  "/api/v1/healthz",
  "/api/v2/healthz",
  "/api/v1/livez",
  "/api/v1/readyz",
  "/api/v1/metrics",
  "/api/v1/stats",
]);

interface RequestSeries {
  count: number;
  sumSeconds: number;
}

interface MetricsRequest {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
}

interface MetricsTrackingResponse {
  once(event: "finish", listener: () => void): unknown;
}

@Injectable()
export class OperationsMetricsService {
  private readonly startedAt = Date.now();
  private readonly series = new Map<string, RequestSeries>();
  private active = 0;

  startRequest(method: string): () => void {
    this.active += 1;
    const started = process.hrtime.bigint();
    let completed = false;
    return () => {
      if (completed) return;
      completed = true;
      this.active -= 1;
      const key = `${method}\u0000unmatched\u0000404`;
      const current = this.series.get(key) ?? { count: 0, sumSeconds: 0 };
      current.count += 1;
      current.sumSeconds +=
        Number(process.hrtime.bigint() - started) / 1_000_000_000;
      this.series.set(key, current);
    };
  }

  render(): string {
    return [
      "# HELP http_server_active_requests HTTP requests currently being processed.",
      "# TYPE http_server_active_requests gauge",
      `http_server_active_requests{service="celesnity-agent"} ${this.active}`,
      "# HELP http_server_requests_total Completed HTTP requests.",
      "# TYPE http_server_requests_total counter",
      "# HELP http_server_request_duration_seconds HTTP request duration in seconds.",
      "# TYPE http_server_request_duration_seconds histogram",
      ...[...this.series.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([key, value]) => {
          const [method, , statusCode] = key.split("\u0000");
          const labels = `service="celesnity-agent",method="${escapeLabel(method ?? "")}",route="unmatched",status_code="${statusCode ?? ""}"`;
          return [
            `http_server_requests_total{${labels}} ${value.count}`,
            ...BUCKETS.map(
              (boundary) =>
                `http_server_request_duration_seconds_bucket{${labels},le="${boundary}"} ${value.count}`,
            ),
            `http_server_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`,
            `http_server_request_duration_seconds_sum{${labels}} ${value.sumSeconds}`,
            `http_server_request_duration_seconds_count{${labels}} ${value.count}`,
          ];
        }),
      "",
    ].join("\n");
  }

  stats(): {
    uptime_seconds: number;
    active_requests: number;
    request_series: number;
  } {
    return {
      uptime_seconds: Math.max(
        0,
        Math.round((Date.now() - this.startedAt) / 1000),
      ),
      active_requests: this.active,
      request_series: this.series.size,
    };
  }
}

@Injectable()
export class OperationsMetricsMiddleware implements NestMiddleware {
  constructor(
    @Inject(OperationsMetricsService)
    private readonly metrics: OperationsMetricsService,
  ) {}

  use(
    request: MetricsRequest,
    response: MetricsTrackingResponse,
    next: (error?: Error) => void,
  ): void {
    if (isOperationalRoute(request.originalUrl ?? request.url)) {
      next();
      return;
    }
    response.once("finish", this.metrics.startRequest(request.method ?? "GET"));
    next();
  }
}

@Controller({ version: VERSION_NEUTRAL })
export class OperationsController {
  constructor(
    @Inject(OperationsMetricsService)
    private readonly metricsService: OperationsMetricsService,
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime?: RunManager,
    @Optional()
    @Inject(AUTH_OPTIONS)
    private readonly authOptions?: OwnerResolverOptions,
  ) {}

  @Get(["healthz", "api/v1/healthz", "api/v2/healthz"])
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get(["livez", "api/v1/livez"])
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get(["readyz", "api/v1/readyz"])
  ready(): { status: "ready" | "not_ready" } {
    if (
      this.runtime === undefined ||
      this.authOptions?.authenticator === undefined
    )
      throw new ServiceUnavailableException({ status: "not_ready" });
    return { status: "ready" };
  }

  @Get(["metrics", "api/v1/metrics"])
  @Header("content-type", METRICS_CONTENT_TYPE)
  metrics(): string {
    return this.metricsService.render();
  }

  @Get(["stats", "api/v1/stats"])
  stats(): {
    uptime_seconds: number;
    active_requests: number;
    request_series: number;
  } {
    return this.metricsService.stats();
  }
}

function escapeLabel(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll('"', '\\"');
}

export function isOperationalRoute(path: string | undefined): boolean {
  const queryOffset = path?.indexOf("?") ?? -1;
  return OPERATIONAL_ROUTES.has(
    queryOffset === -1 ? (path ?? "/") : path!.slice(0, queryOffset),
  );
}

import type { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import type { RunManager } from "@application/runtime";

export function parseRoomResumeCursor(
  value: string | undefined,
): { readonly runId: string; readonly seq: number } | undefined {
  if (!value) return undefined;
  const separator = value.lastIndexOf(":");
  const seq = Number.parseInt(value.slice(separator + 1), 10);
  return separator > 0 && Number.isInteger(seq) && seq > 0
    ? { runId: value.slice(0, separator), seq }
    : undefined;
}

export function roomMetrics(
  runs: readonly {
    readonly status: string;
    readonly createdAt: string;
    readonly finishedAt?: string;
  }[],
): object {
  const duration = runs
    .flatMap((run) =>
      run.finishedAt === undefined
        ? []
        : [Date.parse(run.finishedAt) - Date.parse(run.createdAt)],
    )
    .sort((a, b) => a - b);
  const percentile = (value: number): number | null =>
    duration.length === 0
      ? null
      : (duration[
          Math.min(duration.length - 1, Math.ceil(duration.length * value) - 1)
        ] ?? null);
  return {
    total: runs.length,
    succeeded: runs.filter((run) => run.status === "completed").length,
    failed: runs.filter((run) => run.status === "failed").length,
    cancelled: runs.filter((run) => run.status === "interrupted").length,
    skipped: 0,
    running: runs.filter(
      (run) => run.status === "queued" || run.status === "running",
    ).length,
    p50DurationMs: percentile(0.5),
    p95DurationMs: percentile(0.95),
  };
}

export function roomEvents(
  runtime: RunManager,
  runIds: readonly string[],
  owner: string,
  cursor: { readonly runId: string; readonly seq: number } | undefined,
  keepaliveMs = 15_000,
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const abort = new AbortController();
    let closed = false;
    const loops = runIds.map(async (runId) => {
      const run = await runtime.getAuthorizedRun(runId, owner);
      if (!run) return;
      let lastSeq = cursor?.runId === runId ? cursor.seq : 0;
      let subscription: Awaited<ReturnType<RunManager["subscribe"]>>;
      const send = (event: {
        seq: number;
        payload: { type: string; data: unknown };
      }): boolean => {
        if (event.seq <= lastSeq) return false;
        lastSeq = event.seq;
        subscriber.next({
          id: `${runId}:${event.seq}`,
          type: event.payload.type,
          data: { run_id: runId, data: event.payload.data },
        });
        return event.payload.type === "done";
      };
      try {
        let ended = false;
        for (const event of await runtime.replay(runId, lastSeq, 512)) {
          if (send(event)) {
            ended = true;
            break;
          }
        }
        if (!ended) subscription = await runtime.subscribe(runId);
        while (!ended && !closed && !abort.signal.aborted && subscription) {
          const next = await subscription.next(abort.signal);
          if (next === "closed") break;
          if (next === "resync") {
            for (const event of await runtime.replay(runId, lastSeq, 512)) {
              if (send(event)) {
                ended = true;
                break;
              }
            }
            continue;
          }
          if (send(next)) break;
        }
        const finished = await runtime.getAuthorizedRun(runId, owner);
        if (
          finished &&
          [
            "completed",
            "failed",
            "interrupted",
            "awaiting_input",
            "awaiting_approval",
            // The browser runs the client tool and answers on this signal;
            // without it the run sat open with nothing left to stream.
            "awaiting_client_tool",
          ].includes(finished.status)
        )
          subscriber.next({
            type: "run_finished",
            data: { run_id: runId, status: finished.status },
          });
      } finally {
        subscription?.close();
      }
    });
    void Promise.all(loops).then(
      () => {
        if (!closed) subscriber.complete();
      },
      (error: unknown) => {
        if (!closed) subscriber.error(error);
      },
    );
    const keepalive = setInterval(
      () => {
        if (!closed) subscriber.next({ comment: "keepalive" });
      },
      Math.max(1, keepaliveMs),
    );
    return () => {
      closed = true;
      abort.abort();
      clearInterval(keepalive);
    };
  });
}

import {
  Controller,
  Headers,
  NotFoundException,
  Optional,
  Param,
  Query,
  Sse,
  UseGuards,
  Inject,
} from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import type { RunManager } from "@application/runtime";
import { RUN_MANAGER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { resolveResumeCursor } from "@presentation/http/sse/sse.js";
import { Observable } from "rxjs";

@UseGuards(OwnerAuthGuard)
@Controller()
export class EventsNestController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
  ) {}

  @Sse("runs/:runId/events")
  @ApiOperation({ deprecated: true })
  async events(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
    @Query("from") from: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    if (this.runtime === undefined)
      throw new NotFoundException({
        error: "run_not_found",
        detail: "Run was not found.",
      });
    if (!(await this.runtime.getAuthorizedRun(runId, owner.owner)))
      throw new NotFoundException({
        error: "run_not_found",
        detail: "Run was not found.",
      });
    const manager = this.runtime;
    const cursor = resolveResumeCursor(from ?? null, lastEventId);
    return new Observable<MessageEvent>((subscriber) => {
      const abort = new AbortController();
      let closed = false;
      let subscription: Awaited<ReturnType<RunManager["subscribe"]>>;
      const send = (event: {
        seq: number;
        payload: { type: string } & Record<string, unknown>;
      }): boolean => {
        if (event.seq <= current) return false;
        subscriber.next({
          id: String(event.seq),
          type: event.payload.type,
          data: event.payload,
        });
        current = event.seq;
        return event.payload.type === "done";
      };
      let current = Math.max(0, cursor);
      const keepalive = setInterval(
        () => subscriber.next({ comment: "keepalive" }),
        15_000,
      );
      const loop = async (): Promise<void> => {
        try {
          subscription = await manager.subscribe(runId);
          while (!closed && !abort.signal.aborted) {
            const replay = await manager.replay(runId, current, 512);
            let done = false;
            for (const event of replay) {
              if (send(event)) {
                done = true;
                break;
              }
            }
            if (done || subscription === undefined) break;
            if (replay.length === 512) continue;
            const next = await subscription.next(abort.signal);
            if (next === "closed") break;
            if (next === "resync") continue;
            if (send(next)) break;
          }
          if (!closed) subscriber.complete();
        } catch (error) {
          if (!closed) subscriber.error(error);
        } finally {
          clearInterval(keepalive);
          subscription?.close();
        }
      };
      void loop();
      return () => {
        closed = true;
        abort.abort();
        subscription?.close();
        clearInterval(keepalive);
      };
    });
  }
}

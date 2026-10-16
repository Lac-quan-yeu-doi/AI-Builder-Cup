import {
  Controller,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Sse,
  UseGuards,
  type MessageEvent,
} from "@nestjs/common";
import { ApiExtraModels, ApiResponse, ApiTags } from "@nestjs/swagger";
import { startWith, type Observable } from "rxjs";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { ApiError } from "@presentation/http/common/errors/api-error.js";
import { requestId } from "@presentation/http/common/request/request-context.js";
import { EventsNestController } from "@presentation/http/runs/events.controller.js";
import { resolveResumeCursor } from "@presentation/http/sse/sse.js";
import { ApiErrorV2Response, StreamOpenedEvent } from "./openapi-dtos.js";

@UseGuards(OwnerAuthGuard)
@ApiTags("Runs")
@ApiResponse({ status: 401, type: ApiErrorV2Response })
@ApiResponse({ status: 403, type: ApiErrorV2Response })
@ApiExtraModels(StreamOpenedEvent)
@Controller({ version: "2" })
export class EventsV2Controller {
  constructor(
    @Inject(EventsNestController)
    private readonly eventsController: EventsNestController,
  ) {}

  @Sse("runs/:runId/events")
  @ApiResponse({
    status: 200,
    content: {
      "text/event-stream": {
        schema: {
          type: "string",
          description:
            "The first event is stream_opened; its ID matches the resume cursor and its data uses StreamOpenedEvent.",
        },
      },
    },
  })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  @ApiResponse({ status: 404, type: ApiErrorV2Response })
  async events(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
    @Query() query: Record<string, string>,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() request: object,
  ): Promise<Observable<MessageEvent>> {
    if (Object.keys(query).some((key) => key !== "cursor"))
      throw new ApiError(400, { error: "invalid_cursor" });
    const cursor = String(
      resolveResumeCursor(query.cursor ?? null, lastEventId),
    );
    const stream = await this.eventsController.events(
      owner,
      runId,
      cursor,
      undefined,
    );
    return stream.pipe(
      startWith({
        type: "stream_opened",
        id: cursor,
        data: {
          request_id: requestId(request),
          run_id: runId,
          cursor,
        },
      }),
    );
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { ApiError } from "@presentation/http/common/errors/api-error.js";
import { requestId } from "@presentation/http/common/request/request-context.js";
import { RunsNestController } from "@presentation/http/runs/runs.controller.js";
import { TurnsNestController } from "@presentation/http/runs/turns.controller.js";
import {
  ApiErrorV2Response,
  CompletedRunResponse,
  CreateRunRequest,
  DuplicateDeliveryResponse,
  SessionV2Response,
  StartedRunResponse,
  SubmitToolResultRequest,
} from "./openapi-dtos.js";

interface ResponseHeaders {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@UseGuards(OwnerAuthGuard)
@ApiTags("Runs")
@ApiResponse({ status: 401, type: ApiErrorV2Response })
@ApiResponse({ status: 403, type: ApiErrorV2Response })
@ApiExtraModels(
  ApiErrorV2Response,
  CompletedRunResponse,
  DuplicateDeliveryResponse,
)
@Controller({ version: "2" })
export class RunsV2Controller {
  constructor(
    @Inject(TurnsNestController)
    private readonly turns: TurnsNestController,
    @Inject(RunsNestController)
    private readonly runs: RunsNestController,
  ) {}

  @Post("runs")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: CreateRunRequest })
  @ApiResponse({ status: 200, type: CompletedRunResponse })
  @ApiResponse({ status: 202, type: StartedRunResponse })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  @ApiResponse({ status: 409, type: ApiErrorV2Response })
  @ApiResponse({ status: 503, type: ApiErrorV2Response })
  async start(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: CreateRunRequest,
    @Res({ passthrough: true }) response: ResponseHeaders,
    @Req() request: object,
  ): Promise<object> {
    const result =
      input.wait_ms === undefined
        ? await this.turns.turn(owner, input, response)
        : await this.turns.blocking(owner, input, response);
    return v2Admission(result, response, request);
  }

  @Get("sessions/:sessionKey")
  @ApiResponse({ status: 200, type: SessionV2Response })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  @ApiResponse({ status: 404, type: ApiErrorV2Response })
  @ApiResponse({ status: 503, type: ApiErrorV2Response })
  session(
    @CurrentOwner() owner: OwnerContext,
    @Param("sessionKey") sessionKey: string,
  ): Promise<object> {
    return this.runs.session(owner, sessionKey);
  }

  @Post("sessions/:sessionKey/tool-results")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: SubmitToolResultRequest })
  @ApiResponse({ status: 202, type: StartedRunResponse })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  @ApiResponse({ status: 404, type: ApiErrorV2Response })
  @ApiResponse({ status: 409, type: ApiErrorV2Response })
  @ApiResponse({ status: 503, type: ApiErrorV2Response })
  async toolResult(
    @CurrentOwner() owner: OwnerContext,
    @Param("sessionKey") sessionKey: string,
    @Body() input: SubmitToolResultRequest,
    @Res({ passthrough: true }) response: ResponseHeaders,
    @Req() request: object,
  ): Promise<object> {
    if (
      input.session_key !== undefined &&
      input.session_key.trim() !== sessionKey
    )
      throw new ApiError(400, { error: "session_key_mismatch" });
    const result = await this.turns.clientToolResult(
      owner,
      { ...input, session_key: sessionKey },
      response,
    );
    return v2Admission(result, response, request);
  }

  @Post("webhooks/:source/runs")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: CreateRunRequest })
  @ApiResponse({ status: 200, type: DuplicateDeliveryResponse })
  @ApiResponse({ status: 202, type: StartedRunResponse })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  @ApiResponse({ status: 403, type: ApiErrorV2Response })
  @ApiResponse({ status: 409, type: ApiErrorV2Response })
  @ApiResponse({ status: 503, type: ApiErrorV2Response })
  async webhook(
    @CurrentOwner() owner: OwnerContext,
    @Headers("x-delivery-id") deliveryId: string | undefined,
    @Param("source") source: string,
    @Body() input: CreateRunRequest,
    @Res({ passthrough: true }) response: ResponseHeaders,
    @Req() request: object,
  ): Promise<object> {
    return v2Admission(
      await this.turns.webhook(owner, deliveryId, source, input, response),
      response,
      request,
    );
  }
}

function v2Admission(
  result: object,
  response: ResponseHeaders,
  request: object,
): object {
  const correlated = { ...result, request_id: requestId(request) };
  if (!("run_id" in result)) return correlated;
  const runId = result.run_id;
  if (typeof runId !== "string") return correlated;
  if ("events_url" in result) {
    response.setHeader("content-location", `/api/v2/runs/${runId}`);
    return { ...correlated, events_url: `/api/v2/runs/${runId}/events` };
  }
  return correlated;
}

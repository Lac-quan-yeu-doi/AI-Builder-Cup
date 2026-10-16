import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  ServiceUnavailableException,
  UseGuards,
  type MessageEvent,
} from "@nestjs/common";
import type { ManifestLoader } from "@application/agent";
import {
  parseRunContext,
  type RunManager,
  type RuntimeRun,
  withAuthenticatedOrganization,
} from "@application/runtime";
import { normalizeDataScope } from "@application/shared/ports/index.js";
import type {
  RoomJournalPort,
  RoomRecord,
  RoomRepository,
  RoomWebhookRepository,
} from "@application/shared/ports/index.js";
import {
  createRoomRunCoordinator,
  type RoomQueuePersistence,
  type RoomRunCoordinator,
} from "@application/room/runtime/room-runtime.js";
import {
  MANIFEST_LOADER,
  ROOM_JOURNAL,
  ROOM_QUEUE,
  ROOM_REPOSITORY,
  ROOM_KEEPALIVE_MS,
  ROOM_WEBHOOK_REPOSITORY,
  RUN_MANAGER,
  DEBUG_LOG,
} from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { requestId } from "@presentation/http/common/request/request-context.js";
import { requestContext } from "@presentation/http/common/request/request-context.js";
import { ApiError } from "@presentation/http/common/errors/api-error.js";
import { RunAdmissionService } from "@presentation/http/runs/run-admission.service.js";
import {
  RoomCreateDto,
  RoomMemberDto,
  RoomRunDto,
  RoomWebhookDto,
} from "@presentation/http/contracts/validation.js";
import {
  createMemoryRoomRepository,
  createMemoryRoomWebhookRepository,
} from "@application/room/memory.js";
import {
  asRecord,
  createRoom,
  HttpRoomError,
  roomBody,
  stringField,
  webhookBody,
} from "@presentation/http/rooms/room-input.js";
import {
  parseRoomResumeCursor,
  roomEvents,
  roomMetrics,
} from "@presentation/http/rooms/room-events.js";
import { Observable } from "rxjs";

export type { WebhookSecretResolver } from "@presentation/http/rooms/room-webhooks.controller.js";

const ROOM_HISTORY_RUN_LIMIT = 200;
const ROOM_HISTORY_EVENT_LIMIT = 4096;

interface ResponseHeaders {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@UseGuards(OwnerAuthGuard)
@Controller({ version: ["1", "2"] })
export class RoomsNestController {
  private readonly rooms: RoomRepository;
  private readonly webhooks: RoomWebhookRepository;
  private readonly coordinator: RoomRunCoordinator | undefined;

  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    @Optional()
    @Inject(MANIFEST_LOADER)
    private readonly manifestLoader: ManifestLoader | undefined,
    @Optional() @Inject(ROOM_REPOSITORY) repository: RoomRepository | undefined,
    @Optional()
    @Inject(ROOM_WEBHOOK_REPOSITORY)
    webhookRepository: RoomWebhookRepository | undefined,
    @Optional() @Inject(ROOM_QUEUE) queue: RoomQueuePersistence | undefined,
    @Optional() @Inject(ROOM_JOURNAL) journal: RoomJournalPort | undefined,
    @Optional()
    @Inject(DEBUG_LOG)
    private readonly debugLog: ((entry: string) => void) | undefined,
    @Optional()
    @Inject(ROOM_KEEPALIVE_MS)
    private readonly keepaliveMs: number | undefined,
    private readonly runAdmission: RunAdmissionService,
  ) {
    this.rooms = repository ?? createMemoryRoomRepository();
    this.webhooks = webhookRepository ?? createMemoryRoomWebhookRepository();
    this.coordinator =
      this.runtime === undefined
        ? undefined
        : createRoomRunCoordinator({
            runtime: this.runtime,
            rooms: this.rooms,
            ...(queue === undefined ? {} : { queue }),
            ...(journal === undefined ? {} : { journal }),
          });
  }

  @Get("rooms")
  async list(
    @CurrentOwner() owner: OwnerContext,
    @Query("include_closed") includeClosed: string | undefined,
  ): Promise<readonly object[]> {
    return (
      await this.requireRooms().list(owner.owner, includeClosed === "true")
    ).map(roomBody);
  }

  @Post("rooms")
  async create(
    @CurrentOwner() owner: OwnerContext,
    @Body() body: RoomCreateDto,
  ): Promise<object> {
    const created = await createRoom(
      asRecord(body),
      owner.owner,
      this.requireRooms(),
    );
    if (created instanceof HttpRoomError)
      throw created.status === 409
        ? new ConflictException({
            error: created.code,
            detail: created.message,
          })
        : new BadRequestException({
            error: created.code,
            detail: created.message,
          });
    return roomBody(created);
  }

  @Get("rooms/:roomId")
  async get(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<object> {
    return roomBody(await this.requireRoom(owner.owner, roomId));
  }

  @Post("rooms/:roomId/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    await this.coordinator?.close(owner.owner, room.id);
    return roomBody(
      (await this.requireRooms().close(owner.owner, room.id)) ?? room,
    );
  }

  @Post("rooms/:roomId/members")
  @HttpCode(HttpStatus.OK)
  async addMember(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Body() body: RoomMemberDto,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    const agent = stringField(asRecord(body), "agent");
    if (!agent) throw new BadRequestException({ error: "invalid_room_member" });
    await this.requireRooms().addMember(owner.owner, room.id, agent);
    const updated =
      (await this.requireRooms().get(owner.owner, room.id)) ?? room;
    await this.coordinator?.refresh(owner.owner, updated);
    return roomBody(updated);
  }

  @Delete("rooms/:roomId/members/:agent")
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Param("agent") agent: string,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    await this.requireRooms().removeMember(owner.owner, room.id, agent);
    const updated =
      (await this.requireRooms().get(owner.owner, room.id)) ?? room;
    await this.coordinator?.refresh(owner.owner, updated);
    return roomBody(updated);
  }

  @Get("rooms/:roomId/webhooks")
  async listWebhooks(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<readonly object[]> {
    const room = await this.requireRoom(owner.owner, roomId);
    return (await this.requireWebhooks().list(owner.owner, room.id)).map(
      webhookBody,
    );
  }

  @Post("rooms/:roomId/webhooks")
  async createWebhook(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Body() body: RoomWebhookDto,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    const value = asRecord(body);
    const agent = stringField(value, "agent");
    const source = stringField(value, "source");
    const secretRef = stringField(value, "secret_ref");
    if (!agent || !source || !secretRef || !room.members.includes(agent))
      throw new BadRequestException({ error: "invalid_room_webhook" });
    return webhookBody(
      await this.requireWebhooks().create({
        owner: owner.owner,
        roomId: room.id,
        agent,
        source,
        secretRef,
      }),
    );
  }

  @Delete("rooms/:roomId/webhooks/:webhookId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Param("webhookId") webhookId: string,
  ): Promise<void> {
    const room = await this.requireRoom(owner.owner, roomId);
    const webhook = await this.requireWebhooks().get(webhookId);
    if (!webhook || webhook.owner !== owner.owner || webhook.roomId !== room.id)
      throw new NotFoundException({ error: "room_webhook_not_found" });
    await this.requireWebhooks().remove(owner.owner, webhook.id);
  }

  @Get("rooms/:roomId/history")
  async history(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    const runtime = this.requireRuntime();
    const runIds = await this.requireRooms().runIds(owner.owner, room.id);
    const runs = [];
    for (const runId of runIds.slice(-ROOM_HISTORY_RUN_LIMIT)) {
      const run = await runtime.getAuthorizedRun(runId, owner.owner);
      if (!run) continue;
      const events = await runtime.replay(run.id, 0, ROOM_HISTORY_EVENT_LIMIT);
      runs.push({
        run_id: run.id,
        session_id: run.sessionId,
        input: run.input,
        status: run.status,
        created_at: run.createdAt,
        finished_at: run.finishedAt ?? null,
        response_text: run.responseText,
        events: events.map((event) => ({
          seq: event.seq,
          payload: event.payload,
        })),
      });
    }
    return {
      room_id: room.id,
      runs,
      truncated:
        runIds.length > ROOM_HISTORY_RUN_LIMIT ||
        runs.some((run) => run.events.length >= ROOM_HISTORY_EVENT_LIMIT),
    };
  }

  @Get("rooms/:roomId/metrics")
  async metrics(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    const runtime = this.requireRuntime();
    const runs = await Promise.all(
      (await this.requireRooms().runIds(owner.owner, room.id)).map(async (id) =>
        runtime.getAuthorizedRun(id, owner.owner),
      ),
    );
    return roomMetrics(
      runs.filter((run): run is RuntimeRun => run !== undefined),
    );
  }

  @Post("rooms/:roomId/runs")
  @HttpCode(HttpStatus.ACCEPTED)
  async run(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Body() body: RoomRunDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
    @Req() request: object,
  ): Promise<object> {
    const room = await this.requireRoom(owner.owner, roomId);
    const value = asRecord(body);
    const agent = stringField(value, "agent");
    const input = stringField(value, "input");
    const context = parseRunContext(value?.context);
    if (context === null)
      throw new BadRequestException({ error: "invalid_room_context" });
    const trustedContext =
      context === undefined
        ? undefined
        : withAuthenticatedOrganization(context, owner.organizationId);
    if (!agent || !input)
      throw new BadRequestException({ error: "invalid_room_run" });
    if (room.status !== "open")
      throw new ConflictException({
        error: "room_closed",
        detail: "Room is closed.",
      });
    if (!room.members.includes(agent))
      throw new NotFoundException({ error: "agent_not_found" });
    const manifestOwner = owner.manifestOwner ?? owner.resourceOwner;
    if (this.manifestLoader !== undefined) {
      try {
        const manifest = await this.manifestLoader.get({
          owner: manifestOwner,
          name: agent,
        });
        if (manifest === undefined)
          throw new NotFoundException({ error: "agent_manifest_not_found" });
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        if (!isManifestValidationError(error)) throw error;
        throw new BadRequestException({
          error: "agent_manifest_invalid",
          detail: error instanceof Error ? error.message : "invalid manifest",
        });
      }
    }
    const currentRequestId = requestId(request);
    const dataScope = normalizeDataScope(value?.data_scope);
    const requestedRunId = stringField(value, "run_id");
    if (
      requestedRunId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        requestedRunId,
      )
    )
      throw new BadRequestException({ error: "invalid_run_id" });
    const admission = this.coordinator
      ? await this.coordinator.enqueue({
          owner: owner.owner,
          room,
          agent,
          input,
          manifestOwner,
          callerSubject: owner.callerSubject,
          ...(requestedRunId === undefined ? {} : { runId: requestedRunId }),
          ...(dataScope === undefined ? {} : { dataScope }),
          ...(trustedContext === undefined ? {} : { context: trustedContext }),
          mode: "interactive",
          trigger: { source: "room" },
          ...(currentRequestId === undefined
            ? {}
            : { requestId: currentRequestId }),
        })
      : {
          admission: await this.runAdmission.start({
            key: `room:${room.id}:agent:${agent}`,
            input,
            owner,
            manifestName: agent,
            manifestOwner,
            ...(dataScope === undefined ? {} : { dataScope }),
            ...(trustedContext === undefined
              ? {}
              : { context: trustedContext }),
            delegation: {
              roomId: room.id,
              callerSubject: owner.callerSubject,
              ...(requestedRunId === undefined
                ? {}
                : { authorizationRunId: requestedRunId }),
            },
            ...(requestedRunId === undefined ? {} : { runId: requestedRunId }),
            mode: "interactive",
            trigger: { source: "room" },
            ...(currentRequestId === undefined
              ? {}
              : { requestId: currentRequestId }),
          }),
          queuePosition: 0,
        };
    if (admission.admission.kind === "rejected")
      throw new ConflictException({
        error: "room_busy",
        active_run_id: admission.admission.activeRunId,
      });
    if (admission.admission.kind === "duplicate_delivery")
      return {
        status: "duplicate_delivery",
        ...(requestContext(request)?.apiVersion === "2"
          ? { request_id: currentRequestId }
          : {}),
      };
    if (admission.admission.kind === "full")
      throw new ConflictException({
        error: "room_busy",
        active_run_id: admission.admission.runId,
      });
    if (!this.coordinator)
      await this.requireRooms().attachRun(
        owner.owner,
        room.id,
        admission.admission.run.id,
      );
    this.debugLog?.(
      `room_run_admitted:${JSON.stringify({
        requestId: currentRequestId,
        roomId: room.id,
        runId: admission.admission.run.id,
        agent,
        queuePosition: admission.queuePosition,
      })}`,
    );
    const version = requestContext(request)?.apiVersion === "2" ? "2" : "1";
    response.setHeader(
      "content-location",
      `/api/v${version}/runs/${admission.admission.run.id}`,
    );
    return {
      run_id: admission.admission.run.id,
      session_id: admission.admission.session.id,
      room_id: room.id,
      events_url: `/api/v${version}/runs/${admission.admission.run.id}/events`,
      room_events_url: `/api/v${version}/rooms/${room.id}/events`,
      queue_position: admission.queuePosition,
      ...(version === "2" ? { request_id: currentRequestId } : {}),
    };
  }

  @Get("sessions/:sessionId/transcript")
  async transcript(
    @CurrentOwner() owner: OwnerContext,
    @Param("sessionId") sessionId: string,
  ): Promise<object> {
    const session = await this.requireRuntime().getAuthorizedSession(
      sessionId,
      owner.owner,
    );
    if (!session) throw new NotFoundException({ error: "session_not_found" });
    return { id: session.id, history: session.history };
  }

  @Sse("rooms/:roomId/events")
  async events(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Query("after_seq") afterSeq: string | undefined,
    @Query("from") from: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() request: object,
    @Query() query: Record<string, unknown>,
  ): Promise<Observable<MessageEvent>> {
    const isV2 = requestContext(request)?.apiVersion === "2";
    if (isV2 && Object.keys(query).some((key) => key !== "cursor"))
      throw new ApiError(400, { error: "invalid_cursor" });
    const room = await this.requireRoom(owner.owner, roomId);
    const runtime = this.requireRuntime();
    await this.coordinator?.activate(owner.owner, room.id);
    return roomEvents(
      runtime,
      await this.requireRooms().runIds(owner.owner, room.id),
      owner.owner,
      parseRoomResumeCursor(
        isV2 ? (cursor ?? lastEventId) : (afterSeq ?? from),
      ),
      this.keepaliveMs,
    );
  }

  private async requireRoom(
    owner: string,
    roomId: string,
  ): Promise<RoomRecord> {
    const room = await this.requireRooms().get(owner, roomId);
    if (!room || room.owner !== owner)
      throw new NotFoundException({ error: "room_not_found" });
    return room;
  }

  private requireRooms(): RoomRepository {
    return this.rooms;
  }

  private requireWebhooks(): RoomWebhookRepository {
    return this.webhooks;
  }

  private requireRuntime(): RunManager {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    return this.runtime;
  }
}

function isManifestValidationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.startsWith("invalid YAML manifest") ||
    message.startsWith("invalid manifest") ||
    message.startsWith("manifest ") ||
    message.startsWith("manifest environment variable")
  );
}

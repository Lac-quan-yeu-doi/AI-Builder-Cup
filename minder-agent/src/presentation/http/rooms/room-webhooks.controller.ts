import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { RunManager } from "@application/runtime";
import {
  createRoomRunCoordinator,
  type RoomRunCoordinator,
} from "@application/room/runtime/room-runtime.js";
import { normalizeDataScope } from "@application/shared/ports/index.js";
import type {
  RoomRecord,
  RoomJournalPort,
  RoomQueuePersistence,
  RoomRepository,
  RoomWebhookRepository,
} from "@application/shared/ports/index.js";
import {
  ROOM_REPOSITORY,
  ROOM_JOURNAL,
  ROOM_QUEUE,
  ROOM_WEBHOOK_REPOSITORY,
  ROOM_WEBHOOK_SECRET_RESOLVER,
  RUN_MANAGER,
} from "@modules/tokens.js";
import { RoomWebhookEventDto } from "@presentation/http/contracts/validation.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asRecord } from "@presentation/http/rooms/room-input.js";
import {
  requestContext,
  requestId,
} from "@presentation/http/common/request/request-context.js";

export type WebhookSecretResolver = (input: {
  readonly owner: string;
  readonly secretRef: string;
}) => Promise<string | undefined>;

interface RawBodyRequest {
  readonly rawBody?: Buffer;
}

@Controller({ version: ["1", "2"] })
export class RoomWebhooksNestController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    @Optional() @Inject(ROOM_REPOSITORY) repository: RoomRepository | undefined,
    @Optional()
    @Inject(ROOM_WEBHOOK_REPOSITORY)
    webhookRepository: RoomWebhookRepository | undefined,
    @Optional()
    @Inject(ROOM_WEBHOOK_SECRET_RESOLVER)
    private readonly resolveSecret: WebhookSecretResolver | undefined,
    @Optional() @Inject(ROOM_QUEUE) queue: RoomQueuePersistence | undefined,
    @Optional() @Inject(ROOM_JOURNAL) journal: RoomJournalPort | undefined,
  ) {
    this.rooms = repository;
    this.webhooks = webhookRepository;
    this.coordinator =
      runtime && repository
        ? createRoomRunCoordinator({
            runtime,
            rooms: repository,
            ...(queue === undefined ? {} : { queue }),
            ...(journal === undefined ? {} : { journal }),
          })
        : undefined;
  }

  private readonly rooms: RoomRepository | undefined;
  private readonly webhooks: RoomWebhookRepository | undefined;
  private readonly coordinator: RoomRunCoordinator | undefined;

  @Post("room-webhooks/:webhookId")
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Param("webhookId") webhookId: string,
    @Req() request: RawBodyRequest,
    @Headers("x-minder-signature") signature: string | undefined,
    @Headers("x-delivery-id") deliveryId: string | undefined,
    @Body() body: RoomWebhookEventDto,
  ): Promise<object> {
    if (!this.runtime || !this.resolveSecret)
      throw new ServiceUnavailableException({
        error: "room_webhook_not_configured",
      });
    const webhook = await this.requireWebhooks().get(webhookId);
    if (!webhook)
      throw new NotFoundException({ error: "room_webhook_not_found" });
    const rawBody = request.rawBody?.toString("utf8") ?? JSON.stringify(body);
    const secret = await this.resolveSecret({
      owner: webhook.owner,
      secretRef: webhook.secretRef,
    });
    if (!secret || !validSignature(signature, rawBody, secret))
      throw new UnauthorizedException({ error: "invalid_webhook_signature" });
    const room = await this.requireRooms().get(webhook.owner, webhook.roomId);
    if (!room || !roomIsOpenForAgent(room, webhook.agent))
      throw new NotFoundException({ error: "room_webhook_not_found" });
    const value = asRecord(body);
    const requestedInput =
      typeof value?.input === "string" ? value.input : undefined;
    const input =
      requestedInput?.trim() || `Webhook ${webhook.source}: ${rawBody}`;
    const dataScope = normalizeDataScope(value?.data_scope);
    if (this.coordinator === undefined)
      throw new ServiceUnavailableException({
        error: "room_webhook_not_configured",
      });
    const currentRequestId = requestId(request);
    const result = await this.coordinator.enqueue({
      ...(currentRequestId === undefined
        ? {}
        : { requestId: currentRequestId }),
      owner: webhook.owner,
      room,
      agent: webhook.agent,
      input,
      ...(dataScope === undefined ? {} : { dataScope }),
      mode: "autonomous",
      trigger: {
        source: `room-webhook:${webhook.id}`,
        ...(deliveryId?.trim() ? { deliveryId: deliveryId.trim() } : {}),
      },
    });
    const correlation =
      requestContext(request)?.apiVersion === "2"
        ? { request_id: currentRequestId }
        : {};
    if (result.admission.kind === "duplicate_delivery")
      return { status: "duplicate_delivery", ...correlation };
    if (result.admission.kind === "rejected")
      throw new ConflictException({
        error: "room_busy",
        active_run_id: result.admission.activeRunId,
      });
    if (result.admission.kind === "full")
      throw new ConflictException({
        error: "room_busy",
        active_run_id: result.admission.runId,
      });
    return {
      run_id: result.admission.run.id,
      room_id: room.id,
      ...correlation,
    };
  }

  private requireRooms(): RoomRepository {
    if (this.rooms === undefined)
      throw new ServiceUnavailableException({
        error: "room_store_not_configured",
      });
    return this.rooms;
  }

  private requireWebhooks(): RoomWebhookRepository {
    if (this.webhooks === undefined)
      throw new ServiceUnavailableException({
        error: "room_webhook_store_not_configured",
      });
    return this.webhooks;
  }
}

function roomIsOpenForAgent(room: RoomRecord, agent: string): boolean {
  return room.status === "open" && room.members.includes(agent);
}

function validSignature(
  value: string | undefined,
  body: string,
  secret: string,
): boolean {
  if (!value?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  );
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

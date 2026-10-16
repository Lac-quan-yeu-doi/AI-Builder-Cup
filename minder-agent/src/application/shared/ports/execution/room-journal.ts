import type { JsonValue, RoomId } from "@domain/index.js";
export interface RoomJournalEvent {
  readonly roomId: RoomId;
  readonly seq: number;
  readonly payload: JsonValue;
}
export interface RoomJournalPort {
  append(roomId: RoomId, payload: JsonValue): Promise<RoomJournalEvent>;
  readFrom(
    roomId: RoomId,
    afterSeq: number,
    limit: number,
  ): Promise<readonly RoomJournalEvent[]>;
}

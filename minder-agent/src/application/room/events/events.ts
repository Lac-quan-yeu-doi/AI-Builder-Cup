export interface RoomLifecycleEvent {
  readonly type: string;
  readonly roomId: string;
  readonly sequence: number;
}

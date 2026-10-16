export interface RoomScheduler {
  schedule(): Promise<void>;
}

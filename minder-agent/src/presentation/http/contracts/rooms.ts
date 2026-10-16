export interface RoomDto {
  readonly id: string;
  readonly name: string;
  readonly status: "open" | "closed";
}

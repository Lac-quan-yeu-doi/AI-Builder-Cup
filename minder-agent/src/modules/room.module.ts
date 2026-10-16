import { Module } from "@nestjs/common";
import { ROOM_REGISTRY, ROOM_REPOSITORY } from "./tokens.js";
import { DatabaseModule } from "./database.module.js";

@Module({
  imports: [DatabaseModule],
  providers: [{ provide: ROOM_REGISTRY, useExisting: ROOM_REPOSITORY }],
  exports: [ROOM_REGISTRY],
})
export class RoomModule {}

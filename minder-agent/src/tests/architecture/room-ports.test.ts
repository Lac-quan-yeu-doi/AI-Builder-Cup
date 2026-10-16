import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("room persistence contracts live in application ports", async () => {
  const ports = await readFile(
    "src/application/shared/ports/execution/rooms.ts",
    "utf8",
  );
  const presentation = await readFile(
    "src/presentation/http/rooms/rooms.controller.ts",
    "utf8",
  );
  const runtime = await readFile(
    "src/application/room/runtime/room-runtime.ts",
    "utf8",
  );
  const prismaRooms = await readFile(
    "src/infrastructure/prisma/repositories/rooms.ts",
    "utf8",
  );
  const prismaQueue = await readFile(
    "src/infrastructure/prisma/repositories/room-queue.ts",
    "utf8",
  );

  expect(ports).toContain("interface RoomRepository");
  expect(ports).toContain("interface RoomQueuePersistence");
  expect(presentation).toContain("@application/shared/ports/index.js");
  expect(runtime).toContain("@application/shared/ports/index.js");
  expect(prismaRooms).not.toContain("interface PersistedRoom");
  expect(prismaQueue).not.toContain("type RoomQueueState");
});

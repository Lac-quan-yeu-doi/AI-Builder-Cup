import type { Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma.service.js";

export async function serializable<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // ponytail: bounded serialization retries; raise only with measured contention.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= 3) throw error;
    }
  }
}

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

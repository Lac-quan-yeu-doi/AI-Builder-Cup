import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient, type Prisma } from "@prisma/client";
import { buildPrismaDatasourceUrl } from "./database-config.js";

export { buildPrismaDatasourceUrl } from "./database-config.js";

export type PrismaServiceOptions = Prisma.PrismaClientOptions & {
  readonly schema?: string;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(options?: PrismaServiceOptions) {
    const { schema, ...clientOptions } = options ?? {};
    const datasourceUrl = buildPrismaDatasourceUrl(
      options?.datasourceUrl ?? process.env.DATABASE_URL,
      schema ?? process.env.MINDER_DATABASE_SCHEMA,
    );
    super({
      ...clientOptions,
      ...(datasourceUrl === undefined ? {} : { datasourceUrl }),
    });
  }

  onModuleInit(): Promise<void> {
    return this.$connect();
  }

  onModuleDestroy(): Promise<void> {
    return this.$disconnect();
  }
}

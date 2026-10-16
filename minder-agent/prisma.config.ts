import { defineConfig, env } from "prisma/config";
import { buildPrismaDatasourceUrl } from "./src/infrastructure/prisma/database-config.js";

export default defineConfig({
  schema: "src/infrastructure/prisma/schema.prisma",
  migrations: {
    path: "src/infrastructure/prisma/migrations",
  },
  datasource: {
    url: buildPrismaDatasourceUrl(
      env("DATABASE_URL"),
      process.env.MINDER_DATABASE_SCHEMA,
    )!,
  },
});

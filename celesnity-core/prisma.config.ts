import { defineConfig } from 'prisma/config';

/**
 * The Prisma schema lives with the adapters that use it, under
 * `src/infrastructure/prisma`, rather than in a top-level `prisma/` directory.
 * Persistence is an infrastructure concern, and the schema, its migrations, the
 * repositories, the mappers, and the enum boundaries are all one unit of change:
 * adding a column touches the schema, a migration, and a mapper in the same
 * commit, so they belong in the same folder.
 */
const defaultDatabaseUrl =
  'postgresql://celesnity:celesnity_dev_password@localhost:15432/celesnity?schema=celesnity_app';

export default defineConfig({
  schema: 'src/infrastructure/prisma/schema.prisma',
  migrations: {
    path: 'src/infrastructure/prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});

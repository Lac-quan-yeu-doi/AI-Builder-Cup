import { z } from 'zod';

import { SSL_MODES } from '@/src/entities/models/connection';

const structuredConnectionInputSchema = z.object({
  kind: z.literal('structured'),
  host: z.string(),
  port: z.number(),
  databaseName: z.string(),
  username: z.string(),
  password: z.string().optional(),
  sslMode: z.enum(SSL_MODES),
  applicationName: z.string().optional(),
});

const connectionUrlInputSchema = z.object({
  kind: z.literal('url'),
  connectionUrl: z.string(),
});

export const connectionDetailsInputSchema = z.discriminatedUnion('kind', [
  structuredConnectionInputSchema,
  connectionUrlInputSchema,
]);

export const dataConnectionInputSchema = z.object({
  name: z.string(),
  details: connectionDetailsInputSchema,
});

export const connectionIdSchema = z.string();

export const updateConnectionInputSchema = z.object({
  id: connectionIdSchema,
  input: dataConnectionInputSchema,
});

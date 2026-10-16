import type { CdcConnectionProfileUseCases } from '@/src/application/use-cases/database-services/cdc-connection-profile.use-cases';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentCdcConnectionProfile,
  type CdcConnectionProfileViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import {
  cdcConnectionProfileInputSchema,
  databaseServiceIdSchema,
} from './database-service.schemas';

export type CdcConnectionProfileController = ReturnType<
  typeof createCdcConnectionProfileController
>;

export const createCdcConnectionProfileController = (useCases: CdcConnectionProfileUseCases) => {
  const parseId = (value: string): string => {
    const parsed = databaseServiceIdSchema.safeParse(value.trim());
    if (!parsed.success)
      throw new InputParseError('Invalid databaseService id', { cause: parsed.error });
    return parsed.data;
  };
  return {
    get: async (id: string): Promise<CdcConnectionProfileViewModel> =>
      presentCdcConnectionProfile(await useCases.get(parseId(id))),
    save: async (id: string, input: unknown): Promise<CdcConnectionProfileViewModel> => {
      const parsed = cdcConnectionProfileInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new InputParseError('Invalid CDC connection profile', { cause: parsed.error });
      }
      return presentCdcConnectionProfile(await useCases.save(parseId(id), parsed.data));
    },
    validate: async (id: string): Promise<CdcConnectionProfileViewModel> =>
      presentCdcConnectionProfile(await useCases.validate(parseId(id))),
    remove: (id: string): Promise<void> => useCases.remove(parseId(id)),
  };
};

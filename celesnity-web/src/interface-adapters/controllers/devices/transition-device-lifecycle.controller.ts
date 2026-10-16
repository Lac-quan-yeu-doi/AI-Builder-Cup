import type { TransitionDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/transition-device-lifecycle.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TransitionDeviceLifecycleInput } from '@/src/entities/models/device';
import { presentDevice } from '@/src/interface-adapters/presenters/device.presenter';

import { transitionDeviceLifecycleInputSchema } from './device.schemas';

export type TransitionDeviceLifecycleController = ReturnType<
  typeof createTransitionDeviceLifecycleController
>;
export const createTransitionDeviceLifecycleController =
  (useCase: TransitionDeviceLifecycleUseCase) => async (input: TransitionDeviceLifecycleInput) => {
    const parsed = transitionDeviceLifecycleInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid lifecycle transition', { cause: parsed.error });
    return presentDevice(await useCase(parsed.data));
  };

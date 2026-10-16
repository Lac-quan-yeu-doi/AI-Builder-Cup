import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const MACHINE_AUTHENTICATED = 'celesnity.machineAuthenticated';
export const MachineAuthenticated = (): CustomDecorator<string> =>
  SetMetadata(MACHINE_AUTHENTICATED, true);

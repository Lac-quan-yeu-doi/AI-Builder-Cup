import type { ExecutionContext } from '@nestjs/common';

import type { FirmwareUseCases } from '@application/device-management/firmware.use-cases';
import { FirmwareEventTokenGuard } from '@presentation/device-management/firmware-event-token.guard';

function context(deploymentId?: string, token?: string): ExecutionContext {
  const request = {
    params: deploymentId === undefined ? {} : { deploymentId },
    headers: token === undefined ? {} : { 'x-firmware-event-token': token },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FirmwareEventTokenGuard', () => {
  it('admits a device callback with its deployment-scoped token', async () => {
    const authorizeEvent = jest.fn<Promise<void>, [string, string]>().mockResolvedValue();
    const guard = new FirmwareEventTokenGuard({ authorizeEvent } as unknown as FirmwareUseCases);

    await expect(guard.canActivate(context('deployment-1', 'secret'))).resolves.toBe(true);
    expect(authorizeEvent).toHaveBeenCalledWith('deployment-1', 'secret');
  });

  it('passes empty values to the same non-disclosing authorization path', async () => {
    const notFound = Object.assign(new Error('not found'), { code: 'DEVICE_NOT_FOUND' });
    const authorizeEvent = jest.fn<Promise<void>, [string, string]>().mockRejectedValue(notFound);
    const guard = new FirmwareEventTokenGuard({ authorizeEvent } as unknown as FirmwareUseCases);

    await expect(guard.canActivate(context())).rejects.toBe(notFound);
    expect(authorizeEvent).toHaveBeenCalledWith('', '');
  });
});

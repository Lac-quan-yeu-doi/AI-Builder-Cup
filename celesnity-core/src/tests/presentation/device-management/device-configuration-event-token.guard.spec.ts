import type { ExecutionContext } from '@nestjs/common';

import type { DeviceConfigurationUseCases } from '@application/device-management/device-configuration.use-cases';
import { DeviceConfigurationEventTokenGuard } from '@presentation/device-management/device-configuration-event-token.guard';

function context(configurationId?: string, token?: string): ExecutionContext {
  const request = {
    params: configurationId === undefined ? {} : { configurationId },
    headers: token === undefined ? {} : { 'x-device-configuration-token': token },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('DeviceConfigurationEventTokenGuard', () => {
  it('admits a device callback with its configuration-scoped token', async () => {
    const authorizeEvent = jest.fn<Promise<void>, [string, string]>().mockResolvedValue();
    const guard = new DeviceConfigurationEventTokenGuard({
      authorizeEvent,
    } as unknown as DeviceConfigurationUseCases);

    await expect(guard.canActivate(context('configuration-1', 'secret'))).resolves.toBe(true);
    expect(authorizeEvent).toHaveBeenCalledWith('configuration-1', 'secret');
  });

  it('passes empty values to the same non-disclosing authorization path', async () => {
    const notFound = Object.assign(new Error('not found'), { code: 'DEVICE_NOT_FOUND' });
    const authorizeEvent = jest.fn<Promise<void>, [string, string]>().mockRejectedValue(notFound);
    const guard = new DeviceConfigurationEventTokenGuard({
      authorizeEvent,
    } as unknown as DeviceConfigurationUseCases);

    await expect(guard.canActivate(context())).rejects.toBe(notFound);
    expect(authorizeEvent).toHaveBeenCalledWith('', '');
  });
});

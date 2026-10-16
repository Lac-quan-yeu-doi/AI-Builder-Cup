import type { ExecutionContext } from '@nestjs/common';

import type { DeviceUseCases } from '@application/device-management/device.use-cases';
import { DeviceHeartbeatGuard } from '@presentation/device-management/device-heartbeat.guard';

describe('DeviceHeartbeatGuard', () => {
  it('authenticates Basic device credentials and attaches the principal', async () => {
    const authenticateHeartbeat = jest.fn().mockResolvedValue({
      deviceId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      deviceType: 'GATEWAY',
    });
    const request = {
      headers: { authorization: `Basic ${Buffer.from('dev_gateway:secret').toString('base64')}` },
    };
    const guard = new DeviceHeartbeatGuard({ authenticateHeartbeat } as unknown as DeviceUseCases);

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(authenticateHeartbeat).toHaveBeenCalledWith('dev_gateway', 'secret');
    expect(request).toHaveProperty('deviceHeartbeatPrincipal.deviceType', 'GATEWAY');
  });

  it('rejects invalid device credentials', async () => {
    const guard = new DeviceHeartbeatGuard({
      authenticateHeartbeat: jest.fn().mockResolvedValue(undefined),
    } as unknown as DeviceUseCases);
    const request = {
      headers: { authorization: `Basic ${Buffer.from('dev_gateway:wrong').toString('base64')}` },
    };

    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      status: 401,
    });
  });
});

function executionContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { DeviceConfigurationUseCases } from '@application/device-management/device-configuration.use-cases';

/** Replaces user authentication on a device-originated configuration acknowledgement. */
@Injectable()
export class DeviceConfigurationEventTokenGuard implements CanActivate {
  public constructor(private readonly useCases: DeviceConfigurationUseCases) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const configurationId =
      typeof request.params.configurationId === 'string' ? request.params.configurationId : '';
    const header = request.headers['x-device-configuration-token'];
    const token = typeof header === 'string' ? header : '';

    await this.useCases.authorizeEvent(configurationId, token);
    return true;
  }
}

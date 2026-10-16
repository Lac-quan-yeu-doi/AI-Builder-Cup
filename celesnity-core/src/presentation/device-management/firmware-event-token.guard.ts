import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { FirmwareUseCases } from '@application/device-management/firmware.use-cases';

/** Replaces user authentication on the device-originated OTA event callback. */
@Injectable()
export class FirmwareEventTokenGuard implements CanActivate {
  public constructor(private readonly useCases: FirmwareUseCases) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const deploymentId =
      typeof request.params.deploymentId === 'string' ? request.params.deploymentId : '';
    const header = request.headers['x-firmware-event-token'];
    const token = typeof header === 'string' ? header : '';

    await this.useCases.authorizeEvent(deploymentId, token);
    return true;
  }
}

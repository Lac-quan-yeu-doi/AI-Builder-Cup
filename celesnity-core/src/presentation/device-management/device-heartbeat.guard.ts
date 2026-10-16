import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { DeviceUseCases } from '@application/device-management/device.use-cases';
import type { DeviceHeartbeatPrincipal } from '@domain/device-management/models/device';

type HeartbeatRequest = Request & { deviceHeartbeatPrincipal?: DeviceHeartbeatPrincipal };

@Injectable()
export class DeviceHeartbeatGuard implements CanActivate {
  public constructor(private readonly useCases: DeviceUseCases) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HeartbeatRequest>();
    const credentials = basicCredentials(request.headers.authorization);
    if (credentials === undefined)
      throw new UnauthorizedException('Device credentials are required.');
    const principal = await this.useCases.authenticateHeartbeat(
      credentials.username,
      credentials.password,
    );
    if (principal === undefined) throw new UnauthorizedException('Device credentials are invalid.');
    request.deviceHeartbeatPrincipal = principal;
    return true;
  }
}

export function requireHeartbeatPrincipal(request: Request): DeviceHeartbeatPrincipal {
  const principal = (request as HeartbeatRequest).deviceHeartbeatPrincipal;
  if (principal === undefined)
    throw new UnauthorizedException('Device authentication is required.');
  return principal;
}

function basicCredentials(
  authorization: string | undefined,
): Readonly<{ username: string; password: string }> | undefined {
  if (authorization === undefined || !authorization.startsWith('Basic ')) return undefined;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) return undefined;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return undefined;
  }
}

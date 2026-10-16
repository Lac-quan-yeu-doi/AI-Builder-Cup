import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@application/administration/authorization-policy';

export const REQUIRED_PERMISSION = 'celesnity.required-permission';
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

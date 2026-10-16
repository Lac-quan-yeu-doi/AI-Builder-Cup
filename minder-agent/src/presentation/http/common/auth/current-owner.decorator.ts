import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { OwnerContext, OwnerRequest } from "./owner-context.js";

export const CurrentOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OwnerContext =>
    context.switchToHttp().getRequest<OwnerRequest>().ownerContext!,
);

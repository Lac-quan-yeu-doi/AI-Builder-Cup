import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { AUTH_OPTIONS } from "@modules/tokens.js";
import {
  resolveOwner,
  type OwnerResolverOptions,
} from "../../guards/authentication.js";
import type { OwnerRequest } from "./owner-context.js";

@Injectable()
export class OwnerAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_OPTIONS) private readonly options?: OwnerResolverOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const resolved = await resolveOwner(request, this.options);
    if (resolved.kind === "forbidden")
      throw new ForbiddenException({ error: "permission_denied" });
    if (resolved.kind !== "ok")
      throw new UnauthorizedException({ error: "missing_caller_id" });
    request.ownerContext = resolved;
    return true;
  }
}

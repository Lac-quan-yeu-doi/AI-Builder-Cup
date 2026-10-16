import {
  Injectable,
  Inject,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  Admission,
  RunManager,
  StartTurnInput,
} from "@application/runtime";
import { withAuthenticatedOrganization } from "@application/runtime";
import { RUN_MANAGER } from "@modules/tokens.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { ApiError } from "@presentation/http/common/errors/api-error.js";

export type RunAdmissionInput = Readonly<Omit<StartTurnInput, "owner">> & {
  readonly owner: OwnerContext;
};

@Injectable()
export class RunAdmissionService {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
  ) {}

  async start(input: RunAdmissionInput): Promise<Admission> {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    try {
      return await this.runtime.start({
        ...input,
        owner: input.owner.owner,
        ...(input.context === undefined
          ? {}
          : {
              context: withAuthenticatedOrganization(
                input.context,
                input.owner.organizationId,
              ),
            }),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "RuntimeStoreError" &&
        "code" in error &&
        error.code === "mode_conflict"
      )
        throw new ApiError(409, {
          error: "session_mode_conflict",
          detail: error.message,
        });
      if (
        input.clientToolResult !== undefined &&
        error instanceof Error &&
        error.name === "RuntimeStoreError" &&
        "code" in error &&
        error.code === "invalid_transition"
      )
        throw new ApiError(409, { error: "invalid_client_tool_result" });
      throw error;
    }
  }
}

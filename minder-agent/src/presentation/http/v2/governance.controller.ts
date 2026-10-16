import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { GovernanceValidationDto } from "@presentation/http/contracts/validation.js";
import { GovernanceController } from "@presentation/http/governance/governance.controller.js";
import {
  ApiErrorV2Response,
  GovernanceValidationV2Response,
} from "./openapi-dtos.js";

@UseGuards(OwnerAuthGuard)
@ApiTags("Governance")
@ApiResponse({ status: 401, type: ApiErrorV2Response })
@ApiResponse({ status: 403, type: ApiErrorV2Response })
@Controller({ version: "2" })
export class GovernanceV2Controller {
  constructor(
    @Inject(GovernanceController)
    private readonly governance: GovernanceController,
  ) {}

  @Post("agent-manifests/governance/validate")
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: GovernanceValidationDto })
  @ApiResponse({ status: 200, type: GovernanceValidationV2Response })
  @ApiResponse({ status: 400, type: ApiErrorV2Response })
  validate(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: GovernanceValidationDto,
  ): Promise<object> {
    return this.governance.validateManifest(owner, input);
  }
}

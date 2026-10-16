import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ToolCatalogPort } from "@application/shared/ports/index.js";
import { TOOL_CATALOG } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";

@UseGuards(OwnerAuthGuard)
@Controller({ path: "catalog", version: ["1", "2"] })
export class CatalogController {
  constructor(
    @Inject(TOOL_CATALOG) private readonly catalog: ToolCatalogPort,
  ) {}

  @Get()
  list(@CurrentOwner() _owner: OwnerContext): { tools: object[] } {
    const implemented = new Set(this.catalog.implementedNames());
    return {
      tools: this.catalog.descriptors().map((tool) => ({
        name: tool.name,
        kind: tool.kind,
        aliases: tool.aliases,
        state: implemented.has(tool.name) ? "implemented" : tool.state,
      })),
    };
  }
}

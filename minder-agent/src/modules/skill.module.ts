import { Module } from "@nestjs/common";
import {
  createOptionalToolResolver,
  createSkillServiceForOwner,
} from "@infrastructure/composition";
import {
  OPTIONAL_TOOL_RESOLVER,
  SKILL_SERVICE_FOR_OWNER,
  SKILL_STORE,
} from "./tokens.js";
import { DatabaseModule } from "./database.module.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: SKILL_SERVICE_FOR_OWNER,
      inject: [SKILL_STORE],
      useFactory: createSkillServiceForOwner,
    },
    {
      provide: OPTIONAL_TOOL_RESOLVER,
      inject: [SKILL_SERVICE_FOR_OWNER],
      useFactory: createOptionalToolResolver,
    },
  ],
  exports: [SKILL_SERVICE_FOR_OWNER, OPTIONAL_TOOL_RESOLVER],
})
export class SkillModule {}

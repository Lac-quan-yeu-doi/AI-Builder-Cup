import { Module } from '@nestjs/common';

import { SKILL_CLIENT } from '@application/skill/interfaces/i-skill-client';
import { MinderAgentSkillClient } from '@infrastructure/http/skill/minder-agent-skill.client';
import { SkillMcpController } from '@presentation/skill/skill-mcp.controller';
import { AdministrationModule } from './administration.module';
import { SecurityModule } from './security.module';

/**
 * Skill authoring surface. Registers only the agent-facing MCP endpoint
 * (`/skill-mcp`) and its HTTP proxy to minder-agent's `/skills` API. There is
 * no human-facing REST controller here — the web UI already talks to
 * minder-agent's `/skills` directly through its own `AgentApiSkillRepository`,
 * so celesnity-core only needs to expose the MCP front door for the
 * `skill-creator` agent.
 */
@Module({
  imports: [SecurityModule, AdministrationModule],
  controllers: [SkillMcpController],
  providers: [
    MinderAgentSkillClient,
    { provide: SKILL_CLIENT, useExisting: MinderAgentSkillClient },
  ],
})
export class SkillModule {}

import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createCreateSkillUseCase } from '@/src/application/use-cases/skills/create-skill.use-case';
import { createDeleteSkillUseCase } from '@/src/application/use-cases/skills/delete-skill.use-case';
import { createGetSkillUseCase } from '@/src/application/use-cases/skills/get-skill.use-case';
import { createListSkillsUseCase } from '@/src/application/use-cases/skills/list-skills.use-case';
import { createUpdateSkillUseCase } from '@/src/application/use-cases/skills/update-skill.use-case';
import { AgentApiSkillRepository } from '@/src/infrastructure/repositories/agent-api-skill.repository';
import { createCreateSkillController } from '@/src/interface-adapters/controllers/skills/create-skill.controller';
import { createDeleteSkillController } from '@/src/interface-adapters/controllers/skills/delete-skill.controller';
import { createGetSkillController } from '@/src/interface-adapters/controllers/skills/get-skill.controller';
import { createListSkillsController } from '@/src/interface-adapters/controllers/skills/list-skills.controller';
import { createUpdateSkillController } from '@/src/interface-adapters/controllers/skills/update-skill.controller';

export function createSkillsModule() {
  const skillsModule = createTypedModule();

  skillsModule
    .bind(DI_SYMBOLS.SkillRepository)
    .toClass(AgentApiSkillRepository, [DI_SYMBOLS.AgentApiClient]);

  skillsModule
    .bind(DI_SYMBOLS.ListSkillsUseCase)
    .toHigherOrderFunction(createListSkillsUseCase, [DI_SYMBOLS.SkillRepository]);
  skillsModule
    .bind(DI_SYMBOLS.GetSkillUseCase)
    .toHigherOrderFunction(createGetSkillUseCase, [DI_SYMBOLS.SkillRepository]);
  skillsModule
    .bind(DI_SYMBOLS.CreateSkillUseCase)
    .toHigherOrderFunction(createCreateSkillUseCase, [DI_SYMBOLS.SkillRepository]);
  skillsModule
    .bind(DI_SYMBOLS.UpdateSkillUseCase)
    .toHigherOrderFunction(createUpdateSkillUseCase, [DI_SYMBOLS.SkillRepository]);
  skillsModule
    .bind(DI_SYMBOLS.DeleteSkillUseCase)
    .toHigherOrderFunction(createDeleteSkillUseCase, [DI_SYMBOLS.SkillRepository]);

  skillsModule
    .bind(DI_SYMBOLS.ListSkillsController)
    .toHigherOrderFunction(createListSkillsController, [DI_SYMBOLS.ListSkillsUseCase]);
  skillsModule
    .bind(DI_SYMBOLS.GetSkillController)
    .toHigherOrderFunction(createGetSkillController, [DI_SYMBOLS.GetSkillUseCase]);
  skillsModule
    .bind(DI_SYMBOLS.CreateSkillController)
    .toHigherOrderFunction(createCreateSkillController, [DI_SYMBOLS.CreateSkillUseCase]);
  skillsModule
    .bind(DI_SYMBOLS.UpdateSkillController)
    .toHigherOrderFunction(createUpdateSkillController, [DI_SYMBOLS.UpdateSkillUseCase]);
  skillsModule
    .bind(DI_SYMBOLS.DeleteSkillController)
    .toHigherOrderFunction(createDeleteSkillController, [DI_SYMBOLS.DeleteSkillUseCase]);

  return skillsModule;
}

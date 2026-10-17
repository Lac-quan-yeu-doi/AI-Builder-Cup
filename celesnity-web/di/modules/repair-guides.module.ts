import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createRepairGuideUseCases } from '@/src/application/use-cases/plant-model/repair-guide.use-cases';
import { BrowserRepairGuideRepository } from '@/src/infrastructure/repositories/browser-repair-guide.repository';
import { ApiRepairCaptureService } from '@/src/infrastructure/services/api-repair-capture.service';
import { createRepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

export function createRepairGuidesModule() {
  const repairGuidesModule = createTypedModule();

  repairGuidesModule.bind(DI_SYMBOLS.RepairGuideRepository).toClass(BrowserRepairGuideRepository);
  repairGuidesModule.bind(DI_SYMBOLS.RepairCaptureService).toClass(ApiRepairCaptureService);
  repairGuidesModule
    .bind(DI_SYMBOLS.RepairGuideUseCases)
    .toHigherOrderFunction(createRepairGuideUseCases, [
      DI_SYMBOLS.RepairGuideRepository,
      DI_SYMBOLS.RepairCaptureService,
      DI_SYMBOLS.SkillRepository,
    ]);
  repairGuidesModule
    .bind(DI_SYMBOLS.RepairGuideController)
    .toHigherOrderFunction(createRepairGuideController, [DI_SYMBOLS.RepairGuideUseCases]);

  return repairGuidesModule;
}

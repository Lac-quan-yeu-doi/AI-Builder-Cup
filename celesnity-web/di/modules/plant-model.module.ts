import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createPlantModelUseCases } from '@/src/application/use-cases/plant-model/manage-plant-model.use-cases';
import { CoreApiPlantModelRepository } from '@/src/infrastructure/repositories/core-api-plant-model.repository';
import { createPlantModelController } from '@/src/interface-adapters/controllers/plant-model/plant-model.controller';

export function createPlantModelModule() {
  const plantModelModule = createTypedModule();

  plantModelModule
    .bind(DI_SYMBOLS.PlantModelRepository)
    .toClass(CoreApiPlantModelRepository, [DI_SYMBOLS.CoreApiClient]);
  plantModelModule
    .bind(DI_SYMBOLS.PlantModelUseCases)
    .toHigherOrderFunction(createPlantModelUseCases, [DI_SYMBOLS.PlantModelRepository]);
  plantModelModule
    .bind(DI_SYMBOLS.PlantModelController)
    .toHigherOrderFunction(createPlantModelController, [DI_SYMBOLS.PlantModelUseCases]);

  return plantModelModule;
}
